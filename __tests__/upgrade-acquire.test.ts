import { describe, expect, it } from 'vitest';

import { exposedVpOf, reachOf } from '@/ai/evaluate';
import { buildingTextFor, DEFAULT_BALANCE } from '@/game/balance';
import { canAcquire, canUpgrade, canUseRoad, cardCostFor, incomeStages, legalActions, reduce } from '@/game/reducer';
import {
  acquireBlockOf,
    acquirePriceOf,
  marketValueOf,
  districtOfSlot,
  incomePerTurnOf,
  roadUsesRemaining,
  scoreOf,
  slotEffectStopped,
  vpOfSlot,
} from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { BuildingId, GameState, PlayerId } from '@/game/types';

// 買収の価格 = 市場価値（建設費の定価 + 到達した Lv までのアップグレード費の定価）× 2。代金は誰にも渡らない
// 仕様書の例（城壁 10 で建てて 10 で上げる）に合わせ、城壁の建設費は 10 に固定する（既定値の調整で例が崩れないように）
const B = {
  ...DEFAULT_BALANCE,
  buildings: { ...DEFAULT_BALANCE.buildings, wall: { ...DEFAULT_BALANCE.buildings.wall, cost: 10 } },
  upgrades: { ...DEFAULT_BALANCE.upgrades, wall: { ...DEFAULT_BALANCE.upgrades.wall, cost: 10 } },
};

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


describe('アップグレード', () => {
  it('建設費と同額を払って Lv2 になり、VP が Lv2 の値になる', () => {
    let g = fixture(50, 0);
    const wall = slotOf(g, 'wall');
    g = reduce(g, { type: 'build', slotId: wall }, B);
    expect(g.market[wall]!.level).toBe(1);
    g = pass(pass(g));
    const before = g.players.you.coins;
    g = reduce(g, { type: 'upgrade', slotId: wall }, B);
    expect(g.players.you.coins).toBe(before - B.upgrades.wall.cost);
    expect(g.market[wall]!.level).toBe(2);
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
    expect(marketValueOf(g.market[house]!, B)).toBe(
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

  it('買収費用は市場価値の 2 倍。代金は誰にも渡らず消える。買収後も市場価値は変わらず、次の買収も同じ額', () => {
    let g = fixture(10, 0);
    const wall = slotOf(g, 'wall');
    expect(B.buildings.wall.cost).toBe(10);
    g = reduce(g, { type: 'build', slotId: wall }, B);
    g = pass(g);

    // cpu が 20 で買う
    g.players.cpu.coins = 30;
    const youBefore = g.players.you.coins;
    expect(marketValueOf(g.market[wall]!, B)).toBe(10);
    expect(acquirePriceOf(g.market[wall]!, B)).toBe(20);
    g = reduce(g, { type: 'acquire', slotId: wall }, B);
    expect(g.market[wall]!.owner).toBe('cpu');
    expect(g.players.cpu.coins).toBe(30 - 20);
    expect(g.players.you.coins).toBe(youBefore); // 相手には渡らない
    // 買収で地区の称号も一緒に移る
    expect(scoreOf(g, 'cpu')).toBe(B.buildings.wall.vp + B.districtTitleVp);
    expect(scoreOf(g, 'you')).toBe(0);
    g = pass(g);

    // you が同じ 20 で買い戻す（買収で払った額では価格は変わらない）
    expect(acquirePriceOf(g.market[wall]!, B)).toBe(20);
    g.players.you.coins = 20;
    g = reduce(g, { type: 'acquire', slotId: wall }, B);
    expect(g.market[wall]!.owner).toBe('you');
    expect(g.players.you.coins).toBe(0);
    expect(g.players.cpu.coins).toBe(10);
  });

  it('10 で建てて 10 でアップグレードした物件（市場価値 20）は 40 で買収され、Lv は保たれる', () => {
    let g = fixture(20, 0);
    const wall = slotOf(g, 'wall');
    g = reduce(g, { type: 'build', slotId: wall }, B);
    g = pass(pass(g));
    g = reduce(g, { type: 'upgrade', slotId: wall }, B);
    g = pass(g);
    expect(marketValueOf(g.market[wall]!, B)).toBe(20);
    expect(acquirePriceOf(g.market[wall]!, B)).toBe(40);
    g.players.cpu.coins = 39;
    expect(canAcquire(g, wall, B)).toBe(false);
    g.players.cpu.coins = 40;
    g = reduce(g, { type: 'acquire', slotId: wall }, B);
    expect(g.market[wall]!.owner).toBe('cpu');
    expect(g.market[wall]!.level).toBe(2);
    expect(g.players.cpu.coins).toBe(0);
    expect(scoreOf(g, 'cpu')).toBe(B.upgrades.wall.vp + B.districtTitleVp);
  });

  it('建築家で安く建てても市場価値は定価のまま（買収も定価の 2 倍）', () => {
    let g = fixture(50, 0);
    g.players.you.hand = ['architect', 'miner', 'banker', 'usurer'];
    g = reduce(g, { type: 'useCard', card: 'architect' }, B);
    const wall = slotOf(g, 'wall');
    g = reduce(g, { type: 'build', slotId: wall }, B);
    expect(marketValueOf(g.market[wall]!, B)).toBe(B.buildings.wall.cost);
    expect(acquirePriceOf(g.market[wall]!, B)).toBe(B.buildings.wall.cost * B.acquireMultiplier);
  });

  it('商館（定価 8）は市場価値 8・買収 16。Lv2 に上げる定価が 7 なら市場価値 15・買収 30', () => {
    const g = fixture(0, 0);
    const house = slotOf(g, 'tradingHouse');
    g.market[house]!.owner = 'cpu';
    expect(marketValueOf(g.market[house]!, B)).toBe(B.buildings.tradingHouse.cost);
    expect(acquirePriceOf(g.market[house]!, B)).toBe(B.buildings.tradingHouse.cost * 2);
    g.market[house]!.level = 2;
    expect(marketValueOf(g.market[house]!, B)).toBe(B.buildings.tradingHouse.cost + B.upgrades.tradingHouse.cost);
    // 検査官で Lv が下がれば市場価値も下がる
    g.market[house]!.level = 1;
    expect(marketValueOf(g.market[house]!, B)).toBe(B.buildings.tradingHouse.cost);
  });

  it('自分の物件・未建設の区画は買収できない', () => {
    const g = fixture(100, 0);
    const wall = slotOf(g, 'wall');
    expect(canAcquire(g, wall, B)).toBe(false);
    g.market[wall]!.owner = 'you';
    expect(canAcquire(g, wall, B)).toBe(false);
  });

  it('衛兵で守られている相手の物件は買収できない。城壁は買収を防がない', () => {
    const g = fixture(100, 0);
    const wall = slotOf(g, 'wall');
    g.market[wall]!.owner = 'cpu';
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
    g.blockades = [{ district: districtOfSlot(house, B), target: 'cpu', untilTurn: g.turn, beforeIncome: false }];
    expect(slotEffectStopped(g, g.market[house]!, B)).toBe(true);
    expect(canAcquire(g, house, B)).toBe(true);
    const after = reduce(g, { type: 'acquire', slotId: house }, B);
    expect(after.market[house]!.owner).toBe('you');
    expect(slotEffectStopped(after, after.market[house]!, B)).toBe(false);
  });

  it('買収の代金は誰にも入らない（払った分のコインが消える）', () => {
    const g = fixture(100, 0);
    const [f1] = g.market.filter((s) => s.buildingId === 'fortress');
    f1!.owner = 'cpu';
    const house = slotOf(g, 'tradingHouse');
    g.market[house]!.owner = 'cpu';
    const after = reduce(g, { type: 'acquire', slotId: house }, B);
    expect(after.players.cpu.coins).toBe(0);
    expect(after.players.you.coins).toBe(100 - B.buildings.tradingHouse.cost * B.acquireMultiplier);
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
    const g = fixture(20, 0);
    // 空き地は全部埋めて、買収だけが候補になるようにする
    for (const s of g.market) {
      s.owner = 'cpu';
    }
    expect(reachOf(g, 'you', B)).toBe(B.buildings.wall.vp);
    g.players.cpu.guarded = true;
    expect(reachOf(g, 'you', B)).toBe(0);
  });

  it('アップグレードで買収価格が上がると、相手に奪われうる VP（exposed）が減る', () => {
    const g = fixture(0, 25);
    const wall = slotOf(g, 'wall');
    g.market[wall]!.owner = 'you';
    expect(exposedVpOf(g, 'you', B)).toBe(B.buildings.wall.vp);
    g.market[wall]!.level = 2;
    expect(exposedVpOf(g, 'you', B)).toBe(0);
  });
});
