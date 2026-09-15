import { AnimatePresence, motion } from 'motion/react';

import { CARD_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { cardCostFor } from '@/game/reducer';
import { handOf, nextCardOf } from '@/game/selectors';
import type { CardId, GameState } from '@/game/types';

export function Hand({
  state,
  balance = DEFAULT_BALANCE,
  canUse,
  onPick,
}: {
  state: GameState;
  balance?: Balance;
  canUse: (card: CardId) => boolean;
  onPick: (card: CardId) => void;
}) {
  const hand = handOf(state, 'you', balance);
  const next = nextCardOf(state, 'you', balance);
  return (
    <div className="hand-row">
      <div className="next">
        <span className="next-label">次</span>
        <span className="next-card">{next ? CARD_NAMES[next] : ''}</span>
      </div>
      <div className="hand">
        {/* popLayout: 使ったカードは即座にレイアウトから抜けて絶対配置になり、
            残りのカードが左へ詰める（layout="position"）のを邪魔しない。
            使ったカード自身は盤面の方向（上）へ跳ねながら消える。 */}
        <AnimatePresence mode="popLayout" initial={false}>
          {hand.map((card) => (
            <motion.button
              key={card}
              layout="position"
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
              exit={{ opacity: 0, scale: 0.45, y: -46, transition: { duration: 0.2 } }}
              className={canUse(card) ? 'card' : 'card is-dim'}
              onClick={() => onPick(card)}
            >
              <span className="card-name">{CARD_NAMES[card]}</span>
              <span className="card-cost">{cardCostFor(state, 'you', card, balance)}</span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
