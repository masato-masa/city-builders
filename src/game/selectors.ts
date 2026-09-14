import { DEFAULT_BALANCE, type Balance } from './balance';
import type { BuildingId, BuildingSlot, CardId, GameState, PlayerId } from './types';

/** 勝者。まだ終わっていなければ null。 */
export function winnerOf(
  state: GameState,
  balance: Balance = DEFAULT_BALANCE,
): PlayerId | 'draw' | null {
  if (state.phase !== 'finished') return null;
  const you = scoreOf(state, 'you', balance);
  const cpu = scoreOf(state, 'cpu', balance);
  if (you !== cpu) return you > cpu ? 'you' : 'cpu';
  const youCoins = state.players.you.coins;
  const cpuCoins = state.players.cpu.coins;
  if (youCoins !== cpuCoins) return youCoins > cpuCoins ? 'you' : 'cpu';
  return 'draw';
}

export function opponentOf(player: PlayerId): PlayerId {
  return player === 'you' ? 'cpu' : 'you';
}

export function handOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): CardId[] {
  return state.players[player].deck.slice(0, balance.handSize);
}

/** 手札の次に来る 1 枚。クラロワの next と同じ。 */
export function nextCardOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): CardId | null {
  return state.players[player].deck[balance.handSize] ?? null;
}

export function ownedSlots(state: GameState, player: PlayerId): BuildingSlot[] {
  return state.market.filter((s) => s.owner === player);
}

export function countBuilding(state: GameState, player: PlayerId, id: BuildingId): number {
  return state.market.filter((s) => s.owner === player && s.buildingId === id).length;
}

export function hasBuilding(state: GameState, player: PlayerId, id: BuildingId): boolean {
  return countBuilding(state, player, id) > 0;
}

/** 終了時の VP。大聖堂だけ「自分の他の物件 1 件につき +2」で計算する。 */
export function scoreOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  const owned = ownedSlots(state, player);
  let total = 0;
  for (const slot of owned) {
    if (slot.buildingId === 'cathedral') {
      total += (owned.length - 1) * balance.cathedralVpPerBuilding;
    } else {
      total += balance.buildings[slot.buildingId].vp;
    }
  }
  return total;
}
