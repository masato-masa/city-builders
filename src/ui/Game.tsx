import { AnimatePresence } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import type { Difficulty } from '@/ai/choose';
import { CARD_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { canAcquire, canBuild, canUpgrade, canUseCard, reduce } from '@/game/reducer';
import { createRng, type Rng } from '@/game/rng';
import { effectiveCardOf, handSlotsOf, ownedSlots, scoreOf, turnsRemaining, winnerOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { Action, CardId, GameState, PlayerId } from '@/game/types';
import { dailyScore } from '@/meta/daily';
import type { RankChange } from '@/meta/rank';
import { settleMatch } from '@/meta/settle';
import { loadDaily, saveDaily, withDailyResult } from '@/storage/daily';
import { loadMeta, saveMeta } from '@/storage/meta';
import { loadProgress, saveProgress, withResult } from '@/storage/storage';

import { BUILDING_ART, cardArtOf, FIELD_URL } from './art';
import { Board, boardTargetingOf, type IncomeFlash } from './Board';
import { dragGuide, resolveDrop, slotPick, slotTargetModeOf, type SlotTargetMode } from './card-input';
import { CoinBar } from './CoinBar';
import { type CpuStep, playTurnSteps } from './cpu-turn';
import { cardAftermath, cardSequence, TARGET_LABEL } from './feel';
import {
  AftermathLayer,
  CardFlightLayer,
  CpuCallout,
  type CpuCalloutInfo,
  TurnBanner,
  useAftermath,
  useCardFlights,
  useTurnBanner,
} from './Fx';
import { ImpactFlash, useBoardFeel } from './impact-fx';
import {
  hapticBuild,
  hapticLose,
  hapticReject,
  hapticTap,
  hapticUseCard,
  hapticWin,
  hapticYourTurn,
} from './haptics';
import { Hand } from './Hand';
import { OpponentStrip } from './OpponentStrip';
import { stageCallout, playStageCue } from './income-stages';
import { dropHitAt, playIncome, runIncomeSequence, useLater } from './play-helpers';
import { buildReview, recordTransition, streakLine } from './match-log';
import { type DailyResult, ResultScreen } from './ResultScreen';
import { useMatchLog } from './use-match-log';
import { Sheet } from './Sheets';
import { cpuActionCallout } from './slot-actions';
import { SlotSheet } from './SlotSheet';
import { TargetBanner } from './TargetBanner';
import { HelpText } from './HelpText';
import { SpeedRow } from './SpeedRow';
import { RESULT_DELAY_MS, tempo } from './tempo';
import { TurnBadge } from './TurnBadge';
import { refreshBgm } from './bgm';
import { useGameBgm } from './use-bgm';
import {
  isHapticsEnabled,
  isSoundEnabled,
  setHapticsEnabled,
  setSoundEnabled,
} from './settings';
import {
  playBuild,
  playEndTurn,
  playLose,
  playReject,
  playSelect,
  playUiTap,
  playAcquire,
  playUpgrade,
  playUseCard,
  playWin,
  playYourTurn,
} from './sound';

type Pending =
  | { kind: 'slot'; slotId: number }
  | { kind: 'heraldTarget' }
  /** 区画を対象に取る札（封鎖者・検査官・顔役と、それを写す影武者）の対象選び。card は実際に使う札 */
  | { kind: 'slotTarget'; card: CardId; mode: SlotTargetMode }
  | { kind: 'menu' }
  | { kind: 'confirmExit' }
  | { kind: 'help' }
  | { kind: 'settings' }
  | null;

export function Game({
  seed,
  difficulty,
  balance = DEFAULT_BALANCE,
  first,
  daily,
  deck,
  onExit,
  onRestart,
}: {
  seed: number;
  difficulty: Difficulty;
  balance?: Balance;
  /** 先手を決め打ちする（日替わり）。省略時は seed から決まる。 */
  first?: PlayerId;
  /** 日替わりの一戦。段位・勝敗・連勝は動かさず、その日の自己ベスト（VP 差）だけを記録する。 */
  daily?: { dateKey: string; label: string };
  /** 両者のデッキ（テスト用メニューで新しいカード入りを試す）。省略時は既定の 10 枚。 */
  deck?: readonly CardId[];
  onExit: () => void;
  onRestart: () => void;
}) {
  const [rng] = useState<Rng>(() => createRng(seed * 7919 + 13));
  const [state, setState] = useState<GameState>(() => {
    // 開始処理（収入）はここでは済ませない。手番の帯を見せてから、下の useEffect が反映する。
    // 後手（CPU が先手）のときも同じで、CPU の手番は収入から 1 手ずつ出す。
    return createGame(seed, balance, first, deck ? { you: deck, cpu: deck } : {});
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const later = useLater();
  // 自分の手番に替わったが、まだ収入を反映していない間。この間は操作を受け付けない。
  const [introPending, setIntroPending] = useState(() => state.current === 'you');
  // 収入の演出の途中でプレイヤーが触ったとき、残りを飛ばして反映する（待たせない）。
  const flushIncome = useRef<(() => void) | null>(null);
  // CPU の 1 手の途中でプレイヤーが触ったとき、その 1 手を飛ばして次へ進める。
  const skipCpuStep = useRef<(() => void) | null>(null);
  // カードを使う動きを見せてから効果を反映するまで（建設も同じ）の間。
  const [busy, setBusy] = useState(false);
  // 使用中の札（手札からは先に消し、盤面へ飛ぶ複製が見せる）。
  const [using, setUsing] = useState<CardId[]>([]);
  // 収入の段で光らせる建物（基礎収入の段は無し）。
  const [incomeFlash, setIncomeFlash] = useState<IncomeFlash | null>(null);
  const flashSeq = useRef(0);
  // 手札をドラッグ中の札。盤面に「ここへ落とす」表示を出す。
  const [dragCard, setDragCard] = useState<CardId | null>(null);
  const [sheet, setSheet] = useState<Pending>(null);
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [hapticsOn, setHapticsOn] = useState(() => isHapticsEnabled());
  // BGM（プレイ画面でだけ流す。残り手番で緊張、決着で消える）
  const { bgmOn, toggleBgm } = useGameBgm(turnsRemaining(state, balance), state.phase === 'finished');

  // CPU の手番を 1 手ずつ出すための進行役。null のときは進行中ではない。
  const [cpuTurn, setCpuTurn] = useState<{ steps: CpuStep[]; revealed: number } | null>(null);
  // 画面に見せる実況ログ。直前の CPU の手番ぶんが、次の CPU の手番が始まるまで残る。
  const [cpuLog, setCpuLog] = useState<string[]>([]);
  // いま出ている 1 手が何をしたか。ログの文字だけでは足りないので、盤面側にも指し示す（要望 7）。
  const [cpuCallout, setCpuCallout] = useState<CpuCalloutInfo | null>(null);
  const cpuCalloutSeq = useRef(0);
  const [cpuHighlightSlot, setCpuHighlightSlot] = useState<number | null>(null);
  const cpuActing = cpuTurn !== null;
  /** 演出の途中で、プレイヤーの操作を受け付けない間。 */
  const locked = cpuActing || introPending || busy;

  const finished = state.phase === 'finished';
  // 結果画面は、最後の 1 手（建物の着地・数字の弾み）を見せてから出す。
  const [resultReady, setResultReady] = useState(false);
  useEffect(() => {
    if (!finished) return;
    const t = window.setTimeout(() => setResultReady(true), RESULT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [finished]);

  const boardAreaRef = useRef<HTMLDivElement>(null);
  // 衝撃（ヒットストップ・盤面の揺れ）と決着の静止。盤面にだけ 1 手前を一瞬見せる。
  // CPU の手では震わせない（下の CPU の手番の方針と同じ）。
  const feel = useBoardFeel(state, boardAreaRef, (actor) => actor === 'you');
  const aftermath = useAftermath();
  const { flights, fly } = useCardFlights();
  /** 手札の札の絵を盤面の中央へ飛ばす（使った手応え）。札が手札から消える前に呼ぶ。 */
  const flyCard = (card: CardId) =>
    fly(document.querySelector(`.hand [data-card="${card}"]`), cardArtOf(card), boardAreaRef.current);
  /** 山の底へ送る札（伝令の対象・街道）を「次」の札へ小さくなって飛ばす（捨てる演出）。 */
  const flyDiscard = (card: CardId) =>
    fly(
      document.querySelector(`.hand [data-card="${card}"]`),
      cardArtOf(card),
      document.querySelector('.next-card'),
      'discard',
    );

  /** 収入の 1 段を盤面に出す（帯・光・音）。反映（コイン）は呼び出し側が少し置いてから行う。 */
  const showStage = (stage: Parameters<typeof stageCallout>[0], tone: 'you' | 'cpu') => {
    cpuCalloutSeq.current += 1;
    setCpuCallout(stageCallout(stage, balance, tone, cpuCalloutSeq.current));
    flashSeq.current += 1;
    setIncomeFlash(
      stage.slots.length > 0
        ? { id: flashSeq.current, slots: stage.slots, festival: stage.festival && stage.kind === 'building' }
        : null,
    );
    playStageCue(stage);
  };

  // 手番が替わるたびに盤面を横切る帯を出す（ゲーム開始の 1 回目も）。
  const [banner, clearBanner] = useTurnBanner(`${state.phase}:${state.current}:${state.turn}`, () =>
    state.phase !== 'playing'
      ? null
      : {
          tone: state.current,
          label: state.current === 'you' ? 'あなたのターン' : '相手のターン',
          sub: `のこり ${turnsRemaining(state, balance)} ターン`,
        },
  );

  // 試合の記録（使ったカード・建設・VP の推移）。結果画面の振り返りに使う。
  const matchLog = useMatchLog(state, balance);
  // 結果画面に出す連勝の 1 行。終局を記録した時点で決める。
  const [streakText, setStreakText] = useState<string | null>(null);

  // 結果画面に出す段位の増減と、新しく手に入った実績。
  const [rankResult, setRankResult] = useState<{ change: RankChange; unlocked: string[] } | null>(null);
  // 日替わりの結果（今回の VP 差と今日のベスト）。
  const [dailyResult, setDailyResult] = useState<DailyResult | null>(null);

  const recordIfFinished = (result: GameState) => {
    if (result.phase !== 'finished') return;
    if (daily) {
      // 日替わりは通常の CPU 戦と分ける: 勝敗・連勝・段位・実績は動かさない。
      const score = dailyScore(scoreOf(result, 'you', balance), scoreOf(result, 'cpu', balance));
      const r = withDailyResult(loadDaily(daily.dateKey), daily.dateKey, score);
      saveDaily(r.record);
      setDailyResult({ label: daily.label, score, best: r.record.best ?? score, improved: r.improved, plays: r.record.plays });
      return;
    }
    const progress = loadProgress();
    const winner = winnerOf(result, balance);
    const outcome = winner === 'you' ? 'win' : winner === 'cpu' ? 'lose' : 'draw';
    const next = withResult(progress, outcome, difficulty);
    saveProgress(next);
    setStreakText(streakLine(outcome, next.streak, progress.streak));
    // 記録はまだ最後の差分（いま画面にある状態 → 終局）を積んでいないので、ここで足してから判定する。
    const log = recordTransition(matchLog(), stateRef.current, result, balance);
    const settled = settleMatch(loadMeta(), { log, final: result, outcome, difficulty, streak: next.streak });
    saveMeta(settled.meta);
    setRankResult({ change: settled.rank, unlocked: settled.unlocked });
  };

  // CPU の手番の終わり。手番だけを替え、収入は帯を見せてから（下の useEffect が）反映する。
  const finishCpuTurn = (result: GameState) => {
    recordIfFinished(result);
    if (result.phase === 'playing') {
      playYourTurn(0);
      hapticYourTurn();
      setIntroPending(true);
    }
    setState(result);
  };

  // 自分の手番が回ってきたら、帯を見せてから収入を 1 段ずつ反映する
  // （手番 → 基礎収入 → 建物収入 → 投資 → 返済、の順。祝祭のときは建物収入の段でそれと分かる）。
  useEffect(() => {
    if (!introPending) return;
    const seq = runIncomeSequence(stateRef.current, balance, tempo().turnIntroMs, {
      onShow: (b) => showStage(b.stage, 'you'),
      onApply: (b) => {
        playIncome(b.stage.amount);
        setState(b.state);
      },
      onFinish: () => {
        setCpuCallout(null);
        setIncomeFlash(null);
        setIntroPending(false);
      },
    });
    flushIncome.current = seq.flush;
    return () => {
      flushIncome.current = null;
      seq.cancel();
    };
  }, [introPending]);

  const endTurn = () => {
    playEndTurn();
    const next = reduce(state, { type: 'endTurn' }, balance);
    recordIfFinished(next);
    setState(next);
  };

  // CPU の手番になったら、1 手ずつ出す行動列をまとめて計算しておく。
  // src/ai は変更せず、公開されている chooseAction を使う playTurnSteps に任せる。
  useEffect(() => {
    if (state.phase !== 'playing') return;
    if (state.current !== 'cpu') return;
    if (cpuTurn !== null) return;
    // ゲーム開始時、後手（CPU が先手）の最初の 1 手番だけは seed 直結の乱数を使う
    // （それ以外の CPU の手番は、ずっと使い続けている共有の rng を使う）。
    // これは元の実装（seed だけから作る乱数で先手番を進める）をそのまま踏襲している。
    const stepRng = state.turn === 1 ? createRng(seed) : rng;
    setCpuLog([]);
    setCpuCallout(null);
    setCpuHighlightSlot(null);
    setCpuTurn({ steps: playTurnSteps(state, difficulty, stepRng, balance), revealed: 0 });
  }, [state]);

  // 1 手ずつ、2 段に分けて出す。まず「何をしたか」（絵と帯・使用の音）、少し置いて
  // 「その結果」（盤面・コインの反映）。同時に起こすと、何が原因で何が変わったか読めない。
  // 順番は 手番の帯 → 収入 → 行動 → その効果。振動は入れない（プレイヤーが起こした
  // 操作ではないのでスマホを震わせると誤動作に見える）。
  useEffect(() => {
    if (!cpuTurn) return;
    const { steps, revealed } = cpuTurn;
    const step = steps[revealed];
    if (!step) return;
    const isLast = revealed === steps.length - 1;
    const a = step.action;
    // 収入の段は読める長さだけ（incomeBeatMs）で次へ。行動は 1 手あたり gap + effectDelay。
    // 間合いは設定の速さ（tempo.ts）。1 手ごとに読むので、途中で切り替えても次の 1 手から効く。
    const t = tempo();
    const isStage = a.type === 'startTurn' && step.stage !== undefined;
    const gap = revealed === 0 ? t.cpuFirstGapMs : isStage ? 0 : t.cpuStepGapMs;
    // 伝令は、使う札のあとに「山の底へ送る札」を見せるぶん、効果の反映を遅らせる。
    const heraldTarget = a.type === 'useCard' ? a.heraldTarget : undefined;
    const effectDelay =
      (a.type === 'endTurn' ? t.cpuEndDelayMs : isStage ? t.incomeBeatMs : t.cpuEffectDelayMs) +
      (heraldTarget ? t.discardAtMs : 0);
    let shown = false;
    const showDiscard = heraldTarget
      ? window.setTimeout(() => {
          cpuCalloutSeq.current += 1;
          setCpuCallout({
            id: cpuCalloutSeq.current,
            kind: 'card',
            art: cardArtOf(heraldTarget),
            text: `${CARD_NAMES[heraldTarget]}を山の底へ`,
          });
          playEndTurn();
        }, gap + t.discardAtMs)
      : null;
    const showStep = () => {
      shown = true;
      setCpuLog((prev) => [...prev, step.log]);
      if (a.type === 'startTurn' && step.stage) {
        showStage(step.stage, 'cpu');
        return;
      }
      cpuCalloutSeq.current += 1;
      const id = cpuCalloutSeq.current;
      setCpuCallout(
        a.type === 'useCard'
          ? { id, kind: 'card', art: cardArtOf(a.card), text: step.log }
          : a.type === 'useRoad'
            ? { id, kind: 'card', art: cardArtOf(a.target), text: step.log }
            : a.type === 'build' || a.type === 'upgrade' || a.type === 'acquire'
              ? {
                  id,
                  kind: 'building',
                  art: BUILDING_ART[state.market[a.slotId]!.buildingId]?.url,
                  // アップグレード・買収は「CPU が◯◯を…」と主語から言う（自分の物件が奪われたと分かるように）
                  text: cpuActionCallout(state, a) ?? step.log,
                }
              : a.type === 'startTurn'
                ? { id, kind: 'none', text: step.log }
                : null,
      );
      if (a.type === 'useCard') playUseCard(a.card);
      else if (a.type === 'endTurn') playEndTurn();
    };
    const show = window.setTimeout(showStep, gap);
    const applyStep = () => {
      skipCpuStep.current = null;
      if (a.type === 'build') {
        playBuild();
        setCpuHighlightSlot(a.slotId);
      } else if (a.type === 'upgrade') {
        playUpgrade();
        setCpuHighlightSlot(a.slotId);
      } else if (a.type === 'acquire') {
        playAcquire();
        setCpuHighlightSlot(a.slotId);
      } else if (a.type === 'startTurn' && step.stage) {
        playIncome(step.stage.amount);
      } else if (a.type === 'useCard' && a.inspectSlot !== undefined) {
        // 検査官で Lv を下げられた区画を指し示す（どれが下がったか読めるように）
        setCpuHighlightSlot(a.inspectSlot);
      }
      if (isLast) {
        finishCpuTurn(step.state);
        setCpuTurn(null);
        setCpuCallout(null);
        setCpuHighlightSlot(null);
        setIncomeFlash(null);
      } else {
        setState(step.state);
        setCpuTurn((prev) => (prev ? { ...prev, revealed: prev.revealed + 1 } : prev));
      }
    };
    const apply = window.setTimeout(applyStep, gap + effectDelay);
    // 盤面に触れたら、この 1 手を待たずに反映する（まだ出していなければ出してから）。
    skipCpuStep.current = () => {
      window.clearTimeout(show);
      window.clearTimeout(apply);
      if (showDiscard !== null) window.clearTimeout(showDiscard);
      if (!shown) showStep();
      applyStep();
    };
    return () => {
      skipCpuStep.current = null;
      window.clearTimeout(show);
      window.clearTimeout(apply);
      if (showDiscard !== null) window.clearTimeout(showDiscard);
    };
    // eslint 的な exhaustive-deps はこのプロジェクトに無い。cpuTurn の変化だけを見る。
  }, [cpuTurn]);

  // 決着の山場: 一瞬の静止 → 鐘（useBoardFeel）→ 結果画面。勝ち負けの音は結果画面と一緒に鳴らす
  // （鐘と重ねると濁る）。
  useEffect(() => {
    if (!resultReady) return;
    const winner = winnerOf(state, balance);
    if (winner === 'you') {
      playWin();
      hapticWin();
    } else if (winner === 'cpu') {
      playLose();
      hapticLose();
    }
    // eslint 的な exhaustive-deps はこのプロジェクトに無い。resultReady の変化だけを見る。
  }, [resultReady]);

  /** カードを使う。溜め → 発動（盤面へ飛ぶ）→ 余韻（効果の一言）の 3 段。音は先に鳴らす。
   *  伝令は、使う札のあとに「山の底へ送る札」も飛ばして（捨てる演出）から反映する。
   *  操作は効果の反映で戻る。余韻は待たせない（触れば消える）。 */
  const commitCard = (card: CardId, action: Action) => {
    const discard = action.type === 'useCard' ? action.heraldTarget : undefined;
    const timing = cardSequence(discard !== undefined);
    // 影武者は写した札の音で鳴らす（何が起きたか耳で分かる）
    playUseCard(effectiveCardOf(stateRef.current, stateRef.current.current, card) ?? card);
    hapticUseCard();
    flyCard(card);
    setUsing([card]);
    setBusy(true);
    setSheet(null);
    if (discard) {
      later(tempo().discardAtMs, () => {
        playEndTurn();
        flyDiscard(discard);
        setUsing([card, discard]);
      });
    }
    later(timing.effectAt, () => {
      const before = stateRef.current;
      const after = reduce(before, action, balance);
      setState(after);
      setUsing([]);
      setBusy(false);
      aftermath.show(cardAftermath(before, after, card, balance), boardAreaRef.current, timing.aftermathMs);
    });
  };

  /** 街道で札を山の底へ送る。送る札が「次」へ飛んでから反映する。 */
  const commitRoad = (target: CardId) => {
    playSelect();
    flyDiscard(target);
    setUsing([target]);
    setBusy(true);
    setSheet(null);
    later(tempo().cardEffectDelayMs, () => {
      setState(reduce(stateRef.current, { type: 'useRoad', target }, balance));
      setUsing([]);
      setBusy(false);
    });
  };

  /** 物件を建てる。指示のあと少し置いて、着地とコインの減りを一緒に出す。 */
  const commitBuild = (slotId: number) => {
    hapticBuild();
    setBusy(true);
    setSheet(null);
    later(tempo().buildEffectDelayMs, () => {
      playBuild();
      setState(reduce(stateRef.current, { type: 'build', slotId }, balance));
      setBusy(false);
    });
  };

  /** 物件のアップグレード・買収。建設と同じ間合いで、光る／札が移る演出とコインの増減を一緒に出す
   *  （演出は Board が Lv・持ち主の変化を見て出す。コインの増減は DELTA_POP に乗る。
   *  買収の衝撃（ヒットストップ・揺れ・触覚）は useBoardFeel が状態の変化を見て出す）。 */
  const commitSlotAction = (action: Extract<Action, { type: 'upgrade' | 'acquire' }>) => {
    hapticBuild();
    setBusy(true);
    setSheet(null);
    later(tempo().buildEffectDelayMs, () => {
      if (action.type === 'upgrade') playUpgrade();
      else playAcquire();
      setState(reduce(stateRef.current, action, balance));
      setBusy(false);
    });
  };

  /** 手札をドラッグして離した。カードはこれでしか使わない（タップでは使わない）。
   *  離した場所で決める: 盤面 → 使う / 伝令は別の札の上 → その札を山の底へ / 封鎖者は区画の上 → その区画。
   *  盤面の外で離したらやめる。対象の要る札を盤面の空いたところで離したら、対象選び（タップ）へ。 */
  const dropCard = (card: CardId, point: { x: number; y: number }) => {
    const r = resolveDrop(state, 'you', card, dropHitAt(point.x, point.y, boardAreaRef.current, card), balance);
    if (r.kind === 'cancel') return;
    if (locked || !canUseCard(state, card, balance) || r.kind === 'reject') {
      playReject();
      hapticReject();
      return;
    }
    if (r.kind === 'target') {
      return setSheet(r.mode === 'herald' ? { kind: 'heraldTarget' } : { kind: 'slotTarget', card, mode: r.mode });
    }
    commitCard(card, r.action);
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    refreshBgm();
    playUiTap();
  };
  const toggleHaptics = () => {
    const next = !hapticsOn;
    setHapticsOn(next);
    setHapticsEnabled(next);
    playUiTap();
  };

  return (
    <div
      className={`app app-play${feel.still ? ' is-finale-still' : ''}`}
      style={{ backgroundImage: `url(${FIELD_URL})` }}
    >
      {/* ヘッダーの行は廃止（要望 1）。あきらめる／あそびかた／設定は
          手札の「次」の上のメニューボタン 1 つにまとめた（要望 2）。 */}
      <main className="play">
        <div
          className="board-shell"
          onPointerDownCapture={() => {
            flushIncome.current?.();
            skipCpuStep.current?.();
            aftermath.skip();
          }}
        >
          <OpponentStrip
            state={state}
            balance={balance}
            log={cpuLog}
            active={!finished && (cpuActing || state.current === 'cpu')}
            // CPU の 1 手は相手の情報ボードの右側（行動ログの上）に出す。盤面の中央に出すと建物を隠す。
            overlay={<CpuCallout info={cpuCallout?.tone === 'you' ? null : cpuCallout} placement="strip" />}
          />
          <div className={`board-area${dragCard ? ' is-drop-armed' : ''}`} ref={boardAreaRef}>
            <Board
              state={feel.boardState}
              balance={balance}
              highlightSlot={cpuHighlightSlot}
              targeting={boardTargetingOf(
                sheet?.kind === 'slotTarget'
                  ? sheet.mode
                  : dragCard
                    ? slotTargetModeOf(state, 'you', dragCard)
                    : null,
              )}
              dropArmed={dragCard !== null}
              flash={incomeFlash}
              onPick={(slotId) => {
                if (locked) return;
                // 対象選び（封鎖者・検査官・顔役・それを写す影武者）の間は、区画の詳細シートを開かず、
                // タップした区画をそのまま対象にして確定する（要望 G3）。
                if (sheet?.kind === 'slotTarget') {
                  const r = slotPick(state, 'you', sheet.card, sheet.mode, slotId, balance);
                  if (!r.ok) {
                    playReject();
                    hapticReject();
                    return;
                  }
                  commitCard(sheet.card, r.action);
                  return;
                }
                const slot = state.market[slotId];
                if (slot && slot.owner === null && !canBuild(state, slotId, balance)) {
                  playReject();
                  hapticReject();
                } else {
                  playSelect();
                  hapticTap();
                }
                setSheet({ kind: 'slot', slotId });
              }}
            />
            <ImpactFlash flash={feel.flash} />
            {feel.still ? <span className="finale-still" aria-hidden="true" /> : null}
            <TurnBadge state={state} balance={balance} />
            <TurnBanner banner={banner} onDone={clearBanner} />
            {/* 対象選択中の案内はここ（盤面コンテナ）基準で上端中央に置く。相手の
                情報ボードより下に来るので重ならない（要望 G3）。封鎖者は盤面、
                伝令は手札が対象だが、案内自体はどちらもここにまとめる。手札の
                すぐ上に出すと自分のコインバーと重なってしまうため。実際にどこを
                タップするかは、対象になる側（盤面の区画／手札のカード）が
                光って示す。 */}
            <AnimatePresence>
              {dragCard ? (
                <TargetBanner key={`drag-${dragCard}`} label={dragGuide(dragCard, state, 'you')} />
              ) : null}
              {sheet?.kind === 'slotTarget' ? (
                <TargetBanner key={`slotTarget-${sheet.mode}`} label={TARGET_LABEL[sheet.mode]} onCancel={() => setSheet(null)} />
              ) : null}
              {sheet?.kind === 'heraldTarget' ? (
                <TargetBanner
                  key="heraldTarget"
                  label={TARGET_LABEL.herald}
                  onCancel={() => setSheet(null)}
                />
              ) : null}
            </AnimatePresence>
          </div>
          {/* 自分の収入の段も、盤面ではなく自分の情報ボードの右側に出す（建物を隠さない）。
              収入の間は操作できないので、終了ボタンに重なってもよい。 */}
          <div className="self-wrap">
            <CoinBar
              state={state}
              balance={balance}
              onEndTurn={endTurn}
              endTurnEnabled={!finished && !locked && state.current === 'you'}
              active={!finished && !cpuActing && state.current === 'you'}
              endTurnHint={
                !handSlotsOf(state, 'you').some((c) => c !== null && canUseCard(state, c, balance)) &&
                !state.market.some(
                  (m) =>
                    canBuild(state, m.slotId, balance) ||
                    canUpgrade(state, m.slotId, balance) ||
                    canAcquire(state, m.slotId, balance),
                )
              }
            />
            <CpuCallout info={cpuCallout?.tone === 'you' ? cpuCallout : null} placement="strip" />
          </div>
          <Hand
            state={state}
            balance={balance}
            canUse={(card) => !locked && canUseCard(state, card, balance)}
            using={using}
            onDrop={dropCard}
            onDragActive={setDragCard}
            targeting={sheet?.kind === 'heraldTarget'}
            onPick={(card) => {
              // 伝令の対象選び（盤面で離したあと）。タップした手札をそのまま対象にする。伝令自身は対象にできない。
              if (locked || sheet?.kind !== 'heraldTarget') return;
              if (card === 'herald' || !canUseCard(state, 'herald', balance)) {
                playReject();
                hapticReject();
                return;
              }
              commitCard('herald', { type: 'useCard', card: 'herald', heraldTarget: card });
            }}
            onMenu={() => {
              playUiTap();
              setSheet({ kind: 'menu' });
            }}
          />
        </div>
      </main>

      <AnimatePresence>
        {sheet?.kind === 'slot' ? (
          <SlotSheet
            key="slot"
            state={state}
            slotId={sheet.slotId}
            viewer={'you'}
            balance={balance}
            locked={locked}
            ownerName={{ you: 'あなた', cpu: 'CPU' }}
            onBuild={() => commitBuild(sheet.slotId)}
            onUpgrade={() => commitSlotAction({ type: 'upgrade', slotId: sheet.slotId })}
            onAcquire={() => commitSlotAction({ type: 'acquire', slotId: sheet.slotId })}
            onRoad={commitRoad}
            onClose={() => setSheet(null)}
          />
        ) : null}
      </AnimatePresence>

      {/* 新しいメニュー。あきらめる／あそびかた／設定の 3 つだけ（要望 2）。
          「戻る」ではなく「あきらめる」。いきなり戻さず、確認を挟む。 */}
      <AnimatePresence>
        {sheet?.kind === 'menu' ? (
          <Sheet key="menu" title="メニュー" onClose={() => setSheet(null)}>
            <button className="sheet-row danger" onClick={() => { playUiTap(); setSheet({ kind: 'confirmExit' }); }}>
              あきらめる
            </button>
            <button className="sheet-row" onClick={() => { playUiTap(); setSheet({ kind: 'help' }); }}>
              あそびかた
            </button>
            <button className="sheet-row" onClick={() => { playUiTap(); setSheet({ kind: 'settings' }); }}>
              設定
            </button>
          </Sheet>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {sheet?.kind === 'confirmExit' ? (
          <Sheet key="confirmExit" title="あきらめますか？" onClose={() => setSheet({ kind: 'menu' })}>
            <p className="sheet-text">ここまでの進行はきろくに残りません。</p>
            <button className="btn3d btn3d-red" onClick={onExit}>
              あきらめる
            </button>
            <button className="sheet-link" onClick={() => { playUiTap(); setSheet({ kind: 'menu' }); }}>
              もどる
            </button>
          </Sheet>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {sheet?.kind === 'help' ? (
          <Sheet key="help" title="あそびかた" onClose={() => setSheet(null)}>
            <HelpText balance={balance} />
          </Sheet>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {sheet?.kind === 'settings' ? (
          <Sheet key="settings" title="設定" onClose={() => setSheet(null)}>
            <div className="sheet-row static">
              <span>効果音</span>
              <button
                className="switch"
                role="switch"
                aria-checked={soundOn}
                aria-label="効果音"
                onClick={toggleSound}
              />
            </div>
            <div className="sheet-row static">
              <span>BGM</span>
              <button
                className="switch"
                role="switch"
                aria-checked={bgmOn && soundOn}
                aria-label="BGM"
                disabled={!soundOn}
                onClick={() => {
                  toggleBgm();
                  playUiTap();
                }}
              />
            </div>
            <div className="sheet-row static">
              <span>振動</span>
              <button
                className="switch"
                role="switch"
                aria-checked={hapticsOn}
                aria-label="振動"
                onClick={toggleHaptics}
              />
            </div>
            <SpeedRow />
          </Sheet>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {finished && resultReady
          ? (() => {
              const w = winnerOf(state, balance);
              return (
                <ResultScreen
                  key="result"
                  title={w === 'you' ? 'あなたの勝ち！' : w === 'cpu' ? '負けてしまった…' : '引き分け'}
                  tone={w === 'you' ? 'win' : w === 'cpu' ? 'lose' : 'draw'}
                  top={{
                    name: 'CPU',
                    tone: 'cpu',
                    vp: scoreOf(state, 'cpu', balance),
                    buildings: ownedSlots(state, 'cpu').length,
                  }}
                  bottom={{
                    name: 'あなた',
                    tone: 'you',
                    vp: scoreOf(state, 'you', balance),
                    buildings: ownedSlots(state, 'you').length,
                  }}
                  winner={w === 'you' ? 'bottom' : w === 'cpu' ? 'top' : null}
                  review={buildReview(matchLog(), state, balance, { you: 'あなた', cpu: 'CPU' }, 'you', streakText)}
                  rank={rankResult ?? undefined}
                  daily={dailyResult ?? undefined}
                  onRestart={onRestart}
                  onExit={onExit}
                />
              );
            })()
          : null}
      </AnimatePresence>

      <CardFlightLayer flights={flights} />
      <AftermathLayer pops={aftermath.pops} />
    </div>
  );
}
