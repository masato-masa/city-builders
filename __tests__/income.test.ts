import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { reduce } from '@/game/reducer';
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

function fixture(coins: number): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.players.you.deck = [...ORDER];
  g.players.you.coins = coins;
  return g;
}

describe('遅延収入', () => {
  it('投資カードはそのターンにはコインを生まない', () => {
    const g = fixture(10);
    const after = reduce(g, { type: 'useCard', card: 'miner' }, DEFAULT_BALANCE);
    expect(after.players.you.coins).toBe(10 - DEFAULT_BALANCE.cards.miner.cost);
    expect(after.players.you.pendingIncome).toEqual(['miner']);
  });

  it('次のターン開始時に解決される', () => {
    let g = fixture(10);
    g = reduce(g, { type: 'useCard', card: 'miner' }, DEFAULT_BALANCE);
    g = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    // (10 - 採掘師コスト) + 基本収入 + 採掘師の収入
    const before = 10 - DEFAULT_BALANCE.cards.miner.cost;
    expect(g.players.you.coins).toBe(before + DEFAULT_BALANCE.baseIncome + DEFAULT_BALANCE.minerIncome);
    expect(g.players.you.pendingIncome).toEqual([]);
  });

  it('商館 1 件につき開始時 +1', () => {
    const g = fixture(0);
    g.market.filter((s) => s.buildingId === 'tradingHouse').forEach((s) => (s.owner = 'you'));
    const after = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    expect(after.players.you.coins).toBe(DEFAULT_BALANCE.baseIncome + 3 * DEFAULT_BALANCE.tradingHouseIncome);
  });

  it('銀行家は解決時の物件数で増える', () => {
    let g = fixture(10);
    g = reduce(g, { type: 'useCard', card: 'banker' }, DEFAULT_BALANCE);
    // 使ったあとに物件を 2 件持たせる（商館なので開始時収入も付く）
    g.market.filter((s) => s.buildingId === 'tradingHouse').slice(0, 2).forEach((s) => (s.owner = 'you'));
    g = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    const before = 10 - DEFAULT_BALANCE.cards.banker.cost;
    const houseIncome = 2 * DEFAULT_BALANCE.tradingHouseIncome;
    const bankerIncome = DEFAULT_BALANCE.bankerIncome + 2 * DEFAULT_BALANCE.bankerPerBuilding;
    expect(g.players.you.coins).toBe(before + DEFAULT_BALANCE.baseIncome + houseIncome + bankerIncome);
  });

  it('取引所があると投資カード 1 枚につき +2', () => {
    let g = fixture(10);
    g = reduce(g, { type: 'useCard', card: 'miner' }, DEFAULT_BALANCE);
    g = reduce(g, { type: 'useCard', card: 'banker' }, DEFAULT_BALANCE);
    g.market.find((s) => s.buildingId === 'exchange')!.owner = 'you';
    g = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    const before = 10 - DEFAULT_BALANCE.cards.miner.cost - DEFAULT_BALANCE.cards.banker.cost;
    const minerIncome = DEFAULT_BALANCE.minerIncome + DEFAULT_BALANCE.exchangeBonus;
    // 取引所自身も所有物件数に入る
    const bankerIncome =
      DEFAULT_BALANCE.bankerIncome + 1 * DEFAULT_BALANCE.bankerPerBuilding + DEFAULT_BALANCE.exchangeBonus;
    expect(g.players.you.coins).toBe(before + DEFAULT_BALANCE.baseIncome + minerIncome + bankerIncome);
  });

  it('開始時にターン内の一時状態がリセットされる', () => {
    let g = fixture(10);
    g = reduce(g, { type: 'useCard', card: 'miner' }, DEFAULT_BALANCE);
    expect(g.players.you.usedThisTurn).toEqual(['miner']);
    g = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    expect(g.players.you.usedThisTurn).toEqual([]);
    expect(g.players.you.usedAnyCardThisTurn).toBe(false);
    expect(g.players.you.buildDiscount).toBe(0);
    expect(g.players.you.roadUsesThisTurn).toBe(0);
  });
});
