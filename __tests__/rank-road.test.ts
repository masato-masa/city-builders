import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';
import { type AchievementContext, ACHIEVEMENTS, achievementsMet, newAchievements } from '@/meta/achievements';
import { applyMatch, floorOf, RANK_RULES, STEPS, stepInfo, TOP_STEP, winStarsFor } from '@/meta/rank';
import { settleMatch } from '@/meta/settle';
import { emptyMeta, loadMeta, parseMeta, saveMeta } from '@/storage/meta';
import type { MatchEvent, MatchLog } from '@/ui/match-log';

describe('段位ロード', () => {
  it('段は 村 → 町 → 市 → 都 → 王都 の順で、王都が最上段', () => {
    expect([...new Set(STEPS.map((s) => s.tierName))]).toEqual(['村', '町', '市', '都', '王都']);
    expect(stepInfo(0).label).toBe('村 1');
    expect(stepInfo(TOP_STEP).label).toBe('王都');
    expect(stepInfo(TOP_STEP).isTop).toBe(true);
  });

  it('難易度が高いほど勝ちの星が多い', () => {
    expect(winStarsFor('easy', 1).stars).toBe(1);
    expect(winStarsFor('normal', 1).stars).toBe(3);
    expect(winStarsFor('hard', 1).stars).toBe(4);
  });

  it('3 連勝目から星が倍になる', () => {
    expect(winStarsFor('normal', 2)).toEqual({ stars: 3, bonus: false });
    expect(winStarsFor('normal', 3)).toEqual({ stars: 6, bonus: true });
    expect(winStarsFor('hard', 7)).toEqual({ stars: 8, bonus: true });
  });

  it('星が貯まると位が上がり、余りは持ち越す（複数段も一度に上がる）', () => {
    const c = applyMatch({ step: 0, stars: 2 }, 'win', 'normal', 1);
    expect(c.after).toEqual({ step: 1, stars: 2 });
    expect(c.promoted).toBe(true);
    expect(c.tierUp).toBe(false);
    // 村 3（あと 1）で 6 星: 村3 → 町1（残り 5）→ 町2（残り 1）
    const d = applyMatch({ step: 2, stars: 2 }, 'win', 'hard', 5);
    expect(d.after).toEqual({ step: 4, stars: 3 });
    expect(d.tierUp).toBe(true);
  });

  it('負けると星が 1 つ減り、星 0 なら 1 つ前の位へ下がる', () => {
    expect(applyMatch({ step: 4, stars: 2 }, 'lose', 'hard', 0).after).toEqual({ step: 4, stars: 1 });
    const c = applyMatch({ step: 4, stars: 0 }, 'lose', 'hard', 0);
    expect(c.after).toEqual({ step: 3, stars: stepInfo(3).need - 1 });
    expect(c.demoted).toBe(true);
    expect(c.floor).toBe(false);
    expect(c.delta).toBe(-1);
  });

  it('段の床（最初の位・星 0）からは落ちない', () => {
    const townFloor = floorOf(4);
    expect(stepInfo(townFloor).label).toBe('町 1');
    const c = applyMatch({ step: townFloor, stars: 0 }, 'lose', 'normal', 0);
    expect(c.after).toEqual({ step: townFloor, stars: 0 });
    expect(c.floor).toBe(true);
    expect(c.delta).toBe(0);
    expect(applyMatch({ step: 0, stars: 0 }, 'lose', 'easy', 0).floor).toBe(true);
  });

  it('王都では星が上限なく積み上がる。引き分けは動かない', () => {
    expect(applyMatch({ step: TOP_STEP, stars: 30 }, 'win', 'hard', 1).after).toEqual({ step: TOP_STEP, stars: 34 });
    expect(applyMatch({ step: TOP_STEP, stars: 0 }, 'lose', 'hard', 0).floor).toBe(true);
    const d = applyMatch({ step: 5, stars: 1 }, 'draw', 'hard', 4);
    expect(d.after).toEqual({ step: 5, stars: 1 });
    expect(d.delta).toBe(0);
  });

  it('負けで 1 つ減る数と、段ごとの星の数は 1 か所の定数から来る', () => {
    expect(RANK_RULES.lossStars).toBe(1);
    expect(STEPS.filter((s) => s.tierName === '町').every((s) => s.need === 4)).toBe(true);
  });
});

// ---------------------------------------------------------------------------

function ctx(over: Partial<AchievementContext> & { events?: MatchEvent[]; vp?: MatchLog['vp'] } = {}): AchievementContext {
  const final: GameState = over.final ?? createGame(1, DEFAULT_BALANCE);
  return {
    log: { events: over.events ?? [], vp: over.vp ?? [{ turn: 1, you: 0, cpu: 0 }] },
    final,
    outcome: over.outcome ?? 'win',
    difficulty: over.difficulty ?? 'normal',
    streak: over.streak ?? 1,
  };
}
const card = (c: CardId, turn = 1, actor: 'you' | 'cpu' = 'you'): MatchEvent => ({ kind: 'card', turn, actor, card: c });
const slot = (kind: 'build' | 'upgrade' | 'acquire', turn: number, festival = false, actor: 'you' | 'cpu' = 'you'): MatchEvent => ({
  kind,
  turn,
  actor,
  slotId: 0,
  buildingId: 'tradingHouse',
  festival,
  swing: 0,
  marginAfter: 0,
  marginBefore: 0,
});

describe('実績', () => {
  it('10〜15 個あり、id が重ならない', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(10);
    expect(ACHIEVEMENTS.length).toBeLessThanOrEqual(15);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it('勝ち・難易度・連勝', () => {
    expect(achievementsMet(ctx({ difficulty: 'easy' }))).toEqual(['firstWin']);
    expect(achievementsMet(ctx({ difficulty: 'hard', streak: 3 }))).toEqual(['firstWin', 'normalWin', 'hardWin', 'streak3']);
    expect(achievementsMet(ctx({ outcome: 'lose', difficulty: 'hard' }))).toEqual([]);
  });

  it('封鎖者・伝令は相手が使っても数えない。衛兵は 2 回', () => {
    const met = (events: MatchEvent[]) => achievementsMet(ctx({ events }));
    expect(met([card('blockader', 1, 'cpu')])).not.toContain('blockadeWin');
    expect(met([card('blockader')])).toContain('blockadeWin');
    expect(met([card('herald')])).toContain('heraldWin');
    expect(met([card('guard')])).not.toContain('guardWin');
    expect(met([card('guard', 1), card('guard', 3)])).toContain('guardWin');
  });

  it('買収者を使ったターンの買収（勝ち負けは問わない）', () => {
    const lose = (events: MatchEvent[]) => achievementsMet(ctx({ outcome: 'lose', events }));
    expect(lose([card('spy', 3), slot('acquire', 3)])).toContain('spyAcquire');
    expect(lose([card('spy', 3), slot('acquire', 5)])).not.toContain('spyAcquire');
  });

  it('買収 3 件・祝祭のターンに 2 回・7 種類', () => {
    expect(achievementsMet(ctx({ events: [slot('acquire', 1), slot('acquire', 3), slot('acquire', 5)] }))).toContain('acquire3');
    expect(achievementsMet(ctx({ events: [slot('acquire', 1), slot('acquire', 3), slot('acquire', 5, false, 'cpu')] }))).not.toContain('acquire3');
    expect(achievementsMet(ctx({ outcome: 'lose', events: [slot('build', 5, true), slot('upgrade', 5, true)] }))).toContain('festival2');
    expect(achievementsMet(ctx({ events: [slot('build', 5, true), slot('build', 7, true)] }))).not.toContain('festival2');
    const seven: CardId[] = ['miner', 'banker', 'architect', 'herald', 'festival', 'guard', 'usurer'];
    expect(achievementsMet(ctx({ events: seven.map((c, i) => card(c, i)) }))).toContain('variety');
    expect(achievementsMet(ctx({ events: seven.slice(1).map((c, i) => card(c, i)) }))).not.toContain('variety');
  });

  it('Lv2 を 4 件持って勝つ（終局の盤面で数える）', () => {
    const final = createGame(1, DEFAULT_BALANCE);
    final.market.slice(0, 4).forEach((s) => Object.assign(s, { owner: 'you', level: 2 }));
    expect(achievementsMet(ctx({ final }))).toContain('level2x4');
    final.market[0]!.owner = 'cpu';
    expect(achievementsMet(ctx({ final }))).not.toContain('level2x4');
  });

  it('3 つの地区の称号を全部持って勝つ（終局の称号で数える）', () => {
    const final = createGame(1, DEFAULT_BALANCE);
    final.titles = ['you', 'you', 'you'];
    expect(achievementsMet(ctx({ final }))).toContain('allTitles');
    expect(achievementsMet(ctx({ final, outcome: 'lose' }))).not.toContain('allTitles');
    final.titles = ['you', 'cpu', 'you'];
    expect(achievementsMet(ctx({ final }))).not.toContain('allTitles');
  });

  it('10 VP 以上離されてからの逆転勝ち', () => {
    const vp = [
      { turn: 1, you: 0, cpu: 0 },
      { turn: 6, you: 2, cpu: 12 },
      { turn: 18, you: 30, cpu: 25 },
    ];
    expect(achievementsMet(ctx({ vp }))).toContain('comeback');
    expect(achievementsMet(ctx({ vp: vp.map((p) => ({ ...p, cpu: Math.min(p.cpu, p.you + 9) })) }))).not.toContain('comeback');
  });

  it('既に持っている実績は新しく出さない', () => {
    expect(newAchievements(ctx({ difficulty: 'hard' }), ['firstWin', 'hardWin'])).toEqual(['normalWin']);
  });
});

// ---------------------------------------------------------------------------

describe('段位と実績の保存', () => {
  beforeEach(() => localStorage.clear());

  it('試合の結果を反映して保存し、読み戻せる', () => {
    const s = settleMatch(emptyMeta(), ctx({ difficulty: 'hard' }));
    expect(s.rank.after).toEqual({ step: 1, stars: 1 });
    expect(s.unlocked).toEqual(['firstWin', 'normalWin', 'hardWin']);
    expect(s.meta.bestStep).toBe(1);
    saveMeta(s.meta);
    expect(loadMeta()).toEqual(s.meta);
    // 下がっても最高位は残る
    const t = settleMatch({ ...s.meta, rank: { step: 1, stars: 0 } }, ctx({ outcome: 'lose' }));
    expect(t.meta.rank).toEqual({ step: 0, stars: 2 });
    expect(t.meta.bestStep).toBe(1);
    expect(t.unlocked).toEqual([]);
  });

  it.each([
    null,
    '{',
    'null',
    '42',
    '[]',
    '"x"',
    JSON.stringify({ rank: 'a', achievements: 'b' }),
    JSON.stringify({ rank: { step: -1, stars: NaN }, bestStep: -5, achievements: [1, null] }),
  ])('壊れたデータ %s でも落ちず、0 に戻す', (raw) => {
    expect(parseMeta(raw)).toEqual(emptyMeta());
  });

  it('範囲外の値は丸め、知らない実績は捨てる', () => {
    const m = parseMeta(JSON.stringify({ rank: { step: 999, stars: 5 }, bestStep: 3, achievements: ['firstWin', 'gone', 'firstWin'] }));
    expect(m.rank).toEqual({ step: TOP_STEP, stars: 5 });
    expect(m.bestStep).toBe(TOP_STEP);
    expect(m.achievements).toEqual(['firstWin']);
    expect(parseMeta(JSON.stringify({ rank: { step: 0, stars: 99 } })).rank).toEqual({ step: 0, stars: stepInfo(0).need - 1 });
  });

  it('localStorage が使えなくても落ちない', () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(loadMeta()).toEqual(emptyMeta());
    } finally {
      Storage.prototype.getItem = orig;
    }
  });
});
