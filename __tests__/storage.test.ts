import { beforeEach, describe, expect, it } from 'vitest';

import { loadProgress, saveProgress, withResult } from '@/storage/storage';

const KEY = 'city-builders:progress';

describe('進行の保存（連勝）', () => {
  beforeEach(() => localStorage.clear());

  it('勝つと連勝が伸び、負けると 0、引き分けでは変わらない', () => {
    let p = loadProgress();
    p = withResult(p, 'win', 'normal');
    p = withResult(p, 'win', 'normal');
    expect(p).toMatchObject({ wins: 2, streak: 2, bestStreak: 2 });
    p = withResult(p, 'draw', 'hard');
    expect(p).toMatchObject({ streak: 2, lastDifficulty: 'hard' });
    p = withResult(p, 'lose', 'hard');
    expect(p).toMatchObject({ wins: 2, losses: 1, streak: 0, bestStreak: 2 });
    saveProgress(p);
    expect(loadProgress()).toEqual(p);
  });

  it('連勝を持たない古い保存データも読める', () => {
    localStorage.setItem(KEY, JSON.stringify({ wins: 5, losses: 2, lastDifficulty: 'easy' }));
    expect(loadProgress()).toEqual({ wins: 5, losses: 2, lastDifficulty: 'easy', streak: 0, bestStreak: 0 });
  });

  it.each(['{', 'null', '42', '"x"', '[]', JSON.stringify({ wins: 'a', streak: -3, bestStreak: NaN, lastDifficulty: 'god' })])(
    '壊れたデータ %s でも落ちず、0 に戻す',
    (raw) => {
      localStorage.setItem(KEY, raw);
      const p = loadProgress();
      expect(p.streak).toBe(0);
      expect(p.wins).toBe(0);
      expect(p.lastDifficulty).toBe('normal');
    },
  );
});
