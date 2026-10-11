import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { reduce } from '@/game/reducer';
import { scoreOf, winnerOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

const ORDER: CardId[] = [
  'miner',
  'usurer',
  'banker',
  'architect',
  'spy',
  'herald',
  'taxman',
  'blockader',
];

function fixture(): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.players.you.hand = ORDER.slice(0, 4);
  g.players.you.queue = ORDER.slice(4);
  g.players.you.coins = 50;
  return g;
}

describe('ターン終了', () => {
  it('手番が相手に移り、ターン数が進む', () => {
    const g = fixture();
    const after = reduce(g, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(after.current).toBe('cpu');
    expect(after.turn).toBe(g.turn + 1);
  });

  it('祝祭・買収の結果はターン終了で消える。封鎖者の封鎖は受けた側のターンの終わりで解ける', () => {
    // 封鎖者は「次の相手のターンだけ」（2026-10-11 ユーザー指定。以前は永続）
    const g = fixture();
    g.blockades = [
      { district: 0, target: 'you', untilTurn: g.turn, beforeIncome: false },
      { district: 1, target: 'cpu', untilTurn: g.turn + 1, beforeIncome: true },
    ];
    g.players.you.festivalActive = true;
    g.players.you.acquireDiscount = 5;
    const after = reduce(g, { type: 'endTurn' }, DEFAULT_BALANCE);
    // you が受けていた封鎖（このターンまで）は解け、cpu に掛けた封鎖（cpu の次のターンまで）は残る
    expect(after.blockades).toEqual([{ district: 1, target: 'cpu', untilTurn: g.turn + 1, beforeIncome: true }]);
    expect(after.players.you.festivalActive).toBe(false);
    expect(after.players.you.acquireDiscount).toBe(0);
  });

  it('何もせずに終えられる', () => {
    const g = fixture();
    const after = reduce(g, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(after.phase).toBe('playing');
  });
});

describe('街道', () => {
  it('街道があれば手札 1 枚を無料で底へ送れる', () => {
    const g = fixture();
    g.market.find((s) => s.buildingId === 'road')!.owner = 'you';
    const before = g.players.you.coins;
    const after = reduce(g, { type: 'useRoad', target: 'banker' }, DEFAULT_BALANCE);
    // banker は枠 2 にあった。枠 2 だけ待機列の先頭（spy）に置き換わり、他は不動
    expect(after.players.you.hand).toEqual(['miner', 'usurer', 'spy', 'architect']);
    expect(after.players.you.queue).toEqual(['herald', 'taxman', 'blockader', 'banker']);
    expect(after.players.you.coins).toBe(before);
    expect(after.players.you.roadUsesThisTurn).toBe(1);
  });

  it('1 ターンに 1 回だけ', () => {
    let g = fixture();
    g.market.find((s) => s.buildingId === 'road')!.owner = 'you';
    g = reduce(g, { type: 'useRoad', target: 'banker' }, DEFAULT_BALANCE);
    const twice = reduce(g, { type: 'useRoad', target: 'miner' }, DEFAULT_BALANCE);
    expect(twice).toEqual(g);
  });

  it('街道を持っていなければ使えない', () => {
    const g = fixture();
    const after = reduce(g, { type: 'useRoad', target: 'banker' }, DEFAULT_BALANCE);
    expect(after).toEqual(g);
  });
});

describe('終了条件', () => {
  it('物件が全て建つと終了する', () => {
    const g = fixture();
    g.market.forEach((s, i) => (s.owner = i < 5 ? 'you' : 'cpu'));
    const after = reduce(g, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(after.phase).toBe('finished');
  });

  it('上限ターンで終了する', () => {
    const g = fixture();
    g.turn = DEFAULT_BALANCE.maxTurnsPerPlayer * 2;
    const after = reduce(g, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(after.phase).toBe('finished');
  });

  it('未終了なら勝者は null', () => {
    expect(winnerOf(fixture(), DEFAULT_BALANCE)).toBeNull();
  });

  it('VP が多い方が勝つ', () => {
    const g = fixture();
    g.market.forEach((s) => (s.owner = 'cpu'));
    g.market.find((s) => s.buildingId === 'fortress')!.owner = 'you';
    const after = reduce(g, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(winnerOf(after, DEFAULT_BALANCE)).toBe('cpu');
  });

  it('VP 同点なら残コインが多い方が勝つ', () => {
    const g = fixture();
    // 商館を 1 つずつ持たせ、他は誰のものでもない状態にすると VP は同点
    const houses = g.market.filter((s) => s.buildingId === 'tradingHouse');
    houses[0]!.owner = 'you';
    houses[1]!.owner = 'cpu';
    g.turn = DEFAULT_BALANCE.maxTurnsPerPlayer * 2;
    g.players.you.coins = 10;
    g.players.cpu.coins = 3;
    const after = reduce(g, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(after.phase).toBe('finished');
    expect(scoreOf(after, 'you', DEFAULT_BALANCE)).toBe(scoreOf(after, 'cpu', DEFAULT_BALANCE));
    expect(winnerOf(after, DEFAULT_BALANCE)).toBe('you');
  });
});
