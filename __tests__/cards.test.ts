import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { canBuild, reduce } from '@/game/reducer';
import { districtOfSlot, slotBuildBlocked, slotEffectStopped } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

function fixture(deck: CardId[], coins: number): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.players.you.hand = deck.slice(0, 4);
  g.players.you.queue = deck.slice(4);
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
    // banker（枠 1）は待機列の先頭に、herald（枠 0）はその次に置き換わる。他の枠は動かない。
    expect(after.players.you.hand).toEqual(['spy', 'architect', 'miner', 'guard']);
    // 対象（banker）が先に待機列の底へ、伝令がその下（さらに奥）に積まれる
    expect(after.players.you.queue.slice(-2)).toEqual(['banker', 'herald']);
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
  const HAND = ['taxman', 'miner', 'usurer', 'banker', 'architect', 'spy', 'herald', 'blockader'] as const;

  it('使った時点では相手のコインは動かず、次の収入から 6 引かれる', () => {
    const g = fixture([...HAND], 10);
    const after = reduce(g, { type: 'useCard', card: 'taxman' }, DEFAULT_BALANCE);
    expect(after.players.cpu.coins).toBe(20);
    expect(after.players.cpu.pendingTax).toBe(DEFAULT_BALANCE.taxmanAmount);
    const next = reduce(reduce(after, { type: 'endTurn' }, DEFAULT_BALANCE), { type: 'startTurn' }, DEFAULT_BALANCE);
    expect(next.players.cpu.coins).toBe(20 + DEFAULT_BALANCE.baseIncome + DEFAULT_BALANCE.secondPlayerFirstTurnBonus - DEFAULT_BALANCE.taxmanAmount);
    expect(next.players.cpu.pendingTax).toBe(0);
  });

  it('手持ちと収入が足りなければ、引けた分で止まりマイナスにならない', () => {
    const g = fixture([...HAND], 10);
    g.players.cpu.coins = 0;
    const after = reduce(g, { type: 'useCard', card: 'taxman' }, DEFAULT_BALANCE);
    const next = reduce(reduce(after, { type: 'endTurn' }, DEFAULT_BALANCE), { type: 'startTurn' }, DEFAULT_BALANCE);
    expect(next.players.cpu.coins).toBe(0);
  });

  it('相手が城壁を持っていると無効。コストは払う', () => {
    const g = fixture(['taxman', 'miner', 'usurer', 'banker', 'architect', 'spy', 'herald', 'blockader'], 10);
    g.market.find((s) => s.buildingId === 'wall')!.owner = 'cpu';
    const after = reduce(g, { type: 'useCard', card: 'taxman' }, DEFAULT_BALANCE);
    expect(after.players.cpu.pendingTax).toBe(0);
    expect(after.players.you.coins).toBe(10 - DEFAULT_BALANCE.cards.taxman.cost);
  });
});

describe('封鎖者', () => {
  const DECK: CardId[] = ['blockader', 'miner', 'usurer', 'banker', 'architect', 'spy', 'herald', 'taxman'];
  // 商人街（地区 0）は区画 0・1（商館）・2（石切場）
  const MERCHANT = 0;

  it('地区を封鎖すると、次の相手のターンだけ、相手はその地区の空き地に建てられない（他の地区には建てられる）', () => {
    const g = fixture(DECK, 10);
    const after = reduce(g, { type: 'useCard', card: 'blockader', district: MERCHANT }, DEFAULT_BALANCE);
    expect(after.blockades).toEqual([{ district: MERCHANT, target: 'cpu', untilTurn: g.turn + 1, beforeIncome: true }]);
    let foe = reduce(reduce(after, { type: 'endTurn' }, DEFAULT_BALANCE), { type: 'startTurn' }, DEFAULT_BALANCE);
    foe.players.cpu.coins = 50;
    expect(canBuild(foe, 0, DEFAULT_BALANCE)).toBe(false);
    expect(canBuild(foe, 3, DEFAULT_BALANCE)).toBe(true);
    // 相手のターンの終わりで解ける
    foe = reduce(foe, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(foe.blockades).toEqual([]);
  });

  it('相手の物件は効果（収益を含む）が止まり、自分の物件には何も起きない', () => {
    const g = fixture(DECK, 10);
    g.turn = 5; // 後手の 1 ターン目の補正が乗らない手番
    g.market[0]!.owner = 'cpu';
    g.market[1]!.owner = 'you';
    const after = reduce(g, { type: 'useCard', card: 'blockader', district: MERCHANT }, DEFAULT_BALANCE);
    expect(slotEffectStopped(after, after.market[0]!, DEFAULT_BALANCE)).toBe(true);
    expect(slotEffectStopped(after, after.market[1]!, DEFAULT_BALANCE)).toBe(false);
    // 相手の次の収入に商館の収益が入らない（基礎収入だけ）
    const handed = reduce(after, { type: 'endTurn' }, DEFAULT_BALANCE);
    const coins = handed.players.cpu.coins;
    const started = reduce(handed, { type: 'startTurn' }, DEFAULT_BALANCE);
    expect(started.players.cpu.coins - coins).toBe(DEFAULT_BALANCE.baseIncome);
    expect(started.blockades[0]!.beforeIncome).toBe(false);
    // 解けた後は止まらない
    const done = reduce(started, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(slotEffectStopped(done, done.market[0]!, DEFAULT_BALANCE)).toBe(false);
  });

  it('城塞を持つ地区（城下）の物件は効果が止まらない（空き地に建てられないのは同じ）', () => {
    const g = fixture(DECK, 10);
    const district = districtOfSlot(g.market.find((s) => s.buildingId === 'fortress')!.slotId, DEFAULT_BALANCE);
    const fortress = g.market.find((s) => s.buildingId === 'fortress')!;
    const road = g.market.find((s) => s.buildingId === 'road')!;
    expect(districtOfSlot(road.slotId, DEFAULT_BALANCE)).toBe(district);
    fortress.owner = 'cpu';
    road.owner = 'cpu';
    const after = reduce(g, { type: 'useCard', card: 'blockader', district }, DEFAULT_BALANCE);
    expect(slotEffectStopped(after, after.market[road.slotId]!, DEFAULT_BALANCE)).toBe(false);
    const empty = after.market.find((s) => s.owner === null && districtOfSlot(s.slotId, DEFAULT_BALANCE) === district)!;
    expect(slotBuildBlocked(after, 'cpu', empty.slotId, DEFAULT_BALANCE)).toBe(true);
  });

  it('相手が城壁を持っていると無効。コストは払う', () => {
    const g = fixture(DECK, 10);
    g.market.find((s) => s.buildingId === 'wall')!.owner = 'cpu';
    const after = reduce(g, { type: 'useCard', card: 'blockader', district: MERCHANT }, DEFAULT_BALANCE);
    expect(after.blockades).toEqual([]);
    expect(after.players.you.coins).toBe(10 - DEFAULT_BALANCE.cards.blockader.cost);
  });

  it('存在しない地区は封鎖できない（状態が変わらない）', () => {
    const g = fixture(DECK, 10);
    expect(reduce(g, { type: 'useCard', card: 'blockader', district: 99 }, DEFAULT_BALANCE)).toEqual(g);
    expect(reduce(g, { type: 'useCard', card: 'blockader' }, DEFAULT_BALANCE)).toEqual(g);
  });
});
