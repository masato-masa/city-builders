import { DEFAULT_BALANCE, type Balance } from './balance';
import { handOf, hasBuilding } from './selectors';
import type { Action, CardId, GameState, PlayerId } from './types';

/** 工場の割引を織り込んだ、いま実際に払う額。 */
export function cardCostFor(
  state: GameState,
  player: PlayerId,
  card: CardId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  const base = balance.cards[card].cost;
  const p = state.players[player];
  if (!p.usedAnyCardThisTurn && hasBuilding(state, player, 'factory')) {
    return Math.max(0, base - balance.factoryDiscount);
  }
  return base;
}

export function canUseCard(
  state: GameState,
  card: CardId,
  balance: Balance = DEFAULT_BALANCE,
): boolean {
  if (state.phase !== 'playing') return false;
  const player = state.current;
  const p = state.players[player];
  if (!handOf(state, player, balance).includes(card)) return false;
  if (p.usedThisTurn.includes(card)) return false;
  return p.coins >= cardCostFor(state, player, card, balance);
}

/** カードをデッキの最後尾へ回す。手札は deck の先頭なので、これだけで補充される。 */
function moveToBottom(deck: CardId[], card: CardId): CardId[] {
  const idx = deck.indexOf(card);
  if (idx < 0) return deck;
  return [...deck.slice(0, idx), ...deck.slice(idx + 1), card];
}

export function reduce(
  state: GameState,
  action: Action,
  balance: Balance = DEFAULT_BALANCE,
): GameState {
  switch (action.type) {
    case 'useCard':
      return useCard(state, action, balance);
    default:
      return state;
  }
}

function useCard(
  state: GameState,
  action: Extract<Action, { type: 'useCard' }>,
  balance: Balance,
): GameState {
  if (!canUseCard(state, action.card, balance)) return state;

  const next = structuredClone(state);
  const player = next.current;
  const p = next.players[player];

  p.coins -= cardCostFor(state, player, action.card, balance);
  p.usedAnyCardThisTurn = true;
  p.usedThisTurn = [...p.usedThisTurn, action.card];
  p.deck = moveToBottom(p.deck, action.card);

  return next;
}
