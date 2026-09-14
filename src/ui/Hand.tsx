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
        <span className="next-label">next</span>
        <span className="next-card">{next ? CARD_NAMES[next] : ''}</span>
      </div>
      <div className="hand">
        {hand.map((card) => (
          <button
            key={card}
            className={canUse(card) ? 'card' : 'card is-dim'}
            onClick={() => onPick(card)}
          >
            <span className="card-name">{CARD_NAMES[card]}</span>
            <span className="card-cost">{cardCostFor(state, 'you', card, balance)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
