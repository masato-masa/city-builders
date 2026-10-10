import { describe, expect, it } from 'vitest';

import { exposedVpOf, reachOf } from '@/ai/evaluate';
import { buildingTextFor, DEFAULT_BALANCE } from '@/game/balance';
import { canAcquire, canUpgrade, canUseRoad, cardCostFor, incomeStages, legalActions, reduce } from '@/game/reducer';
import { acquirePriceOf, incomePerTurnOf, roadUsesRemaining, scoreOf, vpOfSlot } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { BuildingId, GameState, PlayerId } from '@/game/types';

const B = DEFAULT_BALANCE;
/** 仕様書の例（10 → 11 → 12、20 → 21）を確かめるための、買収の上乗せが 1 の balance */
const B1 = { ...DEFAULT_BALANCE, acquireMarkup: 1 };

/** you の手番から始まる局面。手札・待機列は createGame のまま。 */
function fixture(youCoins: number, cpuCoins: number): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.turn = 3;
  g.players.you.coins = youCoins;
  g.players.cpu.coins = cpuCoins;
  return g;
}

const slotOf = (g: GameState, id: BuildingId) => g.market.find((s) => s.buildingId === id)!.slotId;

/** 手番を相手に渡す（startTurn の収入を挟まず、コインをそのまま比べられるようにする）。 */
function pass(g: GameState): GameState {
  return reduce(g, { type: 'endTurn' }, B);
}

const totalCoins = (g: GameState) => g.players.you.coins + g.players.cpu.coins;

describe('アップグレード', () => {
  it('建設費と同額を払って Lv2 になり、VP が Lv2 の値になる。払った合計に足される', () => {
    let g = fixture(50, 0);
    const wall = slotOf(g, 'wall');
    g = reduce(g, { type: 'build', slotId: wall }, B);
    expect(g.market[wall]!.paid).toBe(B.buildings.wall.cost);
    expect(g.market[wall]!.level).toBe(1);
    g = pass(pass(g));
    const before = g.players.you.coins;
    g = reduce(g, { type: 'upgrade', slotId: wall }, B);
    expect(g.players.you.coins).toBe(before - B.upgrades.wall.cost);
    expect(g.market[wall]!.level).toBe(2);
    expect(g.market[wall]!.paid).toBe(B.buildings.wall.cost + B.upgrades.wall.cost);
    expect(scoreOf(g, 'you')).toBe(B.upgrades.wall.vp + B.districtTitleVp);
  });

  it('Lv2 より上には上げられない。相手の物件・未建設は上げられない', () => {
    const g = fixture(100, 0);
    const wall = slotOf(g, 'wall');
    g.market[wall]!.owner = 'you';
    g.market[wall]!.level = 2;
    expect(canUpgrade(g, wall, B)).toBe(false);
    g.market[wall]!.owner = 'cpu';
    g.market[wall]!.level = 1;
    expect(canUpgrade(g, wall, B)).toBe(false);
    expect(canUpgrade(g, slotOf(g, 'fortress'), B)).toBe(false);
  });

  it('コインが足りなければ上げられない', () => {
    const g = fixture(B.upgrades.wall.cost - 1, 0);
    const wall = slotOf(g, 'wall');
    g.market[wall]!.owner = 'you';
    expect(canUpgrade(g, wall, B)).toBe(false);
  });
});

describe('買収', () => {
  // 仕様書の例（+1）どおりに動くかを、上乗せ 1 の balance で確かめる。既定の上乗せは実測で決めた値
  it('価格は払われた合計 + 1。10 → 11 → 12 と上がり、代金は元の持ち主に入る', () => {
    let g = fixture(10, 0);
    const wall = slotOf(g, 'wall');
    expect(B.buildings.wall.cost).toBe(10);
    g = reduce(g, { type: 'build', slotId: wall }, B1);
    g = pass(g);

    // cpu が 11 で買う
    g.players.cpu.coins = 30;
    expect(acquirePriceOf(g.market[wall]!, B1)).toBe(11);
    let coins = totalCoins(g);
    g = reduce(g, { type: 'acquire', slotId: wall }, B1);
    expect(g.market[wall]!.owner).toBe('cpu');
    expect(g.market[wall]!.paid).toBe(11);
    expect(g.players.cpu.coins).toBe(30 - 11);
    expect(g.players.you.coins).toBe(11);
    expect(totalCoins(g)).toBe(coins);
    // 買収で地区の称号も一緒に移る
    expect(scoreOf(g, 'cpu')).toBe(B.buildings.wall.vp + B.districtTitleVp);
    expect(scoreOf(g, 'you')).toBe(0);
    g = pass(g);

    // you が 12 で買い戻す
    g.players.you.coins = 12;
    coins = totalCoins(g);
    g = reduce(g, { type: 'acquire', slotId: wall }, B1);
    expect(g.market[wall]!.owner).toBe('you');
    expect(g.market[wall]!.paid).toBe(12);
    expect(g.players.you.coins).toBe(0);
    expect(g.players.cpu.coins).toBe(30 - 11 + 12);
    expect(totalCoins(g)).toBe(coins);
  });

  it('10 で建てて 10 でアップグレードした物件は 21 で買収され、Lv は保たれる', () => {
    let g = fixture(20, 0);
    const wall = slotOf(g, 'wall');
    g = reduce(g, { type: 'build', slotId: wall }, B1);
    g = pass(pass(g));
    g = reduce(g, { type: 'upgrade', slotId: wall }, B1);
    g = pass(g);
    expect(acquirePriceOf(g.market[wall]!, B1)).toBe(21);
    g.players.cpu.coins = 20;
    expect(canAcquire(g, wall, B1)).toBe(false);
    g.players.cpu.coins = 21;
    g = reduce(g, { type: 'acquire', slotId: wall }, B1);
    expect(g.market[wall]!.owner).toBe('cpu');
    expect(g.market[wall]!.level).toBe(2);
    expect(g.market[wall]!.paid).toBe(21);
    expect(g.players.you.coins).toBe(21);
    expect(scoreOf(g, 'cpu')).toBe(B.upgrades.wall.vp + B.districtTitleVp);
  });

  it('安く建てた物件は安く買われる（払った実額が基準）', () => {
    let g = fixture(50, 0);
    g.players.you.hand = ['architect', 'miner', 'banker', 'usurer'];
    g = reduce(g, { type: 'useCard', card: 'architect' }, B);
    const wall = slotOf(g, 'wall');
    g = reduce(g, { type: 'build', slotId: wall }, B);
    expect(g.market[wall]!.paid).toBe(B.buildings.wall.cost - B.architectDiscount);
    expect(acquirePriceOf(g.market[wall]!, B)).toBe(B.buildings.wall.cost - B.architectDiscount + B.acquireMarkup);
  });

  it('自分の物件・未建設の区画は買収できない', () => {
    const g = fixture(100, 0);
    const wall = slotOf(g, 'wall');
    expect(canAcquire(g, wall, B)).toBe(false);
    g.market[wall]!.owner = 'you';
    g.market[wall]!.paid = 10;
    expect(canAcquire(g, wall, B)).toBe(false);
  });

  it('衛兵で守られている相手の物件は買収できない。城壁は買収を防がない', () => {
    const g = fixture(100, 0);
    const wall = slotOf(g, 'wall');
    g.market[wall]!.owner = 'cpu';
    g.market[wall]!.paid = 10;
    expect(canAcquire(g, wall, B)).toBe(true); // 城壁そのものも、城壁の持ち主の物件も買える
    g.players.cpu.guarded = true;
    expect(canAcquire(g, wall, B)).toBe(false);
    expect(legalActions(g, B).some((a) => a.type === 'acquire')).toBe(false);
  });

  it('衛兵は相手の次の手番まで効き、自分の手番の開始で切れる', () => {
    let g = fixture(0, 0);
    g.players.you.hand = ['guard', 'miner', 'banker', 'usurer'];
    g.players.you.coins = B.cards.guard.cost;
    const wall = slotOf(g, 'wall');
    g.market[wall]!.owner = 'you';
    g.market[wall]!.paid = 10;
    g = reduce(g, { type: 'useCard', card: 'guard' }, B);
    g = pass(g);
    g = reduce(g, { type: 'startTurn' }, B);
    g.players.cpu.coins = 100;
    expect(canAcquire(g, wall, B)).toBe(false);
    g = pass(g);
    g = reduce(g, { type: 'startTurn' }, B); // you の開始で衛兵が切れる
    g = pass(g);
    g.players.cpu.coins = 100;
    expect(canAcquire(g, wall, B)).toBe(true);
  });

  it('封鎖者で効果を止められた物件も買える。買った側では効果が生きる', () => {
    const g = fixture(100, 0);
    const house = slotOf(g, 'tradingHouse');
    g.market[house]!.owner = 'cpu';
    g.market[house]!.paid = 7;
    g.players.cpu.disabledSlot = house;
    expect(canAcquire(g, house, B)).toBe(true);
    const after = reduce(g, { type: 'acquire', slotId: house }, B);
    expect(after.market[house]!.owner).toBe('you');
    expect(incomePerTurnOf(after, 'you', B)).toBe(B.baseIncome + B.tradingHouseIncome);
  });

  it('買収は城塞の通行料を払わない（建設ではない）', () => {
    const g = fixture(100, 0);
    const [f1] = g.market.filter((s) => s.buildingId === 'fortress');
    f1!.owner = 'cpu';
    const house = slotOf(g, 'tradingHouse');
    g.market[house]!.owner = 'cpu';
    g.market[house]!.paid = 7;
    const after = reduce(g, { type: 'acquire', slotId: house }, B);
    expect(after.players.cpu.coins).toBe(7 + B.acquireMarkup);
  });
});

describe('同じ区画は 1 ターンに 1 回まで', () => {
  it('建てたターンにアップグレードできない。次の自分の手番ならできる', () => {
    let g = fixture(100, 0);
    const wall = slotOf(g, 'wall');
    g = reduce(g, { type: 'build', slotId: wall }, B);
    expect(canUpgrade(g, wall, B)).toBe(false);
    expect(legalActions(g, B)).not.toContainEqual({ type: 'upgrade', slotId: wall });
    expect(reduce(g, { type: 'upgrade', slotId: wall }, B)).toBe(g);
    g = pass(pass(g));
    expect(canUpgrade(g, wall, B)).toBe(true);
  });

  it('買収したターンにアップグレードできない', () => {
    let g = fixture(100, 0);
    const wall = slotOf(g, 'wall');
    g.market[wall]!.owner = 'cpu';
    g.market[wall]!.paid = 10;
    g = reduce(g, { type: 'acquire', slotId: wall }, B);
    expect(canUpgrade(g, wall, B)).toBe(false);
  });

  it('相手が建てた直後の自分の手番では買収できる（ターンが違う）', () => {
    let g = fixture(10, 50);
    const wall = slotOf(g, 'wall');
    g = reduce(g, { type: 'build', slotId: wall }, B);
    g = pass(g);
    expect(B.slotLockTurns).toBe(1);
    expect(canAcquire(g, wall, B)).toBe(true);
  });

  it('slotLockTurns を 2 にすると、相手の直後の手番でも動かせない（数値で振れる口）', () => {
    const lock2 = { ...B, slotLockTurns: 2 };
    let g = fixture(10, 50);
    const wall = slotOf(g, 'wall');
    g = reduce(g, { type: 'build', slotId: wall }, lock2);
    g = pass(g);
    expect(canAcquire(g, wall, lock2)).toBe(false);
    g = pass(pass(g));
    expect(canAcquire(g, wall, lock2)).toBe(true);
  });
});

describe('Lv2 の効果', () => {
  function owned(id: BuildingId, owner: PlayerId, level: number): GameState {
    const g = fixture(0, 0);
    const s = g.market.find((x) => x.buildingId === id)!;
    s.owner = owner;
    s.level = level;
    s.paid = 10;
    return g;
  }

  it('商館: 毎ターンの収入が Lv2 の値になる', () => {
    const g = owned('tradingHouse', 'you', 2);
    const stage = incomeStages(g, B).find((s) => s.kind === 'building')!;
    expect(stage.amount).toBe(B.level2.tradingHouseIncome);
  });

  it('工場: 最初のカードの割引が Lv2 の値になる', () => {
    const g = owned('factory', 'you', 2);
    expect(cardCostFor(g, 'you', 'banker', B)).toBe(B.cards.banker.cost - B.level2.factoryDiscount);
  });

  it('城塞: 相手が建てたときの通行料が Lv2 の値になる', () => {
    const g = owned('fortress', 'cpu', 2);
    g.players.you.coins = 50;
    const after = reduce(g, { type: 'build', slotId: slotOf(g, 'tradingHouse') }, B);
    expect(after.players.cpu.coins).toBe(B.level2.fortressToll);
  });

  it('大聖堂: 他の物件 1 件あたりの VP が Lv2 の値になる', () => {
    const g = owned('cathedral', 'you', 2);
    g.market.find((x) => x.buildingId === 'wall')!.owner = 'you';
    const cathedral = g.market.find((x) => x.buildingId === 'cathedral')!;
    expect(vpOfSlot(g, cathedral, B)).toBe(B.level2.cathedralVpPerBuilding);
  });

  it('街道: 1 ターンに送れる回数が Lv2 の値になる', () => {
    const g = owned('road', 'you', 2);
    expect(roadUsesRemaining(g, 'you', B)).toBe(B.level2.roadUses);
    g.players.you.roadUsesThisTurn = 1;
    expect(canUseRoad(g, g.players.you.hand[0]!, B)).toBe(B.level2.roadUses > 1);
  });

  it('取引所: 投資の上乗せが Lv2 の値になる', () => {
    const g = owned('exchange', 'you', 2);
    g.players.you.pendingIncome = ['miner'];
    const stage = incomeStages(g, B).find((s) => s.kind === 'invest')!;
    expect(stage.amount).toBe(B.minerIncome + B.level2.exchangeBonus);
  });

  it('説明文はレベルの値で書かれる', () => {
    expect(buildingTextFor('tradingHouse', B, 2)).toContain(`+${B.level2.tradingHouseIncome}`);
    expect(buildingTextFor('tradingHouse', B)).toContain(`+${B.tradingHouseIncome}`);
  });
});

describe('CPU の評価が新しい行動を見る', () => {
  it('reach は相手の物件の買収も数える。相手が衛兵なら数えない', () => {
    const g = fixture(10 + B.acquireMarkup, 0);
    const wall = slotOf(g, 'wall');
    // 空き地は全部埋めて、買収だけが候補になるようにする
    for (const s of g.market) {
      s.owner = 'cpu';
      s.paid = 100;
    }
    g.market[wall]!.paid = 10;
    expect(reachOf(g, 'you', B)).toBe(B.buildings.wall.vp);
    g.players.cpu.guarded = true;
    expect(reachOf(g, 'you', B)).toBe(0);
  });

  it('アップグレードで買収価格が上がると、相手に奪われうる VP（exposed）が減る', () => {
    const g = fixture(0, 15);
    const wall = slotOf(g, 'wall');
    g.market[wall]!.owner = 'you';
    g.market[wall]!.paid = 10;
    expect(exposedVpOf(g, 'you', B)).toBe(B.buildings.wall.vp);
    g.market[wall]!.level = 2;
    g.market[wall]!.paid = 20;
    expect(exposedVpOf(g, 'you', B)).toBe(0);
  });
});
