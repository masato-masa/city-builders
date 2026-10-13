import { describe, expect, it } from 'vitest';

import { ALL_CARDS, BUILDING_NAMES, CARD_POOL, DEFAULT_BALANCE as B } from '@/game/balance';
import { cardCostInfo, costDetailText, costMark } from '@/game/card-cost';
import {
  buildingLinesFor,
  buildingUpgradeLines,
  cardLinesFor,
  cardUpgradeLines,
  flattenLine,
  flattenLines,
  KEYWORD_LABELS,
  KEYWORD_ORDER,
  keywordDefs,
  levelProgress,
  progressDots,
  starSlots,
  type NumSeg,
  type TextLine,
} from '@/game/card-text';
import { cardCostFor } from '@/game/reducer';
import { createGame } from '@/game/setup';
import type { BuildingId, CardId, GameState } from '@/game/types';
import { levelView } from '@/ui/slot-actions';

function board(): GameState {
  const g = createGame(1, B, 'you');
  g.turn = 5;
  g.current = 'you';
  g.players.you.coins = 20;
  g.players.you.hand = ['guard', 'miner', 'herald', 'taxman'];
  return g;
}

const nums = (lines: TextLine[]): NumSeg[] =>
  lines.flatMap((l) => l.filter((s): s is NumSeg => typeof s !== 'string' && s.t === 'num'));

describe('説明文は行の配列', () => {
  it('全カード: 主文 1 行＋補足 1〜3 行で、空の行がない', () => {
    for (const c of CARD_POOL) {
      const lines = cardLinesFor(c, B);
      expect(lines.length).toBeGreaterThanOrEqual(1);
      expect(lines.length).toBeLessThanOrEqual(4);
      for (const l of lines) expect(flattenLine(l).length).toBeGreaterThan(0);
    }
  });

  it('全建物: 1 行目は VP（＝収入）の行', () => {
    for (const id of Object.keys(BUILDING_NAMES) as BuildingId[]) {
      const first = flattenLine(buildingLinesFor(id, B, 1)[0]!);
      expect(first.startsWith('VP')).toBe(true);
    }
    expect(flattenLine(buildingLinesFor('tradingHouse', B, 1)[0]!)).toBe(`VP ${B.buildings.tradingHouse.vp}（＝収入）`);
    expect(flattenLine(buildingLinesFor('cathedral', B, 1)[0]!)).toContain('他の物件 1 件につき');
  });

  it('数字は balance から差し込む（値を変えると文も変わる）', () => {
    expect(flattenLines(cardLinesFor('miner', { ...B, minerIncome: 9 }))).toContain('+9');
    expect(flattenLines(cardLinesFor('festival', { ...B, festivalMultiplier: 3 }))).toContain('× 3');
  });

  it('Lv で上がった値は金（lv）、Lv1 や変わらない値は plain', () => {
    expect(nums(cardLinesFor('miner', B, 1)).every((n) => n.kind === 'plain')).toBe(true);
    const lv2 = nums(cardLinesFor('miner', B, 2)).filter((n) => n.kind === 'lv');
    expect(lv2.map((n) => n.text)).toEqual([`+${B.cardLv2.miner.power}`]);
    // 固定の数字（祝祭の倍率）は Lv が上がっても金にならない
    expect(nums(cardLinesFor('festival', B, 3)).find((n) => n.text === String(B.festivalMultiplier))?.kind).toBe('plain');
  });

  it('次の Lv の差分は「元 → 新」の 1 行だけ', () => {
    const up = cardUpgradeLines('miner', B, 1);
    expect(up).toHaveLength(1);
    expect(flattenLine(up[0]!)).toBe(`次の収入 +${B.minerIncome}→+${B.cardLv2.miner.power}`);
    expect(cardUpgradeLines('miner', B, B.maxLevel)).toEqual([]);
    // 最大 Lv の手前: コストが下がる札は先頭にコストの差分
    const boss = cardUpgradeLines('boss', B, 1);
    expect(flattenLine(boss[0]!)).toBe(`コスト ${B.cards.boss.cost}→${B.cardLv2.boss.cost}`);
    expect(nums(boss)[0]).toMatchObject({ kind: 'good', mark: '▼' });
  });

  it('建物の差分は VP の行が先頭', () => {
    const up = buildingUpgradeLines('factory', B, 1);
    expect(flattenLine(up[0]!)).toBe(`VP ${B.buildings.factory.vp}→${B.upgrades.factory.vp}（＝収入）`);
    expect(flattenLine(up[1]!)).toContain(`−${B.factoryDiscount}→−${B.level2.factoryDiscount}`);
    expect(buildingUpgradeLines('factory', B, B.maxLevel)).toEqual([]);
  });

  it('区画の詳細: 未建設は差分なし。建っていれば Lv・VP 行・差分', () => {
    const g = board();
    expect(levelView(g, 0, B)).toMatchObject({ level: 1, upgrade: [], maxed: false });
    g.market[0]!.owner = 'you';
    const v = levelView(g, 0, B);
    expect(flattenLine(v.lines[0]!)).toContain('VP');
    expect(v.upgrade.length).toBeGreaterThan(0);
    g.market[0]!.level = B.maxLevel;
    expect(levelView(g, 0, B)).toMatchObject({ upgrade: [], maxed: true });
  });

  it('旧 API の平文は行をつないだもの', () => {
    for (const c of ALL_CARDS) expect(flattenLines(cardLinesFor(c, B)).length).toBeGreaterThan(5);
  });
});

describe('キーワード', () => {
  it('7 語すべてに定義が 1 行ある。買収の倍率は balance から', () => {
    expect(KEYWORD_ORDER).toHaveLength(7);
    const defs = keywordDefs({ ...B, acquireMultiplier: 3 });
    for (const id of KEYWORD_ORDER) {
      expect(KEYWORD_LABELS[id].length).toBeGreaterThan(0);
      expect(defs[id]).not.toContain('\n');
    }
    expect(defs.acquire).toContain('× 3');
  });

  it('説明文の中のキーワードは定義がある語だけ', () => {
    const ids = new Set<string>(KEYWORD_ORDER);
    for (const c of CARD_POOL) {
      for (const l of cardLinesFor(c, B)) for (const s of l) if (typeof s !== 'string' && s.t === 'kw') expect(ids.has(s.id)).toBe(true);
    }
  });
});

describe('Lv の表示', () => {
  it('★は 3 枠で常に', () => {
    expect(starSlots(1)).toBe('★☆☆');
    expect(starSlots(2)).toBe('★★☆');
    expect(starSlots(3)).toBe('★★★');
  });

  it('次の Lv までの回数は点。最大 Lv は null', () => {
    const [l2, l3] = B.cardLevelUses;
    expect(levelProgress(B, 0)).toEqual({ filled: 0, total: l2 });
    expect(levelProgress(B, 1)).toEqual({ filled: 1, total: l2 });
    expect(levelProgress(B, l2)).toEqual({ filled: 0, total: l3 - l2 });
    expect(levelProgress(B, l3)).toBeNull();
    expect(progressDots(1, 2)).toBe('●○');
    expect(progressDots(0, 3)).toBe('○○○');
  });
});

describe('手札のコストの内訳', () => {
  it('合計は cardCostFor と必ず一致する（全カード・城壁/街道/工場/鉱山/祝祭の組み合わせ）', () => {
    const buildings: BuildingId[] = ['wall', 'road', 'factory', 'mine'];
    for (let mask = 0; mask < 16; mask++) {
      for (const festival of [false, true]) {
        const g = board();
        g.players.you.festivalActive = festival;
        buildings.forEach((b, i) => {
          if (mask & (1 << i)) g.market.find((s) => s.buildingId === b)!.owner = 'you';
        });
        for (const c of CARD_POOL as CardId[]) {
          const info = cardCostInfo(g, 'you', c, B);
          expect(info.now, `${c} mask=${mask}`).toBe(cardCostFor(g, 'you', c, B));
          // 元の値＋理由の合計＝いまの値
          expect(info.base + info.reasons.reduce((n, r) => n + r.delta, 0), `${c} mask=${mask}`).toBe(info.now);
        }
      }
    }
  });

  it('城壁があって衛兵が 0 になれば、緑（得）で「元 1・城壁 −1」', () => {
    const g = board();
    expect(cardCostInfo(g, 'you', 'guard', B).kind).toBe('plain');
    g.market.find((s) => s.buildingId === 'wall')!.owner = 'you';
    const info = cardCostInfo(g, 'you', 'guard', B);
    expect(info).toMatchObject({ now: 0, base: B.cards.guard.cost, kind: 'good' });
    expect(costDetailText(info)).toBe(`コスト 0（元 ${B.cards.guard.cost}）・城壁 −${B.cards.guard.cost}`);
    expect(costMark(info.kind)).toBe('▼');
  });

  it('徴税官は自分の物件が多いほど高い＝赤（損）で ▲', () => {
    const g = board();
    for (const id of [0, 1, 2, 3]) g.market[id]!.owner = 'you';
    const info = cardCostInfo(g, 'you', 'taxman', B);
    expect(info.kind).toBe('bad');
    expect(costMark(info.kind)).toBe('▲');
    expect(costDetailText(info)).toContain('自分の物件 +');
  });

  it('変わっていなければ「コスト N」だけ', () => {
    expect(costDetailText(cardCostInfo(board(), 'you', 'miner', B))).toBe(`コスト ${B.cards.miner.cost}`);
  });
});
