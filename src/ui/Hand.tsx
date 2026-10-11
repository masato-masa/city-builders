import { animate, AnimatePresence, motion, useMotionValue } from 'motion/react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { CARD_NAMES, cardTextFor, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { cardCostFor } from '@/game/reducer';
import { handSlotsOf, nextCardOf } from '@/game/selectors';
import type { CardId, GameState, PlayerId } from '@/game/types';

import { cardArtOf } from './art';
import { classifyPress, doubleNoteOf, DRAG_THRESHOLD_PX, LONG_PRESS_MS, TAP_HINT, useHintOf, type PressKind } from './card-input';
import { hapticTap } from './haptics';
import { MenuIcon } from './icons';
import { playSelect } from './sound';

/** 手札 4 枚の枠番号。PlayerState.hand は常に長さ 4 の固定スロット配列で、
 *  添字がそのまま画面上の枠に対応する（要望 6）。 */
const SLOTS = [0, 1, 2, 3] as const;

/** タップしたときの案内を出しておく時間。 */
const TAP_HINT_MS = 1600;

export function Hand({
  state,
  balance = DEFAULT_BALANCE,
  viewer = 'you',
  canUse,
  targeting = false,
  onPick,
  onMenu,
  using = [],
  onDrop,
  onDragActive,
}: {
  state: GameState;
  balance?: Balance;
  /** 手札を出す側。既定は 'you'（対 CPU モード）。PvP では手番側を渡す。 */
  viewer?: PlayerId;
  canUse: (card: CardId) => boolean;
  /** 伝令の対象選択モード中かどうか。true の間は伝令自身以外のカードがタップで対象になる。
   *  呼び出し側の onPick が実際の確定／拒否を決める（盤面の封鎖者対象選択と同じ形）。 */
  targeting?: boolean;
  /** 対象選択モード中に札をタップした。 */
  onPick: (card: CardId) => void;
  /** 「次」の真上の横長メニューボタン（要望 2）。 */
  onMenu: () => void;
  /** いま使用中の札。盤面へ飛ぶ複製が受け持つので、手札の側では即座に消す。 */
  using?: readonly CardId[];
  /** 札をドラッグして離した。point は離した位置（ビューポート座標）。どこで離したかの判定は呼び出し側。 */
  onDrop?: (card: CardId, point: { x: number; y: number }) => void;
  /** ドラッグの開始・終了。盤面の「ここへ落とす」表示と案内に使う。 */
  onDragActive?: (card: CardId | null) => void;
}) {
  const hand = handSlotsOf(state, viewer);
  const next = nextCardOf(state, viewer, balance);
  const nextArt = next ? cardArtOf(next) : undefined;
  // 長押しで出している説明の札（離すと閉じる）。
  const [peek, setPeek] = useState<CardId | null>(null);
  // ドラッグ中の札（伝令なら、他の札を「ここへ落とせる」と光らせる）。
  const [dragging, setDragging] = useState<CardId | null>(null);
  // タップしただけのときの案内。
  const [hint, setHint] = useState(0);
  useEffect(() => {
    if (hint === 0) return;
    const t = window.setTimeout(() => setHint(0), TAP_HINT_MS);
    return () => window.clearTimeout(t);
  }, [hint]);

  const heraldDrag = dragging === 'herald';
  return (
    <div className={`hand-row hand-row-${viewer}`}>
      <div className="next-col">
        <button className="menu-btn" aria-label="メニュー" onClick={onMenu}>
          <MenuIcon />
        </button>
        <div className="next">
          <span className="next-label">次</span>
          <span className={nextArt ? 'next-card has-art' : 'next-card'}>
            {nextArt ? <img className="card-art" src={nextArt} alt="" /> : null}
            <span className="next-card-name">{next ? CARD_NAMES[next] : ''}</span>
          </span>
        </div>
      </div>
      <div className="hand">
        {/* 枠を固定し、使った枠にそのまま次のカードが入る（要望 6）。
            .card-slot が枠そのもの（グリッドの列幅・比率を持つ）。中の .card は
            position: absolute でその枠いっぱいに重なるので、入れ替わり中に
            2 枚が一瞬同居しても枠の外形は 1px も動かない。 */}
        {SLOTS.map((i) => {
          const card = hand[i];
          return (
            <div className="card-slot" key={i}>
              <AnimatePresence initial={false}>
                {card ? (
                  <CardButton
                    key={card}
                    card={card}
                    state={state}
                    balance={balance}
                    viewer={viewer}
                    usable={canUse(card)}
                    targeting={targeting || heraldDrag}
                    using={using.includes(card)}
                    onTargetPick={targeting ? onPick : undefined}
                    onDrop={onDrop}
                    onDragActive={(c) => {
                      setDragging(c);
                      onDragActive?.(c);
                    }}
                    onPeek={setPeek}
                    onTap={() => setHint((n) => n + 1)}
                  />
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
      {/* 長押しの説明・タップの案内。手札の上に重ねて出す（絶対配置で寸法は動かない）。
          閉じる途中のクリックは吸わない。 */}
      <AnimatePresence>
        {peek ? (
          <CardPeek key={`peek-${peek}`} card={peek} state={state} viewer={viewer} balance={balance} />
        ) : hint > 0 && !targeting ? (
          <motion.div
            key="hint"
            className="hand-hint"
            role="status"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, pointerEvents: 'none' }}
            transition={{ duration: 0.16 }}
          >
            {TAP_HINT}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** 長押ししている札の説明。手札の真上に出す。 */
function CardPeek({
  card,
  state,
  viewer,
  balance,
}: {
  card: CardId;
  state: GameState;
  viewer: PlayerId;
  balance: Balance;
}) {
  const art = cardArtOf(card);
  return (
    <motion.div
      className="card-peek"
      role="dialog"
      aria-label={`${CARD_NAMES[card]}の説明`}
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, pointerEvents: 'none', transition: { duration: 0.1 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 32 }}
    >
      {art ? <img className="card-peek-art" src={art} alt="" /> : null}
      <div className="card-peek-body">
        <p className="card-peek-title">
          {CARD_NAMES[card]}
          <span className="card-peek-cost">コスト {cardCostFor(state, viewer, card, balance)}</span>
        </p>
        <p className="card-peek-text">{cardTextFor(card, balance)}</p>
        {card === 'blockader' ? <p className="card-peek-note">効くのは次の相手のターンだけです（地区全体。自分の物件には何も起きない）。</p> : null}
        {card === 'double' ? <p className="card-peek-note">{doubleNoteOf(state, viewer, card, balance)}</p> : null}
        <p className="card-peek-note">{useHintOf(state, viewer, card)}</p>
      </div>
    </motion.div>
  );
}

interface Press {
  pointerId: number;
  x0: number;
  y0: number;
  t0: number;
  kind: PressKind;
  /** 長押しで説明を出したか（出したあとに動かせばドラッグへ移る） */
  peeked: boolean;
  timer: number;
}

function CardButton({
  card,
  state,
  balance,
  viewer,
  usable,
  targeting,
  using,
  onTargetPick,
  onDrop,
  onDragActive,
  onPeek,
  onTap,
}: {
  card: CardId;
  state: GameState;
  balance: Balance;
  viewer: PlayerId;
  usable: boolean;
  targeting: boolean;
  using: boolean;
  /** 伝令の対象選びの間だけ。タップでその札を対象にする。 */
  onTargetPick?: (card: CardId) => void;
  onDrop?: (card: CardId, point: { x: number; y: number }) => void;
  onDragActive: (card: CardId | null) => void;
  onPeek: (card: CardId | null) => void;
  onTap: () => void;
}) {
  const art = cardArtOf(card);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const press = useRef<Press | null>(null);
  const [lifted, setLifted] = useState(false);
  // 対象選び中の札・使用中の札は持ち上げない。使えない札も持ち上げられる（離すと理由の音が鳴る）。
  const draggable = !!onDrop && !using && !onTargetPick;

  const end = (e: ReactPointerEvent, dropped: boolean) => {
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId) return;
    window.clearTimeout(p.timer);
    press.current = null;
    if (p.kind === 'drag') {
      setLifted(false);
      onDragActive(null);
      if (dropped) onDrop?.(card, { x: e.clientX, y: e.clientY });
      // 元の枠へバネで戻る（使用になれば、そのまま消える）。
      animate(x, 0, { type: 'spring', stiffness: 600, damping: 38 });
      animate(y, 0, { type: 'spring', stiffness: 600, damping: 38 });
    } else if (p.kind === 'longpress') {
      onPeek(null);
    } else if (dropped) {
      // 動かさずに短く離した＝タップ。対象選び中ならその札を対象に、そうでなければ案内だけ。
      if (onTargetPick) onTargetPick(card);
      else onTap();
    }
  };

  const className = [
    'card',
    art ? 'has-art' : null,
    !targeting && !usable ? 'is-dim' : null,
    targeting && card !== 'herald' ? 'is-targetable' : null,
    targeting && card === 'herald' && !lifted ? 'is-target-invalid' : null,
    lifted ? 'is-selected' : null,
    !targeting && usable ? 'is-usable' : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    // 外側が指の追従（x / y）、内側のボタンが出現・押した感触の動き（入れ子で分ける）。
    // 外側は枠（.card-slot）いっぱいに重なる。離すと元の位置へ戻り、使用になれば消える。
    <motion.div
      className={`card-drag${lifted ? ' is-lifted' : ''}`}
      data-hand-card={card}
      style={{ x, y, zIndex: lifted ? 60 : undefined }}
      animate={{ opacity: using ? 0 : 1, scale: lifted ? 1.12 : 1 }}
      initial={{ opacity: 0 }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.1 } }}
      transition={{ opacity: { duration: using ? 0.08 : 0.2 }, scale: { type: 'spring', stiffness: 520, damping: 30 } }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.button !== 0 || using) return;
        try {
          // 指が札の外へ出ても、離すまでこの札が受け取る。
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // 取れない環境（合成イベントなど）でも、押す・離すの判定は続ける
        }
        const timer = window.setTimeout(() => {
          const p = press.current;
          if (!p || p.kind !== 'pending') return;
          p.kind = 'longpress';
          p.peeked = true;
          playSelect();
          hapticTap();
          onPeek(card);
        }, LONG_PRESS_MS);
        press.current = { pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), kind: 'pending', timer, peeked: false };
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p || p.pointerId !== e.pointerId) return;
        const dx = e.clientX - p.x0;
        const dy = e.clientY - p.y0;
        // 長押しで説明を見たあとでも、指を動かしたらドラッグに移る（迷ってから動かす指は多い）。
        // 持ち上げられない札の「動かした」印（peeked: false の longpress）はそのまま。
        const moved = Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;
        if (p.kind === 'longpress' && p.peeked && moved && draggable) {
          onPeek(null);
          p.kind = 'pending';
        }
        if (p.kind === 'pending' && classifyPress(dx, dy, performance.now() - p.t0) === 'drag') {
          window.clearTimeout(p.timer);
          if (!draggable) {
            // 持ち上げられない札は、動かした時点でタップ扱いもやめる（何もしない）。
            p.kind = 'longpress';
            return;
          }
          p.kind = 'drag';
          setLifted(true);
          onDragActive(card);
        }
        if (p.kind === 'drag') {
          x.set(dx);
          y.set(dy);
        }
      }}
      onPointerUp={(e) => end(e, true)}
      onPointerCancel={(e) => end(e, false)}
    >
      <motion.button
        className={className}
        data-card={card}
        // 指で押している間の縮みだけをここで出す（キーボードでは押せない: 操作はドラッグ）。
        tabIndex={-1}
        initial={{ y: 26, scale: 0.92 }}
        animate={{ y: 0, scale: 1 }}
        whileTap={lifted ? undefined : { scale: 0.93, y: 2 }}
        transition={{ type: 'spring', stiffness: 520, damping: 30 }}
      >
        <span className="card-body">
          {art ? <img className="card-art" src={art} alt="" draggable={false} /> : null}
          <span className="card-name">{CARD_NAMES[card]}</span>
        </span>
        {/* コストは金貨の宝石バッジ（クラロワのエリクサーの雫に当たる）。 */}
        <span className="card-cost">
          <span className="card-cost-num">{cardCostFor(state, viewer, card, balance)}</span>
        </span>
      </motion.button>
    </motion.div>
  );
}
