import { AnimatePresence } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import type { Difficulty } from '@/ai/choose';
import {
  CARD_NAMES,
  cardTextFor,
  DEFAULT_BALANCE,
  type Balance,
} from '@/game/balance';
import { canAcquire, canBuild, canUpgrade, canUseCard, canUseRoad, cardCostFor, reduce } from '@/game/reducer';
import { createRng, type Rng } from '@/game/rng';
import { handSlotsOf, ownedSlots, roadUsesRemaining, scoreOf, turnsRemaining, winnerOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { Action, CardId, GameState } from '@/game/types';
import { loadProgress, saveProgress, withResult } from '@/storage/storage';

import { BUILDING_ART, CARD_ART, FIELD_URL } from './art';
import { Board, type IncomeFlash } from './Board';
import { CoinBar } from './CoinBar';
import { type CpuStep, playTurnSteps } from './cpu-turn';
import {
  CardFlightLayer,
  CpuCallout,
  type CpuCalloutInfo,
  TurnBanner,
  useCardFlights,
  useTurnBanner,
} from './Fx';
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
import { playIncome, runIncomeSequence, slotAtPoint, useLater } from './play-helpers';
import { buildReview, streakLine } from './match-log';
import { ResultScreen } from './ResultScreen';
import { useMatchLog } from './use-match-log';
import { Sheet } from './Sheets';
import { cpuActionCallout } from './slot-actions';
import { SlotSheet } from './SlotSheet';
import { TargetBanner } from './TargetBanner';
import {
  BUILD_EFFECT_DELAY_MS,
  CARD_EFFECT_DELAY_MS,
  CPU_EFFECT_DELAY_MS,
  CPU_END_DELAY_MS,
  CPU_FIRST_GAP_MS,
  INCOME_BEAT_MS,
  DISCARD_AT_MS,
  CPU_STEP_GAP_MS,
  RESULT_DELAY_MS,
  TURN_INTRO_MS,
} from './tempo';
import { TurnBadge } from './TurnBadge';
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
  | { kind: 'card'; card: CardId }
  | { kind: 'heraldTarget' }
  | { kind: 'blockadeTarget' }
  | { kind: 'menu' }
  | { kind: 'confirmExit' }
  | { kind: 'help' }
  | { kind: 'settings' }
  | null;

export function Game({
  seed,
  difficulty,
  balance = DEFAULT_BALANCE,
  onExit,
  onRestart,
}: {
  seed: number;
  difficulty: Difficulty;
  balance?: Balance;
  onExit: () => void;
  onRestart: () => void;
}) {
  const [rng] = useState<Rng>(() => createRng(seed * 7919 + 13));
  const [state, setState] = useState<GameState>(() => {
    // 開始処理（収入）はここでは済ませない。手番の帯を見せてから、下の useEffect が反映する。
    // 後手（CPU が先手）のときも同じで、CPU の手番は収入から 1 手ずつ出す。
    return createGame(seed, balance);
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const later = useLater();
  // 自分の手番に替わったが、まだ収入を反映していない間。この間は操作を受け付けない。
  const [introPending, setIntroPending] = useState(() => state.current === 'you');
  // 収入の演出の途中でプレイヤーが触ったとき、残りを飛ばして反映する（待たせない）。
  const flushIncome = useRef<(() => void) | null>(null);
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
  const { flights, fly } = useCardFlights();
  /** 手札の札の絵を盤面の中央へ飛ばす（使った手応え）。札が手札から消える前に呼ぶ。 */
  const flyCard = (card: CardId) =>
    fly(document.querySelector(`.hand [data-card="${card}"]`), CARD_ART[card], boardAreaRef.current);
  /** 山の底へ送る札（伝令の対象・街道）を「次」の札へ小さくなって飛ばす（捨てる演出）。 */
  const flyDiscard = (card: CardId) =>
    fly(
      document.querySelector(`.hand [data-card="${card}"]`),
      CARD_ART[card],
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

  const recordIfFinished = (result: GameState) => {
    if (result.phase !== 'finished') return;
    const progress = loadProgress();
    const winner = winnerOf(result, balance);
    const outcome = winner === 'you' ? 'win' : winner === 'cpu' ? 'lose' : 'draw';
    const next = withResult(progress, outcome, difficulty);
    saveProgress(next);
    setStreakText(streakLine(outcome, next.streak, progress.streak));
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
    const seq = runIncomeSequence(stateRef.current, balance, TURN_INTRO_MS, {
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
    // 収入の段は読める長さだけ（INCOME_BEAT_MS）で次へ。行動は 1 手あたり gap + effectDelay。
    const isStage = a.type === 'startTurn' && step.stage !== undefined;
    const gap = revealed === 0 ? CPU_FIRST_GAP_MS : isStage ? 0 : CPU_STEP_GAP_MS;
    // 伝令は、使う札のあとに「山の底へ送る札」を見せるぶん、効果の反映を遅らせる。
    const heraldTarget = a.type === 'useCard' ? a.heraldTarget : undefined;
    const effectDelay =
      (a.type === 'endTurn' ? CPU_END_DELAY_MS : isStage ? INCOME_BEAT_MS : CPU_EFFECT_DELAY_MS) +
      (heraldTarget ? DISCARD_AT_MS : 0);
    const showDiscard = heraldTarget
      ? window.setTimeout(() => {
          cpuCalloutSeq.current += 1;
          setCpuCallout({
            id: cpuCalloutSeq.current,
            kind: 'card',
            art: CARD_ART[heraldTarget],
            text: `${CARD_NAMES[heraldTarget]}を山の底へ`,
          });
          playEndTurn();
        }, gap + DISCARD_AT_MS)
      : null;
    const show = window.setTimeout(() => {
      setCpuLog((prev) => [...prev, step.log]);
      if (a.type === 'startTurn' && step.stage) {
        showStage(step.stage, 'cpu');
        return;
      }
      cpuCalloutSeq.current += 1;
      const id = cpuCalloutSeq.current;
      setCpuCallout(
        a.type === 'useCard'
          ? { id, kind: 'card', art: CARD_ART[a.card], text: step.log }
          : a.type === 'useRoad'
            ? { id, kind: 'card', art: CARD_ART[a.target], text: step.log }
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
    }, gap);
    const apply = window.setTimeout(() => {
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
    }, gap + effectDelay);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(apply);
      if (showDiscard !== null) window.clearTimeout(showDiscard);
    };
    // eslint 的な exhaustive-deps はこのプロジェクトに無い。cpuTurn の変化だけを見る。
  }, [cpuTurn]);

  // 勝敗が付いた瞬間に 1 回だけ鳴らす。
  useEffect(() => {
    if (!finished) return;
    const winner = winnerOf(state, balance);
    if (winner === 'you') {
      playWin();
      hapticWin();
    } else if (winner === 'cpu') {
      playLose();
      hapticLose();
    }
    // eslint 的な exhaustive-deps はこのプロジェクトに無い。finished の変化だけを見る。
  }, [finished]);

  /** カードを使う。まず手札から盤面へ飛ぶところを見せ（音も先）、少し置いて効果を反映する。
   *  伝令は、使う札のあとに「山の底へ送る札」も飛ばして（捨てる演出）から反映する。 */
  const commitCard = (card: CardId, action: Action) => {
    const discard = action.type === 'useCard' ? action.heraldTarget : undefined;
    playUseCard(card);
    hapticUseCard();
    flyCard(card);
    setUsing([card]);
    setBusy(true);
    setSheet(null);
    if (discard) {
      later(DISCARD_AT_MS, () => {
        playEndTurn();
        flyDiscard(discard);
        setUsing([card, discard]);
      });
    }
    later((discard ? DISCARD_AT_MS : 0) + CARD_EFFECT_DELAY_MS, () => {
      setState(reduce(stateRef.current, action, balance));
      setUsing([]);
      setBusy(false);
    });
  };

  /** 街道で札を山の底へ送る。送る札が「次」へ飛んでから反映する。 */
  const commitRoad = (target: CardId) => {
    playSelect();
    flyDiscard(target);
    setUsing([target]);
    setBusy(true);
    setSheet(null);
    later(CARD_EFFECT_DELAY_MS, () => {
      setState(reduce(stateRef.current, { type: 'useRoad', target }, balance));
      setUsing([]);
      setBusy(false);
    });
  };

  const useCard = (card: CardId) => {
    if (card === 'herald') return setSheet({ kind: 'heraldTarget' });
    if (card === 'blockader') return setSheet({ kind: 'blockadeTarget' });
    commitCard(card, { type: 'useCard', card });
  };

  /** 物件を建てる。指示のあと少し置いて、着地とコインの減りを一緒に出す。 */
  const commitBuild = (slotId: number) => {
    hapticBuild();
    setBusy(true);
    setSheet(null);
    later(BUILD_EFFECT_DELAY_MS, () => {
      playBuild();
      setState(reduce(stateRef.current, { type: 'build', slotId }, balance));
      setBusy(false);
    });
  };

  /** 物件のアップグレード・買収。建設と同じ間合いで、光る／札が移る演出とコインの増減を一緒に出す
   *  （演出は Board が Lv・持ち主の変化を見て出す。コインの増減は DELTA_POP に乗る）。 */
  const commitSlotAction = (action: Extract<Action, { type: 'upgrade' | 'acquire' }>) => {
    hapticBuild();
    setBusy(true);
    setSheet(null);
    later(BUILD_EFFECT_DELAY_MS, () => {
      if (action.type === 'upgrade') playUpgrade();
      else playAcquire();
      setState(reduce(stateRef.current, action, balance));
      setBusy(false);
    });
  };

  /** 手札を盤面へドラッグして離した。そのまま使用にする。 */
  const dropCard = (card: CardId, point: { x: number; y: number }) => {
    if (locked) return;
    if (!canUseCard(state, card, balance)) {
      playReject();
      hapticReject();
      return;
    }
    if (card === 'herald') return setSheet({ kind: 'heraldTarget' });
    if (card === 'blockader') {
      // 区画の上で離したら、その区画を対象にそのまま使う。盤面の空きで離したら対象選びへ。
      const slotId = slotAtPoint(point.x, point.y);
      if (slotId === null) return setSheet({ kind: 'blockadeTarget' });
      const slot = state.market[slotId];
      if (!slot || slot.owner === 'you') {
        playReject();
        hapticReject();
        return;
      }
      return commitCard(card, { type: 'useCard', card, blockadeSlot: slotId });
    }
    commitCard(card, { type: 'useCard', card });
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    playUiTap();
  };
  const toggleHaptics = () => {
    const next = !hapticsOn;
    setHapticsOn(next);
    setHapticsEnabled(next);
    playUiTap();
  };

  return (
    <div className="app app-play" style={{ backgroundImage: `url(${FIELD_URL})` }}>
      {/* ヘッダーの行は廃止（要望 1）。あきらめる／あそびかた／設定は
          手札の「次」の上のメニューボタン 1 つにまとめた（要望 2）。 */}
      <main className="play">
        <div className="board-shell" onPointerDownCapture={() => flushIncome.current?.()}>
          <OpponentStrip
            state={state}
            balance={balance}
            log={cpuLog}
            active={!finished && (cpuActing || state.current === 'cpu')}
          />
          <div className={`board-area${dragCard ? ' is-drop-armed' : ''}`} ref={boardAreaRef}>
            <Board
              state={state}
              balance={balance}
              highlightSlot={cpuHighlightSlot}
              targeting={sheet?.kind === 'blockadeTarget'}
              dropArmed={dragCard !== null}
              flash={incomeFlash}
              onPick={(slotId) => {
                if (locked) return;
                // 封鎖者の対象選択モード中は、通常の区画詳細シートを開かず、
                // タップした区画をそのまま対象にして確定する（要望 G3）。
                if (sheet?.kind === 'blockadeTarget') {
                  const slot = state.market[slotId];
                  if (!slot || slot.owner === 'you') {
                    playReject();
                    hapticReject();
                    return;
                  }
                  commitCard('blockader', { type: 'useCard', card: 'blockader', blockadeSlot: slotId });
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
            <TurnBadge state={state} balance={balance} />
            <CpuCallout info={cpuCallout} />
            <TurnBanner banner={banner} onDone={clearBanner} />
            {/* 対象選択中の案内はここ（盤面コンテナ）基準で上端中央に置く。相手の
                情報ボードより下に来るので重ならない（要望 G3）。封鎖者は盤面、
                伝令は手札が対象だが、案内自体はどちらもここにまとめる。手札の
                すぐ上に出すと自分のコインバーと重なってしまうため。実際にどこを
                タップするかは、対象になる側（盤面の区画／手札のカード）が
                光って示す。 */}
            <AnimatePresence>
              {sheet?.kind === 'blockadeTarget' ? (
                <TargetBanner key="blockadeTarget" onCancel={() => setSheet(null)} />
              ) : null}
              {sheet?.kind === 'heraldTarget' ? (
                <TargetBanner
                  key="heraldTarget"
                  label="伝令モード中・山の底へ送るカードを手札からタップ"
                  onCancel={() => setSheet(null)}
                />
              ) : null}
            </AnimatePresence>
          </div>
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
          <Hand
            state={state}
            balance={balance}
            canUse={(card) => !locked && canUseCard(state, card, balance)}
            using={using}
            dropRef={boardAreaRef}
            onDrop={dropCard}
            onDragActive={setDragCard}
            targeting={sheet?.kind === 'heraldTarget'}
            selected={sheet?.kind === 'card' ? sheet.card : null}
            onPick={(card) => {
              if (locked) return;
              // 伝令の対象選択モード中は、通常のカード詳細シートを開かず、
              // タップした手札カードをそのまま対象にして確定する（封鎖者の
              // 盤面タップと同じ考え方）。伝令自身は対象にできない。
              if (sheet?.kind === 'heraldTarget') {
                if (card === 'herald') {
                  playReject();
                  hapticReject();
                  return;
                }
                commitCard('herald', { type: 'useCard', card: 'herald', heraldTarget: card });
                return;
              }
              if (canUseCard(state, card, balance)) {
                playSelect();
                hapticTap();
              } else {
                playReject();
                hapticReject();
              }
              setSheet({ kind: 'card', card });
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
            onClose={() => setSheet(null)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {sheet?.kind === 'card' ? (
          <Sheet
            key="card"
            title={CARD_NAMES[sheet.card]}
            subtitle={`コスト ${balance.cards[sheet.card].cost}`}
            onClose={() => setSheet(null)}
          >
            {CARD_ART[sheet.card] ? (
              <img className="sheet-card-art" src={CARD_ART[sheet.card]} alt="" />
            ) : null}
            <p className="sheet-text">{cardTextFor(sheet.card, balance)}</p>
            {sheet.card === 'blockader' ? (
              <p className="sheet-text">永続する効果です。解除する手段はいまはありません。</p>
            ) : null}
            {/* 街道の効果。以前はコインバーの専用ボタンから対象を選んでいたが、
                いまはカードを選んだこのシートの中、「使う」の上に置く（要望 2）。
                街道を持っていない／使い切っているときも、ボタンは消さず disabled にする。 */}
            <button
              className="sheet-row road-btn"
              disabled={locked || !canUseRoad(state, sheet.card, balance)}
              onClick={() => commitRoad(sheet.card)}
            >
              <span>山の底へ送る</span>
              <span className="road-btn-sub">街道・あと {roadUsesRemaining(state, 'you', balance)} 回</span>
            </button>
            <button
              className="btn3d btn3d-yellow"
              disabled={locked || !canUseCard(state, sheet.card, balance)}
              onClick={() => {
                const card = sheet.card;
                setSheet(null);
                useCard(card);
              }}
            >
              {!canUseCard(state, sheet.card, balance) && state.players['you'].boundCards.includes(sheet.card)
                ? '買収者に縛られている'
                : canUseCard(state, sheet.card, balance) ||
              state.current !== 'you' ||
              state.players['you'].coins >= cardCostFor(state, 'you', sheet.card, balance)
                ? '使う'
                : `あと ${cardCostFor(state, 'you', sheet.card, balance) - state.players['you'].coins} コイン`}
            </button>
          </Sheet>
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
            <p className="sheet-text">
              人物カードを使ってコインを稼ぎ、まん中の物件を建てます。物件は早い者勝ちで、
              VP（勝利点）は物件からしか手に入りません。10 件すべてが建つとゲームが終わり、
              VP の多いほうが勝ちです。
            </p>
            <p className="sheet-text">
              投資カード（採掘師・銀行家）のコインが入るのは<b>次のターン</b>です。
              だからコインバーに「次ターン収入 +N」を出しています。今建てるか、
              次のターンに回すかを、この 2 つの数字で比べてください。
            </p>
            <p className="sheet-text">
              手札 4 枚はデッキの先頭 4 枚です。使ったカードだけが山の一番下へ回り、
              使わなかったカードは残ります。つまり<b>何枚で止めるかが、次のターンの手札を決めます</b>。
              左下の「次」で 1 枚先まで見えます。
            </p>
            <p className="sheet-text">
              相手も同じ 10 種を持っています。徴税官でコインを奪われ、封鎖者で区画を 1 つ
              押さえられ、買収者で手札を 1 枚縛られます。衛兵を張るか、城壁を建てて防いでください。
            </p>
            <p className="sheet-text">
              建った物件をタップすると、<b>アップグレード</b>（自分の物件を Lv2 に上げて VP と効果を増やす）と
              <b>買収</b>（相手の物件を、これまでに払われたコイン＋{balance.acquireMarkup} で奪う。代金は相手に渡る）ができます。
              どちらも手札は使いません。カードの「買収者」（手札を縛る）とは別の行動です。
            </p>
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
              <span>振動</span>
              <button
                className="switch"
                role="switch"
                aria-checked={hapticsOn}
                aria-label="振動"
                onClick={toggleHaptics}
              />
            </div>
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
                  onRestart={onRestart}
                  onExit={onExit}
                />
              );
            })()
          : null}
      </AnimatePresence>

      <CardFlightLayer flights={flights} />
    </div>
  );
}
