import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { createGame } from '@/game/setup';
import {
  applyRule,
  DAILY_RULES,
  dailyFor,
  dailyScore,
  formatScore,
  isDateKey,
  localDateKey,
} from '@/meta/daily';
import { loadDaily, parseDaily, saveDaily, withDailyResult } from '@/storage/daily';

const days = (from: string, n: number) => {
  const [y, m, d] = from.split('-').map(Number) as [number, number, number];
  return Array.from({ length: n }, (_, i) => localDateKey(new Date(y, m - 1, d + i)));
};

describe('日替わり: 日付 → 試合', () => {
  it('端末のローカル日付で YYYY-MM-DD を作る', () => {
    expect(localDateKey(new Date(2026, 9, 10, 23, 59))).toBe('2026-10-10');
    expect(localDateKey(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
    expect(isDateKey('2026-10-10')).toBe(true);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey(20261010)).toBe(false);
  });

  it('同じ日なら同じシード・先手・条件・盤面', () => {
    const a = dailyFor('2026-10-10');
    const b = dailyFor('2026-10-10');
    expect(a.seed).toBe(b.seed);
    expect(a.first).toBe(b.first);
    expect(a.rule.id).toBe(b.rule.id);
    expect(a.difficulty).toBe('normal');
    const ga = createGame(a.seed, a.balance, a.first);
    const gb = createGame(b.seed, b.balance, b.first);
    expect(ga).toEqual(gb);
    expect(ga.current).toBe(a.first);
  });

  it('日が変わればシードが変わる', () => {
    const seeds = new Set(days('2026-01-01', 365).map((d) => dailyFor(d).seed));
    expect(seeds.size).toBe(365);
  });

  it('条件は 1 周の中で重ならず、全部の条件が出てくる', () => {
    const n = DAILY_RULES.length;
    const ids = days('2026-10-01', n * 4).map((d) => dailyFor(d).rule.id);
    for (let i = 0; i + 1 < ids.length; i++) {
      // 1 周の境目以外では、隣り合う日は必ず違う（境目でも続きにくい）
      if ((i + 1) % n !== 0) expect(ids[i]).not.toBe(ids[i + 1]);
    }
    expect(new Set(ids).size).toBe(n);
  });

  it('先手は偏らない（1 年で 4〜6 割が自分）', () => {
    const you = days('2026-01-01', 365).filter((d) => dailyFor(d).first === 'you').length;
    expect(you / 365).toBeGreaterThan(0.4);
    expect(you / 365).toBeLessThan(0.6);
  });

  it('条件は既定値に重ねるだけで、既定値そのものは書き換えない', () => {
    const before = structuredClone(DEFAULT_BALANCE);
    for (const r of DAILY_RULES) {
      const b = applyRule(DEFAULT_BALANCE, r);
      expect(b).not.toEqual(DEFAULT_BALANCE);
      expect(r.label(DEFAULT_BALANCE).length).toBeGreaterThan(0);
    }
    expect(DEFAULT_BALANCE).toEqual(before);
  });

  it('VP 差のスコアと表示', () => {
    expect(dailyScore(30, 25)).toBe(5);
    expect(formatScore(5)).toBe('+5');
    expect(formatScore(0)).toBe('±0');
    expect(formatScore(-3)).toBe('−3');
  });
});

describe('日替わり: 記録の保存', () => {
  beforeEach(() => localStorage.clear());
  const today = '2026-10-10';

  it('初回はベストになり、上回ったときだけ更新する。回数は毎回増える', () => {
    let r = withDailyResult(loadDaily(today), today, -4);
    expect(r).toMatchObject({ improved: true, previousBest: null, record: { best: -4, plays: 1 } });
    r = withDailyResult(r.record, today, -6);
    expect(r).toMatchObject({ improved: false, record: { best: -4, plays: 2 } });
    r = withDailyResult(r.record, today, 3);
    expect(r).toMatchObject({ improved: true, previousBest: -4, record: { best: 3, plays: 3 } });
    saveDaily(r.record);
    expect(loadDaily(today)).toEqual(r.record);
  });

  it('前の日の記録は今日の空の記録として読む', () => {
    saveDaily({ date: '2026-10-09', best: 12, plays: 5 });
    expect(loadDaily(today)).toEqual({ date: today, best: null, plays: 0 });
    const r = withDailyResult({ date: '2026-10-09', best: 12, plays: 5 }, today, 1);
    expect(r.record).toEqual({ date: today, best: 1, plays: 1 });
  });

  it.each([
    '{',
    'null',
    '42',
    '[]',
    JSON.stringify({ date: 'きょう', best: 3 }),
    JSON.stringify({ date: today, best: 'a', plays: -2 }),
  ])('壊れたデータ %s でも落ちない', (raw) => {
    const r = parseDaily(raw, today);
    expect(r.date).toBe(today);
    expect(r.best === null || Number.isInteger(r.best)).toBe(true);
    expect(r.plays).toBeGreaterThanOrEqual(0);
  });

  it('回数を持たない古い形式でも、ベストがあれば 1 回として読む', () => {
    expect(parseDaily(JSON.stringify({ date: today, best: 7 }), today)).toEqual({ date: today, best: 7, plays: 1 });
  });
});
