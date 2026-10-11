import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { reduce } from '@/game/reducer';
import { createGame } from '@/game/setup';
import type { GameState } from '@/game/types';
import { tipText } from '@/meta/onboarding';
import { cardBlockReason } from '@/ui/card-input';
import {
  districtDetail,
  districtMeasureOf,
  districtRuleText,
  districtTally,
} from '@/ui/district-view';
import { buildingIncomeOf, buildingSpecRows, districtNote, slotStatusLine } from '@/ui/slot-actions';

const B = DEFAULT_BALANCE;
const NAMES = { you: 'あなた', cpu: 'CPU' } as const;

function board(): GameState {
  const g = createGame(1, B, 'you');
  g.turn = 5;
  g.current = 'you';
  g.players.you.coins = 0;
  g.players.cpu.coins = 0;
  g.players.you.hand = ['usurer', 'miner', 'banker', 'guard'];
  return g;
}

describe('使えない札の理由（cardBlockReason）', () => {
  it('使えるなら null', () => {
    const g = board();
    expect(cardBlockReason(g, 'you', 'usurer', false, B)).toBeNull();
  });

  it('コイン不足は不足額つき', () => {
    const g = board();
    g.players.you.coins = 1;
    expect(cardBlockReason(g, 'you', 'miner', false, B)).toBe(`コインが足りない（あと ${B.cards.miner.cost - 1}）`);
  });

  it('0 コストの札でも、同じ札をこのターンに使っていれば理由を言う', () => {
    let g = board();
    g = reduce(g, { type: 'useCard', card: 'usurer' }, B);
    // 使った札は山の底へ回るが、手札へ戻っている場合も含めて「使用済み」を言う
    g.players.you.hand = ['usurer', 'miner', 'banker', 'guard'];
    expect(cardBlockReason(g, 'you', 'usurer', false, B)).toBe('このターンは使用済み（同じカードは 1 ターン 1 回）');
  });

  it('演出中・相手の番・試合の後は、それを先に言う', () => {
    const g = board();
    expect(cardBlockReason(g, 'you', 'usurer', true, B)).toBe('演出中（終わってから使えます）');
    expect(cardBlockReason({ ...g, current: 'cpu' }, 'you', 'usurer', false, B)).toBe('相手の番です');
    expect(cardBlockReason({ ...g, phase: 'finished' }, 'you', 'usurer', false, B)).toBe('試合は終わりました');
  });

  it('検査官は相手の物件が無ければその理由', () => {
    const g = board();
    g.players.you.hand = ['inspector', 'miner', 'banker', 'guard'];
    g.players.you.coins = 99;
    expect(cardBlockReason(g, 'you', 'inspector', false, B)).toBe('相手の物件がありません');
  });
});

describe('地区の見せ方（district-view）', () => {
  it('既定のルールは件数で決まる（nextTitles で確かめる）', () => {
    expect(districtMeasureOf(B)).toBe('count');
    expect(districtRuleText(B)).toContain('物件の数');
    expect(districtRuleText({ ...B, districtTitleVp: 5 })).toContain('+5 VP');
  });

  it('値は判定に使う値（件数）', () => {
    const g = board();
    const [a, b, c] = B.districts[2]!.slots as [number, number, number];
    g.market[a]!.owner = 'you';
    g.market[b]!.owner = 'you';
    g.market[c]!.owner = 'cpu';
    expect(districtTally(g, 2, B)).toEqual({ measure: 'count', values: { you: 2, cpu: 1 } });
  });

  it('詳細は viewer を先に、区画を地区の並びで', () => {
    const g = board();
    const s0 = B.districts[0]!.slots[0]!;
    g.market[s0]!.owner = 'cpu';
    g.titles[0] = 'cpu';
    const d = districtDetail(g, 0, 'you', B);
    expect(d.name).toBe(B.districts[0]!.name);
    expect(d.holder).toBe('cpu');
    expect(d.tally.map((t) => [t.player, t.text])).toEqual([
      ['you', '0 件'],
      ['cpu', '1 件'],
    ]);
    expect(d.slots.map((s) => s.slotId)).toEqual(B.districts[0]!.slots);
    expect(d.slots[0]).toMatchObject({ owner: 'cpu', level: 1, vp: B.buildings[g.market[s0]!.buildingId].vp });
    expect(d.titleVp).toBe(B.districtTitleVp);
  });

  it('区画のシートの地区の 1 行も同じ値で書く', () => {
    const g = board();
    const [a, b] = B.districts[2]!.slots as [number, number];
    g.market[a]!.owner = 'you';
    g.market[b]!.owner = 'cpu';
    g.titles[2] = 'you';
    expect(districtNote(g, b, 'cpu', B, NAMES)).toContain('CPU 1 件・あなた 1 件');
  });

  it('手引きは「名札をタップで内訳」と言い、件数の話をしない', () => {
    const t = tipText('district', B).body;
    expect(t).toContain('名札をタップ');
    expect(t).not.toContain('対');
    expect(t.length).toBeLessThanOrEqual(30);
  });
});

describe('建物の詳細の固定の数値（buildingSpecRows）', () => {
  it('いつも VP・建築コスト・買収コスト・増築コストの順', () => {
    const rows = buildingSpecRows('tradingHouse', B);
    expect(rows.map((r) => r.label)).toEqual(['VP', '建築コスト', '買収コスト', '増築コスト']);
    expect(rows[0]!.value).toBe(
      `${B.buildings.tradingHouse.vp} / ${B.upgrades.tradingHouse.vp} / ${B.upgrades3.tradingHouse.vp}（Lv1/2/3）`,
    );
    expect(rows[1]!.value).toBe(`${B.buildings.tradingHouse.cost}`);
    expect(rows[2]!.value).toBe(`払われた額 ＋${B.acquireMarkup}`);
    expect(rows[3]!.value).toBe(`Lv2 ${B.upgrades.tradingHouse.cost} ・ Lv3 ${B.upgrades3.tradingHouse.cost}`);
  });

  it('balance の値に追従する（上乗せ・最大レベル）', () => {
    const b: Balance = { ...B, acquireMarkup: 7, maxLevel: 2 };
    const rows = buildingSpecRows('wall', b);
    expect(rows[2]!.value).toBe('払われた額 ＋7');
    expect(rows[3]!.value).toBe(`Lv2 ${B.upgrades.wall.cost}`);
  });

  it('収益は balance に値があるときだけ出す', () => {
    expect(buildingIncomeOf(B, 'tradingHouse')).toBeNull();
    const b: Balance = { ...B, buildings: { ...B.buildings, tradingHouse: { ...B.buildings.tradingHouse, income: 3 } as never } };
    const rows = buildingSpecRows('tradingHouse', b);
    expect(rows.at(-1)).toEqual({ label: '収益', value: '毎ターン +3' });
  });

  it('大聖堂の VP は 1 件あたりの値', () => {
    expect(buildingSpecRows('cathedral', B)[0]!.value).toContain('他の物件 1 件につき');
  });
});

describe('区画の今の状態（slotStatusLine）', () => {
  it('空き地・物件・最終段階', () => {
    const g = board();
    expect(slotStatusLine(g, 0, 'you', B, NAMES, 7)).toBe('空き地 ・ いま建てると 7 コイン');
    g.market[0] = { ...g.market[0]!, owner: 'cpu', paid: 7, level: 2 };
    expect(slotStatusLine(g, 0, 'you', B, NAMES, 7)).toBe(`CPUの物件 ・ Lv2 ・ 市場価値 ${7 + B.acquireMarkup}（払われた 7 ＋${B.acquireMarkup}）`);
    g.market[0]!.level = B.maxLevel;
    expect(slotStatusLine(g, 0, 'you', B, NAMES, 7)).toBe(`CPUの物件 ・ Lv${B.maxLevel} ・ 最終段階のため買収不可`);
  });
});
