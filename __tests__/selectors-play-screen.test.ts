import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { roadUsesRemaining, turnsRemaining } from '@/game/selectors';
import { createGame } from '@/game/setup';

describe('turnsRemaining', () => {
  it('初手は maxTurnsPerPlayer * 2 手ぶん残っている', () => {
    const g = createGame(1);
    expect(turnsRemaining(g, DEFAULT_BALANCE)).toBe(DEFAULT_BALANCE.maxTurnsPerPlayer * 2);
  });

  it('ターンが進むほど減る', () => {
    const g = createGame(1);
    g.turn = 5;
    expect(turnsRemaining(g, DEFAULT_BALANCE)).toBe(DEFAULT_BALANCE.maxTurnsPerPlayer * 2 - 4);
  });

  it('終了していれば 0', () => {
    const g = createGame(1);
    g.phase = 'finished';
    expect(turnsRemaining(g, DEFAULT_BALANCE)).toBe(0);
  });

  it('負の値にはならない', () => {
    const g = createGame(1);
    g.turn = DEFAULT_BALANCE.maxTurnsPerPlayer * 2 + 100;
    expect(turnsRemaining(g, DEFAULT_BALANCE)).toBe(0);
  });
});

describe('roadUsesRemaining', () => {
  it('通常時は 1 回', () => {
    const g = createGame(1);
    g.current = 'you';
    expect(roadUsesRemaining(g, 'you', DEFAULT_BALANCE)).toBe(1);
  });

  it('使うと減る', () => {
    const g = createGame(1);
    g.players.you.roadUsesThisTurn = 1;
    expect(roadUsesRemaining(g, 'you', DEFAULT_BALANCE)).toBe(0);
  });

  it('祝祭中は festivalMultiplier 回まで', () => {
    const g = createGame(1);
    g.players.you.festivalActive = true;
    expect(roadUsesRemaining(g, 'you', DEFAULT_BALANCE)).toBe(DEFAULT_BALANCE.festivalMultiplier);
  });

  it('使い切っていれば 0 を割らない', () => {
    const g = createGame(1);
    g.players.you.roadUsesThisTurn = 99;
    expect(roadUsesRemaining(g, 'you', DEFAULT_BALANCE)).toBe(0);
  });
});
