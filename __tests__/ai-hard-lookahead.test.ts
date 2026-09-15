import { describe, expect, it } from 'vitest';

import { lookaheadScore, optionsFor, playTurn } from '@/ai/choose';
import { DEFAULT_WEIGHTS, evaluateState } from '@/ai/evaluate';
import { DEFAULT_BALANCE } from '@/game/balance';
import { legalActions, reduce } from '@/game/reducer';
import { createRng } from '@/game/rng';
import { createGame } from '@/game/setup';
import type { CardId, GameState, PlayerState } from '@/game/types';

/** テスト用の最小プレイヤー状態。setup.ts の emptyPlayer と同じ形を手で作る。 */
function player(coins: number, deck: CardId[]): PlayerState {
  return {
    coins,
    deck,
    usedThisTurn: [],
    pendingIncome: [],
    buildDiscount: 0,
    buildsThisTurn: 0,
    usedAnyCardThisTurn: false,
    blockedSlot: null,
    roadUsesThisTurn: 0,
    pendingDebt: 0,
    festivalQueued: false,
    festivalActive: false,
    guarded: false,
    bindPending: false,
    boundCard: null,
    disabledSlot: null,
  };
}

/** 「自分（you）がいまターンを終えようとしている」局面を作る。
 *  市場は全区画未建設（誰の reach 計算にも建設物件の所有差が混ざらないようにする）。
 *  cpu の手札は [target, banker, banker, banker]。banker はコスト 5 で cpu の
 *  所持コイン 3 では払えないので、cpu が実際に選べる行動は「target を使う」か
 *  「そのまま手番を終える」の 2 択だけになる（build もコスト 7 以上で払えない）。 */
function scenario(cpuFirstCard: CardId): GameState {
  const market = DEFAULT_BALANCE.market.map((buildingId, slotId) => ({
    slotId,
    buildingId,
    owner: null,
  }));
  return {
    seed: 1,
    turn: 5,
    current: 'you',
    phase: 'playing',
    market,
    players: {
      you: player(10, ['miner', 'banker', 'architect', 'usurer']),
      cpu: player(3, [cpuFirstCard, 'banker', 'banker', 'banker']),
    },
  };
}

describe('lookaheadScore: 相手の想定応手を読む', () => {
  it('相手の手札に何があるかで、自分視点の先読みスコアが変わる（徴税官 vs 建築家）', () => {
    const afterA = reduce(scenario('taxman'), { type: 'endTurn' }, DEFAULT_BALANCE);
    const afterB = reduce(scenario('architect'), { type: 'endTurn' }, DEFAULT_BALANCE);

    // 前提確認: この局面で cpu にとって最善の一手は、想定どおりのカードである
    // （徴税官は自分のコインを削りつつ相手のコインを奪うので cpu にとって得。
    //   建築家はこのターンの建設費 -6 だが、このシナリオでは cpu はどのみち
    //   何も建てられない（コインを使い切るため）ので、コストを払うだけ損。
    //   ※ 祝祭は incomePerTurnOf が festivalQueued を見て収入見積もりを
    //   即座に押し上げるため、実は cpu にとって得な一手になってしまい、
    //   「相手にとって無害なカード」の比較対象として使えなかった。
    const bestFor = (state: GameState): CardId | 'endTurn' => {
      let best: CardId | 'endTurn' = 'endTurn';
      let bestScore = evaluateState(
        reduce(state, { type: 'endTurn' }, DEFAULT_BALANCE),
        'cpu',
        DEFAULT_BALANCE,
        DEFAULT_WEIGHTS,
      );
      for (const action of legalActions(state, DEFAULT_BALANCE)) {
        if (action.type !== 'useCard') continue;
        const score = evaluateState(
          reduce(state, action, DEFAULT_BALANCE),
          'cpu',
          DEFAULT_BALANCE,
          DEFAULT_WEIGHTS,
        );
        if (score > bestScore) {
          bestScore = score;
          best = action.card;
        }
      }
      return best;
    };
    expect(bestFor(afterA)).toBe('taxman');
    expect(bestFor(afterB)).toBe('endTurn');

    // 手番が相手に渡った直後の「静的な」評価（相手がまだ何もしていない時点の評価）は、
    // 徴税官と建築家を入れ替えただけでは変わらない。どちらも手札のコスト構成は同じ
    // （コスト3のカード1枚＋コスト5のカード3枚）で、evaluateState は手札の中身
    // （何が書かれたカードか）までは見ないため。
    const staticA = evaluateState(afterA, 'you', DEFAULT_BALANCE, DEFAULT_WEIGHTS);
    const staticB = evaluateState(afterB, 'you', DEFAULT_BALANCE, DEFAULT_WEIGHTS);
    expect(staticA).toBe(staticB);

    // ところが lookaheadScore（つよいが使う先読み）は、相手が実際に徴税官を
    // 撃ってくることを読んで、自分視点のスコアを下げる。旧実装（手番が移る前の
    // 自分の次の一手を読んでいただけ）では、相手の手札の中身は一度も参照されない
    // ので、この差は絶対に出なかった。
    const lookA = lookaheadScore(afterA, 'you', DEFAULT_WEIGHTS, DEFAULT_BALANCE);
    const lookB = lookaheadScore(afterB, 'you', DEFAULT_WEIGHTS, DEFAULT_BALANCE);
    expect(lookA).toBeLessThan(lookB);

    // 静的評価と比べても、徴税官を読んだほうはスコアが下がっている
    // （建築家のほうは、相手が結局何もしない＝実害がほぼ無いので、静的評価に近いまま）。
    expect(lookA).toBeLessThan(staticA);
    expect(Math.abs(lookB - staticB)).toBeLessThan(1);
  });

  it('手番がすでに相手に渡っている局面では、そのまま使う（二重に endTurn を挟まない）', () => {
    const before = scenario('taxman');
    const alreadyHandedOver = reduce(before, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(alreadyHandedOver.current).toBe('cpu');

    // after が already 相手のターンなら、lookaheadScore は追加で endTurn を
    // 挟まずそのまま展開する。上の afterA と同じ入力なので、同じ値になるはず。
    const direct = lookaheadScore(alreadyHandedOver, 'you', DEFAULT_WEIGHTS, DEFAULT_BALANCE);
    const viaScenario = lookaheadScore(
      reduce(scenario('taxman'), { type: 'endTurn' }, DEFAULT_BALANCE),
      'you',
      DEFAULT_WEIGHTS,
      DEFAULT_BALANCE,
    );
    expect(direct).toBe(viaScenario);
  });

  it('試合が終わる局面では、相手の応手を読まずそのまま評価する', () => {
    const finished: GameState = {
      ...scenario('taxman'),
      turn: DEFAULT_BALANCE.maxTurnsPerPlayer * 2,
    };
    const after = reduce(finished, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(after.phase).toBe('finished');
    expect(lookaheadScore(after, 'you', DEFAULT_WEIGHTS, DEFAULT_BALANCE)).toBe(
      evaluateState(after, 'you', DEFAULT_BALANCE, DEFAULT_WEIGHTS),
    );
  });
});

describe('easy / normal の振る舞いは変えていない', () => {
  // 変更前（相手の手番へ渡さず、自分の次の一手だけを読んでいた実装）と比べて、
  // lookahead を使わない easy / normal の分岐は一切触っていない。
  // ここでは「同じ seed からは同じ手順で試合が進む」ことを、複数 seed・
  // 最後まで通した試合で確かめる（つよい実装の変更が easy / normal に
  // 一切波及していないことの安全網）。
  it.each(['easy', 'normal'] as const)('%s は同じ seed なら毎回同じ結果になる', (difficulty) => {
    for (const seed of [0, 5, 11]) {
      const run = () => {
        let g = createGame(seed);
        const rng = createRng(seed + 4242);
        let guard = 0;
        while (g.phase === 'playing' && guard < 200) {
          g = playTurn(g, difficulty, rng, DEFAULT_BALANCE);
          guard++;
        }
        return g;
      };
      expect(run()).toEqual(run());
    }
  });

  // 実際に確認した最終局面のコイン残高（変更前の実装と一致することを
  // 手動で突き合わせ済み）。以後の変更でここが動いたら、easy / normal の
  // 挙動が変わったということなので、意図的な変更でない限り疑うこと。
  it('seed 0 / 5 の最終コイン残高が既知の値と一致する（回帰検知用）', () => {
    const finish = (difficulty: 'easy' | 'normal', seed: number) => {
      let g = createGame(seed);
      const rng = createRng(seed + 4242);
      let guard = 0;
      while (g.phase === 'playing' && guard < 200) {
        g = playTurn(g, optionsFor(difficulty), rng, DEFAULT_BALANCE);
        guard++;
      }
      return g;
    };

    const easy0 = finish('easy', 0);
    expect(easy0.players.you.coins).toBe(-3);
    expect(easy0.players.cpu.coins).toBe(0);

    const easy5 = finish('easy', 5);
    expect(easy5.players.you.coins).toBe(6);
    expect(easy5.players.cpu.coins).toBe(0);

    const normal0 = finish('normal', 0);
    expect(normal0.players.you.coins).toBe(0);
    expect(normal0.players.cpu.coins).toBe(8);

    const normal5 = finish('normal', 5);
    expect(normal5.players.you.coins).toBe(11);
    expect(normal5.players.cpu.coins).toBe(5);
  });
});
