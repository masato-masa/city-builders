import { describe, expect, it } from 'vitest';

import { exposedVpOf, reachOf } from '@/ai/evaluate';
import { buildingTextFor, DEFAULT_BALANCE } from '@/game/balance';
import { canAcquire, canUpgrade, canUseRoad, cardCostFor, incomeStages, legalActions, reduce } from '@/game/reducer';
import {
  acquireBlockOf,
  acquireCostFor,
  acquirePriceOf,
  districtOfSlot,
  incomePerTurnOf,
  roadUsesRemaining,
  scoreOf,
  slotEffectStopped,
  vpOfSlot,
} from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { BuildingId, GameState, PlayerId } from '@/game/types';

// 買収の価格の基本（払われた額 + 上乗せ）を測るので、物件の数の差による増減は切る（別のテストで測る）
// 仕様書の例（城壁 10 で建てて 10 で上げる）に合わせ、城壁の建設費は 10 に固定する（既定値の調整で例が崩れないように）
const B = {
  ...DEFAULT_BALANCE,
  acquireLeadRate: 0,
  buildings: { ...DEFAULT_BALANCE.buildings, wall: { ...DEFAULT_BALANCE.buildings.wall, cost: 10 } },
  upgrades: { ...DEFAULT_BALANCE.upgrades, wall: { ...DEFAULT_BALANCE.upgrades.wall, cost: 10 } },
};
/** 仕様書の例（10 → 11 → 12、20 → 21）を確かめるための、買収の上乗せが 1 の balance */
const B1 = { ...B, acquireMarkup: 1 };

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

  it('最終段階（maxLevel）より上には上げられない。相手の物件・未建設は上げられない', () => {
    const g = fixture(100, 0);
    const wall = slotOf(g, 'wall');
    g.market[wall]!.owner = 'you';
    g.market[wall]!.level = B.maxLevel;
    expect(canUpgrade(g, wall, B)).toBe(false);
    g.market[wall]!.owner = 'cpu';
    g.market[wall]!.level = 1;
    expect(canUpgrade(g, wall, B)).toBe(false);
    expect(canUpgrade(g, slotOf(g, 'fortress'), B)).toBe(false);
  });

  it('Lv2 から Lv3 へは upgrades3 の額を払い、VP と効果が Lv3 の値になる', () => {
    let g = fixture(100, 0);
    const house = slotOf(g, 'tradingHouse');
    g = reduce(g, { type: 'build', slotId: house }, B);
    g = pass(pass(g));
    g = reduce(g, { type: 'upgrade', slotId: house }, B);
    expect(g.market[house]!.level).toBe(2);
    // 同じ手番に 2 段は上げられない
    expect(canUpgrade(g, house, B)).toBe(false);
    g = pass(pass(g));
    const before = g.players.you.coins;
    g = reduce(g, { type: 'upgrade', slotId: house }, B);
    expect(g.market[house]!.level).toBe(3);
    expect(g.players.you.coins).toBe(before - B.upgrades3.tradingHouse.cost);
    expect(g.market[house]!.paid).toBe(
      B.buildings.tradingHouse.cost + B.upgrades.tradingHouse.cost + B.upgrades3.tradingHouse.cost,
    );
    expect(vpOfSlot(g, g.market[house]!, B)).toBe(B.upgrades3.tradingHouse.vp);
    expect(incomePerTurnOf(g, 'you', B)).toBe(B.baseIncome + B.upgrades3.tradingHouse.income);
    expect(buildingTextFor('tradingHouse', B, 3)).toContain(`+${B.upgrades3.tradingHouse.income}`);
    expect(canUpgrade(pass(pass(g)), house, B)).toBe(false);
  });

  it('コインが足りなければ上げられない', () => {
    const g = fixture(B.upgrades.wall.cost - 1, 0);
    const wall = slotOf(g, 'wall');
    g.market[wall]!.owner = 'you';
    expect(canUpgrade(g, wall, B)).toBe(false);
  });
});

describe('買収', () => {
  it('最終段階（Lv3）の物件は買収できない。理由は acquireBlockOf が maxLevel と返す', () => {
    const g = fixture(0, 200);
    const wall = slotOf(g, 'wall');
    g.market[wall]!.owner = 'you';
    g.market[wall]!.paid = 10;
    g.current = 'cpu';
    g.market[wall]!.level = B.maxLevel - 1;
    expect(canAcquire(g, wall, B)).toBe(true);
    expect(acquireBlockOf(g, wall, 'cpu', B)).toBeNull();
    g.market[wall]!.level = B.maxLevel;
    expect(canAcquire(g, wall, B)).toBe(false);
    expect(acquireBlockOf(g, wall, 'cpu', B)).toBe('maxLevel');
    expect(legalActions(g, B).some((a) => a.type === 'acquire' && a.slotId === wall)).toBe(false);
    // 衛兵が先に言われる（衛兵が切れても最終段階なので買えない）
    g.players.you.guarded = true;
    expect(acquireBlockOf(g, wall, 'cpu', B)).toBe('guarded');
    // CPU の見積もりも揃う: 晒されている VP にも、相手の reach にも入らない
    g.players.you.guarded = false;
    expect(exposedVpOf(g, 'you', B)).toBe(0);
    const lower = structuredClone(g);
    lower.market[wall]!.level = B.maxLevel - 1;
    expect(exposedVpOf(lower, 'you', B)).toBeGreaterThan(0);
    expect(reachOf(lower, 'cpu', B)).toBeGreaterThan(reachOf(g, 'cpu', B));
  });

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
    const wall = slotOf(g, 'wall');
    g.market[wall]!.owner = 'you';
    g.market[wall]!.paid = 10;
    g.players.you.coins = cardCostFor(g, 'you', 'guard', B);
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
    g.blockades = [{ district: districtOfSlot(house, B), target: 'cpu', untilTurn: g.turn, beforeIncome: false }];
    expect(slotEffectStopped(g, g.market[house]!, B)).toBe(true);
    expect(canAcquire(g, house, B)).toBe(true);
    const after = reduce(g, { type: 'acquire', slotId: house }, B);
    expect(after.market[house]!.owner).toBe('you');
    expect(slotEffectStopped(after, after.market[house]!, B)).toBe(false);
  });

  it('買収の代金は元の持ち主に入るだけ（城塞の通行料は廃止）', () => {
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

describe('買収の上乗せは物件の数の差で動く（多く持つ側ほど高く買う）', () => {
  const L = { ...B, acquireLeadRate: 2 };
  it('買う側が 2 件多いと +4、2 件少ないと −4（上乗せは 0 未満にしない）', () => {
    const g = fixture(100, 0);
    const [a, b, c, d] = g.market;
    a!.owner = 'cpu';
    a!.paid = 10;
    b!.owner = 'you';
    c!.owner = 'you';
    d!.owner = 'you';
    // you は 3 件、cpu は 1 件。you が cpu の物件を買う: 上乗せ 4 + 2 × 2
    expect(acquireCostFor(g, 'you', a!, L)).toBe(10 + 4 + 4);
    // cpu が you の物件を買う: 上乗せ 4 − 2 × 2 = 0
    b!.paid = 8;
    expect(acquireCostFor(g, 'cpu', b!, L)).toBe(8);
    // 差がもっと開いても、上乗せは 0 で止まる（払われた額より安くはならない）
    g.market[4]!.owner = 'you';
    g.market[5]!.owner = 'you';
    expect(acquireCostFor(g, 'cpu', b!, L)).toBe(8);
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
    expect(stage.amount).toBe(B.upgrades.tradingHouse.income);
  });

  it('工場: 最初のカードの割引が Lv2 の値になる', () => {
    const g = owned('factory', 'you', 2);
    expect(cardCostFor(g, 'you', 'banker', B)).toBe(B.cards.banker.cost - B.level2.factoryDiscount);
  });

  it('鉱山: 採掘師のコストの割引が Lv2 の値になる', () => {
    const g = owned('mine', 'you', 2);
    expect(cardCostFor(g, 'you', 'miner', B)).toBe(Math.max(0, B.cards.miner.cost - B.level2.mineMinerDiscount));
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
    expect(buildingTextFor('tradingHouse', B, 2)).toContain(`+${B.upgrades.tradingHouse.income}`);
    expect(buildingTextFor('tradingHouse', B)).toContain(`+${B.buildings.tradingHouse.income}`);
    expect(buildingTextFor('mine', B, 2)).toContain(`+${B.level2.mineMinerBonus}`);
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
