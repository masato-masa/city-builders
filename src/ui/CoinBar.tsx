import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { activeOwnedSlots, ownedSlots, scoreOf } from '@/game/selectors';
import type { GameState, PlayerId } from '@/game/types';

import { InfoBoard } from './InfoBoard';

/** 次のターン開始時に入る見込み額。遅延収入のゲームなので、これが無いと判断できない。
 *  高利貸の借り（pendingDebt）は次の開始フェーズで必ず引かれるので、ここでも
 *  差し引く。借りが収入を上回ればマイナスになる（要望 C）。
 *  祝祭を使った直後（festivalQueued）は次のターン開始時に festivalActive へ
 *  切り替わり、物件の効果（商館収入・取引所ボーナス）が festivalMultiplier 倍に
 *  なり、festivalIncomeBonus も上乗せされる（src/game/reducer.ts の startTurn と
 *  同じ計算）。ここが抜けていると「祝祭を使っても見込みが変わらない」ように見える。
 *  封鎖者で効果を止められている物件は activeOwnedSlots が除外するので、
 *  商館・取引所の集計にはそちらを使う。 */
export function forecast(state: GameState, viewer: PlayerId, balance: Balance): number {
  const p = state.players[viewer];
  const festivalNext = p.festivalQueued;
  const active = activeOwnedSlots(state, viewer);

  let bonus = active.some((s) => s.buildingId === 'exchange') ? balance.exchangeBonus : 0;
  if (festivalNext) bonus *= balance.festivalMultiplier;

  let total = balance.baseIncome;
  if (festivalNext) total += balance.festivalIncomeBonus;

  let houseIncome = active.filter((s) => s.buildingId === 'tradingHouse').length * balance.tradingHouseIncome;
  if (festivalNext) houseIncome *= balance.festivalMultiplier;
  total += houseIncome;

  for (const card of p.pendingIncome) {
    if (card === 'miner') total += balance.minerIncome + bonus;
    if (card === 'banker') {
      total += balance.bankerIncome + ownedSlots(state, viewer).length * balance.bankerPerBuilding + bonus;
    }
  }
  total -= p.pendingDebt;
  return total;
}

/** 自分の情報ボード（プレイ画面いちばん下、手札のすぐ上）。相手の帯と同じ骨格
 *  （要望 4）の右側に終了ボタン、2 段目に次のターンの見込みを出す
 *  （街道はここに置かない。カードを選んだときのシートへ移した＝要望 2）。 */
export function CoinBar({
  state,
  balance = DEFAULT_BALANCE,
  viewer = 'you',
  onEndTurn,
  endTurnEnabled,
}: {
  state: GameState;
  balance?: Balance;
  /** この帯が表す側。既定は 'you'（対 CPU モード）。PvP では手番側を渡す。 */
  viewer?: PlayerId;
  onEndTurn: () => void;
  endTurnEnabled: boolean;
}) {
  // マイナスのときは数値自身の '-' がそのまま出るので、プラスのときだけ '+' を足す。
  // 固定で '+' を付けると高利貸の借りが上回ったときに符号が嘘をつく（要望 C）。
  const income = forecast(state, viewer, balance);
  return (
    <InfoBoard
      owner={viewer}
      coins={state.players[viewer].coins}
      vp={scoreOf(state, viewer, balance)}
      right={
        <button className="coinbar-btn is-primary" onClick={onEndTurn} disabled={!endTurnEnabled}>
          終了
        </button>
      }
      sub={
        <span className="coinbar-forecast">
          次ターン収入 {income >= 0 ? `+${income}` : income}
        </span>
      }
    />
  );
}
