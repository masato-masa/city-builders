import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { countBuilding, hasBuilding, ownedSlots, scoreOf } from '@/game/selectors';
import type { GameState } from '@/game/types';

import { RollingNumber } from './RollingNumber';

/** 次のターン開始時に入る見込み額。遅延収入のゲームなので、これが無いと判断できない。 */
function forecast(state: GameState, balance: Balance): number {
  const p = state.players.you;
  const bonus = hasBuilding(state, 'you', 'exchange') ? balance.exchangeBonus : 0;
  let total =
    balance.baseIncome + countBuilding(state, 'you', 'tradingHouse') * balance.tradingHouseIncome;
  for (const card of p.pendingIncome) {
    if (card === 'miner') total += balance.minerIncome + bonus;
    if (card === 'banker') {
      total += balance.bankerIncome + ownedSlots(state, 'you').length * balance.bankerPerBuilding + bonus;
    }
  }
  return total;
}

/** 自分の帯（プレイ画面いちばん下、手札のすぐ上）。色の印・所持コイン・
 *  次のターンの見込み・VP・終了ボタンを 1 行に出す（街道はここに置かない。
 *  カードを選んだときのシートへ移した＝要望 2）。 */
export function CoinBar({
  state,
  balance = DEFAULT_BALANCE,
  onEndTurn,
  endTurnEnabled,
}: {
  state: GameState;
  balance?: Balance;
  onEndTurn: () => void;
  endTurnEnabled: boolean;
}) {
  return (
    <div className="coinbar">
      <span className="owner-mark owner-mark-you" aria-hidden="true" />
      <RollingNumber className="coinbar-amount" value={state.players.you.coins} />
      <span className="coinbar-forecast">次のターン +{forecast(state, balance)}</span>
      <span className="coinbar-vp">{scoreOf(state, 'you', balance)} VP</span>
      <button className="coinbar-btn is-primary" onClick={onEndTurn} disabled={!endTurnEnabled}>
        終了
      </button>
    </div>
  );
}
