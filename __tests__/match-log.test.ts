import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { createRng } from '@/game/rng';
import { scoreOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { GameState, PlayerId } from '@/game/types';
import { playTurnSteps } from '@/ui/cpu-turn';
import {
  buildReview,
  createMatchLog,
  decisiveMoment,
  marginLine,
  type MatchLog,
  ownTurnOf,
  recordTransition,
  streakLine,
  vpChartPaths,
} from '@/ui/match-log';

const B = DEFAULT_BALANCE;
const NAMES = { you: 'あなた', cpu: 'CPU' };

/** 区画の持ち主・レベルだけを書き換えた次の状態（reducer を通さない差分の素材）。 */
function withSlot(s: GameState, slotId: number, owner: PlayerId | null, level = 1, turn = s.turn): GameState {
  const next = structuredClone(s);
  next.turn = turn;
  next.market[slotId] = { ...next.market[slotId]!, owner, level };
  return next;
}

/** 大聖堂でない区画を n 個選ぶ（VP が一定になるように）。 */
function plainSlots(s: GameState, n: number): number[] {
  return s.market.filter((m) => m.buildingId !== 'cathedral').slice(0, n).map((m) => m.slotId);
}

describe('recordTransition（差分から記録）', () => {
  it('建設・アップグレード・買収を見分け、VP の推移を手番ごとに残す', () => {
    const s0 = createGame(1, B);
    const [a, b] = plainSlots(s0, 2) as [number, number];
    let log = createMatchLog(s0, B);
    const s1 = withSlot(s0, a, 'you', 1, 1);
    log = recordTransition(log, s0, s1, B);
    const s2 = withSlot(s1, b, 'cpu', 1, 2);
    log = recordTransition(log, s1, s2, B);
    const s3 = withSlot(s2, a, 'you', 2, 3);
    log = recordTransition(log, s2, s3, B);
    const s4 = withSlot(s3, a, 'cpu', 2, 4);
    log = recordTransition(log, s3, s4, B);

    expect(log.events.map((e) => [e.kind, e.actor])).toEqual([
      ['build', 'you'],
      ['build', 'cpu'],
      ['upgrade', 'you'],
      ['acquire', 'cpu'],
    ]);
    expect(log.vp.map((p) => p.turn)).toEqual([1, 2, 3, 4]);
    expect(log.vp[3]).toEqual({ turn: 4, you: scoreOf(s4, 'you', B), cpu: scoreOf(s4, 'cpu', B) });
    // 買収は自分の VP が増え、相手の VP が減るので、建設より大きく差が動く。
    const acquire = log.events[3]!;
    const build = log.events[1]!;
    if (acquire.kind === 'card' || build.kind === 'card') throw new Error('unexpected');
    expect(acquire.swing).toBeGreaterThan(build.swing);
  });

  it('同じ状態なら何も足さない（StrictMode で 2 回呼ばれても同じ）', () => {
    const s0 = createGame(2, B);
    const log = createMatchLog(s0, B);
    expect(recordTransition(log, s0, s0, B)).toBe(log);
  });

  it('使ったカードを usedThisTurn の伸びから拾う', () => {
    const s0 = createGame(3, B);
    const s1 = structuredClone(s0);
    s1.players.you.usedThisTurn = ['miner', 'banker'];
    const log = recordTransition(createMatchLog(s0, B), s0, s1, B);
    expect(log.events).toEqual([
      { kind: 'card', turn: s0.turn, actor: 'you', card: 'miner' },
      { kind: 'card', turn: s0.turn, actor: 'you', card: 'banker' },
    ]);
  });

  it('本物の試合（CPU 同士、画面と同じ 1 手ずつ）を最後まで記録しても、最後の VP が終局と一致する', () => {
    const rng = createRng(42);
    let s = createGame(42, B);
    let log = createMatchLog(s, B);
    for (let i = 0; i < 200 && s.phase === 'playing'; i++) {
      for (const step of playTurnSteps(s, 'normal', rng, B)) {
        log = recordTransition(log, s, step.state, B);
        s = step.state;
      }
    }
    expect(s.phase).toBe('finished');
    const last = log.vp[log.vp.length - 1]!;
    expect(last.you).toBe(scoreOf(s, 'you', B));
    expect(last.cpu).toBe(scoreOf(s, 'cpu', B));
    expect(log.events.some((e) => e.kind === 'build')).toBe(true);
    expect(log.events.some((e) => e.kind === 'card')).toBe(true);
    const review = buildReview(log, s, B, NAMES, 'you', null);
    expect(review.margin.length).toBeGreaterThan(0);
    expect(review.moment).not.toBeNull();
  });
});

describe('marginLine（差の 1 行）', () => {
  const coins = { you: 3, cpu: 3 };
  it('勝ち・負け・引き分け', () => {
    expect(marginLine('you', { you: 12, cpu: 9 }, coins, NAMES, 'you')).toBe('3 VP 差で勝利');
    expect(marginLine('cpu', { you: 9, cpu: 12 }, coins, NAMES, 'you')).toBe('あと 4 VP で勝てた');
    expect(marginLine('draw', { you: 9, cpu: 9 }, coins, NAMES, 'you')).toBe('VP もコインも同じ。あと 1 VP で勝てた');
  });
  it('VP 同点でコイン差のとき', () => {
    expect(marginLine('cpu', { you: 9, cpu: 9 }, { you: 2, cpu: 5 }, NAMES, 'you')).toBe(
      'VP は同点、コイン 2 対 5 で負け。あと 1 VP で勝てた',
    );
  });
  it('2 人対戦は名前で言う', () => {
    expect(marginLine('cpu', { you: 7, cpu: 10 }, coins, { you: 'あお', cpu: 'あか' }, null)).toBe('あかが 3 VP 差で勝利');
  });
});

describe('decisiveMoment（勝敗を分けた 1 行）', () => {
  function slotEvent(
    turn: number,
    actor: PlayerId,
    kind: 'build' | 'upgrade' | 'acquire',
    marginBefore: number,
    marginAfter: number,
    festival = false,
  ) {
    return {
      kind,
      turn,
      actor,
      slotId: 0,
      buildingId: 'fortress' as const,
      festival,
      swing: marginAfter - marginBefore,
      marginBefore,
      marginAfter,
    };
  }
  const log = (events: MatchLog['events']): MatchLog => ({ events, vp: [] });

  it('負けていた側が前に出て逃げ切ったら「逆転」', () => {
    const m = decisiveMoment(
      log([
        slotEvent(2, 'cpu', 'build', 0, 4),
        slotEvent(23, 'you', 'acquire', -4, 3),
        slotEvent(24, 'cpu', 'build', -3, -1),
      ]),
      'you',
      NAMES,
    );
    expect(m).toEqual({ text: 'あなたの 12 ターン目、城塞の買収で逆転', turn: 23, actor: 'you' });
  });

  it('ずっと前にいたなら、一番大きく差を広げた出来事', () => {
    const m = decisiveMoment(
      log([slotEvent(1, 'you', 'build', 0, 2), slotEvent(5, 'you', 'upgrade', 2, 7), slotEvent(6, 'cpu', 'build', -7, -5)]),
      'you',
      NAMES,
    );
    expect(m?.text).toBe('あなたの 3 ターン目に城塞をアップグレードした（差 +5 VP）');
  });

  it('祝祭のターンにまとめて建てたら、その手番をまとめて言う', () => {
    const m = decisiveMoment(
      log([
        slotEvent(7, 'cpu', 'build', 0, 3, true),
        slotEvent(7, 'cpu', 'build', 3, 6, true),
        slotEvent(7, 'cpu', 'build', 6, 9, true),
      ]),
      'cpu',
      NAMES,
    );
    expect(m?.text).toBe('CPU が祝祭のターンに 3 件建てた（差 +9 VP）');
    expect(m?.turn).toBe(7);
  });

  it('建設と買収が混ざった手番は中身を並べる', () => {
    const m = decisiveMoment(
      log([slotEvent(18, 'cpu', 'build', 0, 2), slotEvent(18, 'cpu', 'acquire', 2, 6)]),
      'cpu',
      NAMES,
    );
    expect(m?.text).toBe('CPU の 9 ターン目に建設 1・買収 1（差 +6 VP）');
  });

  it('記録が無ければ null', () => {
    expect(decisiveMoment(log([]), 'you', NAMES)).toBeNull();
  });
});

describe('streakLine・ownTurnOf・vpChartPaths', () => {
  it('連勝の文言', () => {
    expect(streakLine('win', 1, 0)).toBeNull();
    expect(streakLine('win', 3, 2)).toBe('3 連勝中');
    expect(streakLine('lose', 0, 4)).toBe('4 連勝でストップ');
    expect(streakLine('lose', 0, 1)).toBeNull();
    expect(streakLine('draw', 2, 2)).toBe('2 連勝のまま');
  });

  it('手番の数え方は先手・後手どちらでも ceil(turn / 2)', () => {
    expect([1, 2, 3, 4, 39, 40].map(ownTurnOf)).toEqual([1, 1, 2, 2, 20, 20]);
  });

  it('折れ線は階段状で、範囲に収まる', () => {
    const p = vpChartPaths(
      [
        { turn: 1, you: 0, cpu: 0 },
        { turn: 2, you: 0, cpu: 3 },
        { turn: 3, you: 6, cpu: 3 },
      ],
      100,
      50,
    );
    expect(p.you).toBe('M0 50H50H100V0');
    expect(p.cpu).toBe('M0 50H50V25H100');
    expect(p.maxVp).toBe(6);
  });

  it('点が 1 つ・VP がすべて 0 でも NaN を出さない', () => {
    const p = vpChartPaths([{ turn: 1, you: 0, cpu: 0 }], 100, 50);
    expect(p.you).toBe('M0 50');
  });
});
