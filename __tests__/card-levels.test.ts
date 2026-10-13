import { describe, expect, it } from 'vitest';

import { cardLevelFromXp, cardPower, cardTextFor, DEFAULT_BALANCE as B } from '@/game/balance';
import { cardCostFor, reduce } from '@/game/reducer';
import {
  buildingIncomeTotalOf,
  cardLevelOf,
  cardXpOf,
  scoreOf,
  slotIncomeOf,
  spyDiscountOf,
  taxmanAmountOf,
  usesToNextLevel,
} from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

const DECK: CardId[] = ['miner', 'usurer', 'banker', 'architect', 'spy', 'herald', 'taxman', 'blockader'];

function fixture(coins = 30): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.players.you.hand = DECK.slice(0, 4);
  g.players.you.queue = DECK.slice(4);
  g.players.you.coins = coins;
  return g;
}

/** 同じ札を n 回使った状態にする（手札・待機列の並びはそのまま。経験値だけ積む） */
function used(g: GameState, card: CardId, n: number): GameState {
  g.players.you.cardXp = { ...g.players.you.cardXp, [card]: n };
  return g;
}

describe('人物カードの Lv', () => {
  it('試合の始めは全部 Lv1。使うたびに経験値が 1 たまる', () => {
    let g = fixture();
    expect(cardLevelOf(g, 'you', 'miner', B)).toBe(1);
    g = reduce(g, { type: 'useCard', card: 'miner' }, B);
    expect(cardXpOf(g, 'you', 'miner')).toBe(1);
    expect(cardXpOf(g, 'cpu', 'miner')).toBe(0);
  });

  it('cardLevelUses の回数で Lv2・Lv3 になる', () => {
    const [l2, l3] = B.cardLevelUses;
    expect(cardLevelFromXp(B, l2 - 1)).toBe(1);
    expect(cardLevelFromXp(B, l2)).toBe(2);
    expect(cardLevelFromXp(B, l3 - 1)).toBe(2);
    expect(cardLevelFromXp(B, l3)).toBe(3);
    expect(usesToNextLevel(used(fixture(), 'miner', 1), 'you', 'miner', B)).toBe(l2 - 1);
    expect(usesToNextLevel(used(fixture(), 'miner', l2), 'you', 'miner', B)).toBe(l3 - l2);
    expect(usesToNextLevel(used(fixture(), 'miner', l3), 'you', 'miner', B)).toBeNull();
  });

  it('Lv が上がった回から効果が上がる（採掘師の次の収入）', () => {
    const [l2] = B.cardLevelUses;
    let g = used(fixture(), 'miner', l2 - 1);
    g = reduce(g, { type: 'useCard', card: 'miner' }, B);
    expect(cardLevelOf(g, 'you', 'miner', B)).toBe(2);
    const before = g.players.you.coins;
    g = reduce(g, { type: 'startTurn' }, B);
    expect(g.players.you.coins - before).toBe(B.baseIncome + cardPower(B, 'miner', 2));
    expect(cardPower(B, 'miner', 2)).toBeGreaterThan(B.minerIncome);
  });

  it('Lv が高い札ほど効果が大きい（建築家の割引・高利貸）', () => {
    let g = used(fixture(), 'architect', B.cardLevelUses[1] - 1);
    g = reduce(g, { type: 'useCard', card: 'architect' }, B);
    expect(g.players.you.buildDiscount).toBe(cardPower(B, 'architect', 3));
    let u = used(fixture(0), 'usurer', B.cardLevelUses[0] - 1);
    u = reduce(u, { type: 'useCard', card: 'usurer' }, B);
    expect(u.players.you.coins).toBe(cardPower(B, 'usurer', 2));
  });

  it('経験値は相手と別。試合ごとにリセット（createGame は空）', () => {
    const g = createGame(5);
    expect(g.players.you.cardXp).toEqual({});
    expect(g.players.cpu.cardXp).toEqual({});
  });

  it('説明文は Lv の値で書かれる', () => {
    expect(cardTextFor('miner', B, 1)).toContain(`+${B.minerIncome}`);
    expect(cardTextFor('miner', B, 3)).toContain(`+${cardPower(B, 'miner', 3)}`);
  });

  it('劣勢で使うと経験値の上乗せがある（cardXpBehindBonus）', () => {
    const bonus = { ...B, cardXpBehindBonus: 1 };
    const g = fixture();
    // 相手だけ物件を持つ = you は劣勢
    g.market[0]!.owner = 'cpu';
    const after = reduce(g, { type: 'useCard', card: 'miner' }, bonus);
    expect(cardXpOf(after, 'you', 'miner')).toBe(2);
    const ahead = fixture();
    ahead.market[0]!.owner = 'you';
    expect(cardXpOf(reduce(ahead, { type: 'useCard', card: 'miner' }, bonus), 'you', 'miner')).toBe(1);
  });

  it('Lv でコストが下がる札はコストに出る', () => {
    const cost = { ...B, cardLv2: { ...B.cardLv2, miner: { cost: 1, power: 5 } } };
    const g = used(fixture(), 'miner', B.cardLevelUses[0]);
    expect(cardCostFor(g, 'you', 'miner', cost)).toBe(1);
  });
});

describe('建物の収入 = VP', () => {
  it('毎ターンの収入は物件の VP と同じ（商館以外）', () => {
    const g = fixture(0);
    const wall = g.market.find((s) => s.buildingId === 'wall')!;
    const fortress = g.market.find((s) => s.buildingId === 'fortress')!;
    wall.owner = 'you';
    fortress.owner = 'you';
    fortress.level = 2;
    expect(slotIncomeOf(g, wall, B)).toBe(B.buildings.wall.vp);
    expect(slotIncomeOf(g, fortress, B)).toBe(B.upgrades.fortress.vp);
    const after = reduce(g, { type: 'startTurn' }, B);
    expect(after.players.you.coins).toBe(B.baseIncome + B.buildings.wall.vp + B.upgrades.fortress.vp);
  });

  it('商館は VP が低い代わりに、効果で追加の収入が入る', () => {
    const g = fixture(0);
    const house = g.market.find((s) => s.buildingId === 'tradingHouse')!;
    house.owner = 'you';
    expect(slotIncomeOf(g, house, B)).toBe(B.buildings.tradingHouse.vp + B.tradingHouseIncome);
    house.level = 3;
    expect(slotIncomeOf(g, house, B)).toBe(B.upgrades3.tradingHouse.vp + B.level3.tradingHouseIncome);
    expect(B.buildings.tradingHouse.vp).toBeLessThan(B.buildings.wall.vp);
  });

  it('大聖堂の収入は他の物件の数で増える VP と同じ', () => {
    const g = fixture(0);
    const cathedral = g.market.find((s) => s.buildingId === 'cathedral')!;
    cathedral.owner = 'you';
    g.market.filter((s) => s.buildingId === 'wall' || s.buildingId === 'factory').forEach((s) => (s.owner = 'you'));
    expect(slotIncomeOf(g, cathedral, B)).toBe(2 * B.cathedralVpPerBuilding);
  });

  it('封鎖で効果が止まった物件は収入も止まる（VP は残る）', () => {
    const g = fixture(0);
    const wall = g.market.find((s) => s.buildingId === 'wall')!;
    wall.owner = 'you';
    const d = B.districts.findIndex((x) => x.slots.includes(wall.slotId));
    g.blockades = [{ district: d, target: 'you', untilTurn: 3, beforeIncome: true }];
    expect(slotIncomeOf(g, wall, B)).toBe(0);
    expect(buildingIncomeTotalOf(g, 'you', B)).toBe(0);
    expect(scoreOf(g, 'you', B)).toBeGreaterThanOrEqual(B.buildings.wall.vp);
  });
});

describe('持つ側ほど痛い・持たない側が撃ちやすい', () => {
  it('徴税官の取る額は相手の VP に応じて増える', () => {
    const g = fixture();
    const base = taxmanAmountOf(g, 'you', B);
    g.market.find((s) => s.buildingId === 'fortress')!.owner = 'cpu';
    expect(taxmanAmountOf(g, 'you', B)).toBe(base + Math.floor(B.buildings.fortress.vp * B.taxmanIncomeRate));
  });

  it('徴税官のコストは自分の物件の数で上がる', () => {
    const g = fixture();
    const base = cardCostFor(g, 'you', 'taxman', B);
    expect(base).toBe(B.cards.taxman.cost);
    ['wall', 'quarry', 'road', 'mine'].forEach((id) => (g.market.find((s) => s.buildingId === id)!.owner = 'you'));
    expect(cardCostFor(g, 'you', 'taxman', B)).toBe(base + Math.floor(4 * B.taxmanCostPerSlot));
  });

  it('買収者の割引は相手の物件が多いほど大きい', () => {
    const g = fixture();
    const B0 = { ...B, cardXpBehindBonus: 0 };
    const base = spyDiscountOf(g, 'you', B0);
    expect(base).toBe(B.spyAcquireDiscount);
    ['wall', 'factory', 'road'].forEach((id) => (g.market.find((s) => s.buildingId === id)!.owner = 'cpu'));
    expect(spyDiscountOf(g, 'you', B0)).toBe(base + Math.floor(3 * B.spyPerSlot));
    g.players.you.hand = ['spy', 'miner', 'banker', 'architect'];
    const after = reduce(g, { type: 'useCard', card: 'spy' }, B0);
    expect(after.players.you.acquireDiscount).toBe(spyDiscountOf(g, 'you', B0));
  });

  it('Lv3 の封鎖者は封鎖が続く手番が増える', () => {
    let g = used(fixture(), 'blockader', B.cardLevelUses[1] - 1);
    g.players.you.hand = ['blockader', 'miner', 'banker', 'architect'];
    g = reduce(g, { type: 'useCard', card: 'blockader', district: 0 }, B);
    const turns = g.blockades[0]!.untilTurn - g.turn;
    expect(turns).toBe(1 + 2 * cardPower(B, 'blockader', 3));
  });
});
