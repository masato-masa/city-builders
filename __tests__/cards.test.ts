import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { reduce } from '@/game/reducer';
import { handOf } from '@/game/selectors';
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
  'merchant',
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
      'merchant',
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
});

describe('密偵', () => {
  it('相手の手札 4 枚が見える', () => {
    const g = fixture(['spy', 'miner', 'merchant', 'banker', 'architect', 'herald', 'taxman', 'blockader'], 10);
    const after = reduce(g, { type: 'useCard', card: 'spy' }, DEFAULT_BALANCE);
    expect(after.revealedOpponentHand).toEqual(handOf(g, 'cpu'));
  });
});

describe('徴税官', () => {
  it('相手のコインを 5 減らす', () => {
    const g = fixture(['taxman', 'miner', 'merchant', 'banker', 'architect', 'spy', 'herald', 'blockader'], 10);
    const after = reduce(g, { type: 'useCard', card: 'taxman' }, DEFAULT_BALANCE);
    expect(after.players.cpu.coins).toBe(20 - DEFAULT_BALANCE.taxmanAmount);
  });

  it('相手のコインが足りなければ 0 で止まる', () => {
    const g = fixture(['taxman', 'miner', 'merchant', 'banker', 'architect', 'spy', 'herald', 'blockader'], 10);
    g.players.cpu.coins = 2;
    const after = reduce(g, { type: 'useCard', card: 'taxman' }, DEFAULT_BALANCE);
    expect(after.players.cpu.coins).toBe(0);
  });

  it('相手が城壁を持っていると無効。コストは払う', () => {
    const g = fixture(['taxman', 'miner', 'merchant', 'banker', 'architect', 'spy', 'herald', 'blockader'], 10);
    g.market.find((s) => s.buildingId === 'wall')!.owner = 'cpu';
    const after = reduce(g, { type: 'useCard', card: 'taxman' }, DEFAULT_BALANCE);
    expect(after.players.cpu.coins).toBe(20);
    expect(after.players.you.coins).toBe(10 - DEFAULT_BALANCE.cards.taxman.cost);
  });
});

describe('封鎖者', () => {
  it('相手の建設不可スロットを立てる', () => {
    const g = fixture(['blockader', 'miner', 'merchant', 'banker', 'architect', 'spy', 'herald', 'taxman'], 10);
    const target = g.market.find((s) => s.buildingId === 'fortress')!.slotId;
    const after = reduce(
      g,
      { type: 'useCard', card: 'blockader', blockadeSlot: target },
      DEFAULT_BALANCE,
    );
    expect(after.players.cpu.blockedSlot).toBe(target);
  });

  it('相手が城壁を持っていると無効', () => {
    const g = fixture(['blockader', 'miner', 'merchant', 'banker', 'architect', 'spy', 'herald', 'taxman'], 10);
    g.market.find((s) => s.buildingId === 'wall')!.owner = 'cpu';
    const after = reduce(
      g,
      { type: 'useCard', card: 'blockader', blockadeSlot: 7 },
      DEFAULT_BALANCE,
    );
    expect(after.players.cpu.blockedSlot).toBeNull();
  });

  it('建設済みのスロットは封鎖できない（状態が変わらない）', () => {
    const g = fixture(['blockader', 'miner', 'merchant', 'banker', 'architect', 'spy', 'herald', 'taxman'], 10);
    g.market[7]!.owner = 'you';
    const after = reduce(
      g,
      { type: 'useCard', card: 'blockader', blockadeSlot: 7 },
      DEFAULT_BALANCE,
    );
    expect(after).toEqual(g);
  });
});
