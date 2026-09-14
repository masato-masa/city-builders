import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import {
  handOf,
  hasBuilding,
  nextCardOf,
  opponentOf,
  ownedSlots,
  scoreOf,
  vpOfSlot,
} from '@/game/selectors';
import { createGame } from '@/game/setup';

describe('初期状態', () => {
  it('同じシードからは同じ試合になる', () => {
    expect(createGame(2024)).toEqual(createGame(2024));
  });

  it('違うシードでは循環順が変わる', () => {
    const a = createGame(1).players.you.deck;
    const b = createGame(99999).players.you.deck;
    expect(a).not.toEqual(b);
  });

  it('両者とも 10 枚すべてを 1 枚ずつ持つ', () => {
    const g = createGame(5);
    for (const p of ['you', 'cpu'] as const) {
      expect(g.players[p].deck).toHaveLength(10);
      expect(new Set(g.players[p].deck).size).toBe(10);
    }
  });

  it('先手と後手の初期コインはどちらも 0', () => {
    const g = createGame(5);
    const first = g.players[g.current].coins;
    const second = g.players[opponentOf(g.current)].coins;
    expect(first).toBe(DEFAULT_BALANCE.startingCoins.first);
    expect(second).toBe(DEFAULT_BALANCE.startingCoins.second);
    expect(first).toBe(0);
    expect(second).toBe(0);
  });

  it('市場は 10 スロットで全て未建設', () => {
    const g = createGame(5);
    expect(g.market).toHaveLength(10);
    expect(g.market.every((s) => s.owner === null)).toBe(true);
    expect(g.market.map((s) => s.slotId)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('手札はデッキの先頭 4 枚、next はその次の 1 枚', () => {
    const g = createGame(5);
    expect(handOf(g, 'you')).toEqual(g.players.you.deck.slice(0, 4));
    expect(nextCardOf(g, 'you')).toBe(g.players.you.deck[4]);
  });
});

describe('派生値', () => {
  it('未建設なら所有物件は 0、VP も 0', () => {
    const g = createGame(5);
    expect(ownedSlots(g, 'you')).toHaveLength(0);
    expect(scoreOf(g, 'you')).toBe(0);
    expect(hasBuilding(g, 'you', 'wall')).toBe(false);
  });

  it('大聖堂は他の物件 1 件につき +2 VP', () => {
    const g = createGame(5);
    // 大聖堂 + 城塞 + 商館 を所有させる
    const cathedral = g.market.find((s) => s.buildingId === 'cathedral')!;
    const fortress = g.market.find((s) => s.buildingId === 'fortress')!;
    const house = g.market.find((s) => s.buildingId === 'tradingHouse')!;
    cathedral.owner = 'you';
    fortress.owner = 'you';
    house.owner = 'you';
    // 城塞 6 + 商館 2 + 大聖堂（他 2 件 × 2）4 = 12
    expect(scoreOf(g, 'you')).toBe(12);
  });

  it('区画ごとの VP を単体で取れる', () => {
    const g = createGame(5);
    const fortress = g.market.find((s) => s.buildingId === 'fortress')!;
    const cathedral = g.market.find((s) => s.buildingId === 'cathedral')!;
    const house = g.market.find((s) => s.buildingId === 'tradingHouse')!;
    fortress.owner = 'you';
    cathedral.owner = 'you';
    house.owner = 'you';

    expect(vpOfSlot(g, fortress)).toBe(DEFAULT_BALANCE.buildings.fortress.vp);
    // 大聖堂は「自分の他の物件 1 件につき +2」。他に 2 件あるので 4
    expect(vpOfSlot(g, cathedral)).toBe(2 * DEFAULT_BALANCE.cathedralVpPerBuilding);
  });

  it('未建設の区画は 0 VP', () => {
    const g = createGame(5);
    expect(vpOfSlot(g, g.market[0]!)).toBe(0);
  });

  it('scoreOf は区画ごとの VP の合計と一致する', () => {
    const g = createGame(5);
    g.market.forEach((s, i) => {
      s.owner = i % 2 === 0 ? 'you' : 'cpu';
    });
    const sum = g.market
      .filter((s) => s.owner === 'you')
      .reduce((n, s) => n + vpOfSlot(g, s), 0);
    expect(scoreOf(g, 'you')).toBe(sum);
  });
});
