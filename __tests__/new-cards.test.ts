import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { canUseCard, canUseRoad, reduce } from '@/game/reducer';
import { handOf, scoreOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

function fixture(deck: CardId[], coins: number): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.players.you.deck = [...deck];
  g.players.you.coins = coins;
  return g;
}

describe('高利貸', () => {
  it('使うとこのターン +5、次の自分の開始フェーズで −7 される', () => {
    let g = fixture(
      ['usurer', 'miner', 'banker', 'architect', 'herald', 'festival', 'guard', 'spy', 'taxman', 'blockader'],
      10,
    );
    g = reduce(g, { type: 'useCard', card: 'usurer' }, DEFAULT_BALANCE);
    expect(g.players.you.coins).toBe(10 + DEFAULT_BALANCE.usurerGain);
    expect(g.players.you.pendingDebt).toBe(DEFAULT_BALANCE.usurerDebt);

    g = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    const afterUse = 10 + DEFAULT_BALANCE.usurerGain;
    expect(g.players.you.coins).toBe(
      afterUse + DEFAULT_BALANCE.baseIncome - DEFAULT_BALANCE.usurerDebt,
    );
    expect(g.players.you.pendingDebt).toBe(0);
  });

  it('借りでコインがマイナスになり、マイナスの間はコスト 0 のカード以外使えない', () => {
    const deck: CardId[] = [
      'usurer',
      'miner',
      'banker',
      'architect',
      'herald',
      'festival',
      'guard',
      'spy',
      'taxman',
      'blockader',
    ];
    let g = fixture(deck, 0);
    g.players.you.pendingDebt = DEFAULT_BALANCE.usurerDebt;
    g = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);

    expect(g.players.you.coins).toBe(DEFAULT_BALANCE.baseIncome - DEFAULT_BALANCE.usurerDebt);
    expect(g.players.you.coins).toBeLessThan(0);

    expect(canUseCard(g, 'usurer', DEFAULT_BALANCE)).toBe(true);
    expect(canUseCard(g, 'miner', DEFAULT_BALANCE)).toBe(false);
    expect(canUseCard(g, 'banker', DEFAULT_BALANCE)).toBe(false);
    expect(canUseCard(g, 'architect', DEFAULT_BALANCE)).toBe(false);
  });
});

describe('祝祭', () => {
  const deck: CardId[] = [
    'festival',
    'herald',
    'miner',
    'banker',
    'architect',
    'guard',
    'usurer',
    'spy',
    'taxman',
    'blockader',
  ];

  it('次のターン、商館の収入が 2 倍になり、収入が +2 される', () => {
    let g = fixture(deck, 10);
    g.market.filter((s) => s.buildingId === 'tradingHouse').slice(0, 2).forEach((s) => (s.owner = 'you'));
    g = reduce(g, { type: 'useCard', card: 'festival' }, DEFAULT_BALANCE);
    g = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);

    expect(g.players.you.festivalActive).toBe(true);
    const spent = 10 - DEFAULT_BALANCE.cards.festival.cost;
    const houseIncome = 2 * DEFAULT_BALANCE.tradingHouseIncome * DEFAULT_BALANCE.festivalMultiplier;
    expect(g.players.you.coins).toBe(
      spent + DEFAULT_BALANCE.baseIncome + DEFAULT_BALANCE.festivalIncomeBonus + houseIncome,
    );
  });

  it('効果はその 1 ターンで消える', () => {
    let g = fixture(deck, 10);
    g = reduce(g, { type: 'useCard', card: 'festival' }, DEFAULT_BALANCE);
    g = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    expect(g.players.you.festivalActive).toBe(true);

    g = reduce(g, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(g.players.you.festivalActive).toBe(false);
  });

  it('祝祭中は街道が 2 回使える', () => {
    let g = fixture(deck, 10);
    g.market.find((s) => s.buildingId === 'road')!.owner = 'you';
    g = reduce(g, { type: 'useCard', card: 'festival' }, DEFAULT_BALANCE);
    g = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    expect(g.players.you.festivalActive).toBe(true);

    const [first, second] = handOf(g, 'you', DEFAULT_BALANCE);
    g = reduce(g, { type: 'useRoad', target: first! }, DEFAULT_BALANCE);
    expect(g.players.you.roadUsesThisTurn).toBe(1);
    expect(canUseRoad(g, second!, DEFAULT_BALANCE)).toBe(true);

    g = reduce(g, { type: 'useRoad', target: second! }, DEFAULT_BALANCE);
    expect(g.players.you.roadUsesThisTurn).toBe(2);
    const third = handOf(g, 'you', DEFAULT_BALANCE)[0]!;
    expect(canUseRoad(g, third, DEFAULT_BALANCE)).toBe(false);
  });
});

describe('衛兵', () => {
  it('張ると徴税官・買収者・封鎖者のどれも通らない。カードのコストは払われる', () => {
    let g = fixture(
      ['guard', 'miner', 'banker', 'architect', 'herald', 'festival', 'usurer', 'spy', 'taxman', 'blockader'],
      10,
    );
    g = reduce(g, { type: 'useCard', card: 'guard' }, DEFAULT_BALANCE);
    expect(g.players.you.guarded).toBe(true);

    // cpu の番にして、衛兵を張った you に妨害を撃たせる
    g.current = 'cpu';
    g.players.cpu.deck = [
      'taxman',
      'spy',
      'blockader',
      'miner',
      'banker',
      'architect',
      'herald',
      'festival',
      'usurer',
      'guard',
    ];
    g.players.cpu.coins = 20;
    const youCoinsBefore = g.players.you.coins;

    const afterTaxman = reduce(g, { type: 'useCard', card: 'taxman' }, DEFAULT_BALANCE);
    expect(afterTaxman.players.you.coins).toBe(youCoinsBefore);
    expect(afterTaxman.players.cpu.coins).toBe(20 - DEFAULT_BALANCE.cards.taxman.cost);

    const afterSpy = reduce(g, { type: 'useCard', card: 'spy' }, DEFAULT_BALANCE);
    expect(afterSpy.players.you.bindPending).toBe(false);
    expect(afterSpy.players.cpu.coins).toBe(20 - DEFAULT_BALANCE.cards.spy.cost);

    const emptySlot = g.market.find((s) => s.owner === null)!.slotId;
    const afterBlockader = reduce(
      g,
      { type: 'useCard', card: 'blockader', blockadeSlot: emptySlot },
      DEFAULT_BALANCE,
    );
    expect(afterBlockader.players.you.blockedSlot).toBeNull();
    expect(afterBlockader.players.cpu.coins).toBe(20 - DEFAULT_BALANCE.cards.blockader.cost);
  });
});

describe('買収者', () => {
  it('受けると次のターン手札の 1 枚が使えない。同じ seed なら同じカードが選ばれる', () => {
    function resolve(): GameState {
      let g = fixture(
        ['spy', 'miner', 'banker', 'architect', 'herald', 'festival', 'guard', 'usurer', 'taxman', 'blockader'],
        10,
      );
      g.seed = 777;
      g.turn = 5;
      g = reduce(g, { type: 'useCard', card: 'spy' }, DEFAULT_BALANCE);
      expect(g.players.cpu.bindPending).toBe(true);

      g.current = 'cpu';
      g.players.cpu.deck = [
        'miner',
        'banker',
        'architect',
        'herald',
        'festival',
        'guard',
        'usurer',
        'taxman',
        'blockader',
        'spy',
      ];
      g.players.cpu.coins = 10;
      return reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    }

    const a = resolve();
    const b = resolve();

    expect(a.players.cpu.bindPending).toBe(false);
    expect(a.players.cpu.boundCard).not.toBeNull();
    expect(handOf(a, 'cpu', DEFAULT_BALANCE)).toContain(a.players.cpu.boundCard);
    expect(canUseCard(a, a.players.cpu.boundCard!, DEFAULT_BALANCE)).toBe(false);
    // 同じ seed・同じターンなら、抽選結果は必ず同じになる
    expect(a.players.cpu.boundCard).toBe(b.players.cpu.boundCard);
  });
});

describe('効果を止められた物件', () => {
  it('収入は生まないが、VP は減らない', () => {
    const g = fixture(
      ['miner', 'banker', 'architect', 'herald', 'festival', 'guard', 'usurer', 'spy', 'taxman', 'blockader'],
      0,
    );
    const house = g.market.find((s) => s.buildingId === 'tradingHouse')!;
    house.owner = 'you';
    g.players.you.disabledSlot = house.slotId;

    const after = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    // 商館ぶんの収入が乗らない
    expect(after.players.you.coins).toBe(DEFAULT_BALANCE.baseIncome);
    // VP は封鎖者の影響を受けない
    expect(scoreOf(after, 'you', DEFAULT_BALANCE)).toBe(DEFAULT_BALANCE.buildings.tradingHouse.vp);
  });
});

describe('城塞', () => {
  const deck: CardId[] = [
    'architect',
    'miner',
    'banker',
    'herald',
    'festival',
    'guard',
    'usurer',
    'spy',
    'taxman',
    'blockader',
  ];

  it('相手が物件を建てると、城塞を持っている側にコインが入る。2 件持っていれば 2 倍', () => {
    const g = fixture(deck, 50);
    g.market.filter((s) => s.buildingId === 'fortress').forEach((s) => (s.owner = 'you'));
    g.current = 'cpu';
    g.players.cpu.coins = 50;
    const slot = g.market.find((s) => s.buildingId === 'tradingHouse')!.slotId;
    const before = g.players.you.coins;

    const after = reduce(g, { type: 'build', slotId: slot }, DEFAULT_BALANCE);
    expect(after.players.you.coins).toBe(before + 2 * DEFAULT_BALANCE.fortressToll);
  });

  it('城塞を持っている側が自分で建てても、自分にはコインが入らない', () => {
    const g = fixture(deck, 50);
    g.market.find((s) => s.buildingId === 'fortress')!.owner = 'you';
    const slot = g.market.find((s) => s.buildingId === 'tradingHouse')!.slotId;
    const before = g.players.you.coins;

    const after = reduce(g, { type: 'build', slotId: slot }, DEFAULT_BALANCE);
    expect(after.players.you.coins).toBe(before - DEFAULT_BALANCE.buildings.tradingHouse.cost);
  });
});
