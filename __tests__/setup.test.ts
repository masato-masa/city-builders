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
import type { GameState } from '@/game/types';

describe('初期状態', () => {
  it('同じシードからは同じ試合になる', () => {
    expect(createGame(2024)).toEqual(createGame(2024));
  });

  it('違うシードでは循環順が変わる', () => {
    const a = createGame(1).players.you;
    const b = createGame(99999).players.you;
    expect([...a.hand, ...a.queue]).not.toEqual([...b.hand, ...b.queue]);
  });

  it('両者とも 10 枚すべてを 1 枚ずつ持つ', () => {
    const g = createGame(5);
    for (const p of ['you', 'cpu'] as const) {
      const all = [...g.players[p].hand, ...g.players[p].queue];
      expect(all).toHaveLength(10);
      expect(new Set(all).size).toBe(10);
      expect(g.players[p].hand).toHaveLength(4);
      expect(g.players[p].queue).toHaveLength(6);
    }
  });

  it('forcedFirst を渡すと必ずその側が先手になる', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = createGame(seed, DEFAULT_BALANCE, 'you');
      expect(g.current).toBe('you');
      expect(g.players.you.coins).toBe(DEFAULT_BALANCE.startingCoins.first);
      expect(g.players.cpu.coins).toBe(DEFAULT_BALANCE.startingCoins.second);
    }
    // 対称ケース: 'cpu' を強制しても必ず cpu が先手になる。
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = createGame(seed, DEFAULT_BALANCE, 'cpu');
      expect(g.current).toBe('cpu');
      expect(g.players.cpu.coins).toBe(DEFAULT_BALANCE.startingCoins.first);
      expect(g.players.you.coins).toBe(DEFAULT_BALANCE.startingCoins.second);
    }
  });

  it('forcedFirst は山札のシャッフルに影響しない（先手決定より前に山札を作るため）', () => {
    // createGame の実装は「両者の山札を shuffle → 先手を rng から決める」の順で
    // RNG を消費する。forcedFirst は「先手を rng から決める」部分を ?? で
    // 短絡させるだけなので、山札の内容（構成要素）自体は forcedFirst の有無や
    // 値に関係なく同じでなければならない。将来 RNG 呼び出し順が入れ替わって
    // 山札より前に先手決定が来るようになれば、このテストが落ちる。
    const deckOf = (g: GameState, p: 'you' | 'cpu') => [...g.players[p].hand, ...g.players[p].queue];
    for (const seed of [1, 2, 3, 4, 5, 42]) {
      const free = createGame(seed);
      const forcedYou = createGame(seed, DEFAULT_BALANCE, 'you');
      const forcedCpu = createGame(seed, DEFAULT_BALANCE, 'cpu');
      for (const p of ['you', 'cpu'] as const) {
        expect(new Set(deckOf(forcedYou, p))).toEqual(new Set(deckOf(free, p)));
        expect(new Set(deckOf(forcedCpu, p))).toEqual(new Set(deckOf(free, p)));
        expect(deckOf(forcedYou, p)).toEqual(deckOf(free, p));
        expect(deckOf(forcedCpu, p)).toEqual(deckOf(free, p));
      }
    }
  });

  it('forcedFirst を省略したときは、シードによって you・cpu どちらも先手になる（非強制時の非退行確認）', () => {
    // createGame(seed) を forcedFirst なしで多数のシードに対して呼び、
    // g.current に 'you' と 'cpu' の両方が現れることを確認する。
    const seen = new Set(Array.from({ length: 20 }, (_, i) => createGame(i).current));
    expect(seen).toContain('you');
    expect(seen).toContain('cpu');
  });

  it('先手と後手の初期コインは同額', () => {
    const g = createGame(5);
    const first = g.players[g.current].coins;
    const second = g.players[opponentOf(g.current)].coins;
    expect(first).toBe(DEFAULT_BALANCE.startingCoins.first);
    expect(second).toBe(DEFAULT_BALANCE.startingCoins.second);
    // 先手と後手の開始資金は同額（先手有利の補正は後手の 1 ターン目の収入で行う）
    expect(first).toBe(second);
  });

  it('市場は 10 スロットで全て未建設', () => {
    const g = createGame(5);
    expect(g.market).toHaveLength(10);
    expect(g.market.every((s) => s.owner === null)).toBe(true);
    expect(g.market.map((s) => s.slotId)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('手札は固定 4 枠、next は待機列の先頭 1 枚', () => {
    const g = createGame(5);
    expect(handOf(g, 'you')).toEqual(g.players.you.hand);
    expect(nextCardOf(g, 'you')).toBe(g.players.you.queue[0]);
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
    // 城塞 + 商館 + 大聖堂（他 2 件 × 2）4
    expect(scoreOf(g, 'you')).toBe(
      DEFAULT_BALANCE.buildings.fortress.vp + DEFAULT_BALANCE.buildings.tradingHouse.vp + 2 * DEFAULT_BALANCE.cathedralVpPerBuilding,
    );
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
