import { describe, expect, it } from 'vitest';

import { lookaheadScore, optionsFor, playTurn } from '@/ai/choose';
import { DEFAULT_WEIGHTS, evaluateState } from '@/ai/evaluate';
import { DEFAULT_BALANCE } from '@/game/balance';
import { legalActions, reduce } from '@/game/reducer';
import { createRng } from '@/game/rng';
import { createGame } from '@/game/setup';
import type { CardId, GameState, PlayerState } from '@/game/types';

/** テスト用の最小プレイヤー状態。setup.ts の emptyPlayer と同じ形を手で作る。
 *  ここでは手札 4 枚だけを持たせ、待機列は空にする（このテストは手札の中身の
 *  比較だけが目的で、循環までは検証しない）。 */
function player(coins: number, hand: CardId[]): PlayerState {
  return {
    coins,
    hand: [...hand],
    queue: [],
    usedThisTurn: [],
    pendingIncome: [],
    buildDiscount: 0,
    buildsThisTurn: 0,
    usedAnyCardThisTurn: false,
    blockedSlot: null,
    roadUsesThisTurn: 0,
    pendingDebt: 0,
    pendingTax: 0,
    festivalQueued: false,
    festivalActive: false,
    guarded: false,
    acquireDiscount: 0,
    disabledSlot: null,
  };
}

/** cpu の手持ち。手番の頭の基礎収入を足すと、ちょうど徴税官（コスト 3）が払える額。 */
const CPU_COINS = DEFAULT_BALANCE.cards.taxman.cost - DEFAULT_BALANCE.baseIncome;

/** 「自分（you）がいまターンを終えようとしている」局面を作る。
 *  市場は全区画未建設（誰の reach 計算にも建設物件の所有差が混ざらないようにする）。
 *  cpu の手札は [target, banker, banker, banker]。cpu は収入を受け取っても 3 コインで、
 *  banker（コスト 5）も建設（コスト 7 以上）も払えないので、cpu が実際に選べる行動は
 *  「target を使う」か「そのまま手番を終える」の 2 択だけになる。 */
function scenario(cpuFirstCard: CardId): GameState {
  const market = DEFAULT_BALANCE.market.map((buildingId, slotId) => ({
    slotId,
    buildingId,
    owner: null,
    paid: 0,
    level: 1,
    touchedTurn: 0,
  }));
  return {
    seed: 1,
    turn: 5,
    current: 'you',
    phase: 'playing',
    market,
    players: {
      you: player(10, ['miner', 'banker', 'architect', 'usurer']),
      cpu: player(CPU_COINS, [cpuFirstCard, 'banker', 'banker', 'banker']),
    },
  };
}

describe('lookaheadScore: 相手の想定応手を読む', () => {
  it('相手の手札に何があるかで、自分視点の先読みスコアが変わる（徴税官 vs 建築家）', () => {
    const afterA = reduce(scenario('taxman'), { type: 'endTurn' }, DEFAULT_BALANCE);
    const afterB = reduce(scenario('architect'), { type: 'endTurn' }, DEFAULT_BALANCE);

    // 前提確認: 手番を渡した直後の cpu は、まだ徴税官を払えない。払えるのは収入を受け取ってから。
    // （1 手ずつ読んでいた旧版は相手の startTurn を挟まなかったので、この徴税官を読めなかった）
    expect(legalActions(afterA, DEFAULT_BALANCE)).not.toContainEqual({ type: 'useCard', card: 'taxman' });
    const startedA = reduce(afterA, { type: 'startTurn' }, DEFAULT_BALANCE);
    const startedB = reduce(afterB, { type: 'startTurn' }, DEFAULT_BALANCE);

    // 前提確認: 収入を受け取った cpu にとって最善の一手は、想定どおりのカードである
    // （徴税官は相手の次の収入を削るので cpu にとって得。建築家はこのターンの建設費を
    //   下げるが、cpu はどのみち何も建てられないので、コストを払うだけ損）。
    //   ※ 祝祭は incomePerTurnOf が festivalQueued を見て収入見積もりを
    //   即座に押し上げるため、cpu にとって得な一手になってしまい、
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
    expect(bestFor(startedA)).toBe('taxman');
    expect(bestFor(startedB)).toBe('endTurn');

    // 手番が相手に渡った直後の「静的な」評価（相手がまだ何もしていない時点の評価）は、
    // 徴税官と建築家を入れ替えただけでは変わらない。どちらもコスト 3 のカードで、
    // evaluateState は手札の中身（何が書かれたカードか）までは見ないため。
    const staticA = evaluateState(afterA, 'you', DEFAULT_BALANCE, DEFAULT_WEIGHTS);
    const staticB = evaluateState(afterB, 'you', DEFAULT_BALANCE, DEFAULT_WEIGHTS);
    expect(staticA).toBe(staticB);

    // ところが lookaheadScore（つよいが使う手番単位の先読み: 自分の手番の残り →
    // 収入を受け取った相手の手番）は、相手が実際に徴税官を撃ってくることを読んで、
    // 自分視点のスコアを下げる。
    const lookA = lookaheadScore(afterA, 'you', DEFAULT_WEIGHTS, DEFAULT_BALANCE);
    const lookB = lookaheadScore(afterB, 'you', DEFAULT_WEIGHTS, DEFAULT_BALANCE);
    expect(lookA).toBeLessThan(lookB);

    // 建築家のほうは相手が結局何もしない（cpu の最善手は endTurn）ので、
    // 先読みの結果は、相手が収入を受け取って手番を終えただけの局面になる。
    const quiet = reduce(startedB, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(lookB).toBe(evaluateState(quiet, 'you', DEFAULT_BALANCE, DEFAULT_WEIGHTS));
  });

  it('手番の途中の局面からは、自分の残りの手を打ち切ってから相手を読む', () => {
    // you が建築家を使った直後（まだ自分の手番）。先読みは「建築家で安くなった建設」を
    // 打ち切ってから手番を渡すので、建築家を使わずに手番を終えた場合より高く評価する。
    const g = scenario('architect');
    g.players.you.hand = ['architect', 'banker', 'banker', 'banker'];
    g.players.you.coins = 10;
    const usedArchitect = reduce(g, { type: 'useCard', card: 'architect' }, DEFAULT_BALANCE);
    expect(usedArchitect.current).toBe('you');
    const stopped = reduce(g, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(lookaheadScore(usedArchitect, 'you', DEFAULT_WEIGHTS, DEFAULT_BALANCE)).toBeGreaterThan(
      lookaheadScore(stopped, 'you', DEFAULT_WEIGHTS, DEFAULT_BALANCE),
    );
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

describe('easy / normal の決定性', () => {
  // 「同じ seed からは同じ手順で試合が進む」ことを、複数 seed・最後まで通した試合で確かめる。
  // 下の最終コイン残高は、easy / normal の指し手が動いたことに気づくための回帰検知。
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

  // 実際に確認した最終局面のコイン残高。手札を「使った枠にだけ補充する」方式
  // （moveToBottom による全体シフトをやめた変更）で、AI の指し手の並び方自体は
  // 変えていないが、同じ手を選んでも手札に積まれるカードの並びが変わるため、
  // 決定的な対局の軌跡がここで一度更新されている。以後の変更でここが動いたら、
  // easy / normal の挙動が変わったということなので、意図的な変更でない限り疑うこと。
  // 買収者の封印枚数を 1→2 枚にした変更（spyBindCount）で全 4 局が動いたため、
  // ここも合わせて更新した。
  // 徴税官を「相手の次の収入から引く」効果（pendingTax）に変えたときも更新した。
  // 銀行家の収入を（11,+1/件）→（6,+2/件）に変えたときも更新した（自走改善の調整で数値は今後も動く）。
  // アップグレード・買収の追加（合法手が増える）、採掘師 6→5、衛兵の一律加点の廃止で全 4 局が動いたので更新した。
  // 買収者を「このターンの買収価格 −3」に作り替え、城壁×衛兵・街道×伝令の連携と数値の調整（後手 1 ターン目の補正 1→0 を含む）を入れたときも更新した。
  // 難易度の段差を作り直し（3 段とも CPU_PROFILE、揺らぎ・妨害の頻度を測り直し）たときも更新した。
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
    expect(easy0.players.you.coins).toBe(3);
    expect(easy0.players.cpu.coins).toBe(4);

    const easy5 = finish('easy', 5);
    expect(easy5.players.you.coins).toBe(18);
    expect(easy5.players.cpu.coins).toBe(0);

    const normal0 = finish('normal', 0);
    expect(normal0.players.you.coins).toBe(0);
    expect(normal0.players.cpu.coins).toBe(2);

    const normal5 = finish('normal', 5);
    expect(normal5.players.you.coins).toBe(0);
    expect(normal5.players.cpu.coins).toBe(3);
  });
});
