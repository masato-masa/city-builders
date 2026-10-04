import { AnimatePresence, motion } from 'motion/react';

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
}) {
  const art = CARD_ART[card];
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
    <motion.button
      className={className}
      data-card={card}
      initial={{ y: 26, opacity: 0, scale: 0.92 }}
      // 選んだ札は 8px 持ち上げて少し大きく（クラロワの選択中の札と同じ）。
      // transform だけなので枠（.card-slot）は動かない。
      animate={{ y: selected ? -8 : 0, opacity: 1, scale: selected ? 1.06 : 1 }}
      whileTap={{ scale: selected ? 1.02 : 0.93, y: selected ? -6 : 2 }}
      // 使った札は盤面へ飛ぶ複製（Fx.tsx の CardFlightLayer）が受け持つので、ここではすぐ消す。
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.1 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 30 }}
      onClick={() => onPick(card)}
    >
      <span className="card-body">
        {art ? <img className="card-art" src={art} alt="" /> : null}
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
  );
}
