import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { reduce } from '@/game/reducer';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

function fixture(deck: CardId[], coins: number): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.players.you.deck = [...deck];
  g.players.you.coins = coins;
  g.players.cpu.coins = 20;
  return g;
}

const WITH_HERALD: CardId[] = [
  'herald',
  'banker',
  'miner',
  'guard',
  'architect',
  'spy',
  'taxman',
  'blockader',
];

describe('伝令', () => {
  it('選んだカードを使わずに底へ送り、伝令もその下へ回る', () => {
    const g = fixture(WITH_HERALD, 10);
    const after = reduce(
      g,
      { type: 'useCard', card: 'herald', heraldTarget: 'banker' },
      DEFAULT_BALANCE,
    );
    expect(after.players.you.deck).toEqual([
      'miner',
      'guard',
      'architect',
      'spy',
      'taxman',
      'blockader',
      'banker',
      'herald',
    ]);
  });

  it('送ったカードのコストは払わない', () => {
    const g = fixture(WITH_HERALD, 10);
    const after = reduce(
      g,
      { type: 'useCard', card: 'herald', heraldTarget: 'banker' },
      DEFAULT_BALANCE,
    );
    expect(after.players.you.coins).toBe(10 - DEFAULT_BALANCE.cards.herald.cost);
  });

  it('送ったカードは使用済みにならない', () => {
    const g = fixture(WITH_HERALD, 10);
    const after = reduce(
      g,
      { type: 'useCard', card: 'herald', heraldTarget: 'banker' },
      DEFAULT_BALANCE,
    );
    expect(after.players.you.usedThisTurn).toEqual(['herald']);
  });

  it('手札に無いカードは送れない（状態が変わらない）', () => {
    const g = fixture(WITH_HERALD, 10);
    const after = reduce(
      g,
      { type: 'useCard', card: 'herald', heraldTarget: 'taxman' },
      DEFAULT_BALANCE,
    );
    expect(after).toEqual(g);
  });

  it('対象が伝令自身なら何も起きない', () => {
    const g = fixture(WITH_HERALD, 10);
    const after = reduce(
      g,
      { type: 'useCard', card: 'herald', heraldTarget: 'herald' },
      DEFAULT_BALANCE,
    );
    expect(after).toEqual(g);
  });

  it('対象が未指定なら何も起きない', () => {
    const g = fixture(WITH_HERALD, 10);
    const after = reduce(g, { type: 'useCard', card: 'herald' }, DEFAULT_BALANCE);
    expect(after).toEqual(g);
  });
});

describe('徴税官', () => {
  it('相手のコインを 6 減らす', () => {
    const g = fixture(['taxman', 'miner', 'usurer', 'banker', 'architect', 'spy', 'herald', 'blockader'], 10);
    const after = reduce(g, { type: 'useCard', card: 'taxman' }, DEFAULT_BALANCE);
    expect(after.players.cpu.coins).toBe(20 - DEFAULT_BALANCE.taxmanAmount);
  });

  it('相手のコインが足りなければ 0 で止まる', () => {
    const g = fixture(['taxman', 'miner', 'usurer', 'banker', 'architect', 'spy', 'herald', 'blockader'], 10);
    g.players.cpu.coins = 2;
    const after = reduce(g, { type: 'useCard', card: 'taxman' }, DEFAULT_BALANCE);
    expect(after.players.cpu.coins).toBe(0);
  });

  it('相手が城壁を持っていると無効。コストは払う', () => {
    const g = fixture(['taxman', 'miner', 'usurer', 'banker', 'architect', 'spy', 'herald', 'blockader'], 10);
    g.market.find((s) => s.buildingId === 'wall')!.owner = 'cpu';
    const after = reduce(g, { type: 'useCard', card: 'taxman' }, DEFAULT_BALANCE);
    expect(after.players.cpu.coins).toBe(20);
    expect(after.players.you.coins).toBe(10 - DEFAULT_BALANCE.cards.taxman.cost);
  });
});

describe('封鎖者', () => {
  it('空き地を指定すると、相手はそこに建設できなくなる', () => {
    const g = fixture(['blockader', 'miner', 'usurer', 'banker', 'architect', 'spy', 'herald', 'taxman'], 10);
    const target = g.market.find((s) => s.buildingId === 'fortress')!.slotId;
    const after = reduce(
      g,
      { type: 'useCard', card: 'blockader', blockadeSlot: target },
      DEFAULT_BALANCE,
    );
    expect(after.players.cpu.blockedSlot).toBe(target);
    expect(after.players.cpu.disabledSlot).toBeNull();
  });

  it('相手が建設済みの区画を指定すると、その効果が止まる（建設不可にはならない）', () => {
    const g = fixture(['blockader', 'miner', 'usurer', 'banker', 'architect', 'spy', 'herald', 'taxman'], 10);
    const target = g.market.find((s) => s.buildingId === 'tradingHouse')!.slotId;
    g.market[target]!.owner = 'cpu';
    const after = reduce(
      g,
      { type: 'useCard', card: 'blockader', blockadeSlot: target },
      DEFAULT_BALANCE,
    );
    expect(after.players.cpu.disabledSlot).toBe(target);
    expect(after.players.cpu.blockedSlot).toBeNull();
  });

  it('相手が城壁を持っていると無効。コストは払う', () => {
    const g = fixture(['blockader', 'miner', 'usurer', 'banker', 'architect', 'spy', 'herald', 'taxman'], 10);
    g.market.find((s) => s.buildingId === 'wall')!.owner = 'cpu';
    const after = reduce(
      g,
      { type: 'useCard', card: 'blockader', blockadeSlot: 7 },
      DEFAULT_BALANCE,
    );
    expect(after.players.cpu.blockedSlot).toBeNull();
    expect(after.players.cpu.disabledSlot).toBeNull();
    expect(after.players.you.coins).toBe(10 - DEFAULT_BALANCE.cards.blockader.cost);
  });

  it('自分が所有している区画は対象にできない（状態が変わらない）', () => {
    const g = fixture(['blockader', 'miner', 'usurer', 'banker', 'architect', 'spy', 'herald', 'taxman'], 10);
    g.market[7]!.owner = 'you';
    const after = reduce(
      g,
      { type: 'useCard', card: 'blockader', blockadeSlot: 7 },
      DEFAULT_BALANCE,
    );
    expect(after).toEqual(g);
  });

  it('存在しないスロットは封鎖できない（状態が変わらない）', () => {
    const g = fixture(['blockader', 'miner', 'usurer', 'banker', 'architect', 'spy', 'herald', 'taxman'], 10);
    const after = reduce(
      g,
      { type: 'useCard', card: 'blockader', blockadeSlot: 99 },
      DEFAULT_BALANCE,
    );
    expect(after).toEqual(g);
  });
});
