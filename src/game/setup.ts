import { ALL_CARDS, DEFAULT_BALANCE, type Balance } from './balance';
import { createRng, shuffle } from './rng';
import type { BuildingSlot, GameState, PlayerId, PlayerState } from './types';

function emptyPlayer(coins: number, deck: PlayerState['deck']): PlayerState {
  return {
    coins,
    deck,
    usedThisTurn: [],
    pendingIncome: [],
    buildDiscount: 0,
    buildsThisTurn: 0,
    usedAnyCardThisTurn: false,
    blockedSlot: null,
    roadUsesThisTurn: 0,
    pendingDebt: 0,
    festivalQueued: false,
    festivalActive: false,
    guarded: false,
    bindPending: false,
    boundCard: null,
    disabledSlot: null,
  };
}

/** シードからゲーム全体を決める。同じシードからは必ず同じ試合になる。 */
export function createGame(
  seed: number,
  balance: Balance = DEFAULT_BALANCE,
  forcedFirst?: PlayerId,
): GameState {
  const rng = createRng(seed);
  const youDeck = shuffle(ALL_CARDS, rng);
  const cpuDeck = shuffle(ALL_CARDS, rng);
  const first: PlayerId = forcedFirst ?? (rng.int(2) === 0 ? 'you' : 'cpu');
  const second: PlayerId = first === 'you' ? 'cpu' : 'you';

  const market: BuildingSlot[] = balance.market.map((buildingId, slotId) => ({
    slotId,
    buildingId,
    owner: null,
  }));

  const players = {
    you: emptyPlayer(0, youDeck),
    cpu: emptyPlayer(0, cpuDeck),
  } as Record<PlayerId, PlayerState>;
  players[first].coins = balance.startingCoins.first;
  players[second].coins = balance.startingCoins.second;

  return {
    seed,
    turn: 1,
    current: first,
    players,
    market,
    phase: 'playing',
  };
}
