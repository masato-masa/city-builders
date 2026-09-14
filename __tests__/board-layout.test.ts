import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { PLOTS, PLOT_WIDTH } from '@/ui/board-layout';

describe('区画の座標', () => {
  it('市場の件数と同じ数だけある', () => {
    expect(PLOTS).toHaveLength(DEFAULT_BALANCE.market.length);
  });

  it('すべて盤面の内側にある', () => {
    for (const [i, p] of PLOTS.entries()) {
      expect(p.x, `区画 ${i} の x`).toBeGreaterThan(PLOT_WIDTH / 2);
      expect(p.x, `区画 ${i} の x`).toBeLessThan(1 - PLOT_WIDTH / 2);
      expect(p.y, `区画 ${i} の y`).toBeGreaterThan(0);
      expect(p.y, `区画 ${i} の y`).toBeLessThan(1);
    }
  });

  it('どの二つも重ならない', () => {
    for (let i = 0; i < PLOTS.length; i++) {
      for (let j = i + 1; j < PLOTS.length; j++) {
        const a = PLOTS[i]!;
        const b = PLOTS[j]!;
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        // 横に近いときは、縦が十分離れていること
        const apart = dx >= PLOT_WIDTH || dy >= PLOT_WIDTH * 0.9;
        expect(apart, `区画 ${i} と ${j} が近すぎる`).toBe(true);
      }
    }
  });

  it('横 3 / 4 / 3 の三段になっている', () => {
    const rows = new Map<number, number>();
    for (const p of PLOTS) {
      const band = p.y < 0.3 ? 0 : p.y < 0.55 ? 1 : 2;
      rows.set(band, (rows.get(band) ?? 0) + 1);
    }
    expect(rows.get(0)).toBe(3);
    expect(rows.get(1)).toBe(4);
    expect(rows.get(2)).toBe(3);
  });
});
