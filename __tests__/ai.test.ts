import { describe, expect, it } from 'vitest';

import { chooseAction, optionsFor, playTurn, type Difficulty } from '@/ai/choose';
import { DEFAULT_PROFILE, DEFAULT_WEIGHTS, evaluateState, weightsAt } from '@/ai/evaluate';
import { CPU_PROFILE } from '@/ai/profiles';
import { DEFAULT_BALANCE } from '@/game/balance';
import { acquireCostFor, winnerOf } from '@/game/selectors';
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

  // 衛兵の価値は、買収を導入してから「相手に奪われうる物件（exposed）を守る」で測る。
  // 一律の加点（guarded 重み）は 0 にした（card-value で衛兵を禁止したほうが勝っていたため）。
  it('guarded: 相手が買収できる物件を持っているとき、衛兵が張れているほうが評価が高い', () => {
    const own = (g: ReturnType<typeof createGame>) => {
      const wall = g.market.find((s) => s.buildingId === 'wall')!;
      wall.owner = 'you';
      wall.paid = 10;
      g.players.cpu.coins = 30;
      return g;
    };
    const guardedRich = own(createGame(3));
    guardedRich.players.you.guarded = true;
    const unguardedRich = own(createGame(3));
    unguardedRich.players.you.guarded = false;
    expect(evaluateState(guardedRich, 'you', DEFAULT_BALANCE)).toBeGreaterThan(
      evaluateState(unguardedRich, 'you', DEFAULT_BALANCE),
    );
  });

  it('reach: 買収者の割引で相手の物件に手が届くと評価が上がる', () => {
    const g = createGame(3);
    const fortress = g.market.find((s) => s.buildingId === 'fortress')!;
    fortress.owner = 'cpu';
    // 安く建てられた城塞（建築家・石切場）。割引なしでは 1 コイン足りず、商館しか建てられない
    fortress.paid = 5;
    g.current = 'you';
    g.players.you.coins = acquireCostFor(g, 'you', fortress, DEFAULT_BALANCE) - 1;
    const discounted = structuredClone(g);
    discounted.players.you.acquireDiscount = DEFAULT_BALANCE.spyAcquireDiscount;
    expect(evaluateState(discounted, 'you', DEFAULT_BALANCE)).toBeGreaterThan(
      evaluateState(g, 'you', DEFAULT_BALANCE),
    );
  });

  it('stuck: 城壁があると衛兵が払えるようになり、評価が上がる', () => {
    const g = createGame(3);
    g.players.you.hand = ['guard', 'miner', 'banker', 'architect'];
    g.players.you.coins = 0;
    const walled = structuredClone(g);
    const wall = walled.market.find((s) => s.buildingId === 'wall')!;
    wall.owner = 'you';
    // 盤面は同じで、連携のコストだけが違う balance と比べる（差は stuck だけに出る）
    // 守る物件 1 件ごとの上乗せは切る（城壁 1 件で衛兵が払えなくなるため。上乗せは snowball.test.ts で測る）
    const B = { ...DEFAULT_BALANCE, guardCostPerBuilding: 0 };
    const noSynergy = { ...B, guardCostWithWall: B.cards.guard.cost };
    expect(evaluateState(walled, 'you', B)).toBeGreaterThan(
      evaluateState(walled, 'you', noSynergy),
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
  it('optionsFor は難易度ごとの値をそのまま写している（3 段とも CPU_PROFILE）', () => {
    expect(optionsFor('easy')).toEqual({
      noise: 25,
      harassRate: 0.5,
      lookahead: false,
      profile: CPU_PROFILE,
    });
    expect(optionsFor('normal')).toEqual({
      noise: 5,
      harassRate: 0.8,
      lookahead: false,
      profile: CPU_PROFILE,
    });
    expect(optionsFor('hard')).toEqual({
      noise: 0,
      harassRate: 1,
      lookahead: true,
      profile: CPU_PROFILE,
    });
  });

  it('Difficulty を渡しても optionsFor(difficulty) を渡しても指し手は完全一致する（20 試合ぶん。つよいは 2 試合）', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      // つよいは先読みで 1 試合 0.3 秒ほどかかるので、試合数を絞る
      const seeds = difficulty === 'hard' ? 2 : 20;
      for (let seed = 0; seed < seeds; seed++) {
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

});

describe('難易度の順序（つよい > ふつう > やさしい > パスだけ）', () => {
  /** a を 'you'、b を 'cpu' として n 試合。先手は交互。a の勝ち数（引き分け 0.5）を返す。
   *  null は「何もしない（毎手番すぐ手番を終える）」相手。 */
  const winsOf = (a: Difficulty | null, b: Difficulty | null, n: number, base: number): number => {
    let wins = 0;
    for (let k = 0; k < n; k++) {
      const seed = base + k;
      let g = createGame(seed);
      const first = k % 2 === 0 ? 'you' : 'cpu';
      if (g.current !== first) {
        g = structuredClone(g);
        g.current = first;
        g.players[first].coins = DEFAULT_BALANCE.startingCoins.first;
        g.players[first === 'you' ? 'cpu' : 'you'].coins = DEFAULT_BALANCE.startingCoins.second;
      }
      const rng = createRng(seed + 1000);
      let guard = 0;
      while (g.phase === 'playing' && guard < 200) {
        const d = g.current === 'you' ? a : b;
        g = d
          ? playTurn(g, d, rng, DEFAULT_BALANCE)
          : reduce(reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE), { type: 'endTurn' }, DEFAULT_BALANCE);
        guard++;
      }
      const w = winnerOf(g, DEFAULT_BALANCE);
      wins += w === 'you' ? 1 : w === 'draw' ? 0.5 : 0;
    }
    return wins;
  };

  // 本番の目安は 70〜85%（npm run ladder、200 試合/組）。ここは少ない試合数で順序だけを見る。
  // 試合の seed は固定なので、結果も毎回同じ（揺れて落ちることはない）。
  it('ふつうは、やさしいに勝ち越す', () => {
    expect(winsOf('normal', 'easy', 40, 0)).toBeGreaterThan(24);
  });

  it('つよいは、ふつうに勝ち越す', () => {
    expect(winsOf('hard', 'normal', 20, 100)).toBeGreaterThan(12);
  });

  it('やさしいでも、何もしない相手には負けない', () => {
    expect(winsOf('easy', null, 10, 200)).toBe(10);
  });
});
