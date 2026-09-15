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

/** 効果が生きている自分の物件。封鎖者で止められている 1 件を除く。
 *  VP の計算には使わないこと（VP は止まらない）。 */
export function activeOwnedSlots(state: GameState, player: PlayerId): BuildingSlot[] {
  const disabled = state.players[player].disabledSlot;
  return ownedSlots(state, player).filter((s) => s.slotId !== disabled);
}

export function countBuilding(state: GameState, player: PlayerId, id: BuildingId): number {
  return state.market.filter((s) => s.owner === player && s.buildingId === id).length;
}

export function hasBuilding(state: GameState, player: PlayerId, id: BuildingId): boolean {
  return countBuilding(state, player, id) > 0;
}

/** 区画 1 つが所有者にもたらす VP。未建設なら 0。
 *  大聖堂だけ「自分の他の物件 1 件につき +N」と条件付きで決まる。 */
export function vpOfSlot(
  state: GameState,
  slot: BuildingSlot,
  balance: Balance = DEFAULT_BALANCE,
): number {
  if (slot.owner === null) return 0;
  if (slot.buildingId === 'cathedral') {
    return (ownedSlots(state, slot.owner).length - 1) * balance.cathedralVpPerBuilding;
  }
  return balance.buildings[slot.buildingId].vp;
}

/** 終了時の VP。 */
export function scoreOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  return ownedSlots(state, player).reduce((n, slot) => n + vpOfSlot(state, slot, balance), 0);
}

/** 1 ターンあたりの見込み収入。商館の毎ターン収入と、城塞の通行料の期待値
 *  （相手が残りの区画の半分を建てるという見込み）を織り込む。封鎖者で止まって
 *  いる物件は activeOwnedSlots が除外するのでここには含まれない。
 *  祝祭が queued か active なら、ここまでの値をまとめて festivalMultiplier 倍し、
 *  さらに festivalIncomeBonus を足す。 */
export function incomePerTurnOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  const p = state.players[player];
  const active = activeOwnedSlots(state, player);
  const houseCount = active.filter((s) => s.buildingId === 'tradingHouse').length;
  const fortressCount = active.filter((s) => s.buildingId === 'fortress').length;
  const unbuiltCount = state.market.filter((s) => s.owner === null).length;

  let income =
    balance.baseIncome +
    houseCount * balance.tradingHouseIncome +
    fortressCount * balance.fortressToll * (unbuiltCount / 2);

  if (p.festivalQueued || p.festivalActive) {
    income = income * balance.festivalMultiplier + balance.festivalIncomeBonus;
  }
  return income;
}
