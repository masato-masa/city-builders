import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import {
  handOf,
  incomePerTurnOf,
  opponentOf,
  ownedSlots,
  reachOf,
  scoreOf,
} from '@/game/selectors';
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
  /** いま自分が実際に払える未建設の区画のうち、いちばん VP が高いものの VP。
   *  建築家の割引と高利貸で増やしたコインが、ここで初めて価値になる。 */
  reach: number;
  /** 相手の reach。マイナスに効く。封鎖者（相手の射程を削る）と徴税官（相手のコインを削る）の
   *  価値を、これで同じ物差しで測る。 */
  opponentReach: number;
  /** 相手の 1 ターンあたり収入。封鎖者で相手の物件を止めると下がるので、マイナスに効く */
  opponentIncome: number;
  /** 自分の pendingDebt（高利貸の借り）。マイナスに効く */
  debt: number;
  /** 衛兵が張れているか（0 か 1）。守っているものの大きさを掛けて使う */
  guarded: number;
  /** 相手が買収者を受けているか（bindPending か boundCard が非 null なら 1） */
  opponentBound: number;
  /** 手札のうち、いま払えない・買収者に縛られているカードの枚数 */
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
  reach: 2.0,
  opponentReach: -1.6,
  opponentIncome: -2.0,
  debt: -1.2,
  guarded: 0.5,
  opponentBound: 2.5,
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
  const foeState = state.players[foe];
  const late = lateness(state, balance);

  const incomePerTurn = incomePerTurnOf(state, player, balance);
  const opponentIncome = incomePerTurnOf(state, foe, balance);

  const reach = reachOf(state, player, balance);
  const opponentReach = reachOf(state, foe, balance);

  // 衛兵が守っているものの大きさ。持っているコインと、これから積み上がる収入が
  // 大きいほど「守れて良かった」の価値が上がる。相手の手札は読まない。
  const guarded = p.guarded ? p.coins + incomePerTurn * 3 : 0;

  const opponentBound = foeState.bindPending || foeState.boundCard !== null ? 1 : 0;

  // 手札のうち、いま払えない・買収者に縛られていて使えないカードの枚数
  const stuck = handOf(state, player, balance).filter(
    (c) => p.coins < balance.cards[c].cost || c === p.boundCard,
  ).length;
  // 相手について同じ計算をする（払えない枚数のみ）。相手が詰まっているのは自分に有利
  const opponentStuck = handOf(state, foe, balance).filter(
    (c) => foeState.coins < balance.cards[c].cost,
  ).length;

  return (
    scoreOf(state, player, balance) * weights.vp * (0.5 + late) +
    scoreOf(state, foe, balance) * weights.opponentVp * (0.5 + late) +
    p.coins * weights.coin +
    foeState.coins * weights.opponentCoin +
    stuck * weights.stuck +
    opponentStuck * weights.opponentStuck +
    p.pendingIncome.length * weights.pendingIncome * 4 +
    incomePerTurn * weights.incomePerTurn * (1 - late) +
    opponentIncome * weights.opponentIncome +
    ownedSlots(state, player).length * 2 +
    reach * weights.reach +
    opponentReach * weights.opponentReach +
    p.pendingDebt * weights.debt +
    guarded * weights.guarded +
    opponentBound * weights.opponentBound
  );
}
