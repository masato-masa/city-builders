import { describe, expect, it } from 'vitest';

import { buildingTextFor, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { createGame } from '@/game/setup';
import type { GameState } from '@/game/types';
import { describeAction } from '@/ui/cpu-turn';
import {
  acquireButton,
  acquireNote,
  cpuActionCallout,
  levelEffects,
  lockRemaining,
  upgradeButton,
} from '@/ui/slot-actions';

const B = DEFAULT_BALANCE;

/** 自分の手番（turn 5）で、区画 0（商館）が自分、区画 7（城塞）が相手の物件の盤面。 */
function board(): GameState {
  const s = createGame(1, B, 'you');
  s.turn = 5;
  s.current = 'you';
  s.players.you.coins = 0;
  s.players.cpu.coins = 0;
  s.market[0] = { ...s.market[0]!, owner: 'you', level: 1, touchedTurn: 1 };
  s.market[7] = { ...s.market[7]!, owner: 'cpu', level: 1, touchedTurn: 2 };
  return s;
}

describe('upgradeButton', () => {
  it('空き地・相手の物件・最大レベルでは出さない', () => {
    const s = board();
    expect(upgradeButton(s, 1, 'you', B)).toBeNull();
    expect(upgradeButton(s, 7, 'you', B)).toBeNull();
    s.market[0]!.level = B.maxLevel;
    expect(upgradeButton(s, 0, 'you', B)).toBeNull();
  });

  it('足りれば価格つきで押せる', () => {
    const s = board();
    s.players.you.coins = 7;
    expect(upgradeButton(s, 0, 'you', B)).toEqual({
      price: 7,
      enabled: true,
      label: 'アップグレード（7コイン）',
      reason: null,
    });
  });

  it('足りなければ「あと N コイン」', () => {
    const s = board();
    s.players.you.coins = 3;
    const b = upgradeButton(s, 0, 'you', B)!;
    expect(b.enabled).toBe(false);
    expect(b.label).toBe('あと 4 コイン');
  });

  it('この手番に建てた区画は、理由を 1 行で出して押せない', () => {
    const s = board();
    s.players.you.coins = 99;
    s.market[0]!.touchedTurn = 5;
    const b = upgradeButton(s, 0, 'you', B)!;
    expect(b.enabled).toBe(false);
    expect(b.label).toBe('アップグレード（7コイン）');
    expect(b.reason).toMatch(/次の手番から/);
  });

  it('相手の手番中は押せないが、理由は出さない', () => {
    const s = board();
    s.players.you.coins = 99;
    s.current = 'cpu';
    const b = upgradeButton(s, 0, 'you', B)!;
    expect(b.enabled).toBe(false);
    expect(b.reason).toBeNull();
  });
});

describe('acquireButton', () => {
  it('価格は市場価値（建設費の定価）× acquireMultiplier', () => {
    const s = board();
    const price = B.buildings.fortress.cost * B.acquireMultiplier;
    s.players.you.coins = price;
    const b = acquireButton(s, 7, 'you', B)!;
    expect(b).toEqual({ price, enabled: true, label: `買収（${price}コイン）`, reason: null });
    expect(acquireNote(s, 7, B)).toContain(`市場価値 ${B.buildings.fortress.cost} × ${B.acquireMultiplier}`);
  });

  it('自分の物件・空き地では出さない', () => {
    const s = board();
    expect(acquireButton(s, 0, 'you', B)).toBeNull();
    expect(acquireButton(s, 1, 'you', B)).toBeNull();
  });

  it('足りなければ「あと N コイン」', () => {
    const s = board();
    const price = B.buildings.fortress.cost * B.acquireMultiplier;
    s.players.you.coins = price - 2;
    expect(acquireButton(s, 7, 'you', B)!.label).toBe('あと 2 コイン');
  });

  it('衛兵中は理由を出して押せない（コインが足りていても）', () => {
    const s = board();
    s.players.you.coins = 99;
    s.players.cpu.guarded = true;
    const b = acquireButton(s, 7, 'you', B)!;
    expect(b.enabled).toBe(false);
    expect(b.reason).toMatch(/衛兵/);
  });

  it('動かされたばかりの区画は、残りの手番数を添えて押せない', () => {
    const s = board();
    s.players.you.coins = 99;
    const lock2: Balance = { ...B, slotLockTurns: 2 };
    s.market[7]!.touchedTurn = 4; // 相手が直前の手番に建てた
    expect(lockRemaining(s, 7, lock2)).toBe(1);
    const b = acquireButton(s, 7, 'you', lock2)!;
    expect(b.enabled).toBe(false);
    expect(b.reason).toBe('動かされたばかりの区画です（あと 1 手番）');
    // 既定（1）なら直前の手番に建てた物件も買える
    expect(acquireButton(s, 7, 'you', B)!.enabled).toBe(true);
  });

  it('倍率は balance の値に従う', () => {
    const s = board();
    s.players.you.coins = 99;
    expect(acquireButton(s, 7, 'you', { ...B, acquireMultiplier: 1 })!.price).toBe(B.buildings.fortress.cost);
  });
});

describe('levelEffects', () => {
  it('Lv1 の物件は、いまと上げたあと（level + 1）を並べる', () => {
    const s = board();
    const { current, next } = levelEffects(s, 0, B);
    expect(current).toEqual({ level: 1, vp: '1 VP', text: buildingTextFor('tradingHouse', B, 1) });
    expect(next).toEqual({ level: 2, vp: '2 VP', text: buildingTextFor('tradingHouse', B, 2) });
    expect(current.text).toContain(`収入 +${B.tradingHouseIncome}`);
  });

  it('最大レベルは next を出さない。未建設も出さない', () => {
    const s = board();
    s.market[0]!.level = B.maxLevel;
    expect(levelEffects(s, 0, B).next).toBeNull();
    expect(levelEffects(s, 0, B).current.vp).toBe(`${B.upgrades3.tradingHouse.vp} VP`);
    expect(levelEffects(s, 1, B).next).toBeNull();
  });

  it('大聖堂は 1 件あたりの VP で書く', () => {
    const s = board();
    s.market[6] = { ...s.market[6]!, owner: 'you', level: 1, touchedTurn: 1 };
    const { current, next } = levelEffects(s, 6, B);
    expect(current.vp).toBe('他の物件 1 件につき 2 VP');
    expect(next!.vp).toBe('他の物件 1 件につき 3 VP');
  });
});

describe('CPU の行動の文言', () => {
  it('実況ログと吹き出し', () => {
    const s = board();
    expect(describeAction(s, { type: 'upgrade', slotId: 7 })).toBe('城塞をアップグレードした');
    expect(describeAction(s, { type: 'acquire', slotId: 0 })).toBe('商館を買収した');
    expect(cpuActionCallout(s, { type: 'upgrade', slotId: 7 })).toBe('CPU が城塞をアップグレードした');
    expect(cpuActionCallout(s, { type: 'acquire', slotId: 0 })).toBe('CPU があなたの商館を買収した');
    expect(cpuActionCallout(s, { type: 'build', slotId: 1 })).toBeNull();
  });
});

describe('最終段階の物件（買収できない）', () => {
  it('名札の市場価値は null（買収不可）、アップグレードの数字も出さない', async () => {
    const { plotFigures } = await import('@/ui/slot-actions');
    const s = board();
    s.market[7]!.level = B.maxLevel;
    const f = plotFigures(s, 7, 'you', B, () => 0);
    expect(f).toEqual({ kind: 'built', value: null, upgrade: null });
  });

  it('買収のボタンは押せず、理由を 1 行で出す', () => {
    const s = board();
    s.players.you.coins = 99;
    s.market[7]!.level = B.maxLevel;
    const b = acquireButton(s, 7, 'you', B)!;
    expect(b.enabled).toBe(false);
    expect(b.reason).toContain('最終段階');
  });
});
