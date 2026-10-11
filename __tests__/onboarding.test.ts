import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { createGame } from '@/game/setup';
import type { GameState } from '@/game/types';
import {
  emptyOnboarding,
  nextTip,
  recommendedDifficulty,
  TIP_ORDER,
  tipClosedBy,
  tipsActive,
  tipText,
  tipTriggered,
  withFinished,
  withSeen,
} from '@/meta/onboarding';
import { loadOnboarding, parseOnboarding, replayOnboarding, saveOnboarding } from '@/storage/onboarding';

const B = DEFAULT_BALANCE;

/** 自分の手番・コイン 0・盤面は空。 */
function fresh(): GameState {
  const s = structuredClone(createGame(1, B, 'you'));
  s.current = 'you';
  s.players.you.coins = 0;
  return s;
}

describe('手引き: 場面の判定', () => {
  it('最初の手番はカードの使い方だけ', () => {
    expect(nextTip(fresh(), [], true)).toBe('drag');
  });

  it('操作できない間（演出中・相手の手番・終局）は出さない', () => {
    const s = fresh();
    expect(nextTip(s, [], false)).toBeNull();
    expect(nextTip({ ...s, current: 'cpu' }, [], true)).toBeNull();
    expect(nextTip({ ...s, phase: 'finished' }, [], true)).toBeNull();
  });

  it('コインが空き地の建設費に届いたら「建てる」', () => {
    const s = fresh();
    expect(tipTriggered('build', s, B)).toBe(false);
    s.players.you.coins = 50;
    expect(tipTriggered('build', s, B)).toBe(true);
    expect(nextTip(s, ['drag'], true)).toBe('build');
  });

  it('投資カードを使ったら「次の収入」', () => {
    const s = fresh();
    expect(tipTriggered('invest', s, B)).toBe(false);
    s.players.you.pendingIncome = ['miner'];
    expect(nextTip(s, ['drag'], true)).toBe('invest');
  });

  it('相手の物件が建ったら「買収」、物件が 1 件でもあれば「地区」', () => {
    const s = fresh();
    expect(tipTriggered('acquire', s, B)).toBe(false);
    expect(tipTriggered('district', s, B)).toBe(false);
    s.market[0] = { ...s.market[0]!, owner: 'cpu', paid: 7 };
    expect(tipTriggered('acquire', s, B)).toBe(true);
    expect(tipTriggered('district', s, B)).toBe(true);
    // 同時に来たら順に 1 つずつ
    expect(nextTip(s, ['drag'], true)).toBe('acquire');
    expect(nextTip(s, ['drag', 'acquire'], true)).toBe('district');
    expect(nextTip(s, ['drag', 'acquire', 'district'], true)).toBeNull();
  });

  it('自分の物件だけなら買収は出さない', () => {
    const s = fresh();
    s.market[0] = { ...s.market[0]!, owner: 'you', paid: 7 };
    expect(tipTriggered('acquire', s, B)).toBe(false);
    expect(nextTip(s, ['drag'], true)).toBe('district');
  });

  it('全部見たら何も出さない', () => {
    const s = fresh();
    s.players.you.coins = 99;
    s.market[0] = { ...s.market[0]!, owner: 'cpu', paid: 7 };
    expect(nextTip(s, TIP_ORDER, true)).toBeNull();
  });

  it('教えた操作をしたら閉じる', () => {
    expect(tipClosedBy('drag', 'useCard')).toBe(true);
    expect(tipClosedBy('drag', 'build')).toBe(false);
    expect(tipClosedBy('build', 'build')).toBe(true);
    expect(tipClosedBy('acquire', 'acquire')).toBe(true);
    expect(tipClosedBy('acquire', 'upgrade')).toBe(false);
    expect(tipClosedBy('upgrade', 'upgrade')).toBe(true);
  });

  it('文は短い（1 つ 30 字以内）・数字は balance から', () => {
    for (const id of TIP_ORDER) expect(tipText(id, B).body.length).toBeLessThanOrEqual(30);
    expect(tipText('district', { ...B, districtTitleVp: 4 }).body).toContain('+4VP');
  });
});

describe('手引き: 出す試合・難易度の案内', () => {
  it('はじめての人だけ。1 戦を終えたら出さない', () => {
    expect(tipsActive(emptyOnboarding(), 0)).toBe(true);
    expect(tipsActive(emptyOnboarding(), 3)).toBe(false);
    expect(tipsActive(withFinished(emptyOnboarding()), 0)).toBe(false);
  });

  it('テスト用の「もう一度」は戦績があっても出し、終えたら戻る', () => {
    const r = { ...emptyOnboarding(), replay: true };
    expect(tipsActive(r, 5)).toBe(true);
    expect(tipsActive(withFinished(r), 5)).toBe(false);
  });

  it('見たものは重複せずに足す', () => {
    const a = withSeen(withSeen(emptyOnboarding(), 'drag'), 'drag');
    expect(a.seen).toEqual(['drag']);
  });

  it('はじめては「やさしい」を勧める。それ以外は前回の難易度', () => {
    expect(recommendedDifficulty('normal', 0, emptyOnboarding())).toEqual({ difficulty: 'easy', tag: 'はじめて' });
    expect(recommendedDifficulty('hard', 2, emptyOnboarding()).difficulty).toBe('hard');
    expect(recommendedDifficulty('normal', 0, withFinished(emptyOnboarding())).difficulty).toBe('normal');
  });
});

describe('手引き: 保存', () => {
  beforeEach(() => localStorage.clear());

  it('壊れたデータでも落ちない', () => {
    for (const raw of [null, '', '{', 'null', '[]', '42', '"x"', '{"seen":"drag"}', '{"seen":[1,null,{}]}']) {
      expect(parseOnboarding(raw)).toEqual(emptyOnboarding());
    }
  });

  it('知らない id・重複は捨て、真偽値は true のときだけ', () => {
    expect(parseOnboarding('{"seen":["drag","zzz","drag","build"],"finished":"yes","replay":1}')).toEqual({
      seen: ['drag', 'build'],
      finished: false,
      replay: false,
    });
  });

  it('保存して読み直せる・もう一度で最初から', () => {
    saveOnboarding(withFinished(withSeen(emptyOnboarding(), 'drag')));
    expect(loadOnboarding()).toEqual({ seen: ['drag'], finished: true, replay: false });
    replayOnboarding();
    expect(loadOnboarding()).toEqual({ seen: [], finished: false, replay: true });
  });

  it('保存の中身が壊れていたら空として読む', () => {
    localStorage.setItem('city-builders:onboarding', '{oops');
    expect(loadOnboarding()).toEqual(emptyOnboarding());
  });
});
