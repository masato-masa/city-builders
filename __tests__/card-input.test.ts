import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { createGame } from '@/game/setup';

import {
  classifyPress,
  dragGuide,
  DRAG_THRESHOLD_PX,
  LONG_PRESS_MS,
  resolveDrop,
  type DropHit,
} from '@/ui/card-input';
import { isMaxLevel, plotFigures } from '@/ui/slot-actions';
import { TEMPO } from '@/ui/tempo';
import { acquirePriceOf, upgradePriceOf } from '@/game/selectors';

// 買収の上乗せの基本を測るので、物件の数の差による増減は切る
const B = { ...DEFAULT_BALANCE };
const hit = (h: Partial<DropHit>): DropHit => ({ onBoard: false, slotId: null, handCard: null, ...h });

describe('押し方の判定（classifyPress）', () => {
  it('閾値は 7px 前後・長押しは 0.3〜0.6 秒', () => {
    expect(DRAG_THRESHOLD_PX).toBeGreaterThanOrEqual(6);
    expect(DRAG_THRESHOLD_PX).toBeLessThanOrEqual(10);
    expect(LONG_PRESS_MS).toBeGreaterThanOrEqual(300);
    expect(LONG_PRESS_MS).toBeLessThanOrEqual(600);
  });

  it('指の小さな揺れはタップのまま、閾値を超えたらドラッグ', () => {
    expect(classifyPress(3, 4, 100)).toBe('pending');
    expect(classifyPress(DRAG_THRESHOLD_PX - 1, 0, 100)).toBe('pending');
    expect(classifyPress(DRAG_THRESHOLD_PX, 0, 100)).toBe('drag');
    expect(classifyPress(5, 5, 100)).toBe('drag');
  });

  it('動かさずに押し続けたら長押し。動いていればドラッグが勝つ', () => {
    expect(classifyPress(0, 0, LONG_PRESS_MS - 1)).toBe('pending');
    expect(classifyPress(2, 1, LONG_PRESS_MS)).toBe('longpress');
    expect(classifyPress(20, 0, LONG_PRESS_MS + 500)).toBe('drag');
  });
});

describe('離した場所の判定（resolveDrop）', () => {
  const g = createGame(1, B, 'you');
  g.market[3]!.owner = 'cpu';
  g.market[4]!.owner = 'you';

  it('ふつうの札は盤面の上で使う。盤面の外ならやめる', () => {
    expect(resolveDrop(g, 'you', 'miner', hit({ onBoard: true }))).toEqual({
      kind: 'use',
      action: { type: 'useCard', card: 'miner' },
    });
    expect(resolveDrop(g, 'you', 'miner', hit({ onBoard: true, slotId: 2 })).kind).toBe('use');
    expect(resolveDrop(g, 'you', 'miner', hit({}))).toEqual({ kind: 'cancel' });
    // 手札の上（盤面の外）で離したのはやめた扱い
    expect(resolveDrop(g, 'you', 'miner', hit({ handCard: 'banker' }))).toEqual({ kind: 'cancel' });
  });

  it('伝令は別の札の上で、その札を山の底へ。盤面なら対象選びへ', () => {
    expect(resolveDrop(g, 'you', 'herald', hit({ handCard: 'banker' }))).toEqual({
      kind: 'use',
      action: { type: 'useCard', card: 'herald', heraldTarget: 'banker' },
    });
    expect(resolveDrop(g, 'you', 'herald', hit({ onBoard: true }))).toEqual({ kind: 'target', mode: 'herald' });
    expect(resolveDrop(g, 'you', 'herald', hit({ handCard: 'herald' }))).toEqual({ kind: 'cancel' });
  });

  it('封鎖者は区画の上でその区画の地区。封鎖済みの地区ははじく。区画の外の盤面なら対象選びへ', () => {
    expect(resolveDrop(g, 'you', 'blockader', hit({ onBoard: true, slotId: 3 }))).toEqual({
      kind: 'use',
      action: { type: 'useCard', card: 'blockader', district: 1 },
    });
    expect(resolveDrop(g, 'you', 'blockader', hit({ onBoard: true, slotId: 0 })).kind).toBe('use');
    // 自分の物件の上でも、その地区を封鎖する（自分の物件には何も起きない）
    expect(resolveDrop(g, 'you', 'blockader', hit({ onBoard: true, slotId: 4 })).kind).toBe('use');
    const blocked = structuredClone(g);
    blocked.blockades = [{ district: 1, target: 'cpu', untilTurn: g.turn + 1, beforeIncome: true }];
    expect(resolveDrop(blocked, 'you', 'blockader', hit({ onBoard: true, slotId: 3 })).kind).toBe('reject');
    // 2 人対戦: 手番側から見る（cpu から見て you は封鎖を受けていない）
    expect(resolveDrop(blocked, 'cpu', 'blockader', hit({ onBoard: true, slotId: 3 })).kind).toBe('use');
    expect(resolveDrop(g, 'you', 'blockader', hit({ onBoard: true }))).toEqual({ kind: 'target', mode: 'blockade' });
    expect(resolveDrop(g, 'you', 'blockader', hit({}))).toEqual({ kind: 'cancel' });
  });

  it('ドラッグ中の案内は札ごとに、どこで離すかを言う（時計と重ならない長さ）', () => {
    expect(dragGuide('herald')).toContain('札の上');
    expect(dragGuide('blockader')).toContain('地区');
    expect(dragGuide('miner')).toContain('盤面');
    for (const c of ['herald', 'blockader', 'miner'] as const) expect(dragGuide(c).length).toBeLessThanOrEqual(22);
  });
});

describe('区画の名札の数字（plotFigures）', () => {
  const cost = (id: number) => B.buildings[createGame(1, B, 'you').market[id]!.buildingId].cost;

  it('未建設は建設費だけ', () => {
    const g = createGame(1, B, 'you');
    expect(plotFigures(g, 0, 'you', B, cost)).toEqual({ kind: 'unbuilt', build: cost(0) });
  });

  it('建った物件は買収に要るコイン（市場価値 × 倍率）とアップグレード費。Lv が上がれば上がる', () => {
    const g = createGame(1, B, 'you');
    const slot = g.market[0]!;
    slot.owner = 'you';
    const f = plotFigures(g, 0, 'you', B, cost);
    const house = B.buildings.tradingHouse.cost;
    expect(f).toEqual({ kind: 'built', value: house * B.acquireMultiplier, upgrade: upgradePriceOf(slot, B) });
    slot.level = 2;
    expect(plotFigures(g, 0, 'you', B, cost)).toMatchObject({
      value: (house + B.upgrades.tradingHouse.cost) * B.acquireMultiplier,
    });
  });

  it('相手の物件は、自分がいま払う額（買収者の割引込み）。自分の物件は相手が払う額（割引なし）', () => {
    const g = createGame(1, B, 'you');
    g.market[0]!.owner = 'cpu';
    g.market[1]!.owner = 'you';
    g.players.you.acquireDiscount = 3;
    expect(plotFigures(g, 0, 'you', B, cost)).toMatchObject({ value: acquirePriceOf(g.market[0]!, B) - 3 });
    expect(plotFigures(g, 1, 'you', B, cost)).toMatchObject({ value: acquirePriceOf(g.market[1]!, B) });
  });

  it('最大レベルはアップグレード費を出さない（upgradePriceOf が Infinity かで見る）', () => {
    const g = createGame(1, B, 'you');
    const slot = g.market[0]!;
    slot.owner = 'you';
    for (let lv = 1; lv <= 5; lv++) {
      slot.level = lv;
      const max = !Number.isFinite(upgradePriceOf(slot, B));
      expect(isMaxLevel(g, 0, B)).toBe(max);
      const f = plotFigures(g, 0, 'you', B, cost);
      expect(f.kind === 'built' && f.upgrade === null).toBe(max);
    }
  });
});

describe('間合い（tempo）', () => {
  it('「ふつう」は待ち時間の短縮より前の値、「はやい」は短縮後の値', () => {
    expect(TEMPO.normal).toMatchObject({
      bannerMs: 1500,
      cardEffectDelayMs: 800,
      buildEffectDelayMs: 450,
      cpuStepGapMs: 750,
      cpuEffectDelayMs: 800,
      incomeApplyMs: 550,
      incomeBeatMs: 1400,
      incomeTailMs: 600,
      discardAtMs: 800,
    });
    expect(TEMPO.fast).toMatchObject({ bannerMs: 800, cpuStepGapMs: 150, cpuEffectDelayMs: 350, incomeBeatMs: 260 });
  });

  it('どの項目も「ふつう」のほうが長いか同じ', () => {
    for (const key of Object.keys(TEMPO.fast) as (keyof typeof TEMPO.fast)[]) {
      expect(TEMPO.normal[key]).toBeGreaterThanOrEqual(TEMPO.fast[key]);
    }
  });

  it('CPU の 1 手（出す前の間 + 反映まで）は「ふつう」で 1.5 秒前後、「はやい」で 0.5 秒前後', () => {
    expect(TEMPO.normal.cpuStepGapMs + TEMPO.normal.cpuEffectDelayMs).toBe(1550);
    expect(TEMPO.fast.cpuStepGapMs + TEMPO.fast.cpuEffectDelayMs).toBe(500);
  });
});

describe('早送りの設定', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('既定は「ふつう」。切り替えると保存され、tempo() が追従する', async () => {
    const settings = await import('@/ui/settings');
    const t = await import('@/ui/tempo');
    expect(settings.getSpeed()).toBe('normal');
    expect(t.tempo()).toBe(t.TEMPO.normal);
    settings.setSpeed('fast');
    expect(t.tempo()).toBe(t.TEMPO.fast);
    expect(localStorage.getItem('city-builders:speed')).toBe('fast');
    vi.resetModules();
    const again = await import('@/ui/settings');
    expect(again.getSpeed()).toBe('fast');
  });
});
