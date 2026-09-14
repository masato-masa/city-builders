import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { countBuilding, hasBuilding, ownedSlots } from '@/game/selectors';
import type { GameState } from '@/game/types';

/** 次のターン開始時に入る見込み額。遅延収入のゲームなので、これが無いと判断できない。 */
function forecast(state: GameState, balance: Balance): number {
  const p = state.players.you;
  const bonus = hasBuilding(state, 'you', 'exchange') ? balance.exchangeBonus : 0;
  let total =
    balance.baseIncome + countBuilding(state, 'you', 'tradingHouse') * balance.tradingHouseIncome;
  for (const card of p.pendingIncome) {
    if (card === 'miner') total += balance.minerIncome + bonus;
    if (card === 'merchant') total += balance.merchantIncome + bonus;
    if (card === 'banker') {
      total += balance.bankerIncome + ownedSlots(state, 'you').length * balance.bankerPerBuilding + bonus;
    }
  }
  return total;
}

export function CoinBar({
  state,
  balance = DEFAULT_BALANCE,
}: {
  state: GameState;
  balance?: Balance;
}) {
  return (
    <div className="coinbar">
      <span className="coinbar-amount">{state.players.you.coins}</span>
      <span className="coinbar-forecast">次のターン +{forecast(state, balance)}</span>
    </div>
  );
}
