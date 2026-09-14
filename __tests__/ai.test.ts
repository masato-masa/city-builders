import { describe, expect, it } from 'vitest';

import { chooseAction, optionsFor, playTurn } from '@/ai/choose';
import { DEFAULT_WEIGHTS, evaluateState } from '@/ai/evaluate';
import { DEFAULT_BALANCE } from '@/game/balance';
import { countBuilding, handOf, opponentOf, ownedSlots, scoreOf } from '@/game/selectors';
import { legalActions, reduce } from '@/game/reducer';
import { createRng } from '@/game/rng';
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

describe('重み付き評価関数', () => {
  // 重み付き化する前の評価関数をそのまま再現したもの。opponentStuck の項だけ無い。
  function legacyEvaluateState(state: ReturnType<typeof createGame>, player: 'you' | 'cpu') {
    const balance = DEFAULT_BALANCE;
    const foe = opponentOf(player);
    const p = state.players[player];
    const late = Math.min(1, state.turn / (balance.maxTurnsPerPlayer * 2));

    const incomePerTurn =
      balance.baseIncome +
      countBuilding(state, player, 'tradingHouse') * balance.tradingHouseIncome;

    let threat = 0;
    for (const slot of state.market) {
      if (slot.owner !== null) continue;
      const cost = balance.buildings[slot.buildingId].cost;
      if (state.players[foe].coins >= cost) {
        threat += balance.buildings[slot.buildingId].vp;
      }
    }

    const stuck = handOf(state, player, balance).filter(
      (c) => p.coins < balance.cards[c].cost,
    ).length;

    return (
      scoreOf(state, player, balance) * DEFAULT_WEIGHTS.vp * (0.5 + late) +
      scoreOf(state, foe, balance) * DEFAULT_WEIGHTS.opponentVp * (0.5 + late) +
      p.coins * DEFAULT_WEIGHTS.coin +
      state.players[foe].coins * DEFAULT_WEIGHTS.opponentCoin +
      stuck * DEFAULT_WEIGHTS.stuck +
      p.pendingIncome.length * DEFAULT_WEIGHTS.pendingIncome * 4 +
      incomePerTurn * DEFAULT_WEIGHTS.incomePerTurn * (1 - late) +
      ownedSlots(state, player).length * 2 +
      threat * DEFAULT_WEIGHTS.threat * (1 - late)
    );
  }

  it('既定の重みで呼んだ結果は、opponentStuck の項を除けば変更前と完全に一致する', () => {
    for (let seed = 0; seed < 20; seed++) {
      let g = createGame(seed);
      const rng = createRng(seed + 500);
      for (let i = 0; i < 5 && g.phase === 'playing'; i++) {
        g = playTurn(g, 'normal', rng, DEFAULT_BALANCE);
      }
      for (const player of ['you', 'cpu'] as const) {
        const foe = opponentOf(player);
        const opponentStuckCount = handOf(g, foe, DEFAULT_BALANCE).filter(
          (c) => g.players[foe].coins < DEFAULT_BALANCE.cards[c].cost,
        ).length;
        const withDefaults = evaluateState(g, player, DEFAULT_BALANCE, DEFAULT_WEIGHTS);
        const opponentStuckTerm = opponentStuckCount * DEFAULT_WEIGHTS.opponentStuck;
        expect(withDefaults - opponentStuckTerm).toBeCloseTo(legacyEvaluateState(g, player), 9);
      }
    }
  });

  it('weights を省略しても DEFAULT_WEIGHTS を使う', () => {
    const g = createGame(3);
    expect(evaluateState(g, 'you', DEFAULT_BALANCE)).toBe(
      evaluateState(g, 'you', DEFAULT_BALANCE, DEFAULT_WEIGHTS),
    );
  });
});

describe('行動選択', () => {
  it('必ず合法手を返す', () => {
    const g = reduce(createGame(11), { type: 'startTurn' }, DEFAULT_BALANCE);
    const action = chooseAction(g, 'normal', createRng(1), DEFAULT_BALANCE);
    expect(legalActions(g, DEFAULT_BALANCE)).toContainEqual(action);
  });

  it('同じ状態と同じシードからは同じ手を返す', () => {
    const g = createGame(11);
    const a = chooseAction(g, 'normal', createRng(7), DEFAULT_BALANCE);
    const b = chooseAction(g, 'normal', createRng(7), DEFAULT_BALANCE);
    expect(a).toEqual(b);
  });
});

describe('AiOptions への分解', () => {
  it('optionsFor は難易度ごとの値をそのまま写している', () => {
    expect(optionsFor('easy')).toEqual({
      noise: 45,
      harassRate: 0.25,
      lookahead: false,
      weights: DEFAULT_WEIGHTS,
    });
    expect(optionsFor('normal')).toEqual({
      noise: 3,
      harassRate: 0.8,
      lookahead: false,
      weights: DEFAULT_WEIGHTS,
    });
    expect(optionsFor('hard')).toEqual({
      noise: 0,
      harassRate: 1,
      lookahead: true,
      weights: DEFAULT_WEIGHTS,
    });
  });

  it('Difficulty を渡しても optionsFor(difficulty) を渡しても指し手は完全一致する（20 試合ぶん）', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (let seed = 0; seed < 20; seed++) {
        let byName = createGame(seed);
        let byOptions = createGame(seed);
        const rngA = createRng(seed + 9000);
        const rngB = createRng(seed + 9000);
        let guard = 0;
        while (byName.phase === 'playing' && guard < 200) {
          byName = playTurn(byName, difficulty, rngA, DEFAULT_BALANCE);
          byOptions = playTurn(byOptions, optionsFor(difficulty), rngB, DEFAULT_BALANCE);
          guard++;
        }
        expect(byOptions).toEqual(byName);
      }
    }
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
