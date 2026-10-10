import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { incomeStages } from '@/game/reducer';
import { createGame } from '@/game/setup';
import { runIncomeSequence } from '@/ui/play-helpers';
import { INCOME_BEAT_MS, INCOME_TAIL_MS, TURN_INTRO_MS } from '@/ui/tempo';

const B = DEFAULT_BALANCE;

function fresh() {
  const g = createGame(3, B, 'you');
  g.current = 'you';
  g.market[0]!.owner = 'you';
  g.market[0]!.buildingId = 'tradingHouse';
  g.players.you.pendingIncome = ['miner'];
  g.players.you.pendingDebt = 2;
  return g;
}

describe('runIncomeSequence（収入演出の長さと飛ばし）', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function run() {
    const g = fresh();
    const log: string[] = [];
    const seq = runIncomeSequence(g, B, TURN_INTRO_MS, {
      onShow: (b) => log.push(`show${b.index}`),
      onApply: (b) => log.push(`apply${b.index}`),
      onFinish: () => log.push('finish'),
    });
    return { g, log, seq };
  }

  it('全体が 1.3 秒以内に終わり、段の順に出る', () => {
    const { g, log } = run();
    const n = incomeStages(g, B).length;
    expect(n).toBeGreaterThanOrEqual(4);
    const total = TURN_INTRO_MS + (n - 1) * INCOME_BEAT_MS + INCOME_TAIL_MS + 200;
    expect(total).toBeLessThanOrEqual(1300);
    vi.advanceTimersByTime(total);
    expect(log[0]).toBe('show0');
    expect(log.at(-1)).toBe('finish');
    expect(log.filter((l) => l.startsWith('show'))).toHaveLength(n);
  });

  it('flush は最後の段を反映して即座に終わり、あとで二重に走らない', () => {
    const { g, log, seq } = run();
    const n = incomeStages(g, B).length;
    seq.flush();
    expect(log).toEqual([`apply${n - 1}`, 'finish']);
    vi.advanceTimersByTime(5000);
    expect(log).toEqual([`apply${n - 1}`, 'finish']);
    seq.flush();
    expect(log).toHaveLength(2);
  });

  it('自然に終わったあとの flush は何もしない', () => {
    const { log, seq } = run();
    vi.advanceTimersByTime(5000);
    const len = log.length;
    seq.flush();
    expect(log).toHaveLength(len);
  });
});
