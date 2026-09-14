import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { buildCostFor, canBuild, reduce } from '@/game/reducer';
import { scoreOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

const ORDER: CardId[] = [
  'architect',
  'miner',
  'merchant',
  'banker',
  'spy',
  'herald',
  'taxman',
  'blockader',
];

function fixture(coins: number): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.players.you.deck = [...ORDER];
  g.players.you.coins = coins;
  return g;
}

const houseSlot = (g: GameState) => g.market.find((s) => s.buildingId === 'tradingHouse')!.slotId;

describe('建設', () => {
  it('コインを払って自分のものになる', () => {
    const g = fixture(10);
    const slot = houseSlot(g);
    const after = reduce(g, { type: 'build', slotId: slot }, DEFAULT_BALANCE);
    expect(after.players.you.coins).toBe(10 - DEFAULT_BALANCE.buildings.tradingHouse.cost);
    expect(after.market[slot]!.owner).toBe('you');
    expect(scoreOf(after, 'you')).toBe(DEFAULT_BALANCE.buildings.tradingHouse.vp);
  });

  it('コインが足りなければ建てられない', () => {
    const g = fixture(3);
    expect(canBuild(g, houseSlot(g), DEFAULT_BALANCE)).toBe(false);
  });

  it('建設済みのスロットは建てられない', () => {
    const g = fixture(50);
    const slot = houseSlot(g);
    g.market[slot]!.owner = 'cpu';
    expect(canBuild(g, slot, DEFAULT_BALANCE)).toBe(false);
  });

  it('存在しないスロットは建てられない', () => {
    const g = fixture(50);
    expect(canBuild(g, 99, DEFAULT_BALANCE)).toBe(false);
  });

  it('1 ターンに何件でも建てられる', () => {
    let g = fixture(50);
    const slots = g.market.filter((s) => s.buildingId === 'tradingHouse').map((s) => s.slotId);
    for (const slotId of slots) {
      g = reduce(g, { type: 'build', slotId }, DEFAULT_BALANCE);
    }
    expect(g.market.filter((s) => s.owner === 'you')).toHaveLength(3);
  });

  it('建築家はこのターン建てる物件すべてを割り引く', () => {
    let g = fixture(50);
    g = reduce(g, { type: 'useCard', card: 'architect' }, DEFAULT_BALANCE);
    const slots = g.market.filter((s) => s.buildingId === 'tradingHouse').map((s) => s.slotId);
    const before = g.players.you.coins;
    g = reduce(g, { type: 'build', slotId: slots[0]! }, DEFAULT_BALANCE);
    g = reduce(g, { type: 'build', slotId: slots[1]! }, DEFAULT_BALANCE);
    const discounted = DEFAULT_BALANCE.buildings.tradingHouse.cost - DEFAULT_BALANCE.architectDiscount;
    expect(g.players.you.coins).toBe(before - discounted * 2);
  });

  it('建築家の割引で建設費は 0 未満にならない', () => {
    // 割引は「建築家を使ったときの balance」で buildDiscount に積まれる。
    // buildCostFor は積まれた buildDiscount だけを見るので、使用時に強い balance を渡す。
    const strong = { ...DEFAULT_BALANCE, architectDiscount: 100 };
    let g = fixture(50);
    g = reduce(g, { type: 'useCard', card: 'architect' }, strong);
    const slot = houseSlot(g);
    expect(buildCostFor(g, 'you', slot, strong)).toBe(0);

    // 0 まで下がった建設費が、実際の建設でもそのまま使われる
    const coinsBefore = g.players.you.coins;
    const after = reduce(g, { type: 'build', slotId: slot }, strong);
    expect(after.players.you.coins).toBe(coinsBefore);
    expect(after.market[slot]!.owner).toBe('you');
  });

  it('封鎖されたスロットは建てられない', () => {
    const g = fixture(50);
    const slot = houseSlot(g);
    g.players.you.blockedSlot = slot;
    expect(canBuild(g, slot, DEFAULT_BALANCE)).toBe(false);
    expect(canBuild(g, g.market.find((s) => s.buildingId === 'fortress')!.slotId, DEFAULT_BALANCE)).toBe(true);
  });
});
