import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { canAcquire, canBuild, canUpgrade, canUseCard, reduce } from '@/game/reducer';
import { handSlotsOf, opponentOf, ownedSlots, scoreOf, turnsRemaining, winnerOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { Action, CardId, GameState } from '@/game/types';

import { cardArtOf, FIELD_URL } from './art';
import { Board, type IncomeFlash } from './Board';
import { dragGuide, inspectPick, resolveDrop, type TargetMode } from './card-input';
import { CoinBar, forecast } from './CoinBar';
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
import { incomeLine } from './income-text';
import { hapticBuild, hapticReject, hapticTap, hapticUseCard, hapticWin, hapticYourTurn } from './haptics';
import { Hand } from './Hand';
import { InfoBoard } from './InfoBoard';
import { playStageCue, stageCallout } from './income-stages';
import { dropHitAt, playIncome, runIncomeSequence, useLater } from './play-helpers';
import { buildReview } from './match-log';
import { ResultScreen } from './ResultScreen';
import { useMatchLog } from './use-match-log';
import { Sheet } from './Sheets';
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
  playReject,
  playSelect,
  playUiTap,
  playAcquire,
  playUpgrade,
  playUseCard,
  playWin,
  playYourTurn,
} from './sound';

/** 対象選びの種類 → 開くモード。 */
const TARGET_SHEET: Record<TargetMode, 'heraldTarget' | 'blockadeTarget' | 'inspectTarget'> = {
  herald: 'heraldTarget',
  blockade: 'blockadeTarget',
  inspect: 'inspectTarget',
};

type Pending =
  | { kind: 'slot'; slotId: number }
  | { kind: 'heraldTarget' }
  | { kind: 'blockadeTarget' }
  | { kind: 'inspectTarget' }
  | { kind: 'menu' }
  | { kind: 'confirmExit' }
  | { kind: 'help' }
  | { kind: 'settings' }
  | null;

// 手番交代のスライドが終わるまでの時間。この間は操作を無効化する。
const SWAP_DURATION_MS = 520;
const SWAP_DURATION_S = SWAP_DURATION_MS / 1000;

export function PvpGame({
  seed,
  balance = DEFAULT_BALANCE,
  deck,
  onExit,
  onRestart,
}: {
  seed: number;
  balance?: Balance;
  /** 両者のデッキ（テスト用メニューで新しいカード入りを試す）。省略時は既定の 10 枚。 */
  deck?: readonly CardId[];
  onExit: () => void;
  onRestart: () => void;
}) {
  // PvP は常に 'you' を先手にする（対 CPU モードの乱数先手とは別扱い）。
  // 開始処理（収入）はここでは済ませない。目隠しを開けて手番の帯を見せてから反映する。
  const [state, setState] = useState<GameState>(() => createGame(seed, balance, 'you', deck ? { you: deck, cpu: deck } : {}));
  const stateRef = useRef(state);
  stateRef.current = state;
  // 試合の記録。結果画面の振り返りに使う。
  const matchLog = useMatchLog(state, balance);
  const later = useLater();
  // 手番の受け渡し中（目隠し画面を出している間）。開始直後も 1 人目に渡す前提で出す。
  const [handoff, setHandoff] = useState(true);
  // 目隠しを開けたが、まだ収入を反映していない間。この間は操作を受け付けない。
  const [introPending, setIntroPending] = useState(false);
  // 収入の演出の途中で触ったとき、残りを飛ばして反映する。
  const flushIncome = useRef<(() => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [using, setUsing] = useState<CardId[]>([]);
  // 収入の段の帯と、光らせる建物。
  const [callout, setCallout] = useState<CpuCalloutInfo | null>(null);
  const calloutSeq = useRef(0);
  const [incomeFlash, setIncomeFlash] = useState<IncomeFlash | null>(null);
  const [dragCard, setDragCard] = useState<CardId | null>(null);
  const [sheet, setSheet] = useState<Pending>(null);
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [hapticsOn, setHapticsOn] = useState(() => isHapticsEnabled());
  // BGM（プレイ画面でだけ流す。残り手番で緊張、決着で消える）
  const { bgmOn, toggleBgm } = useGameBgm(turnsRemaining(state, balance), state.phase === 'finished');
  // ターン交代のスライド演出中は操作を無効化する。
  const [swapping, setSwapping] = useState(false);

  const finished = state.phase === 'finished';
  const active = state.current;
  const waiting = opponentOf(active);
  const waitingIncome = forecast(state, waiting, balance);
  const locked = swapping || introPending || busy;

  // 結果画面は、最後の 1 手（建物の着地・数字の弾み）を見せてから出す。
  const [resultReady, setResultReady] = useState(false);
  useEffect(() => {
    if (!finished) return;
    const t = window.setTimeout(() => setResultReady(true), RESULT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [finished]);

  const boardAreaRef = useRef<HTMLDivElement>(null);
  // 衝撃（ヒットストップ・盤面の揺れ）と決着の静止。2 人とも人なので、どちらの手でも震わせる。
  const feel = useBoardFeel(state, boardAreaRef, () => true);
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

  // 手番が替わるたびに盤面を横切る帯を出す（ゲーム開始の 1 回目も）。
  // 目隠しの間は出さず、「はじめる」を押した瞬間に出す。
  const [banner, clearBanner] = useTurnBanner(
    handoff ? 'handoff' : `${state.phase}:${state.current}:${state.turn}`,
    () =>
      handoff || state.phase !== 'playing'
        ? null
        : {
            tone: state.current,
            label: state.current === 'you' ? 'あおのターン' : 'あかのターン',
            sub: `のこり ${turnsRemaining(state, balance)} ターン`,
          },
  );

  // 目隠しを開ける: 手番の帯と鐘を先に出し、収入は帯のあとに反映する（手番 → 収入、の順）。
  const startHandoffTurn = () => {
    if (!handoff) return;
    playYourTurn(0);
    hapticYourTurn();
    setHandoff(false);
    setIntroPending(true);
  };

  // 帯のあと、収入を 1 段ずつ反映する（基礎収入 → 建物収入 → 投資 → 返済。祝祭は建物収入の段で見せる）。
  useEffect(() => {
    if (!introPending) return;
    const seq = runIncomeSequence(stateRef.current, balance, tempo().turnIntroMs, {
      onShow: (b) => {
        calloutSeq.current += 1;
        const who = stateRef.current.current;
        setCallout(stageCallout(b.stage, balance, who, calloutSeq.current));
        setIncomeFlash(
          b.stage.slots.length > 0
            ? { id: calloutSeq.current, slots: b.stage.slots, festival: b.stage.festival && b.stage.kind === 'building' }
            : null,
        );
        playStageCue(b.stage);
      },
      onApply: (b) => {
        playIncome(b.stage.amount);
        setState(b.state);
      },
      onFinish: () => {
        setCallout(null);
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

  useEffect(() => {
    if (!swapping) return;
    const timer = window.setTimeout(() => setSwapping(false), SWAP_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [swapping]);

  // 勝敗が付いた瞬間に 1 回だけ鳴らす。PvP はどちらも人間なので勝ち/負けの
  // 効果音を出し分けず、対戦終了のファンファーレだけ鳴らす。
  // 決着の一瞬の静止と鐘は useBoardFeel が出す。ファンファーレは結果画面と一緒に。
  useEffect(() => {
    if (!resultReady) return;
    playWin();
    hapticWin();
  }, [resultReady]);

  /** カードを使う。溜め → 発動（盤面へ飛ぶ）→ 余韻（効果の一言）の 3 段。音は先に鳴らす。
   *  伝令は、使う札のあとに「山の底へ送る札」も飛ばして（捨てる演出）から反映する。 */
  const commitCard = (card: CardId, action: Action) => {
    const discard = action.type === 'useCard' ? action.heraldTarget : undefined;
    const timing = cardSequence(discard !== undefined);
    playUseCard(card);
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

  /** 物件のアップグレード・買収。建設と同じ間合いで、光る／札が移る演出とコインの増減を一緒に出す。 */
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

  /** 手札をドラッグして離した。カードはこれでしか使わない（CPU 戦と同じ。判定は resolveDrop）。 */
  const dropCard = (card: CardId, point: { x: number; y: number }) => {
    const r = resolveDrop(state, active, card, dropHitAt(point.x, point.y, boardAreaRef.current, card));
    if (r.kind === 'cancel') return;
    if (locked || handoff || !canUseCard(state, card, balance) || r.kind === 'reject') {
      playReject();
      hapticReject();
      return;
    }
    if (r.kind === 'target') return setSheet({ kind: TARGET_SHEET[r.mode] });
    commitCard(card, r.action);
  };

  // 終了ボタン: endTurn だけ進めて目隠しを出す。次の手番側の startTurn（収入）は、
  // 目隠しを開けて帯を見せたあとに反映する（startHandoffTurn）。
  const endTurn = () => {
    playEndTurn();
    const afterEnd = reduce(state, { type: 'endTurn' }, balance);
    if (afterEnd.phase === 'finished') {
      setState(afterEnd);
      return;
    }
    // 手番交代の鐘は、目隠しを開けた瞬間（startHandoffTurn）に鳴らす。
    clearBanner();
    setSheet(null);
    setHandoff(true);
    setSwapping(true);
    setState(afterEnd);
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
      <main className="play">
        <div
          className="board-shell"
          onPointerDownCapture={() => {
            flushIncome.current?.();
            aftermath.skip();
          }}
        >
          <div className={`pvp-opponent${handoff ? ' is-concealed' : ''}`}>
            <AnimatePresence initial={false}>
              <motion.div
                key={waiting}
                initial={{ opacity: 0, y: -28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 28, pointerEvents: 'none' }}
                transition={{ duration: SWAP_DURATION_S, ease: 'easeInOut' }}
              >
                <InfoBoard
                  owner={waiting}
                  coins={state.players[waiting].coins}
                  vp={scoreOf(state, waiting, balance)}
                  sub={<span className="coinbar-forecast">{incomeLine(waitingIncome)}</span>}
                />
              </motion.div>
            </AnimatePresence>
          </div>
          <div className={`board-area${dragCard ? ' is-drop-armed' : ''}`} ref={boardAreaRef}>
            <Board
              state={feel.boardState}
              balance={balance}
              viewer={active}
              targeting={
                sheet?.kind === 'inspectTarget' || dragCard === 'inspector'
                  ? 'foe'
                  : sheet?.kind === 'blockadeTarget' || dragCard === 'blockader'
              }
              dropArmed={dragCard !== null}
              flash={incomeFlash}
              onPick={(slotId) => {
                if (locked) return;
                // 封鎖者の対象選択モード中は、通常の区画詳細シートを開かず、
                // タップした区画をそのまま対象にして確定する（要望 G3）。
                if (sheet?.kind === 'blockadeTarget') {
                  const slot = state.market[slotId];
                  if (!slot || slot.owner === active) {
                    playReject();
                    hapticReject();
                    return;
                  }
                  commitCard('blockader', { type: 'useCard', card: 'blockader', blockadeSlot: slotId });
                  return;
                }
                // 検査官の対象選び: 相手の物件だけ
                if (sheet?.kind === 'inspectTarget') {
                  const r = inspectPick(state, active, slotId);
                  if (!r.ok) {
                    playReject();
                    hapticReject();
                    return;
                  }
                  commitCard('inspector', r.action);
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
            <CpuCallout info={callout} />
            <TurnBanner banner={banner} onDone={clearBanner} />
            {/* 対象選択中の案内はここ（盤面コンテナ）基準で上端中央に置く（要望
                G3）。伝令は手札が対象だが、案内を手札のすぐ上に出すと自分の
                コインバーと重なるため、封鎖者と同じ場所にまとめる。実際にどこを
                タップするかは対象側（盤面の区画／手札のカード）が光って示す。 */}
            <AnimatePresence>
              {dragCard ? <TargetBanner key={`drag-${dragCard}`} label={dragGuide(dragCard)} /> : null}
              {sheet?.kind === 'blockadeTarget' ? (
                <TargetBanner key="blockadeTarget" onCancel={() => setSheet(null)} />
              ) : null}
              {sheet?.kind === 'inspectTarget' ? (
                <TargetBanner key="inspectTarget" label={TARGET_LABEL.inspect} onCancel={() => setSheet(null)} />
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
          <div className={`pvp-self${handoff ? ' is-concealed' : ''}`}>
            <AnimatePresence initial={false}>
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -28, pointerEvents: 'none' }}
                transition={{ duration: SWAP_DURATION_S, ease: 'easeInOut' }}
              >
                <CoinBar
                  state={state}
                  balance={balance}
                  viewer={active}
                  onEndTurn={endTurn}
                  endTurnEnabled={!finished && !locked && !handoff}
                  active={!finished}
                  endTurnHint={
                    !handSlotsOf(state, active).some((c) => c !== null && canUseCard(state, c, balance)) &&
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
                  viewer={active}
                  canUse={(card) => !locked && canUseCard(state, card, balance)}
                  using={using}
                  onDrop={dropCard}
                  onDragActive={setDragCard}
                  targeting={sheet?.kind === 'heraldTarget'}
                  onPick={(card) => {
                    // 伝令の対象選び（盤面で離したあと）。伝令自身は対象にできない。
                    if (locked || sheet?.kind !== 'heraldTarget') return;
                    if (card === 'herald' || !canUseCard(state, 'herald', balance)) {
                      playReject();
                      hapticReject();
                      return;
                    }
                    commitCard('herald', { type: 'useCard', card: 'herald', heraldTarget: card });
                  }}
                  onMenu={() => {
                    if (swapping) return;
                    playUiTap();
                    setSheet({ kind: 'menu' });
                  }}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* シート類は Game.tsx と同じ構成。'you' 決め打ちの参照だけ、いまの
          手番側を表す active (= state.current) に置き換えている。 */}
      <AnimatePresence>
        {sheet?.kind === 'slot' ? (
          <SlotSheet
            key="slot"
            state={state}
            slotId={sheet.slotId}
            viewer={active}
            balance={balance}
            locked={locked}
            ownerName={{ you: 'あお', cpu: 'あか' }}
            onBuild={() => commitBuild(sheet.slotId)}
            onUpgrade={() => commitSlotAction({ type: 'upgrade', slotId: sheet.slotId })}
            onAcquire={() => commitSlotAction({ type: 'acquire', slotId: sheet.slotId })}
            onRoad={commitRoad}
            onClose={() => setSheet(null)}
          />
        ) : null}
      </AnimatePresence>

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

      {/* 手番の受け渡し。手札と相手の情報はぼかし、押すまで次の人の手札を見せない。 */}
      <AnimatePresence>
        {handoff && !finished ? (
          <motion.div
            key={`handoff-${state.turn}-${active}`}
            className={`handoff handoff-${active}`}
            role="dialog"
            aria-modal="true"
            aria-label={`${active === 'you' ? 'あお' : 'あか'}の番です`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, pointerEvents: 'none' }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <motion.div
              className="handoff-body"
              initial={{ y: 24, scale: 0.9 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: -12, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 460, damping: 28 }}
            >
              <p className="handoff-title">{active === 'you' ? 'あお' : 'あか'}の番です</p>
              <p className="handoff-text">
                スマホを <b>{active === 'you' ? 'あお' : 'あか'}</b> の人に渡してください
              </p>
              <button
                className={`btn3d btn3d-lg handoff-btn${active === 'cpu' ? ' btn3d-red' : ''}`}
                onClick={startHandoffTurn}
              >
                <span className="btn3d-label">はじめる</span>
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {finished && resultReady
          ? (() => {
              const w = winnerOf(state, balance);
              return (
                <ResultScreen
                  key="result"
                  title={w === 'you' ? 'あおの勝ち！' : w === 'cpu' ? 'あかの勝ち！' : '引き分け'}
                  tone={w === 'you' || w === 'cpu' ? 'win' : 'draw'}
                  top={{
                    name: 'あか',
                    tone: 'cpu',
                    vp: scoreOf(state, 'cpu', balance),
                    buildings: ownedSlots(state, 'cpu').length,
                  }}
                  bottom={{
                    name: 'あお',
                    tone: 'you',
                    vp: scoreOf(state, 'you', balance),
                    buildings: ownedSlots(state, 'you').length,
                  }}
                  winner={w === 'you' ? 'bottom' : w === 'cpu' ? 'top' : null}
                  review={buildReview(matchLog(), state, balance, { you: 'あお', cpu: 'あか' }, null, null)}
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
