import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { incomeStages, reduce } from '@/game/reducer';
import { acquireCostFor, pendingInvestOf, vpOfSlot } from '@/game/selectors';
import { createGame, marketFor } from '@/game/setup';
import type { GameState } from '@/game/types';
import { swingHelpLines } from '@/ui/help-content';

// CB-12: 揺れる区画（見張り塔・市庁舎・関所）
const B = DEFAULT_BALANCE;
/** 3 区画とも必ず入れ替わる市場 */
const ALT = { ...B, swingChance: 1 };

function fixture(): GameState {
  const g = createGame(1, ALT, 'you');
  g.turn = 5;
  g.current = 'you';
  return g;
}

describe('揺れる区画の市場', () => {
  it('同じ seed からは同じ市場になり、swingChance 0 なら元の並び', () => {
    expect(marketFor(42, B)).toEqual(marketFor(42, B));
    expect(marketFor(42, { ...B, swingChance: 0 })).toEqual(B.market);
    const alt = marketFor(42, ALT);
    for (const { slot, alt: id } of B.swingSlots) expect(alt[slot]).toBe(id);
  });

  it('各区画はおよそ半々で入れ替わる', () => {
    for (const { slot, alt } of B.swingSlots) {
      let n = 0;
      for (let seed = 0; seed < 2000; seed++) if (marketFor(seed, B)[slot] === alt) n++;
      expect(n / 2000).toBeGreaterThan(0.45);
      expect(n / 2000).toBeLessThan(0.55);
    }
  });

  it('市場の乱数は山札の並べ替えと別の系列（既定のデッキ・先手は入れ替えの有無で変わらない）', () => {
    const a = createGame(7, { ...B, swingChance: 0 });
    const b = createGame(7, ALT);
    expect(b.players).toEqual(a.players);
    expect(b.current).toBe(a.current);
  });
});

describe('建物の効果', () => {
  it('見張り塔: 持ち主の物件すべての買収価格が上がる（Lv で増える）', () => {
    const g = fixture();
    const house = g.market[0]!;
    house.owner = 'cpu';
    const before = acquireCostFor(g, 'you', house, ALT);
    const tower = g.market[1]!;
    expect(tower.buildingId).toBe('watchtower');
    tower.owner = 'cpu';
    expect(acquireCostFor(g, 'you', house, ALT)).toBe(before + B.watchtowerGuard);
    tower.level = 2;
    expect(acquireCostFor(g, 'you', house, ALT)).toBe(before + B.level2.watchtowerGuard);
  });

  it('市庁舎: 同じ地区の自分の他の物件 1 件につき VP が増える', () => {
    const g = fixture();
    const hall = g.market[6]!;
    expect(hall.buildingId).toBe('cityHall');
    hall.owner = 'you';
    expect(vpOfSlot(g, hall, ALT)).toBe(B.buildings.cityHall.vp);
    g.market[3]!.owner = 'you'; // 職人街
    g.market[4]!.owner = 'you'; // 職人街
    g.market[0]!.owner = 'you'; // 商人街（数えない）
    expect(vpOfSlot(g, hall, ALT)).toBe(B.buildings.cityHall.vp + 2 * B.cityHallVpPerBuilding);
  });

  it('関所: 相手の投資カードの解決ごとに通行料が持ち主へ移る', () => {
    const g = fixture();
    const gate = g.market[7]!;
    expect(gate.buildingId).toBe('tollgate');
    gate.owner = 'cpu';
    g.players.you.pendingIncome = ['miner'];
    const stages = incomeStages(g, ALT);
    const toll = stages.find((s) => s.kind === 'toll')!;
    expect(toll.amount).toBe(-B.tollgateToll);
    const youBefore = g.players.you.coins;
    const cpuBefore = g.players.cpu.coins;
    const after = reduce(g, { type: 'startTurn' }, ALT);
    const total = stages.reduce((n, s) => n + s.amount, 0);
    expect(after.players.you.coins).toBe(youBefore + total);
    expect(after.players.cpu.coins).toBe(cpuBefore + B.tollgateToll);
    // 見込み（CPU の評価）にも通行料が入る
    expect(pendingInvestOf(g, 'cpu', ALT)).toBe(B.tollgateToll);
  });

  it('あそびかたに 3 区画の入れ替わりが載る', () => {
    const lines = swingHelpLines(B);
    expect(lines).toHaveLength(3);
    expect(lines.join('\n')).toContain('見張り塔');
    expect(lines.join('\n')).toContain('市庁舎');
    expect(lines.join('\n')).toContain('関所');
  });
});
