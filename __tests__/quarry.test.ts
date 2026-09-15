import { describe, expect, it } from 'vitest';

import { reachOf } from '@/ai/evaluate';
import { DEFAULT_BALANCE } from '@/game/balance';
import { buildCostFor, reduce } from '@/game/reducer';
import { scoreOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

const ORDER: CardId[] = [
  'architect',
  'miner',
  'usurer',
  'banker',
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

const quarrySlot = (g: GameState) => g.market.find((s) => s.buildingId === 'quarry')!.slotId;
const houseSlots = (g: GameState) =>
  g.market.filter((s) => s.buildingId === 'tradingHouse').map((s) => s.slotId);

describe('建築家（強化後）', () => {
  it('建築家を使うとそのターンの建設費が 6 安くなる', () => {
    let g = fixture(50);
    g = reduce(g, { type: 'useCard', card: 'architect' }, DEFAULT_BALANCE);
    expect(g.players.you.buildDiscount).toBe(DEFAULT_BALANCE.architectDiscount);
    expect(DEFAULT_BALANCE.architectDiscount).toBe(6);

    const slot = houseSlots(g)[0]!;
    const before = g.players.you.coins;
    g = reduce(g, { type: 'build', slotId: slot }, DEFAULT_BALANCE);
    const discounted = DEFAULT_BALANCE.buildings.tradingHouse.cost - DEFAULT_BALANCE.architectDiscount;
    expect(g.players.you.coins).toBe(before - discounted);
  });
});

describe('石切場', () => {
  it('持っていても、建築家を使っていないターンは 2 件目以降も安くならない', () => {
    let g = fixture(50);
    g.market.find((s) => s.buildingId === 'quarry')!.owner = 'you';

    const [first, second] = houseSlots(g);
    g = reduce(g, { type: 'build', slotId: first! }, DEFAULT_BALANCE);
    const costOfSecond = buildCostFor(g, 'you', second!, DEFAULT_BALANCE);
    expect(costOfSecond).toBe(DEFAULT_BALANCE.buildings.tradingHouse.cost);
  });

  it('建築家を使ったターン、持っていると 2 件目以降がさらに 4 安くなる', () => {
    let g = fixture(50);
    g.market.find((s) => s.buildingId === 'quarry')!.owner = 'you';
    g = reduce(g, { type: 'useCard', card: 'architect' }, DEFAULT_BALANCE);

    const [first, second] = houseSlots(g);
    g = reduce(g, { type: 'build', slotId: first! }, DEFAULT_BALANCE);
    const costOfSecond = buildCostFor(g, 'you', second!, DEFAULT_BALANCE);
    const expected = Math.max(
      0,
      DEFAULT_BALANCE.buildings.tradingHouse.cost -
        DEFAULT_BALANCE.architectDiscount -
        DEFAULT_BALANCE.quarryExtraDiscount,
    );
    expect(costOfSecond).toBe(expected);
    // 商館より高い区画（城壁）で、割引が両方乗って実際に安くなっていることも確かめる
    const wallSlot = g.market.find((s) => s.buildingId === 'wall' && s.owner === null)!.slotId;
    const wallCost = buildCostFor(g, 'you', wallSlot, DEFAULT_BALANCE);
    const expectedWall =
      DEFAULT_BALANCE.buildings.wall.cost -
      DEFAULT_BALANCE.architectDiscount -
      DEFAULT_BALANCE.quarryExtraDiscount;
    expect(wallCost).toBe(expectedWall);
  });

  it('1 件目は石切場の割引を受けない', () => {
    let g = fixture(50);
    g.market.find((s) => s.buildingId === 'quarry')!.owner = 'you';
    g = reduce(g, { type: 'useCard', card: 'architect' }, DEFAULT_BALANCE);

    const [first] = houseSlots(g);
    const costOfFirst = buildCostFor(g, 'you', first!, DEFAULT_BALANCE);
    const expected = DEFAULT_BALANCE.buildings.tradingHouse.cost - DEFAULT_BALANCE.architectDiscount;
    expect(costOfFirst).toBe(expected);
  });

  it('効果を止められた石切場は割引を出さないが、VP は減らない', () => {
    const g = fixture(50);
    const qSlot = quarrySlot(g);
    g.market[qSlot]!.owner = 'you';
    g.players.you.disabledSlot = qSlot;
    // 「建築家を使い、すでに 1 件建てたあと」の状態を直接作って 2 件目のコストだけを見る
    g.players.you.buildDiscount = DEFAULT_BALANCE.architectDiscount;
    g.players.you.buildsThisTurn = 1;

    const [house] = houseSlots(g);
    const costOfSecond = buildCostFor(g, 'you', house!, DEFAULT_BALANCE);
    const expectedWithoutQuarry =
      DEFAULT_BALANCE.buildings.tradingHouse.cost - DEFAULT_BALANCE.architectDiscount;
    expect(costOfSecond).toBe(expectedWithoutQuarry);

    // VP は封鎖者の影響を受けない（石切場の VP はそのまま乗る）
    expect(scoreOf(g, 'you', DEFAULT_BALANCE)).toBe(DEFAULT_BALANCE.buildings.quarry.vp);
  });

  it('buildsThisTurn がターンをまたいで 0 に戻る', () => {
    let g = fixture(50);
    const [first] = houseSlots(g);
    g = reduce(g, { type: 'build', slotId: first! }, DEFAULT_BALANCE);
    expect(g.players.you.buildsThisTurn).toBe(1);

    g = reduce(g, { type: 'endTurn' }, DEFAULT_BALANCE);
    g = reduce(g, { type: 'endTurn' }, DEFAULT_BALANCE); // cpu のターンも終えて you に戻す
    expect(g.current).toBe('you');
    g = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    expect(g.players.you.buildsThisTurn).toBe(0);
  });
});

describe('reach（まとめ買い）', () => {
  it('まとめ買いできるときに合計 VP を返し、建築家あり・なしで値が変わる', () => {
    // 全部は買えないが、建築家の割引があれば買える件数が増える額を選ぶ
    const withoutArchitect = fixture(100);
    const withArchitect = reduce(
      fixture(100),
      { type: 'useCard', card: 'architect' },
      DEFAULT_BALANCE,
    );

    const reachWithout = reachOf(withoutArchitect, 'you', DEFAULT_BALANCE);
    const reachWith = reachOf(withArchitect, 'you', DEFAULT_BALANCE);

    // 貪欲に VP 降順で買った合計と一致することを手計算で確かめる
    const affordableSum = (state: GameState) => {
      const p = state.players.you;
      const sorted = [...state.market]
        .filter((s) => s.owner === null)
        .map((s) => DEFAULT_BALANCE.buildings[s.buildingId])
        .sort((a, b) => b.vp - a.vp);
      let coins = p.coins;
      let vp = 0;
      for (const b of sorted) {
        const cost = Math.max(0, b.cost - p.buildDiscount);
        if (coins < cost) continue;
        coins -= cost;
        vp += b.vp;
      }
      return vp;
    };

    expect(reachWithout).toBe(affordableSum(withoutArchitect));
    expect(reachWith).toBe(affordableSum(withArchitect));
    expect(reachWith).not.toBe(reachWithout);
  });

  it('コインが足りない区画があっても止めず、より安い区画を買う', () => {
    const g = fixture(0);
    // 最安の商館ぴったりのコインにする
    g.players.you.coins = DEFAULT_BALANCE.buildings.tradingHouse.cost;
    const reach = reachOf(g, 'you', DEFAULT_BALANCE);
    expect(reach).toBe(DEFAULT_BALANCE.buildings.tradingHouse.vp);
  });
});
