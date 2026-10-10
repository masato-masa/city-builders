import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import {
  CARD_NAMES,
  cardTextFor,
  DEFAULT_BALANCE,
  type Balance,
} from '@/game/balance';
import { canAcquire, canBuild, canUpgrade, canUseCard, canUseRoad, cardCostFor, reduce } from '@/game/reducer';
import { handSlotsOf, opponentOf, ownedSlots, roadUsesRemaining, scoreOf, turnsRemaining, winnerOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { Action, CardId, GameState } from '@/game/types';

import { CARD_ART, FIELD_URL } from './art';
import { Board, type IncomeFlash } from './Board';
import { CoinBar, forecast } from './CoinBar';
import {
  CardFlightLayer,
  CpuCallout,
  type CpuCalloutInfo,
  TurnBanner,
  useCardFlights,
  useTurnBanner,
} from './Fx';
import { hapticBuild, hapticReject, hapticTap, hapticUseCard, hapticWin, hapticYourTurn } from './haptics';
import { Hand } from './Hand';
import { InfoBoard } from './InfoBoard';
import { playStageCue, stageCallout } from './income-stages';
import { playIncome, runIncomeSequence, slotAtPoint, useLater } from './play-helpers';
import { ResultScreen } from './ResultScreen';
import { Sheet } from './Sheets';
import { SlotSheet } from './SlotSheet';
import { TargetBanner } from './TargetBanner';
import {
  BUILD_EFFECT_DELAY_MS,
  CARD_EFFECT_DELAY_MS,
  DISCARD_AT_MS,
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

// 手番交代のスライドが終わるまでの時間。この間は操作を無効化する。
const SWAP_DURATION_MS = 520;
const SWAP_DURATION_S = SWAP_DURATION_MS / 1000;

export function PvpGame({
  seed,
  balance = DEFAULT_BALANCE,
  onExit,
  onRestart,
}: {
  seed: number;
  balance?: Balance;
  onExit: () => void;
  onRestart: () => void;
}) {
  // PvP は常に 'you' を先手にする（対 CPU モードの乱数先手とは別扱い）。
  // 開始処理（収入）はここでは済ませない。目隠しを開けて手番の帯を見せてから反映する。
  const [state, setState] = useState<GameState>(() => createGame(seed, balance, 'you'));
  const stateRef = useRef(state);
  stateRef.current = state;
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
    const seq = runIncomeSequence(stateRef.current, balance, TURN_INTRO_MS, {
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
  useEffect(() => {
    if (!finished) return;
    playWin();
    hapticWin();
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

  /** 物件のアップグレード・買収。建設と同じ間合いで、光る／札が移る演出とコインの増減を一緒に出す。 */
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
    if (locked || handoff) return;
    if (!canUseCard(state, card, balance)) {
      playReject();
      hapticReject();
      return;
    }
    if (card === 'herald') return setSheet({ kind: 'heraldTarget' });
    if (card === 'blockader') {
      const slotId = slotAtPoint(point.x, point.y);
      if (slotId === null) return setSheet({ kind: 'blockadeTarget' });
      const slot = state.market[slotId];
      if (!slot || slot.owner === active) {
        playReject();
        hapticReject();
        return;
      }
      return commitCard(card, { type: 'useCard', card, blockadeSlot: slotId });
    }
    commitCard(card, { type: 'useCard', card });
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
      <main className="play">
        <div className="board-shell" onPointerDownCapture={() => flushIncome.current?.()}>
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
                  sub={
                    <span className="coinbar-forecast">
                      次ターン収入 {waitingIncome >= 0 ? `+${waitingIncome}` : waitingIncome}
                    </span>
                  }
                />
              </motion.div>
            </AnimatePresence>
          </div>
          <div className={`board-area${dragCard ? ' is-drop-armed' : ''}`} ref={boardAreaRef}>
            <Board
              state={state}
              balance={balance}
              viewer={active}
              targeting={sheet?.kind === 'blockadeTarget'}
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
            <CpuCallout info={callout} />
            <TurnBanner banner={banner} onDone={clearBanner} />
            {/* 対象選択中の案内はここ（盤面コンテナ）基準で上端中央に置く（要望
                G3）。伝令は手札が対象だが、案内を手札のすぐ上に出すと自分の
                コインバーと重なるため、封鎖者と同じ場所にまとめる。実際にどこを
                タップするかは対象側（盤面の区画／手札のカード）が光って示す。 */}
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
                  dropRef={boardAreaRef}
                  onDrop={dropCard}
                  onDragActive={setDragCard}
                  targeting={sheet?.kind === 'heraldTarget'}
                  selected={sheet?.kind === 'card' ? sheet.card : null}
                  onPick={(card) => {
                    if (locked) return;
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
            <button
              className="sheet-row road-btn"
              disabled={locked || !canUseRoad(state, sheet.card, balance)}
              onClick={() => commitRoad(sheet.card)}
            >
              <span>山の底へ送る</span>
              <span className="road-btn-sub">街道・あと {roadUsesRemaining(state, active, balance)} 回</span>
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
              {canUseCard(state, sheet.card, balance) ||
              state.current !== active ||
              state.players[active].coins >= cardCostFor(state, active, sheet.card, balance)
                ? '使う'
                : `あと ${cardCostFor(state, active, sheet.card, balance) - state.players[active].coins} コイン`}
            </button>
          </Sheet>
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
                  tone={w === null ? 'draw' : 'win'}
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
