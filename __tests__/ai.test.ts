import { describe, expect, it } from 'vitest';

import { chooseAction, optionsFor, playTurn } from '@/ai/choose';
import { DEFAULT_PROFILE, DEFAULT_WEIGHTS, evaluateState, weightsAt } from '@/ai/evaluate';
import { DEFAULT_BALANCE } from '@/game/balance';
import { handOf, scoreOf } from '@/game/selectors';
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
  // カードの入れ替えで評価式そのものを作り直した（threat を廃止し reach 系の項を足した）ので、
  // 「作り替え前の式と完全一致するか」を確かめていた旧テストはもう成立しない。
  // 代わりに、新しく足した項それぞれが狙いどおりの向きに効くかを 1 つずつ確かめる。

  it('weights を省略しても DEFAULT_WEIGHTS を使う', () => {
    const g = createGame(3);
    expect(evaluateState(g, 'you', DEFAULT_BALANCE)).toBe(
      evaluateState(g, 'you', DEFAULT_BALANCE, DEFAULT_WEIGHTS),
    );
  });

  it('reach: いま買える区画があるほうが評価が高い', () => {
    const cheapest = Object.values(DEFAULT_BALANCE.buildings).reduce((a, b) =>
      a.cost < b.cost ? a : b,
    );
    const affordable = createGame(3);
    affordable.players.you.coins = cheapest.cost;
    const notAffordable = createGame(3);
    notAffordable.players.you.coins = cheapest.cost - 1;
    expect(evaluateState(affordable, 'you', DEFAULT_BALANCE)).toBeGreaterThan(
      evaluateState(notAffordable, 'you', DEFAULT_BALANCE),
    );
  });

  it('opponentReach: 相手がいま買える区画があるほうが評価が低い', () => {
    const cheapest = Object.values(DEFAULT_BALANCE.buildings).reduce((a, b) =>
      a.cost < b.cost ? a : b,
    );
    const foeAffordable = createGame(3);
    foeAffordable.players.cpu.coins = cheapest.cost;
    const foeNotAffordable = createGame(3);
    foeNotAffordable.players.cpu.coins = cheapest.cost - 1;
    expect(evaluateState(foeAffordable, 'you', DEFAULT_BALANCE)).toBeLessThan(
      evaluateState(foeNotAffordable, 'you', DEFAULT_BALANCE),
    );
  });

  it('opponentIncome: 相手の 1 ターン収入が高いほど評価が低い', () => {
    const g = createGame(3);
    g.market.filter((s) => s.buildingId === 'tradingHouse').forEach((s) => (s.owner = 'cpu'));
    const noHouses = createGame(3);
    expect(evaluateState(g, 'you', DEFAULT_BALANCE)).toBeLessThan(
      evaluateState(noHouses, 'you', DEFAULT_BALANCE),
    );
  });

  it('debt: 自分に高利貸の借りが残っているほど評価が低い', () => {
    const indebted = createGame(3);
    indebted.players.you.pendingDebt = DEFAULT_BALANCE.usurerDebt;
    const clean = createGame(3);
    expect(evaluateState(indebted, 'you', DEFAULT_BALANCE)).toBeLessThan(
      evaluateState(clean, 'you', DEFAULT_BALANCE),
    );
  });

  it('guarded: 衛兵が張れていて、かつ守るものが多いほど評価が高い', () => {
    const guardedRich = createGame(3);
    guardedRich.players.you.guarded = true;
    guardedRich.players.you.coins = 30;
    const unguardedRich = createGame(3);
    unguardedRich.players.you.guarded = false;
    unguardedRich.players.you.coins = 30;
    expect(evaluateState(guardedRich, 'you', DEFAULT_BALANCE)).toBeGreaterThan(
      evaluateState(unguardedRich, 'you', DEFAULT_BALANCE),
    );
  });

  it('opponentBound: 相手が買収者を受けているほうが評価が高い', () => {
    const bound = createGame(3);
    bound.players.cpu.boundCard = 'miner';
    const notBound = createGame(3);
    expect(evaluateState(bound, 'you', DEFAULT_BALANCE)).toBeGreaterThan(
      evaluateState(notBound, 'you', DEFAULT_BALANCE),
    );
  });

  it('stuck: 買収者に縛られたカードがあると評価が低い', () => {
    const g = createGame(3);
    g.players.you.coins = 100;
    const bound = structuredClone(g);
    bound.players.you.boundCard = handOf(g, 'you', DEFAULT_BALANCE)[0]!;
    expect(evaluateState(bound, 'you', DEFAULT_BALANCE)).toBeLessThan(
      evaluateState(g, 'you', DEFAULT_BALANCE),
    );
  });
});

describe('Profile と weightsAt', () => {
  it('DEFAULT_PROFILE は early = late = DEFAULT_WEIGHTS', () => {
    expect(DEFAULT_PROFILE).toEqual({ early: DEFAULT_WEIGHTS, late: DEFAULT_WEIGHTS });
  });

  it('early = late の Profile は、進行度によらず同じ Weights を返す', () => {
    const start = createGame(3);
    const late = createGame(3);
    late.turn = DEFAULT_BALANCE.maxTurnsPerPlayer * 2;
    expect(weightsAt(DEFAULT_PROFILE, start, DEFAULT_BALANCE)).toEqual(DEFAULT_WEIGHTS);
    expect(weightsAt(DEFAULT_PROFILE, late, DEFAULT_BALANCE)).toEqual(DEFAULT_WEIGHTS);
  });

  it('序盤（turn=0）では early、終盤（turn が上限）では late をそのまま返す', () => {
    const profile = { early: { ...DEFAULT_WEIGHTS, vp: 1 }, late: { ...DEFAULT_WEIGHTS, vp: 99 } };
    const early = createGame(3);
    early.turn = 0;
    const late = createGame(3);
    late.turn = DEFAULT_BALANCE.maxTurnsPerPlayer * 2;
    expect(weightsAt(profile, early, DEFAULT_BALANCE).vp).toBe(1);
    expect(weightsAt(profile, late, DEFAULT_BALANCE).vp).toBe(99);
  });

  it('中間の進行度では early と late を線形補間する', () => {
    const profile = { early: { ...DEFAULT_WEIGHTS, vp: 0 }, late: { ...DEFAULT_WEIGHTS, vp: 10 } };
    const half = createGame(3);
    half.turn = DEFAULT_BALANCE.maxTurnsPerPlayer; // lateness = 0.5
    expect(weightsAt(profile, half, DEFAULT_BALANCE).vp).toBeCloseTo(5);
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
      profile: DEFAULT_PROFILE,
    });
    expect(optionsFor('normal')).toEqual({
      noise: 3,
      harassRate: 0.8,
      lookahead: false,
      profile: DEFAULT_PROFILE,
    });
    expect(optionsFor('hard')).toEqual({
      noise: 0,
      harassRate: 1,
      lookahead: true,
      profile: DEFAULT_PROFILE,
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
