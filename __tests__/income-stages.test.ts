import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { incomeStages, incomeStageStates, reduce } from '@/game/reducer';
import { createGame } from '@/game/setup';

const B = DEFAULT_BALANCE;

/** 先手 you の手番開始直前（収入未反映）の盤面。 */
function fresh(seed = 3) {
  const g = createGame(seed, B, 'you');
  g.current = 'you';
  return g;
}

describe('incomeStages（収入を 1 段ずつ見せるための分割）', () => {
  it('段の合計が startTurn で実際に入る額と一致する', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = fresh(seed);
      g.market[0]!.owner = 'you';
      g.market[0]!.buildingId = 'tradingHouse';
      g.players.you.pendingIncome = ['miner', 'banker'];
      g.players.you.pendingDebt = 3;
      g.players.you.festivalQueued = seed % 2 === 0;
      const sum = incomeStages(g, B).reduce((n, s) => n + s.amount, 0);
      const after = reduce(g, { type: 'startTurn' }, B);
      expect(after.players.you.coins - g.players.you.coins).toBe(sum);
    }
  });

  it('基礎収入 → 建物収入 → 投資 → 借り返済 の順に分かれる', () => {
    const g = fresh();
    g.market[0]!.owner = 'you';
    g.market[0]!.buildingId = 'tradingHouse';
    g.players.you.pendingIncome = ['miner'];
    g.players.you.pendingDebt = 2;
    expect(incomeStages(g, B).map((s) => s.kind)).toEqual(['base', 'building', 'invest', 'debt']);
  });

  it('建物が無ければ建物収入の段は出ない（基礎収入だけ）', () => {
    expect(incomeStages(fresh(), B).map((s) => s.kind)).toEqual(['base']);
  });

  it('祝祭が効くターンは、建物収入が 2 倍になり上乗せ分が分かる', () => {
    const g = fresh();
    g.market[0]!.owner = 'you';
    g.market[0]!.buildingId = 'tradingHouse';
    const once = incomeStages(g, B).find((s) => s.kind === 'building')!;
    g.players.you.festivalQueued = true;
    const doubled = incomeStages(g, B).find((s) => s.kind === 'building')!;
    expect(once.festival).toBe(false);
    expect(doubled.festival).toBe(true);
    expect(doubled.amount).toBe(once.amount * B.festivalMultiplier);
    expect(doubled.festivalExtra).toBe(doubled.amount - once.amount);
    expect(doubled.slots).toEqual([0]);
  });

  it('各段の盤面は、その段までのコインを持ち、最後だけ startTurn 完了状態になる', () => {
    const g = fresh();
    g.market[0]!.owner = 'you';
    g.market[0]!.buildingId = 'tradingHouse';
    const steps = incomeStageStates(g, B);
    expect(steps).toHaveLength(2);
    const start = g.players.you.coins;
    expect(steps[0]!.state.players.you.coins).toBe(start + steps[0]!.stage.amount);
    expect(steps[1]!.state).toEqual(reduce(g, { type: 'startTurn' }, B));
  });
});
