import { describe, expect, it } from 'vitest';

import { playTurn } from '@/ai/choose';
import { DEFAULT_BALANCE } from '@/game/balance';
import { reduce } from '@/game/reducer';
import { createRng } from '@/game/rng';
import { createGame } from '@/game/setup';
import { playTurnSteps } from '@/ui/cpu-turn';

describe('playTurnSteps', () => {
  it('1 手ずつ回しても、一気に進める playTurn と同じ最終状態になる', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const start = createGame(seed);
      start.current = 'you';
      const base = reduce(start, { type: 'endTurn' }, DEFAULT_BALANCE);
      expect(base.current).toBe('cpu');

      const viaPlayTurn = playTurn(base, 'normal', createRng(seed), DEFAULT_BALANCE);
      const steps = playTurnSteps(base, 'normal', createRng(seed), DEFAULT_BALANCE);

      expect(steps.length).toBeGreaterThan(0);
      expect(steps[steps.length - 1]!.state).toEqual(viaPlayTurn);
    }
  });

  it('最後のログは必ず「ターンを終えた」', () => {
    const base = reduce(createGame(7), { type: 'endTurn' }, DEFAULT_BALANCE);
    const steps = playTurnSteps(base, 'normal', createRng(7), DEFAULT_BALANCE);
    expect(steps[steps.length - 1]!.log).toBe('ターンを終えた');
  });

  it('何もできないターンでも、endTurn の 1 ステップだけは必ず出る', () => {
    // 高利貸（コスト 0）は必ず打てる札なので手札から外し、残りはコイン 2（baseIncome）
    // では届かない額にそろえる。建設費はどれも 7 以上なのでそもそも届かない。
    const base = createGame(9);
    base.current = 'cpu';
    base.turn = 3;
    base.players.cpu.coins = 0;
    base.players.cpu.deck = [
      'banker',
      'architect',
      'festival',
      'spy',
      'usurer',
      'herald',
      'miner',
      'guard',
      'taxman',
      'blockader',
    ];
    const steps = playTurnSteps(base, 'normal', createRng(9), DEFAULT_BALANCE);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.log).toBe('ターンを終えた');
  });

  it('各ステップの log は空文字にならない', () => {
    const base = reduce(createGame(11), { type: 'endTurn' }, DEFAULT_BALANCE);
    const steps = playTurnSteps(base, 'hard', createRng(11), DEFAULT_BALANCE);
    for (const step of steps) {
      expect(step.log.length).toBeGreaterThan(0);
    }
  });
});
