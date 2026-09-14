import { describe, expect, it } from 'vitest';

import { chooseAction, playTurn } from '@/ai/choose';
import { evaluateState } from '@/ai/evaluate';
import { DEFAULT_BALANCE } from '@/game/balance';
import { createRng } from '@/game/rng';
import { scoreOf } from '@/game/selectors';
import { createGame } from '@/game/setup';

describe('評価関数', () => {
  it('VP が高いほど評価が高い', () => {
    const poor = createGame(3);
    const rich = createGame(3);
    rich.market.find((s) => s.buildingId === 'fortress')!.owner = 'you';
    expect(evaluateState(rich, 'you', DEFAULT_BALANCE)).toBeGreaterThan(
      evaluateState(poor, 'you', DEFAULT_BALANCE),
    );
  });

  it('コインが多いほど評価が高い', () => {
    const a = createGame(3);
    const b = createGame(3);
    b.players.you.coins += 20;
    expect(evaluateState(b, 'you', DEFAULT_BALANCE)).toBeGreaterThan(
      evaluateState(a, 'you', DEFAULT_BALANCE),
    );
  });
});

describe('行動選択', () => {
  it('必ず合法手を返す', () => {
    const g = createGame(11);
    const action = chooseAction(g, 'normal', createRng(1), DEFAULT_BALANCE);
    expect(action).toBeDefined();
  });

  it('同じ状態と同じシードからは同じ手を返す', () => {
    const g = createGame(11);
    const a = chooseAction(g, 'normal', createRng(7), DEFAULT_BALANCE);
    const b = chooseAction(g, 'normal', createRng(7), DEFAULT_BALANCE);
    expect(a).toEqual(b);
  });
});

describe('1 ターンを通す', () => {
  it('手番が相手に移る', () => {
    const g = createGame(11);
    const after = playTurn(g, 'normal', createRng(1), DEFAULT_BALANCE);
    expect(after.current).not.toBe(g.current);
  });

  it('試合が必ず終わる', () => {
    let g = createGame(11);
    const rng = createRng(1);
    let guard = 0;
    while (g.phase === 'playing' && guard < 200) {
      g = playTurn(g, 'normal', rng, DEFAULT_BALANCE);
      guard++;
    }
    expect(g.phase).toBe('finished');
    expect(guard).toBeLessThan(200);
  });

  it('ふつうは、やさしいより強い', () => {
    let normalWins = 0;
    for (let seed = 0; seed < 40; seed++) {
      let g = createGame(seed);
      const rng = createRng(seed + 1000);
      // 'you' を normal、'cpu' を easy として回す
      let guard = 0;
      while (g.phase === 'playing' && guard < 200) {
        g = playTurn(g, g.current === 'you' ? 'normal' : 'easy', rng, DEFAULT_BALANCE);
        guard++;
      }
      if (scoreOf(g, 'you') > scoreOf(g, 'cpu')) normalWins++;
    }
    expect(normalWins).toBeGreaterThan(20);
  });
});
