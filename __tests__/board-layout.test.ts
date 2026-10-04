import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { PLOTS, PLOT_HEIGHT, PLOT_WIDTH, STREET_JUNCTIONS, STUBS, rowOf } from '@/ui/board-layout';

describe('区画の座標', () => {
  it('市場の件数と同じ数だけある', () => {
    expect(PLOTS).toHaveLength(DEFAULT_BALANCE.market.length);
  });

  it('箱ごと盤面の内側にある', () => {
    for (const [i, p] of PLOTS.entries()) {
      expect(p.x - PLOT_WIDTH / 2, `区画 ${i} の左端`).toBeGreaterThan(0);
      expect(p.x + PLOT_WIDTH / 2, `区画 ${i} の右端`).toBeLessThan(1);
      expect(p.y - PLOT_HEIGHT / 2, `区画 ${i} の上端`).toBeGreaterThan(0);
      expect(p.y + PLOT_HEIGHT / 2, `区画 ${i} の下端`).toBeLessThan(1);
    }
  });

  it('どの二つもタップ範囲が重ならない', () => {
    for (let i = 0; i < PLOTS.length; i++) {
      for (let j = i + 1; j < PLOTS.length; j++) {
        const a = PLOTS[i]!;
        const b = PLOTS[j]!;
        const apart = Math.abs(a.x - b.x) >= PLOT_WIDTH || Math.abs(a.y - b.y) >= PLOT_HEIGHT;
        expect(apart, `区画 ${i} と ${j} が近すぎる`).toBe(true);
      }
    }
  });

  it('横 2 / 3 / 2 / 3 の四段になっている', () => {
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < PLOTS.length; i++) counts[rowOf(i)]!++;
    expect(counts).toEqual([2, 3, 2, 3]);
  });

  it('どの区画も道につながっている', () => {
    for (let i = 0; i < PLOTS.length; i++) {
      expect(STUBS.some((s) => s.slotId === i), `区画 ${i} の道`).toBe(true);
      expect(
        STREET_JUNCTIONS.some((js) => js.some((j) => j.slotId === i)),
        `区画 ${i} の通り`,
      ).toBe(true);
    }
  });
});
