import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { countBuilding, handOf, opponentOf, ownedSlots, scoreOf } from '@/game/selectors';
import type { GameState, PlayerId } from '@/game/types';

/** 評価関数の重み。ハードな条件分岐ではなく、ここの重みで振る舞いを決める。
 *  外から差し替えられるようにして、性格の違う CPU（balance-lab）を作れるようにする。 */
export interface Weights {
  vp: number;
  coin: number;
  /** 相手の手持ちコイン。奪えば相手の購買力が落ちるので、マイナスに効く */
  opponentCoin: number;
  pendingIncome: number;
  incomePerTurn: number;
  opponentVp: number;
  /** 相手が次のターンに買えてしまう物件の価値 */
  threat: number;
  /** 手札のうち、いま払えないカードの枚数 */
  stuck: number;
  /** 相手の手札のうち、相手がいま払えない枚数。相手が詰まっているのは自分に有利なので正の重み */
  opponentStuck: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  vp: 10,
  coin: 1,
  opponentCoin: -0.8,
  pendingIncome: 1.2,
  incomePerTurn: 3,
  opponentVp: -8,
  threat: -0.6,
  stuck: -1.5,
  opponentStuck: 1.0,
};

/** 残りターンの多さ。序盤は収入を、終盤は VP を重く見るための係数。 */
function lateness(state: GameState, balance: Balance): number {
  return Math.min(1, state.turn / (balance.maxTurnsPerPlayer * 2));
}

export function evaluateState(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
  weights: Weights = DEFAULT_WEIGHTS,
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

  // 手札のうち、いま払えないカードの枚数。詰まっているほど打てる手が無い
  const stuck = handOf(state, player, balance).filter(
    (c) => p.coins < balance.cards[c].cost,
  ).length;
  // 相手について同じ計算をする。相手が詰まっているのは自分に有利
  const opponentStuck = handOf(state, foe, balance).filter(
    (c) => state.players[foe].coins < balance.cards[c].cost,
  ).length;

  return (
    scoreOf(state, player, balance) * weights.vp * (0.5 + late) +
    scoreOf(state, foe, balance) * weights.opponentVp * (0.5 + late) +
    p.coins * weights.coin +
    state.players[foe].coins * weights.opponentCoin +
    stuck * weights.stuck +
    opponentStuck * weights.opponentStuck +
    p.pendingIncome.length * weights.pendingIncome * 4 +
    incomePerTurn * weights.incomePerTurn * (1 - late) +
    ownedSlots(state, player).length * 2 +
    threat * weights.threat * (1 - late)
  );
}
