import { describe, expect, it } from 'vitest';

import { createRng, shuffle } from '@/game/rng';

describe('rng', () => {
  it('同じシードからは同じ列が出る', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it('違うシードからは違う列が出る', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('next は 0 以上 1 未満', () => {
    const rng = createRng(999);
    for (let i = 0; i < 500; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int は 0 以上 max 未満の整数', () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const v = rng.int(8);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(8);
    }
  });

  it('shuffle は元配列を壊さず、同じシードで同じ並びになる', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(src, createRng(42));
    const b = shuffle(src, createRng(42));
    expect(a).toEqual(b);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...a].sort((x, y) => x - y)).toEqual(src);
  });
});
