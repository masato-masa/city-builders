import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { canAcquire, canUseCard, canUseRoad, cardCostFor, reduce } from '@/game/reducer';
import { districtOfSlot, handOf, scoreOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

function fixture(deck: CardId[], coins: number): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.players.you.hand = deck.slice(0, 4);
  g.players.you.queue = deck.slice(4);
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
    const houseIncome = 2 * DEFAULT_BALANCE.buildings.tradingHouse.income * DEFAULT_BALANCE.festivalMultiplier;
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
  it('張ると徴税官・封鎖者・物件の買収のどれも通らない。カードのコストは払われる', () => {
    let g = fixture(
      ['guard', 'miner', 'banker', 'architect', 'herald', 'festival', 'usurer', 'spy', 'taxman', 'blockader'],
      10,
    );
    g = reduce(g, { type: 'useCard', card: 'guard' }, DEFAULT_BALANCE);
    expect(g.players.you.guarded).toBe(true);

    // cpu の番にして、衛兵を張った you に妨害を撃たせる
    g.current = 'cpu';
    g.players.cpu.hand = ['taxman', 'spy', 'blockader', 'miner'];
    g.players.cpu.queue = ['banker', 'architect', 'herald', 'festival', 'usurer', 'guard'];
    g.players.cpu.coins = 20;
    const youCoinsBefore = g.players.you.coins;

    const afterTaxman = reduce(g, { type: 'useCard', card: 'taxman' }, DEFAULT_BALANCE);
    expect(afterTaxman.players.you.coins).toBe(youCoinsBefore);
    expect(afterTaxman.players.cpu.coins).toBe(20 - DEFAULT_BALANCE.cards.taxman.cost);

    // 買収者で割引を得ても、衛兵を張った相手の物件は買えない
    const yourSlot = g.market.find((s) => s.owner === null)!;
    yourSlot.owner = 'you';
    const afterSpy = reduce(g, { type: 'useCard', card: 'spy' }, DEFAULT_BALANCE);
    expect(afterSpy.players.cpu.acquireDiscount).toBe(DEFAULT_BALANCE.spyAcquireDiscount);
    expect(canAcquire(afterSpy, yourSlot.slotId, DEFAULT_BALANCE)).toBe(false);
    yourSlot.owner = null;

    const afterBlockader = reduce(g, { type: 'useCard', card: 'blockader', district: 0 }, DEFAULT_BALANCE);
    expect(afterBlockader.blockades).toEqual([]);
    expect(afterBlockader.players.cpu.coins).toBe(20 - DEFAULT_BALANCE.cards.blockader.cost);
  });
});

describe('買収者', () => {
  // 買収者の割引そのものを測るので、物件の数の差による上乗せの増減は切る
  const B = { ...DEFAULT_BALANCE };
  /** you の手番。cpu が商館を持っていて、you は割引なしでは 1 コイン足りない */
  function setup(): { g: GameState; slot: number; price: number } {
    const g = fixture(
      ['spy', 'miner', 'banker', 'architect', 'herald', 'festival', 'guard', 'usurer', 'taxman', 'blockader'],
      0,
    );
    const house = g.market.find((s) => s.buildingId === 'tradingHouse')!;
    house.owner = 'cpu';
    const price = house.paid + B.acquireMarkup;
    g.players.you.coins = B.cards.spy.cost + price - B.spyAcquireDiscount;
    return { g, slot: house.slotId, price };
  }

  it('使ったターンは買収価格が下がり、相手に渡る代金と次の基準（paid）も下がる', () => {
    const { g, slot, price } = setup();
    expect(canAcquire(g, slot, B)).toBe(false);
    const afterSpy = reduce(g, { type: 'useCard', card: 'spy' }, B);
    expect(afterSpy.players.you.acquireDiscount).toBe(B.spyAcquireDiscount);
    expect(canAcquire(afterSpy, slot, B)).toBe(true);
    const cpuBefore = afterSpy.players.cpu.coins;
    const after = reduce(afterSpy, { type: 'acquire', slotId: slot }, B);
    const paid = price - B.spyAcquireDiscount;
    expect(after.market[slot]!.owner).toBe('you');
    expect(after.market[slot]!.paid).toBe(paid);
    expect(after.players.you.coins).toBe(0);
    expect(after.players.cpu.coins).toBe(cpuBefore + paid);
  });

  it('割引はそのターンだけ。ターンを終えると消える', () => {
    const { g } = setup();
    const afterSpy = reduce(g, { type: 'useCard', card: 'spy' }, B);
    const ended = reduce(afterSpy, { type: 'endTurn' }, B);
    expect(ended.players.you.acquireDiscount).toBe(0);
  });

  it('価格は 0 より下がらない', () => {
    const { g, slot } = setup();
    const big = { ...B, spyAcquireDiscount: 100 };
    const afterSpy = reduce(g, { type: 'useCard', card: 'spy' }, big);
    const coins = afterSpy.players.you.coins;
    const after = reduce(afterSpy, { type: 'acquire', slotId: slot }, big);
    expect(after.market[slot]!.owner).toBe('you');
    expect(after.players.you.coins).toBe(coins);
  });
});

describe('物件との連携', () => {
  it('城壁があると衛兵のコストが下がる。封鎖者で城壁を止められると元に戻る', () => {
    // 守る物件 1 件ごとの上乗せは切る（上乗せは snowball.test.ts で測る）
    const GB = { ...DEFAULT_BALANCE };
    const g = fixture(
      ['guard', 'miner', 'banker', 'architect', 'herald', 'festival', 'usurer', 'spy', 'taxman', 'blockader'],
      0,
    );
    expect(cardCostFor(g, 'you', 'guard', GB)).toBe(GB.cards.guard.cost);
    const wall = g.market.find((s) => s.buildingId === 'wall')!;
    wall.owner = 'you';
    expect(cardCostFor(g, 'you', 'guard', GB)).toBe(GB.guardCostWithWall);
    expect(canUseCard(g, 'guard', GB)).toBe(GB.guardCostWithWall <= 0);
    g.blockades = [{ district: districtOfSlot(wall.slotId), target: 'you', untilTurn: g.turn, beforeIncome: false }];
    expect(cardCostFor(g, 'you', 'guard', GB)).toBe(GB.cards.guard.cost);
  });

  it('街道があると伝令のコストが下がる', () => {
    const g = fixture(
      ['herald', 'miner', 'banker', 'architect', 'guard', 'festival', 'usurer', 'spy', 'taxman', 'blockader'],
      0,
    );
    expect(cardCostFor(g, 'you', 'herald', DEFAULT_BALANCE)).toBe(DEFAULT_BALANCE.cards.herald.cost);
    g.market.find((s) => s.buildingId === 'road')!.owner = 'you';
    expect(cardCostFor(g, 'you', 'herald', DEFAULT_BALANCE)).toBe(DEFAULT_BALANCE.heraldCostWithRoad);
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
    g.blockades = [{ district: districtOfSlot(house.slotId), target: 'you', untilTurn: g.turn, beforeIncome: true }];

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

  it('相手が物件を建てても、城塞を持っている側にコインは入らない（通行料は廃止）', () => {
    const g = fixture(deck, 50);
    g.market.filter((s) => s.buildingId === 'fortress').forEach((s) => (s.owner = 'you'));
    g.current = 'cpu';
    g.players.cpu.coins = 50;
    const slot = g.market.find((s) => s.buildingId === 'tradingHouse')!.slotId;
    const before = g.players.you.coins;

    const after = reduce(g, { type: 'build', slotId: slot }, DEFAULT_BALANCE);
    expect(after.players.you.coins).toBe(before);
  });

  it('市場の城塞は 1 つ（もう 1 つは鉱山）', () => {
    expect(DEFAULT_BALANCE.market.filter((b) => b === 'fortress')).toHaveLength(1);
    expect(DEFAULT_BALANCE.market.filter((b) => b === 'mine')).toHaveLength(1);
  });
});
