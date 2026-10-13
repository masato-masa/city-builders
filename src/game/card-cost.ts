// 手札のコストの内訳。バッジは現在値だけを出し、長押しで「コスト 1（元 3）・城壁 −3」のように元の値と理由を出す。
// cardCostFor（reducer）と同じ順で積み上げる。合計が cardCostFor と一致することはテストで確かめる。

import { cardCostAt, DEFAULT_BALANCE, type Balance } from './balance';
import { cardCostFor, hasActiveBuilding } from './reducer';
import { activeEffectMax, cardLevelOf, doubleSourceOf } from './selectors';
import type { CardId, GameState, PlayerId } from './types';

export interface CostReason {
  label: string;
  delta: number;
}

export interface CardCostInfo {
  /** いま払う額（cardCostFor と同じ） */
  now: number;
  /** 元の額（札に刻まれたコスト。影武者は写す札のコストを足したもの） */
  base: number;
  reasons: CostReason[];
  /** 持ち主にとって得か損か（コストは下がれば得） */
  kind: 'plain' | 'good' | 'bad';
}

export function cardCostInfo(state: GameState, player: PlayerId, card: CardId, balance: Balance = DEFAULT_BALANCE): CardCostInfo {
  const level = cardLevelOf(state, player, card, balance);
  const printed = balance.cards[card].cost;
  const reasons: CostReason[] = [];
  let cur = cardCostAt(balance, card, level);
  let base = printed;
  if (cur !== printed) reasons.push({ label: `Lv${level}`, delta: cur - printed });
  if (card === 'double') {
    const source = doubleSourceOf(state, player, balance);
    if (source) {
      // 写す札のコストは「元のコスト」に含めて数える（理由には出さない）
      const add = cardCostAt(balance, source, cardLevelOf(state, player, source, balance));
      cur += add;
      base += add;
    }
  }
  const push = (label: string, next: number) => {
    if (next !== cur) reasons.push({ label, delta: next - cur });
    cur = next;
  };
  if (card === 'guard' && hasActiveBuilding(state, player, 'wall', balance)) push('城壁', Math.min(cur, balance.guardCostWithWall));
  if (card === 'herald' && hasActiveBuilding(state, player, 'road', balance)) push('街道', Math.min(cur, balance.heraldCostWithRoad));
  const p = state.players[player];
  const taxSource = card === 'taxman' ? 'taxman' : card === 'double' ? doubleSourceOf(state, player, balance) : null;
  if (taxSource === 'taxman') {
    push('自分の物件', cur + Math.floor(state.market.filter((s) => s.owner === player).length * balance.taxmanCostPerSlot));
  }
  if (card === 'miner') {
    const mine = activeEffectMax(state, player, 'mine', 'mineMinerDiscount', balance);
    if (mine > 0) push('鉱山', Math.max(0, cur - (p.festivalActive ? mine * balance.festivalMultiplier : mine)));
  }
  if (!p.usedAnyCardThisTurn && hasActiveBuilding(state, player, 'factory', balance)) {
    const once = activeEffectMax(state, player, 'factory', 'factoryDiscount', balance);
    push('工場', Math.max(0, cur - (p.festivalActive ? once * balance.festivalMultiplier : once)));
  }
  const now = cardCostFor(state, player, card, balance);
  return { now, base, reasons, kind: now < base ? 'good' : now > base ? 'bad' : 'plain' };
}

/** 長押しの説明に出すコストの文。変わっていなければ「コスト 3」、変わっていれば「コスト 1（元 3）・城壁 −3」。 */
export function costDetailText(info: CardCostInfo): string {
  if (info.now === info.base) return `コスト ${info.now}`;
  const why = info.reasons.map((r) => `${r.label} ${r.delta < 0 ? '−' : '+'}${Math.abs(r.delta)}`).join('・');
  return `コスト ${info.now}（元 ${info.base}）${why ? `・${why}` : ''}`;
}

/** バッジに添える印。得（コスト減）は ▼、損（コスト増）は ▲。変わっていなければ空。 */
export function costMark(kind: CardCostInfo['kind']): string {
  return kind === 'good' ? '▼' : kind === 'bad' ? '▲' : '';
}
