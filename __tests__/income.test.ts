import { buildingIncomeOf as incomeAt } from '@/game/balance';
import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { cardCostFor, reduce } from '@/game/reducer';
import { scoreOf } from '@/game/selectors';
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
  g.players.you.hand = ORDER.slice(0, 4);
  g.players.you.queue = ORDER.slice(4);
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

  it('物件は毎ターン開始時に収益を生む（商館 1 件につき buildings.tradingHouse.income）', () => {
    const g = fixture(0);
    const houses = g.market.filter((s) => s.buildingId === 'tradingHouse');
    houses.forEach((s) => (s.owner = 'you'));
    const after = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    expect(after.players.you.coins).toBe(
      DEFAULT_BALANCE.baseIncome + houses.length * incomeAt(DEFAULT_BALANCE, 'tradingHouse', 1),
    );
  });

  it('収益はレベルで変わる（Lv2 は upgrades、Lv3 は upgrades3 の income）', () => {
    const g = fixture(0);
    const [a, b] = g.market.filter((s) => s.buildingId === 'tradingHouse');
    a!.owner = 'you';
    a!.level = 2;
    b!.owner = 'you';
    b!.level = 3;
    const after = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    expect(after.players.you.coins).toBe(
      DEFAULT_BALANCE.baseIncome +
        incomeAt(DEFAULT_BALANCE, 'tradingHouse', 2) +
        incomeAt(DEFAULT_BALANCE, 'tradingHouse', 3),
    );
  });

  it('銀行家は解決時の自分の VP の分だけ増える', () => {
    let g = fixture(10);
    g = reduce(g, { type: 'useCard', card: 'banker' }, DEFAULT_BALANCE);
    // 使ったあとに物件を 2 件持たせる（商館なので開始時の収益も付く。称号は盤面を引き直していないので無し）
    g.market.filter((s) => s.buildingId === 'tradingHouse').slice(0, 2).forEach((s) => (s.owner = 'you'));
    const vp = scoreOf(g, 'you', DEFAULT_BALANCE);
    expect(vp).toBe(2 * DEFAULT_BALANCE.buildings.tradingHouse.vp);
    g = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    const before = 10 - DEFAULT_BALANCE.cards.banker.cost;
    const houseIncome = 2 * incomeAt(DEFAULT_BALANCE, 'tradingHouse', 1);
    const bankerIncome = DEFAULT_BALANCE.bankerIncome + Math.floor(vp * DEFAULT_BALANCE.bankerVpRate);
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
    // 取引所自身の VP が銀行家に乗る。取引所の収益も入る
    const bankerIncome =
      DEFAULT_BALANCE.bankerIncome +
      Math.floor(DEFAULT_BALANCE.buildings.exchange.vp * DEFAULT_BALANCE.bankerVpRate) +
      DEFAULT_BALANCE.exchangeBonus;
    expect(g.players.you.coins).toBe(
      before + DEFAULT_BALANCE.baseIncome + incomeAt(DEFAULT_BALANCE, 'exchange', 1) + minerIncome + bankerIncome,
    );
  });

  it('鉱山があると採掘師が安くなり、次の収入が増える', () => {
    let g = fixture(10);
    g.market.find((s) => s.buildingId === 'mine')!.owner = 'you';
    expect(cardCostFor(g, 'you', 'miner', DEFAULT_BALANCE)).toBe(
      DEFAULT_BALANCE.cards.miner.cost - DEFAULT_BALANCE.mineMinerDiscount,
    );
    g = reduce(g, { type: 'useCard', card: 'miner' }, DEFAULT_BALANCE);
    expect(g.players.you.coins).toBe(10 - (DEFAULT_BALANCE.cards.miner.cost - DEFAULT_BALANCE.mineMinerDiscount));
    const before = g.players.you.coins;
    g = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    expect(g.players.you.coins - before).toBe(
      DEFAULT_BALANCE.baseIncome +
        incomeAt(DEFAULT_BALANCE, 'mine', 1) +
        DEFAULT_BALANCE.minerIncome +
        DEFAULT_BALANCE.mineMinerBonus,
    );
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
