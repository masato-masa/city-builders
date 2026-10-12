import { describe, expect, it } from 'vitest';

import { buildingIncomeOf, buildingTextFor, DEFAULT_BALANCE } from '@/game/balance';
import { legalActions, nextIncomeOf, reduce } from '@/game/reducer';
import {
  blockadeIncomeLossOf,
  blockadeViewsOf,
  buildingStatsOf,
  districtVpOf,
  investIncomeOf,
  slotIncomeOf,
} from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

const B = DEFAULT_BALANCE;
const DECK: CardId[] = ['blockader', 'miner', 'usurer', 'banker', 'architect', 'spy', 'herald', 'taxman', 'guard', 'festival'];

function fixture(): GameState {
  const g = createGame(1, B, 'you');
  g.turn = 5;
  g.players.you.hand = DECK.slice(0, 4);
  g.players.you.queue = DECK.slice(4);
  g.players.you.coins = 20;
  return g;
}

describe('画面に渡す数値（selectors）', () => {
  it('buildingStatsOf: Lv ごとの VP・費用・市場価値と買収費用・次の増築費・収益・効果文', () => {
    const rows = buildingStatsOf('tradingHouse', B);
    expect(rows.map((r) => r.level)).toEqual([1, 2, 3]);
    expect(rows[0]).toMatchObject({
      vp: B.buildings.tradingHouse.vp,
      cost: B.buildings.tradingHouse.cost,
      income: B.buildings.tradingHouse.income,
      marketValue: B.buildings.tradingHouse.cost,
      acquireCost: B.buildings.tradingHouse.cost * B.acquireMultiplier,
      nextUpgradeCost: B.upgrades.tradingHouse.cost,
    });
    // 最終段階は買収されない・上げられない
    expect(rows[2]).toMatchObject({ acquireCost: null, nextUpgradeCost: null, income: B.upgrades3.tradingHouse.income });
    // 効果文に収益は入らない（収益は数値で並べる）
    expect(rows[0]!.effectText).not.toContain('収益 コイン');
    expect(buildingStatsOf('cathedral', B)[0]!.vpPerOtherBuilding).toBe(B.cathedralVpPerBuilding);
  });

  it('商館は収益が最も高い（2026-10-12 に全体を引き上げた）。城塞の説明は城下の封鎖を受けない', () => {
    expect(buildingIncomeOf(B, 'tradingHouse', 1)).toBe(B.buildings.tradingHouse.income);
    for (const id of Object.keys(B.buildings) as (keyof typeof B.buildings)[]) {
      expect(B.buildings.tradingHouse.income).toBeGreaterThanOrEqual(B.buildings[id].income);
    }
    expect(buildingTextFor('fortress', B)).toContain('封鎖');
    expect(B.buildings.fortress.cost).toBe(25);
    expect(B.buildings.mine.cost).toBe(15);
    expect(B.cards.miner.cost).toBe(3);
    expect(B.minerIncome).toBe(4);
  });

  it('blockadeViewsOf: 残りは使った手番で 1、受けた側の手番で 0。受けた側の手番の終わりで消える', () => {
    let g = fixture();
    g = reduce(g, { type: 'useCard', card: 'blockader', district: 0 }, B);
    expect(blockadeViewsOf(g, B)).toEqual([
      { district: 0, districtName: B.districts[0]!.name, target: 'cpu', remaining: 1, shielded: false },
    ]);
    g = reduce(reduce(g, { type: 'endTurn' }, B), { type: 'startTurn' }, B);
    expect(blockadeViewsOf(g, B)[0]!.remaining).toBe(0);
    g = reduce(g, { type: 'endTurn' }, B);
    expect(blockadeViewsOf(g, B)).toEqual([]);
  });

  it('封鎖で次に入らなくなる収益（CPU の見積もり）と、画面の「次の収入」', () => {
    let g = fixture();
    g.market[0]!.owner = 'cpu';
    const before = nextIncomeOf(g, 'cpu', B);
    g = reduce(g, { type: 'useCard', card: 'blockader', district: 0 }, B);
    expect(blockadeIncomeLossOf(g, 'cpu', B)).toBe(B.buildings.tradingHouse.income);
    expect(nextIncomeOf(g, 'cpu', B)).toBe(before - B.buildings.tradingHouse.income);
    expect(slotIncomeOf(g, g.market[0]!, B)).toBe(0);
    // 同じ地区は 2 度封鎖できない
    expect(
      legalActions(g, B).filter((a) => a.type === 'useCard' && a.card === 'blockader' && a.district === 0),
    ).toEqual([]);
  });

  it('districtVpOf と、銀行家は解決時の VP（称号込み）', () => {
    let g = fixture();
    g = reduce(g, { type: 'build', slotId: 0 }, B);
    expect(districtVpOf(g, 0, B)).toEqual({ you: B.buildings.tradingHouse.vp, cpu: 0 });
    // 称号 2 VP 込みで 4 VP
    expect(investIncomeOf(g, 'you', 'banker', B)).toBe(B.bankerIncome + B.buildings.tradingHouse.vp + B.districtTitleVp);
  });
});
