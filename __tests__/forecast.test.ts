import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { reduce } from '@/game/reducer';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

import { forecast } from '@/ui/CoinBar';

const ORDER: CardId[] = [
  'miner',
  'usurer',
  'banker',
  'architect',
  'spy',
  'herald',
  'taxman',
  'festival',
];

function fixture(coins: number): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.players.you.hand = ORDER.slice(0, 4);
  g.players.you.queue = ORDER.slice(4);
  g.players.you.coins = coins;
  return g;
}

/** forecast() が「次の startTurn で実際に増える額」と一致することを確認する。
 *  CoinBar の「次ターン収入」表示が実際の挙動とズレていた（祝祭が反映されない）
 *  という指摘への回帰防止。 */
function actualNextTurnDelta(g: GameState): number {
  const before = g.players.you.coins;
  const after = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
  return after.players.you.coins - before;
}

describe('次ターン収入の見込み（forecast）', () => {
  it('基本収入だけなら実際の増分と一致する', () => {
    const g = fixture(0);
    expect(forecast(g, 'you', DEFAULT_BALANCE)).toBe(actualNextTurnDelta(g));
  });

  it('商館を持っていれば実際の増分と一致する', () => {
    const g = fixture(0);
    g.market.filter((s) => s.buildingId === 'tradingHouse').forEach((s) => (s.owner = 'you'));
    expect(forecast(g, 'you', DEFAULT_BALANCE)).toBe(actualNextTurnDelta(g));
  });

  it('祝祭を使った直後は、次ターンの商館収入が 2 倍 + 追加収入になる', () => {
    let g = fixture(10);
    g.players.you.hand = ['festival', 'usurer', 'banker', 'architect'];
    g.market.filter((s) => s.buildingId === 'tradingHouse').forEach((s) => (s.owner = 'you'));
    g = reduce(g, { type: 'useCard', card: 'festival' }, DEFAULT_BALANCE);
    expect(g.players.you.festivalQueued).toBe(true);

    const predicted = forecast(g, 'you', DEFAULT_BALANCE);
    expect(predicted).toBe(actualNextTurnDelta(g));

    // 祝祭を使わなかった場合との差で、実際に 2 倍 + ボーナスが乗っていることも確かめる
    const gWithout = fixture(10);
    gWithout.market.filter((s) => s.buildingId === 'tradingHouse').forEach((s) => (s.owner = 'you'));
    const withoutFestival = forecast(gWithout, 'you', DEFAULT_BALANCE);
    const houseIncome = gWithout.market.filter((s) => s.buildingId === 'tradingHouse').length
      * DEFAULT_BALANCE.buildings.tradingHouse.income;
    expect(predicted).toBe(
      withoutFestival + houseIncome * (DEFAULT_BALANCE.festivalMultiplier - 1) + DEFAULT_BALANCE.festivalIncomeBonus,
    );
  });

  it('取引所があると、祝祭中は投資カードのボーナス分も 2 倍になる', () => {
    let g = fixture(10);
    g.players.you.hand = ['festival', 'miner', 'banker', 'architect'];
    g.market.find((s) => s.buildingId === 'exchange')!.owner = 'you';
    g = reduce(g, { type: 'useCard', card: 'festival' }, DEFAULT_BALANCE);
    expect(g.players.you.festivalQueued).toBe(true);
    g = reduce(g, { type: 'useCard', card: 'miner' }, DEFAULT_BALANCE);
    expect(g.players.you.pendingIncome).toEqual(['miner']);
    expect(forecast(g, 'you', DEFAULT_BALANCE)).toBe(actualNextTurnDelta(g));
  });

  it('Lv2 の商館・取引所は、上がった効果値で見込む', () => {
    let g = fixture(10);
    g.players.you.hand = ['miner', 'usurer', 'banker', 'architect'];
    for (const s of g.market) {
      if (s.buildingId === 'tradingHouse' || s.buildingId === 'exchange') {
        s.owner = 'you';
        s.level = 2;
      }
    }
    g = reduce(g, { type: 'useCard', card: 'miner' }, DEFAULT_BALANCE);
    expect(forecast(g, 'you', DEFAULT_BALANCE)).toBe(actualNextTurnDelta(g));
  });

  it('封鎖者に効果を止められている物件は、商館収入の見込みから除外される', () => {
    const g = fixture(0);
    const house = g.market.find((s) => s.buildingId === 'tradingHouse')!;
    house.owner = 'you';
    g.blockades = [{ district: 0, target: "you", untilTurn: g.turn, beforeIncome: true }];
    expect(forecast(g, 'you', DEFAULT_BALANCE)).toBe(actualNextTurnDelta(g));
  });
});
