import { describe, expect, it } from 'vitest';

import { lookaheadScore, optionsFor, playTurn } from '@/ai/choose';
import { DEFAULT_WEIGHTS, evaluateState } from '@/ai/evaluate';
import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { legalActions, reduce } from '@/game/reducer';
import { createRng } from '@/game/rng';
import { createGame } from '@/game/setup';
import type { CardId, GameState, PlayerState } from '@/game/types';


/** 回帰検知専用の凍結した数値。2026-10-10 時点の DEFAULT_BALANCE を写したもの。
 *  DEFAULT_BALANCE を調整しても下の「最終コイン残高」は動かない（動くのは AI の指し手を変えたときだけ）。
 *  ここは書き換えない。Balance に項目が増えたら、その項目だけ当時の既定の振る舞いになる値を足す。 */
const FROZEN_BALANCE: Balance = {
  handSize: 4,
  baseIncome: 2,
  startingCoins: { first: 0, second: 0 },
  maxTurnsPerPlayer: 20,
  cards: {
    miner: { cost: 2 },
    banker: { cost: 5 },
    architect: { cost: 3 },
    herald: { cost: 1 },
    festival: { cost: 3 },
    guard: { cost: 1 },
    usurer: { cost: 0 },
    spy: { cost: 1 },
    taxman: { cost: 3 },
    blockader: { cost: 4 },
    // 新しいカード（凍結時点には無い。既定のデッキに入らないので試合には出ない）
    craftsman: { cost: 2 },
    inspector: { cost: 3 },
    boss: { cost: 2 },
    informer: { cost: 1 },
    double: { cost: 1 },
    clerk: { cost: 1 },
  },
  minerIncome: 4,
  // 当時の銀行家は 6 + 2/件。2026-10-11 に「VP の分」へ作り替えたので、基本の 6 だけ写す（VP 倍率 0）
  bankerIncome: 6,
  bankerVpRate: 0,
  architectDiscount: 6,
  taxmanAmount: 5,
  taxmanIncomeRate: 0,
  spyAcquireDiscount: 3,
  guardCostWithWall: 0,
  heraldCostWithRoad: 0,
  craftsmanDiscount: 5,
  clerkPerHouse: 2,
  clerkMaxHouses: 3,
  doubleExcluded: ['herald', 'double', 'festival', 'guard'],
  buildings: {
    tradingHouse: { cost: 7, vp: 2, income: 1 },
    wall: { cost: 10, vp: 2, income: 0 },
    factory: { cost: 12, vp: 3, income: 0 },
    road: { cost: 14, vp: 2, income: 0 },
    cathedral: { cost: 16, vp: 0, income: 0 },
    fortress: { cost: 18, vp: 6, income: 0 },
    exchange: { cost: 20, vp: 3, income: 0 },
    quarry: { cost: 13, vp: 3, income: 0 },
    mine: { cost: 15, vp: 3, income: 0 },
  },
  factoryDiscount: 2,
  cathedralVpPerBuilding: 2,
  exchangeBonus: 2,
  usurerGain: 5,
  usurerDebt: 7,
  festivalMultiplier: 2,
  festivalIncomeBonus: 2,
  // 城塞の通行料は 2026-10-11 に廃止。鉱山は当時なかった（市場に無いので使われない）
  mineMinerBonus: 0,
  mineMinerDiscount: 0,
  quarryExtraDiscount: 4,
  roadUses: 1,
  secondPlayerFirstTurnBonus: 1,
  upgrades: {
    tradingHouse: { cost: 7, vp: 4, income: 2 },
    wall: { cost: 10, vp: 4, income: 0 },
    factory: { cost: 12, vp: 5, income: 0 },
    road: { cost: 14, vp: 4, income: 0 },
    cathedral: { cost: 16, vp: 0, income: 0 },
    fortress: { cost: 18, vp: 9, income: 0 },
    exchange: { cost: 20, vp: 5, income: 0 },
    quarry: { cost: 13, vp: 5, income: 0 },
    mine: { cost: 15, vp: 5, income: 0 },
  },
  level2: {
    factoryDiscount: 4,
    cathedralVpPerBuilding: 3,
    exchangeBonus: 4,
    quarryExtraDiscount: 6,
    roadUses: 2,
    mineMinerBonus: 0,
    mineMinerDiscount: 0,
  },
  // Lv3 は凍結時点のルールに無かったので上限 2 のまま（表は型を満たすためだけに置く）
  upgrades3: {
    tradingHouse: { cost: 8, vp: 6, income: 3 },
    wall: { cost: 11, vp: 6, income: 0 },
    factory: { cost: 13, vp: 7, income: 0 },
    road: { cost: 15, vp: 6, income: 0 },
    cathedral: { cost: 17, vp: 0, income: 0 },
    fortress: { cost: 19, vp: 12, income: 0 },
    exchange: { cost: 21, vp: 7, income: 0 },
    quarry: { cost: 14, vp: 7, income: 0 },
    mine: { cost: 18, vp: 7, income: 0 },
  },
  level3: {
    factoryDiscount: 6,
    cathedralVpPerBuilding: 4,
    exchangeBonus: 6,
    quarryExtraDiscount: 8,
    roadUses: 3,
    mineMinerBonus: 0,
    mineMinerDiscount: 0,
  },
  maxLevel: 2,
  acquireMultiplier: 2,
  slotLockTurns: 1,
  market: [
    'tradingHouse',
    'tradingHouse',
    'quarry',
    'wall',
    'factory',
    'road',
    'cathedral',
    'fortress',
    'fortress',
    'exchange',
  ],
  // 地区の称号は当時なかった（地区なし = 称号なし）
  districts: [],
  districtTitleVp: 0,
  districtMinVp: 1,
};

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
    roadUsesThisTurn: 0,
    pendingDebt: 0,
    pendingTax: 0,
    festivalQueued: false,
    festivalActive: false,
    guarded: false,
    acquireDiscount: 0,
    upgradeDiscount: 0,
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
    level: 1,
    touchedTurn: 0,
  }));
  return {
    seed: 1,
    turn: 5,
    current: 'you',
    phase: 'playing',
    market,
    titles: DEFAULT_BALANCE.districts.map(() => null),
    blockades: [],
    players: {
      you: player(10, ['miner', 'banker', 'architect', 'usurer']),
      cpu: player(CPU_COINS, [cpuFirstCard, 'banker', 'banker', 'banker']),
    },
  };
}

describe('lookaheadScore: 相手の想定応手を読む', () => {
  it('相手の手札に何があるかで、自分視点の先読みスコアが変わる（徴税官 vs 建築家）', () => {
    // 建築家と徴税官を同じコストにそろえた数値で読む（手札の中身以外が同じ局面にするため）。
    // 既定の建築家（コスト 2）だと、cpu は残り 1 コインで割引後の商館を建ててしまい「無害な札」にならない
    const B: Balance = {
      ...DEFAULT_BALANCE,
      cards: { ...DEFAULT_BALANCE.cards, architect: { cost: DEFAULT_BALANCE.cards.taxman.cost } },
    };
    const afterA = reduce(scenario('taxman'), { type: 'endTurn' }, B);
    const afterB = reduce(scenario('architect'), { type: 'endTurn' }, B);

    // 前提確認: 手番を渡した直後の cpu は、まだ徴税官を払えない。払えるのは収入を受け取ってから。
    // （1 手ずつ読んでいた旧版は相手の startTurn を挟まなかったので、この徴税官を読めなかった）
    expect(legalActions(afterA, B)).not.toContainEqual({ type: 'useCard', card: 'taxman' });
    const startedA = reduce(afterA, { type: 'startTurn' }, B);
    const startedB = reduce(afterB, { type: 'startTurn' }, B);

    // 前提確認: 収入を受け取った cpu にとって最善の一手は、想定どおりのカードである
    // （徴税官は相手の次の収入を削るので cpu にとって得。建築家はこのターンの建設費を
    //   下げるが、cpu はどのみち何も建てられないので、コストを払うだけ損）。
    //   ※ 祝祭は次の収入への上乗せ（festivalExtraOf）を評価に足すため、
    //   cpu にとって得な一手になってしまい、
    //   「相手にとって無害なカード」の比較対象として使えなかった。
    const bestFor = (state: GameState): CardId | 'endTurn' => {
      let best: CardId | 'endTurn' = 'endTurn';
      let bestScore = evaluateState(
        reduce(state, { type: 'endTurn' }, B),
        'cpu',
        B,
        DEFAULT_WEIGHTS,
      );
      for (const action of legalActions(state, B)) {
        if (action.type !== 'useCard') continue;
        const score = evaluateState(
          reduce(state, action, B),
          'cpu',
          B,
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
    const staticA = evaluateState(afterA, 'you', B, DEFAULT_WEIGHTS);
    const staticB = evaluateState(afterB, 'you', B, DEFAULT_WEIGHTS);
    expect(staticA).toBe(staticB);

    // ところが lookaheadScore（つよいが使う手番単位の先読み: 自分の手番の残り →
    // 収入を受け取った相手の手番）は、相手が実際に徴税官を撃ってくることを読んで、
    // 自分視点のスコアを下げる。
    const lookA = lookaheadScore(afterA, 'you', DEFAULT_WEIGHTS, B);
    const lookB = lookaheadScore(afterB, 'you', DEFAULT_WEIGHTS, B);
    expect(lookA).toBeLessThan(lookB);

    // 建築家のほうは相手が結局何もしない（cpu の最善手は endTurn）ので、
    // 先読みの結果は、相手が収入を受け取って手番を終えただけの局面になる。
    const quiet = reduce(startedB, { type: 'endTurn' }, B);
    expect(lookB).toBe(evaluateState(quiet, 'you', B, DEFAULT_WEIGHTS));
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

  // 実際に確認した最終局面のコイン残高。数値は凍結した FROZEN_BALANCE で回すので、
  // DEFAULT_BALANCE の調整では動かない。ここが動いたら easy / normal の指し手（AI）が変わったということなので、
  // 意図的な変更でない限り疑うこと。祝祭を「毎ターンの収入」でなく 1 度きりの上乗せとして評価するよう直したとき、
  // 手番の後の建築家の割引・試合の終わりの投資/借りを数えないよう直したとき、最終段階の物件を買収不可にしたとき、
  // 重みの再探索と揺らぎの変更（20/6 → 40/10）のとき、2026-10-11 のルール変更（封鎖の作り替え・称号を VP で・投資を額で評価）、終わった局面を勝ち負けで評価・重みの再探索・揺らぎ 40/10 → 20/8 のとき、
  // 雪だるまの対策（買収されたときの代金 exposedCoins を評価に足す・揺らぎ 20/8 → 25/5）のときに更新した。
  it('seed 0 / 5 の最終コイン残高が既知の値と一致する（回帰検知用）', () => {
    const finish = (difficulty: 'easy' | 'normal', seed: number) => {
      let g = createGame(seed, FROZEN_BALANCE);
      const rng = createRng(seed + 4242);
      let guard = 0;
      while (g.phase === 'playing' && guard < 200) {
        g = playTurn(g, optionsFor(difficulty), rng, FROZEN_BALANCE);
        guard++;
      }
      return g;
    };

    const coins = (g: GameState) => [g.players.you.coins, g.players.cpu.coins];
    expect({
      easy0: coins(finish('easy', 0)),
      easy5: coins(finish('easy', 5)),
      normal0: coins(finish('normal', 0)),
      normal5: coins(finish('normal', 5)),
    }).toEqual({ easy0: [0, 13], easy5: [-2, 7], normal0: [5, 4], normal5: [3, 2] });
  });
});
