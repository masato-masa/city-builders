import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { reduce } from '@/game/reducer';
import { acquireCostFor, leaderDiscountOf, scoreOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { GameState } from '@/game/types';

// 先頭への向かい風（CB-13）: VP で先行している持ち主の物件は、差に応じて買収費用が下がる。
const OFF = { ...DEFAULT_BALANCE, swingChance: 0, leaderAcquireDiscount: { perVp: 0, max: 0 } };
const ON = { ...OFF, leaderAcquireDiscount: { perVp: 1, max: 8 } };

/** you が 1 件建てて VP で先行している局面（cpu は無し）。 */
function lead(): GameState {
  let g = createGame(1, OFF);
  g.current = 'you';
  g.turn = 3;
  g.players.you.coins = 100;
  g = reduce(g, { type: 'build', slotId: g.market.findIndex((s) => s.owner === null) }, OFF);
  return g;
}

describe('先頭への向かい風', () => {
  it('無効（perVp 0）なら、買収費用は今までと同じ', () => {
    const g = lead();
    const slot = g.market.find((s) => s.owner === 'you')!;
    expect(leaderDiscountOf(g, 'you', 'cpu', OFF)).toBe(0);
    expect(acquireCostFor(g, 'cpu', slot, OFF)).toBe(acquireCostFor(g, 'cpu', slot, OFF));
  });

  it('先行している持ち主の物件は、差 1 VP ごとに perVp だけ安くなる（上限あり）', () => {
    const g = lead();
    const slot = g.market.find((s) => s.owner === 'you')!;
    const diff = scoreOf(g, 'you', ON) - scoreOf(g, 'cpu', ON);
    expect(diff).toBeGreaterThan(0);
    const want = Math.min(8, Math.floor(diff * ON.leaderAcquireDiscount.perVp));
    expect(leaderDiscountOf(g, 'you', 'cpu', ON)).toBe(want);
    expect(acquireCostFor(g, 'cpu', slot, ON)).toBe(acquireCostFor(g, 'cpu', slot, OFF) - want);
  });

  it('買収する側が先行しているときは割引なし', () => {
    const g = lead();
    expect(leaderDiscountOf(g, 'cpu', 'you', ON)).toBe(0); // cpu は後ろ → cpu の物件を you が買うときの値引きは 0
  });

  it('値引きで価格が 0 未満にはならない', () => {
    const g = lead();
    const slot = g.market.find((s) => s.owner === 'you')!;
    const huge = { ...ON, leaderAcquireDiscount: { perVp: 1000, max: 1000 } };
    expect(acquireCostFor(g, 'cpu', slot, huge)).toBe(0);
  });
});
