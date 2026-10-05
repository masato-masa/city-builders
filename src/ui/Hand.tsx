import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { useRef, type RefObject } from 'react';

import { CARD_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { cardCostFor } from '@/game/reducer';
import { handSlotsOf, nextCardOf } from '@/game/selectors';
import type { CardId, GameState, PlayerId } from '@/game/types';

import { CARD_ART } from './art';
import { ChainIcon, MenuIcon } from './icons';

/** 手札 4 枚の枠番号。PlayerState.hand は常に長さ 4 の固定スロット配列で、
 *  添字がそのまま画面上の枠に対応する（要望 6）。 */
const SLOTS = [0, 1, 2, 3] as const;

export function Hand({
  state,
  balance = DEFAULT_BALANCE,
  viewer = 'you',
  canUse,
  targeting = false,
  selected = null,
  onPick,
  onMenu,
  using = null,
  dropRef,
  onDrop,
  onDragActive,
}: {
  state: GameState;
  balance?: Balance;
  /** 手札を出す側。既定は 'you'（対 CPU モード）。PvP では手番側を渡す。 */
  viewer?: PlayerId;
  canUse: (card: CardId) => boolean;
  /** 伝令の対象選択モード中かどうか。true の間は使用可否に関係なく、
   *  伝令自身以外のカードがすべて対象としてタップできる。呼び出し側の
   *  onPick が実際の確定／拒否を決める（盤面の封鎖者対象選択と同じ形）。 */
  targeting?: boolean;
  /** 詳細シートを開いている札。持ち上げて金の枠で囲む。 */
  selected?: CardId | null;
  onPick: (card: CardId) => void;
  /** 「次」の真上の横長メニューボタン（要望 2）。 */
  onMenu: () => void;
  /** いま使用中の札。盤面へ飛ぶ複製が受け持つので、手札の側では即座に消す。 */
  using?: CardId | null;
  /** ドラッグで離したとき「使用」になる領域（盤面）。 */
  dropRef?: RefObject<HTMLElement | null>;
  /** 札を盤面の上で離した。point は離した位置（ビューポート座標）。 */
  onDrop?: (card: CardId, point: { x: number; y: number }) => void;
  /** ドラッグの開始・終了。盤面の「ここへ落とす」表示に使う。 */
  onDragActive?: (card: CardId | null) => void;
}) {
  const hand = handSlotsOf(state, viewer);
  const next = nextCardOf(state, viewer, balance);
  const nextArt = next ? CARD_ART[next] : undefined;
  const bound = state.players[viewer].boundCards;
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
            2 枚が一瞬同居しても枠の外形は 1px も動かない。新しい札は下から
            差し込み、抜けた札は上へ小さくなりながら消える。 */}
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
                    bound={bound.includes(card)}
                    targeting={targeting}
                    selected={selected === card}
                    onPick={onPick}
                    using={using === card}
                    dropRef={dropRef}
                    onDrop={onDrop}
                    onDragActive={onDragActive}
                  />
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardButton({
  card,
  state,
  balance,
  viewer,
  usable,
  bound,
  targeting,
  selected,
  onPick,
  using,
  dropRef,
  onDrop,
  onDragActive,
}: {
  card: CardId;
  state: GameState;
  balance: Balance;
  viewer: PlayerId;
  usable: boolean;
  /** 買収者に縛られて今ターン使えないカードか。使えない理由が「買収者」だと
   *  ひと目で分かるよう、コスト不足の is-dim とは別に鎖マークを出す。 */
  bound: boolean;
  targeting: boolean;
  selected: boolean;
  onPick: (card: CardId) => void;
  using: boolean;
  dropRef?: RefObject<HTMLElement | null>;
  onDrop?: (card: CardId, point: { x: number; y: number }) => void;
  onDragActive?: (card: CardId | null) => void;
}) {
  const art = CARD_ART[card];
  // ドラッグ直後に出る click を、タップ（シートを開く）と取り違えない。
  const dragged = useRef(false);
  // 使えない札・対象選択中・使用中は持ち上げられない（理由はタップで開くシートが言う）。
  const draggable = !!onDrop && usable && !targeting && !using;
  const overDrop = (info: PanInfo) => {
    const el = dropRef?.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return info.point.x >= r.left && info.point.x <= r.right && info.point.y >= r.top && info.point.y <= r.bottom;
  };
  // 対象選択モード中（伝令）は、使用可否と無関係に「伝令自身か・そうでないか」
  // だけで見た目を決める。盤面の封鎖者対象選択と同じ考え方（要望参照）。
  const targetable = targeting && card !== 'herald';
  const targetInvalid = targeting && card === 'herald';
  const className = [
    'card',
    art ? 'has-art' : null,
    !targeting && !usable ? 'is-dim' : null,
    !targeting && bound ? 'is-bound' : null,
    targetable ? 'is-targetable' : null,
    targetInvalid ? 'is-target-invalid' : null,
    selected ? 'is-selected' : null,
    !targeting && usable ? 'is-usable' : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    // 外側がドラッグ、内側のボタンが選択・出現の動き（どちらも y を使うので入れ子で分ける）。
    // 外側は枠（.card-slot）いっぱいに重なる。離すと元の位置へ戻り、使用になれば消える。
    <motion.div
      className="card-drag"
      drag={draggable}
      dragSnapToOrigin
      dragElastic={0.18}
      dragMomentum={false}
      whileDrag={{ scale: 1.12, zIndex: 60, cursor: 'grabbing' }}
      animate={{ opacity: using ? 0 : 1 }}
      initial={{ opacity: 0 }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.1 } }}
      transition={{ opacity: { duration: using ? 0.08 : 0.2 } }}
      onDragStart={() => {
        dragged.current = true;
        onDragActive?.(card);
      }}
      onDragEnd={(_, info) => {
        onDragActive?.(null);
        // click は離した直後に来るので、少し経ってから「ドラッグではない」に戻す。
        window.setTimeout(() => {
          dragged.current = false;
        }, 60);
        if (overDrop(info)) onDrop?.(card, { x: info.point.x, y: info.point.y });
      }}
    >
      <motion.button
        className={className}
        data-card={card}
        initial={{ y: 26, scale: 0.92 }}
        // 選んだ札は 8px 持ち上げて少し大きく（クラロワの選択中の札と同じ）。
        // transform だけなので枠（.card-slot）は動かない。
        animate={{ y: selected ? -8 : 0, scale: selected ? 1.06 : 1 }}
        whileTap={{ scale: selected ? 1.02 : 0.93, y: selected ? -6 : 2 }}
        transition={{ type: 'spring', stiffness: 520, damping: 30 }}
        onClick={() => {
          if (dragged.current) return;
          onPick(card);
        }}
      >
        <span className="card-body">
          {art ? <img className="card-art" src={art} alt="" draggable={false} /> : null}
          <span className="card-name">{CARD_NAMES[card]}</span>
        </span>
        {!targeting && bound ? (
          <span className="card-chain-badge" aria-hidden="true">
            <ChainIcon />
          </span>
        ) : null}
        {/* コストは金貨の宝石バッジ（クラロワのエリクサーの雫に当たる）。 */}
        <span className="card-cost">
          <span className="card-cost-num">{cardCostFor(state, viewer, card, balance)}</span>
        </span>
      </motion.button>
    </motion.div>
  );
}
