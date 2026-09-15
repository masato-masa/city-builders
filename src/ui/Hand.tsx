import { AnimatePresence, motion } from 'motion/react';

import { CARD_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { cardCostFor } from '@/game/reducer';
import { handOf, nextCardOf } from '@/game/selectors';
import type { CardId, GameState } from '@/game/types';

import { CARD_ART } from './art';
import { MenuIcon } from './icons';

/** 手札 4 枚の枠番号。handOf は常に balance.handSize（4）枚を返すので、
 *  添字 0〜3 をそのまま枠として使う（要望 6）。 */
const SLOTS = [0, 1, 2, 3] as const;

export function Hand({
  state,
  balance = DEFAULT_BALANCE,
  canUse,
  onPick,
  onMenu,
}: {
  state: GameState;
  balance?: Balance;
  canUse: (card: CardId) => boolean;
  onPick: (card: CardId) => void;
  /** 「次」の真上の横長メニューボタン（要望 2）。 */
  onMenu: () => void;
}) {
  const hand = handOf(state, 'you', balance);
  const next = nextCardOf(state, 'you', balance);
  const nextArt = next ? CARD_ART[next] : undefined;
  return (
    <div className="hand-row">
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
                    usable={canUse(card)}
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
  usable,
  onPick,
}: {
  card: CardId;
  state: GameState;
  balance: Balance;
  usable: boolean;
  onPick: (card: CardId) => void;
}) {
  const art = CARD_ART[card];
  const className = ['card', art ? 'has-art' : null, usable ? null : 'is-dim'].filter(Boolean).join(' ');
  return (
    <motion.button
      className={className}
      initial={{ y: 26, opacity: 0, scale: 0.92 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.45, y: -46, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }}
      onClick={() => onPick(card)}
    >
      <span className="card-body">
        {art ? <img className="card-art" src={art} alt="" /> : null}
        <span className="card-name">{CARD_NAMES[card]}</span>
      </span>
      <span className="card-cost">{cardCostFor(state, 'you', card, balance)}</span>
    </motion.button>
  );
}
