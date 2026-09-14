import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { countBuilding, opponentOf, ownedSlots, scoreOf } from '@/game/selectors';
import type { GameState, PlayerId } from '@/game/types';

/** 重み。ハードな条件分岐ではなく、ここの重みで振る舞いを決める。 */
const W = {
  vp: 10,
  coin: 1,
  pendingIncome: 1.2,
  incomePerTurn: 3,
  opponentVp: -8,
  /** 相手が次のターンに買えてしまう物件の価値 */
  threat: -0.6,
};

/** 残りターンの多さ。序盤は収入を、終盤は VP を重く見るための係数。 */
function lateness(state: GameState, balance: Balance): number {
  return Math.min(1, state.turn / (balance.maxTurnsPerPlayer * 2));
}

export function evaluateState(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  const foe = opponentOf(player);
  const p = state.players[player];
  const late = lateness(state, balance);

  const incomePerTurn =
    balance.baseIncome + countBuilding(state, player, 'tradingHouse') * balance.tradingHouseIncome;

  let threat = 0;
  for (const slot of state.market) {
    if (slot.owner !== null) continue;
    const cost = balance.buildings[slot.buildingId].cost;
    if (state.players[foe].coins >= cost) {
      threat += balance.buildings[slot.buildingId].vp;
    }
  }

  return (
    scoreOf(state, player, balance) * W.vp * (0.5 + late) +
    scoreOf(state, foe, balance) * W.opponentVp * (0.5 + late) +
    p.coins * W.coin +
    p.pendingIncome.length * W.pendingIncome * 4 +
    incomePerTurn * W.incomePerTurn * (1 - late) +
    ownedSlots(state, player).length * 2 +
    threat * W.threat * (1 - late)
  );
}
