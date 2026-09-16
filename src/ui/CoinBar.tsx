import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { countBuilding, hasBuilding, ownedSlots, scoreOf } from '@/game/selectors';
import type { GameState, PlayerId } from '@/game/types';

import { InfoBoard } from './InfoBoard';

/** 次のターン開始時に入る見込み額。遅延収入のゲームなので、これが無いと判断できない。 */
function forecast(state: GameState, viewer: PlayerId, balance: Balance): number {
  const p = state.players[viewer];
  const bonus = hasBuilding(state, viewer, 'exchange') ? balance.exchangeBonus : 0;
  let total =
    balance.baseIncome + countBuilding(state, viewer, 'tradingHouse') * balance.tradingHouseIncome;
  for (const card of p.pendingIncome) {
    if (card === 'miner') total += balance.minerIncome + bonus;
    if (card === 'banker') {
      total += balance.bankerIncome + ownedSlots(state, viewer).length * balance.bankerPerBuilding + bonus;
    }
  }
  return total;
}

/** 自分の情報ボード（プレイ画面いちばん下、手札のすぐ上）。相手の帯と同じ骨格
 *  （要望 4）の右側に終了ボタン、2 段目に次のターンの見込みを出す
 *  （街道はここに置かない。カードを選んだときのシートへ移した＝要望 2）。 */
export function CoinBar({
  state,
  balance = DEFAULT_BALANCE,
  viewer = 'you',
  name = 'あなた',
  onEndTurn,
  endTurnEnabled,
}: {
  state: GameState;
  balance?: Balance;
  /** この帯が表す側。既定は 'you'（対 CPU モード）。PvP では手番側を渡す。 */
  viewer?: PlayerId;
  /** 帯に出す名前。対 CPU モードは常に「あなた」。 */
  name?: string;
  onEndTurn: () => void;
  endTurnEnabled: boolean;
}) {
  return (
    <InfoBoard
      owner={viewer}
      name={name}
      coins={state.players[viewer].coins}
      vp={scoreOf(state, viewer, balance)}
      right={
        <button className="coinbar-btn is-primary" onClick={onEndTurn} disabled={!endTurnEnabled}>
          終了
        </button>
      }
      sub={<span className="coinbar-forecast">次のターン +{forecast(state, viewer, balance)}</span>}
    />
  );
}
