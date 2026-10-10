import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { activeEffectMax, activeEffectSum, ownedSlots, scoreOf } from '@/game/selectors';
import type { GameState, PlayerId } from '@/game/types';

import { hapticTap } from './haptics';
import { incomeLine } from './income-text';
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
  // Lv2 の物件は効果値が上がるので、件数 × Lv1 の値ではなくレベルを見る集計を使う
  let bonus = activeEffectMax(state, viewer, 'exchange', 'exchangeBonus', balance);
  if (festivalNext) bonus *= balance.festivalMultiplier;

  let total = balance.baseIncome;
  if (festivalNext) total += balance.festivalIncomeBonus;

  let houseIncome = activeEffectSum(state, viewer, 'tradingHouse', 'tradingHouseIncome', balance);
  if (festivalNext) houseIncome *= balance.festivalMultiplier;
  total += houseIncome;

  for (const card of p.pendingIncome) {
    if (card === 'miner') total += balance.minerIncome + bonus;
    if (card === 'banker') {
      total += balance.bankerIncome + ownedSlots(state, viewer).length * balance.bankerPerBuilding + bonus;
    }
  }
  total -= p.pendingDebt;
  total -= Math.min(p.pendingTax, Math.max(0, p.coins + total));
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
  active = false,
  endTurnHint = false,
}: {
  state: GameState;
  balance?: Balance;
  /** この帯が表す側。既定は 'you'（対 CPU モード）。PvP では手番側を渡す。 */
  viewer?: PlayerId;
  onEndTurn: () => void;
  endTurnEnabled: boolean;
  /** いまこの側の手番か（ボードの縁を光らせる）。 */
  active?: boolean;
  /** もう打てる手が無いとき true。終了ボタンを脈打たせて次の操作を示す。 */
  endTurnHint?: boolean;
}) {
  // マイナスのときは数値自身の '-' がそのまま出るので、プラスのときだけ '+' を足す。
  // 固定で '+' を付けると高利貸の借りが上回ったときに符号が嘘をつく（要望 C）。
  const income = forecast(state, viewer, balance);
  return (
    <InfoBoard
      owner={viewer}
      coins={state.players[viewer].coins}
      vp={scoreOf(state, viewer, balance)}
      active={active}
      right={
        <button
          className={`coinbar-btn btn3d btn3d-yellow${endTurnHint && endTurnEnabled ? ' is-hint' : ''}`}
          onClick={() => {
            hapticTap();
            onEndTurn();
          }}
          disabled={!endTurnEnabled}
        >
          <span className="btn3d-label">ターン終了</span>
        </button>
      }
      sub={
        <span className="coinbar-forecast">{incomeLine(income)}</span>
      }
    />
  );
}
