import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { incomeStages } from '@/game/reducer';
import { createGame } from '@/game/setup';
import { runIncomeSequence } from '@/ui/play-helpers';
import { TEMPO, type Tempo } from '@/ui/tempo';

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

  function run(t: Tempo = TEMPO.fast) {
    const g = fresh();
    const log: string[] = [];
    const seq = runIncomeSequence(
      g,
      B,
      t.turnIntroMs,
      {
        onShow: (b) => log.push(`show${b.index}`),
        onApply: (b) => log.push(`apply${b.index}`),
        onFinish: () => log.push('finish'),
      },
      t,
    );
    return { g, log, seq };
  }

  it('「はやい」は全体が 1.3 秒以内に終わり、段の順に出る', () => {
    const t = TEMPO.fast;
    const { g, log } = run(t);
    const n = incomeStages(g, B).length;
    expect(n).toBeGreaterThanOrEqual(4);
    const total = t.turnIntroMs + (n - 1) * t.incomeBeatMs + t.incomeTailMs + 200;
    expect(total).toBeLessThanOrEqual(1300);
    vi.advanceTimersByTime(total);
    expect(log[0]).toBe('show0');
    expect(log.at(-1)).toBe('finish');
    expect(log.filter((l) => l.startsWith('show'))).toHaveLength(n);
  });

  it('「ふつう」は 1 段ずつ読める長さで出し、途中ではまだ終わっていない', () => {
    const t = TEMPO.normal;
    const { g, log } = run(t);
    const n = incomeStages(g, B).length;
    // 帯が出きってから 1 段目（重ねない）
    vi.advanceTimersByTime(t.turnIntroMs - 1);
    expect(log).toEqual([]);
    vi.advanceTimersByTime(1 + t.incomeBeatMs);
    expect(log.filter((l) => l.startsWith('show'))).toHaveLength(2);
    expect(log).not.toContain('finish');
    vi.advanceTimersByTime((n - 1) * t.incomeBeatMs + t.incomeTailMs);
    expect(log.at(-1)).toBe('finish');
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
