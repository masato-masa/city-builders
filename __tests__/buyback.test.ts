import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { reduce } from '@/game/reducer';
import { acquireCostFor } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { GameState } from '@/game/types';

// 買い戻し割引（CB-14）: 奪われた物件を取り返すときだけ、買収費用が下がる。
const OFF = { ...DEFAULT_BALANCE, swingChance: 0, buybackDiscount: 0, leaderAcquireDiscount: { perVp: 0, max: 0 } };
const ON = { ...OFF, buybackDiscount: 4 };

/** you が建てた物件を cpu が買収した直後（cpu の手番が終わって you の番）。 */
function taken(): { g: GameState; id: number } {
  let g = createGame(1, OFF);
  const id = g.market.findIndex((s) => s.owner === null);
  g.current = 'you';
  g.turn = 3;
  g.players.you.coins = 100;
  g = reduce(g, { type: 'build', slotId: id }, OFF);
  g.current = 'cpu';
  g.turn = 5;
  g.players.cpu.coins = 100;
  g = reduce(g, { type: 'acquire', slotId: id }, ON);
  g.current = 'you';
  g.turn = 7;
  g.players.you.coins = 100;
  return { g, id };
}

describe('買い戻し割引', () => {
  it('奪われた本人が取り返すときだけ、割引ぶん安い', () => {
    const { g, id } = taken();
    expect(g.market[id]!.owner).toBe('cpu');
    expect(g.market[id]!.prevOwner).toBe('you');
    expect(acquireCostFor(g, 'you', g.market[id]!, ON)).toBe(acquireCostFor(g, 'you', g.market[id]!, OFF) - 4);
  });

  it('取り返すと印が消え、また奪われても安くは戻らない', () => {
    const { g, id } = taken();
    const back = reduce(g, { type: 'acquire', slotId: id }, ON);
    expect(back.market[id]!.owner).toBe('you');
    expect(back.market[id]!.prevOwner).toBeUndefined();
    expect(acquireCostFor(back, 'cpu', back.market[id]!, ON)).toBe(acquireCostFor(back, 'cpu', back.market[id]!, OFF));
  });
});
