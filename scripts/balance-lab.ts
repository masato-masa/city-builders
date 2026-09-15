/** 戦略の多様性を測る常設ツール。
 *
 *   npm run lab            # 既定 400 試合 / 組
 *   npm run lab -- 1200
 *
 * scripts/simulate.ts（先手有利や CPU の強さを測る別目的のツール）とは狙いが違う。
 * こちらは「性格の違う CPU を総当たりさせて、誰か 1 つが勝ち越さないか」を測る。
 * ゲームの数値・カード効果は一切変えない。計測用の状態もすべてこのファイルの中だけで持ち、
 * src/game/ にはフィールドを足さない。
 *
 * 乱数は src/game/rng.ts の seeded PRNG のみを使う。試合ごとの seed は、
 * 性格の組み合わせ・先手/後手・何試合目かという「引数」だけから決まるので、
 * 同じコマンドを 2 回走らせれば必ず同じ結果になる。 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chooseAction, type AiOptions } from '../src/ai/choose';
import { DEFAULT_WEIGHTS, type Profile, type Weights } from '../src/ai/evaluate';
import { ALL_CARDS, CARD_NAMES, DEFAULT_BALANCE, type Balance } from '../src/game/balance';
import { reduce } from '../src/game/reducer';
import { createRng } from '../src/game/rng';
import { handOf, opponentOf, winnerOf } from '../src/game/selectors';
import { createGame } from '../src/game/setup';
import type { CardId, GameState, PlayerId } from '../src/game/types';

// ---------------------------------------------------------------------------
// 性格（persona）
// ---------------------------------------------------------------------------

interface Persona {
  name: string;
  profile: Profile;
}

/** 手で重み 1 つを置くだけの Persona を作る（early = late、序盤終盤の区別なし）。
 *  scripts/searched-profiles.json が無いときの後方互換フォールバック用。 */
function flatPersona(name: string, weights: Weights): Persona {
  return { name, profile: { early: weights, late: weights } };
}

/** 4 つの性格は「人間が取りうる方針」の代表。DEFAULT_WEIGHTS の一部だけを上書きする。
 *  すべて noise: 0 / harassRate: 1 / lookahead: false で戦わせる（揺らぎがあると性格が混ざる）。
 *
 *  10 枚化にあわせて重みを引き直した。
 *  - 妨害: opponentReach・opponentIncome・opponentBound を強く。徴税官・封鎖者・買収者は
 *    どれも「相手の reach か income を削る」効果なので、この 3 項を上げるだけで 3 枚まとめて
 *    優先度が上がる。
 *  - 回転: pendingIncome・incomePerTurn を強く、coin を弱く。稼いだコインを溜めずに
 *    すぐ使う（建てる・また稼ぐ）方向に寄せる。
 *  - 大器晩成: 旧 threat の代わりに reach と coin を強く。序盤は reach（＝買えるものの
 *    価値）とコインの蓄積を評価し、終盤の VP 重視と合わせて「溜めて一気に買う」を狙う。 */
const HAND_PLACED_PERSONAS: Persona[] = [
  flatPersona('均衡', DEFAULT_WEIGHTS),
  flatPersona('妨害', {
    ...DEFAULT_WEIGHTS,
    opponentCoin: -2.5,
    opponentStuck: 3.5,
    opponentReach: -3.5,
    opponentIncome: -4.0,
    opponentBound: 5.0,
    reach: 4.0,
    vp: 8,
  }),
  flatPersona('回転', {
    ...DEFAULT_WEIGHTS,
    pendingIncome: 2.6,
    incomePerTurn: 5.5,
    vp: 7,
    coin: 0.6,
  }),
  flatPersona('大器晩成', {
    ...DEFAULT_WEIGHTS,
    coin: 2.6,
    vp: 13,
    incomePerTurn: 1.2,
    reach: 3.0,
    opponentReach: -0.2,
  }),
];

/** scripts/weight-search.ts（npm run search）が書き出した収束後の重み。
 *  ファイルが無ければ（＝探索をまだ実行していなければ）手で置いた重みで動く。 */
function loadSearchedPersonas(): Persona[] | null {
  const path = fileURLToPath(new URL('./searched-profiles.json', import.meta.url));
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as { name: string; profile: Profile }[];
  return raw.map((r) => ({ name: r.name, profile: r.profile }));
}

const PERSONAS: Persona[] = loadSearchedPersonas() ?? HAND_PLACED_PERSONAS;

function optionsForPersona(p: Persona): AiOptions {
  return { noise: 0, harassRate: 1, lookahead: false, profile: p.profile };
}

// ---------------------------------------------------------------------------
// 1 試合
// ---------------------------------------------------------------------------

function emptyCardUsage(): Record<CardId, number> {
  return Object.fromEntries(ALL_CARDS.map((c) => [c, 0])) as Record<CardId, number>;
}

interface GameStats {
  winner: 'A' | 'B' | 'draw';
  firstMover: 'A' | 'B';
  /** 1 人あたりのターン数（simulate.ts と同じ、両者合計を 2 で割って切り上げ） */
  turnsPerPlayer: number;
  cardUsage: { A: Record<CardId, number>; B: Record<CardId, number> };
  turnsPlayed: { A: number; B: number };
  totalTurns: number;
  bankedTurns: { A: number; B: number };
  stuckTurns: { A: number; B: number };
  /** 手番の開始時点（収入が入った直後）のコイン残高の合計。turnsPlayed で割れば平均になる */
  coinsSum: { A: number; B: number };
  taxmanJustified: number;
  taxmanWasted: number;
  taxmanTotal: number;
  /** 同じカードが手札の先頭に戻るまでのターン数（そのプレイヤー自身のターン数で数える）のサンプル */
  deckCycleSamples: { A: number[]; B: number[] };
  /** 1 試合中に建てた件数 */
  buildsCount: { A: number; B: number };
  /** そのうち、試合の前半（自分のターン数の半分まで）に建てた件数 */
  firstHalfBuilds: { A: number; B: number };
}

/** 先手を強制的に決める。createGame は seed から先手をランダムに決めるが、
 *  ラボでは「性格 A が先手の試合」を明示的に同数用意したいので、ここで上書きする。
 *  デッキの並び（シャッフル結果）はそのまま、手番と開始コインだけ入れ替える。 */
function forceFirst(g: GameState, first: PlayerId, balance: Balance): GameState {
  if (g.current === first) return g;
  const second = opponentOf(first);
  const next = structuredClone(g);
  next.current = first;
  next.players[first].coins = balance.startingCoins.first;
  next.players[second].coins = balance.startingCoins.second;
  return next;
}

function runOne(
  seed: number,
  optionsA: AiOptions,
  optionsB: AiOptions,
  firstIsA: boolean,
  balance: Balance,
): GameStats {
  let g = createGame(seed, balance);
  g = forceFirst(g, firstIsA ? 'you' : 'cpu', balance);
  const firstMover: 'A' | 'B' = firstIsA ? 'A' : 'B';
  // 'you' は常に性格 A、'cpu' は常に性格 B。先手/後手は forceFirst 側で制御する
  const optionsOf: Record<PlayerId, AiOptions> = { you: optionsA, cpu: optionsB };
  const rng = createRng(seed * 65537 + 11);

  const cardUsage = { A: emptyCardUsage(), B: emptyCardUsage() };
  const turnsPlayed = { A: 0, B: 0 };
  const bankedTurns = { A: 0, B: 0 };
  const stuckTurns = { A: 0, B: 0 };
  const coinsSum = { A: 0, B: 0 };
  let taxmanJustified = 0;
  let taxmanWasted = 0;
  let taxmanTotal = 0;
  const deckCycleSamples: { A: number[]; B: number[] } = { A: [], B: [] };
  const buildsCount = { A: 0, B: 0 };
  // 建てたときの「自分の何ターン目か」（1 始まり）を記録し、試合が終わったあとに
  // 前半・後半を判定する（前半かどうかは自分の最終ターン数が分からないと決まらないため）
  const buildTurns: { A: number[]; B: number[] } = { A: [], B: [] };
  // プレイヤーごとに「手札の先頭にいたカードを、自分の何ターン目に見たか」を覚えておく
  const lastFrontTurn: Record<PlayerId, Partial<Record<CardId, number>>> = { you: {}, cpu: {} };
  const ownTurnCount: Record<PlayerId, number> = { you: 0, cpu: 0 };
  // 直前のターン終了時点で先頭にいたカード。同じカードが居座っているだけの
  // ターン（何も使わなかった等）を「1 周」に数えないよう、変化した時だけサンプルを取る
  const prevFront: Record<PlayerId, CardId | undefined> = { you: undefined, cpu: undefined };

  let guard = 0;
  // maxTurnsPerPlayer * 2 （既定 40）が本来の上限。guard はその安全網
  while (g.phase === 'playing' && guard < 100) {
    guard++;
    const player = g.current;
    const who: 'A' | 'B' = player === 'you' ? 'A' : 'B';
    const options = optionsOf[player];

    let next = reduce(g, { type: 'startTurn' }, balance);

    // 手札詰まり率・平均コイン残高: 行動フェーズに入った時点（収入が入った直後）で測る
    const hand = handOf(next, player, balance);
    const unaffordable = hand.filter(
      (c) => next.players[player].coins < balance.cards[c].cost,
    ).length;
    if (unaffordable >= 3) stuckTurns[who]++;
    coinsSum[who] += next.players[player].coins;

    let usedAnyCard = false;
    let builtAny = false;
    // playTurn 内部の安全網（上限 40 手）と同じ考え方
    for (let i = 0; i < 40; i++) {
      const action = chooseAction(next, options, rng, balance);
      if (action.type === 'endTurn') break;
      const before = next;
      const applied = reduce(next, action, balance);
      if (applied === before) break;

      if (action.type === 'useCard') {
        usedAnyCard = true;
        cardUsage[who][action.card]++;
        if (action.card === 'taxman') {
          const foe = opponentOf(player);
          taxmanTotal++;
          if (before.players[foe].coins >= 5) taxmanJustified++;
          else taxmanWasted++;
        }
      } else if (action.type === 'build') {
        builtAny = true;
        buildsCount[who]++;
        // このターンはまだ ownTurnCount[player] に加算されていないので +1 して「何ターン目か」にする
        buildTurns[who].push(ownTurnCount[player] + 1);
      }
      next = applied;
    }

    turnsPlayed[who]++;
    // 貯めターン: カードを 1 枚も使わず、建設もしなかったターン
    if (!usedAnyCard && !builtAny) bankedTurns[who]++;

    // デッキ 1 周: 手札の先頭が「入れ替わった」ときだけ記録する。同じカードが
    // 先頭に居座り続けているターン（貯めターンなど）は変化ではないので数えない
    ownTurnCount[player]++;
    const front = next.players[player].deck[0];
    if (front && front !== prevFront[player]) {
      const lastTurn = lastFrontTurn[player][front];
      if (lastTurn !== undefined) {
        deckCycleSamples[who].push(ownTurnCount[player] - lastTurn);
      }
      lastFrontTurn[player][front] = ownTurnCount[player];
      prevFront[player] = front;
    }

    g = reduce(next, { type: 'endTurn' }, balance);
  }

  const rawWinner = winnerOf(g, balance);
  const winner: 'A' | 'B' | 'draw' =
    rawWinner === 'draw' || rawWinner === null ? 'draw' : rawWinner === 'you' ? 'A' : 'B';
  const totalTurns = turnsPlayed.A + turnsPlayed.B;

  // 前半判定: そのプレイヤーの最終ターン数の半分まで
  const firstHalfBuilds = {
    A: buildTurns.A.filter((t) => t <= turnsPlayed.A / 2).length,
    B: buildTurns.B.filter((t) => t <= turnsPlayed.B / 2).length,
  };

  return {
    winner,
    firstMover,
    turnsPerPlayer: Math.ceil(totalTurns / 2),
    cardUsage,
    turnsPlayed,
    totalTurns,
    bankedTurns,
    stuckTurns,
    coinsSum,
    taxmanJustified,
    taxmanWasted,
    taxmanTotal,
    deckCycleSamples,
    buildsCount,
    firstHalfBuilds,
  };
}

// ---------------------------------------------------------------------------
// 総当たり
// ---------------------------------------------------------------------------

const GAMES_PER_PAIR = Number(process.argv[2] ?? 400);
const FIRST_HALF = Math.floor(GAMES_PER_PAIR / 2);
const SECOND_HALF = GAMES_PER_PAIR - FIRST_HALF;

/** 性格の組み合わせ・先手/後手・何試合目かという「引数」だけから seed を決める。
 *  同じ引数からは必ず同じ seed になる。 */
function seedFor(i: number, j: number, order: 0 | 1, gameIndex: number): number {
  return ((i * PERSONAS.length + j) * 2 + order) * 1_000_000 + gameIndex;
}

const N = PERSONAS.length;
const winsMatrix: number[][] = Array.from({ length: N }, () => new Array(N).fill(0) as number[]);
const gamesMatrix: number[][] = Array.from({ length: N }, () => new Array(N).fill(0) as number[]);
const personaTurns: number[] = new Array(N).fill(0) as number[];
const personaGames: number[] = new Array(N).fill(0) as number[];
const personaBuilds: number[] = new Array(N).fill(0) as number[];
const personaFirstHalfBuilds: number[] = new Array(N).fill(0) as number[];
const personaCardUsage: Record<CardId, number>[] = PERSONAS.map(() => emptyCardUsage());
// 表 2c: 性格ごとの内訳
const personaBankedTurns: number[] = new Array(N).fill(0) as number[];
const personaStuckTurns: number[] = new Array(N).fill(0) as number[];
const personaCoinsSum: number[] = new Array(N).fill(0) as number[];
const personaDeckCycleSamples: number[][] = Array.from({ length: N }, () => [] as number[]);
// 表 5: 妨害・防御の札が「相手の性格」を見ているか。personaCardUsageByOpp[i][j] は
// 性格 i が性格 j と対戦したときに使ったカードの枚数、personaTurnsByOpp[i][j] はそのときの
// 性格 i 側のターン数
const personaCardUsageByOpp: Record<CardId, number>[][] = Array.from({ length: N }, () =>
  Array.from({ length: N }, () => emptyCardUsage()),
);
const personaTurnsByOpp: number[][] = Array.from({ length: N }, () => new Array(N).fill(0) as number[]);

let totalGames = 0;
let draws = 0;
let firstMoverScore = 0;
let turnsPerPlayerSum = 0;
let globalTurns = 0;
let bankedTurns = 0;
let stuckTurns = 0;
let taxmanJustified = 0;
let taxmanWasted = 0;
let taxmanTotal = 0;
const globalCardUsage: Record<CardId, number> = emptyCardUsage();
const deckCycleSamples: number[] = [];

for (let i = 0; i < N; i++) {
  for (let j = i + 1; j < N; j++) {
    const personaI = PERSONAS[i]!;
    const personaJ = PERSONAS[j]!;
    const optionsI = optionsForPersona(personaI);
    const optionsJ = optionsForPersona(personaJ);

    // 先手・後手を入れ替えて同数ずつ（先手有利を勝率から取り除くため）
    const orders: { order: 0 | 1; firstIsA: boolean; count: number }[] = [
      { order: 0, firstIsA: true, count: FIRST_HALF },
      { order: 1, firstIsA: false, count: SECOND_HALF },
    ];

    for (const { order, firstIsA, count } of orders) {
      for (let g = 0; g < count; g++) {
        const seed = seedFor(i, j, order, g);
        const result = runOne(seed, optionsI, optionsJ, firstIsA, DEFAULT_BALANCE);

        totalGames++;
        if (result.winner === 'draw') {
          draws++;
          winsMatrix[i]![j]! += 0.5;
          winsMatrix[j]![i]! += 0.5;
          firstMoverScore += 0.5;
        } else if (result.winner === result.firstMover) {
          firstMoverScore += 1;
          if (result.winner === 'A') winsMatrix[i]![j]! += 1;
          else winsMatrix[j]![i]! += 1;
        } else if (result.winner === 'A') {
          winsMatrix[i]![j]! += 1;
        } else {
          winsMatrix[j]![i]! += 1;
        }
        gamesMatrix[i]![j]! += 1;
        gamesMatrix[j]![i]! += 1;

        turnsPerPlayerSum += result.turnsPerPlayer;
        globalTurns += result.totalTurns;
        bankedTurns += result.bankedTurns.A + result.bankedTurns.B;
        stuckTurns += result.stuckTurns.A + result.stuckTurns.B;
        taxmanJustified += result.taxmanJustified;
        taxmanWasted += result.taxmanWasted;
        taxmanTotal += result.taxmanTotal;
        deckCycleSamples.push(...result.deckCycleSamples.A, ...result.deckCycleSamples.B);

        personaTurns[i]! += result.turnsPlayed.A;
        personaTurns[j]! += result.turnsPlayed.B;
        personaGames[i]! += 1;
        personaGames[j]! += 1;
        personaBuilds[i]! += result.buildsCount.A;
        personaBuilds[j]! += result.buildsCount.B;
        personaFirstHalfBuilds[i]! += result.firstHalfBuilds.A;
        personaFirstHalfBuilds[j]! += result.firstHalfBuilds.B;
        personaBankedTurns[i]! += result.bankedTurns.A;
        personaBankedTurns[j]! += result.bankedTurns.B;
        personaStuckTurns[i]! += result.stuckTurns.A;
        personaStuckTurns[j]! += result.stuckTurns.B;
        personaCoinsSum[i]! += result.coinsSum.A;
        personaCoinsSum[j]! += result.coinsSum.B;
        personaDeckCycleSamples[i]!.push(...result.deckCycleSamples.A);
        personaDeckCycleSamples[j]!.push(...result.deckCycleSamples.B);
        for (const c of ALL_CARDS) {
          personaCardUsage[i]![c] += result.cardUsage.A[c];
          personaCardUsage[j]![c] += result.cardUsage.B[c];
          globalCardUsage[c] += result.cardUsage.A[c] + result.cardUsage.B[c];
          // 性格 i は相手 j に対して、性格 j は相手 i に対して、というように
          // 双方向で「使った側」と「相手の性格」を記録する
          personaCardUsageByOpp[i]![j]![c] += result.cardUsage.A[c];
          personaCardUsageByOpp[j]![i]![c] += result.cardUsage.B[c];
        }
        personaTurnsByOpp[i]![j]! += result.turnsPlayed.A;
        personaTurnsByOpp[j]![i]! += result.turnsPlayed.B;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const avg = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;

console.log(`試合数: ${GAMES_PER_PAIR} / 組 × ${(N * (N - 1)) / 2} 組 = ${totalGames} 試合`);
console.log('');

console.log('## 表 1: 総当たりの勝率（行の性格から見た勝率。引き分けは 0.5 勝）');
console.log('');
console.log(`| 性格 | ${PERSONAS.map((p) => p.name).join(' | ')} | 総合 |`);
console.log(`|---|${PERSONAS.map(() => '---').join('|')}|---|`);
const personaOverallWinRate: number[] = [];
for (let i = 0; i < N; i++) {
  const cells = PERSONAS.map((_, j) => {
    if (i === j) return '―';
    return pct(winsMatrix[i]![j]! / gamesMatrix[i]![j]!);
  });
  let winsSum = 0;
  let gamesSum = 0;
  for (let j = 0; j < N; j++) {
    if (i === j) continue;
    winsSum += winsMatrix[i]![j]!;
    gamesSum += gamesMatrix[i]![j]!;
  }
  const overall = winsSum / gamesSum;
  personaOverallWinRate.push(overall);
  console.log(`| ${PERSONAS[i]!.name} | ${cells.join(' | ')} | ${pct(overall)} |`);
}
console.log('');

console.log('## 表 2: カードの使用率（全ターン中そのカードが使われたターンの割合）');
console.log('');
console.log(`| カード | ${PERSONAS.map((p) => p.name).join(' | ')} | 全体 |`);
console.log(`|---|${PERSONAS.map(() => '---').join('|')}|---|`);
const cardOverallRate = new Map<CardId, number>();
for (const card of ALL_CARDS) {
  const cells = PERSONAS.map((_, i) => pct(personaCardUsage[i]![card] / personaTurns[i]!));
  const overall = globalCardUsage[card] / globalTurns;
  cardOverallRate.set(card, overall);
  console.log(`| ${CARD_NAMES[card]} | ${cells.join(' | ')} | ${pct(overall)} |`);
}
console.log('');

console.log('## 表 2b: 性格が狙いどおりの打ち方をしているか');
console.log('');
console.log(`| 項目 | ${PERSONAS.map((p) => p.name).join(' | ')} |`);
console.log(`|---|${PERSONAS.map(() => '---').join('|')}|`);
const HARASS_CARDS: CardId[] = ['taxman', 'blockader', 'spy'];
{
  const cardsPerTurn = PERSONAS.map((_, i) => {
    const totalCards = ALL_CARDS.reduce((s, c) => s + personaCardUsage[i]![c], 0);
    return totalCards / personaTurns[i]!;
  });
  console.log(`| 1 ターンあたりのカード使用枚数 | ${cardsPerTurn.map((v) => v.toFixed(2)).join(' | ')} |`);
}
{
  const buildsPerGame = PERSONAS.map((_, i) => personaBuilds[i]! / personaGames[i]!);
  console.log(`| 1 試合の建設数 | ${buildsPerGame.map((v) => v.toFixed(2)).join(' | ')} |`);
}
{
  const firstHalfRatio = PERSONAS.map((_, i) =>
    personaBuilds[i]! > 0 ? personaFirstHalfBuilds[i]! / personaBuilds[i]! : NaN,
  );
  console.log(
    `| 前半の建設割合 | ${firstHalfRatio.map((v) => (Number.isFinite(v) ? pct(v) : '(建設無し)')).join(' | ')} |`,
  );
}
{
  const harassRate = PERSONAS.map((_, i) => {
    const harassCount = HARASS_CARDS.reduce((s, c) => s + personaCardUsage[i]![c], 0);
    return harassCount / personaTurns[i]!;
  });
  console.log(`| 妨害カードの使用率（徴税官・封鎖者・買収者） | ${harassRate.map((v) => pct(v)).join(' | ')} |`);
}
console.log('');

console.log('## 表 2c: 性格ごとの内訳');
console.log('');
console.log(`| 項目 | ${PERSONAS.map((p) => p.name).join(' | ')} |`);
console.log(`|---|${PERSONAS.map(() => '---').join('|')}|`);
{
  const rates = PERSONAS.map((_, i) => personaBankedTurns[i]! / personaTurns[i]!);
  console.log(`| 貯めターン率 | ${rates.map((v) => pct(v)).join(' | ')} |`);
}
{
  const rates = PERSONAS.map((_, i) => personaStuckTurns[i]! / personaTurns[i]!);
  console.log(`| 手札詰まり率 | ${rates.map((v) => pct(v)).join(' | ')} |`);
}
{
  const avgCoins = PERSONAS.map((_, i) => personaCoinsSum[i]! / personaTurns[i]!);
  console.log(`| 平均コイン残高 | ${avgCoins.map((v) => v.toFixed(1)).join(' | ')} |`);
}
{
  const cycles = PERSONAS.map((_, i) =>
    personaDeckCycleSamples[i]!.length > 0 ? avg(personaDeckCycleSamples[i]!) : NaN,
  );
  console.log(
    `| デッキ 1 周のターン数 | ${cycles.map((v) => (Number.isFinite(v) ? v.toFixed(2) : '(サンプル無し)')).join(' | ')} |`,
  );
}
console.log('');

const firstMoverRate = firstMoverScore / totalGames;
const drawRate = draws / totalGames;
const avgTurnsPerPlayer = turnsPerPlayerSum / totalGames;
const bankedRate = bankedTurns / globalTurns;
const stuckRate = stuckTurns / globalTurns;
const deckCycleAvg = deckCycleSamples.length > 0 ? avg(deckCycleSamples) : NaN;

console.log('## 表 3: そのほか');
console.log('');
console.log('| 項目 | 実測 |');
console.log('|---|---|');
console.log(`| 先手勝率 | ${pct(firstMoverRate)} |`);
console.log(`| 引き分け率 | ${pct(drawRate)} |`);
console.log(`| 平均ターン数（1 人あたり） | ${avgTurnsPerPlayer.toFixed(1)} |`);
console.log(`| 貯めターン率 | ${pct(bankedRate)} |`);
console.log(
  `| デッキ 1 周のターン数 | ${Number.isFinite(deckCycleAvg) ? deckCycleAvg.toFixed(2) : '(サンプル無し)'} |`,
);
console.log(`| 手札詰まり率 | ${pct(stuckRate)} |`);
console.log('');

console.log('## 表 4: 徴税官の状況判断');
console.log('');
console.log('| 項目 | 実測 |');
console.log('|---|---|');
console.log(`| 徴税官を使った回数 | ${taxmanTotal} |`);
console.log(
  `| そのうち相手のコインが 5 以上だった割合 | ${taxmanTotal > 0 ? pct(taxmanJustified / taxmanTotal) : '(使用無し)'} |`,
);
console.log(`| 相手のコインが 5 未満なのに使った回数 | ${taxmanWasted} |`);
console.log('');

console.log('## 表 5: 妨害・防御の札が状況を見ているか（相手の性格ごとの使用率）');
console.log('');
console.log(
  '衛兵の使用率が相手の性格によって変わらなければ、CPU は「とりあえず張っておけば評価が上がる」',
);
console.log('札として濫用しているだけで、実際の価値を見て使っているわけではない。');
console.log('');
const GUARD_CARDS: CardId[] = ['guard', 'taxman', 'blockader', 'spy'];
console.log(`| カード | ${PERSONAS.map((p) => `相手が${p.name}`).join(' | ')} | ばらつき（最大÷最小） |`);
console.log(`|---|${PERSONAS.map(() => '---').join('|')}|---|`);
for (const card of GUARD_CARDS) {
  const rates = PERSONAS.map((_, j) => {
    let used = 0;
    let turns = 0;
    for (let i = 0; i < N; i++) {
      if (i === j) continue;
      used += personaCardUsageByOpp[i]![j]![card];
      turns += personaTurnsByOpp[i]![j]!;
    }
    return turns > 0 ? used / turns : NaN;
  });
  const finite = rates.filter((v) => Number.isFinite(v));
  const spread = finite.length > 0 ? Math.max(...finite) / Math.max(Math.min(...finite), 1e-9) : NaN;
  console.log(
    `| ${CARD_NAMES[card]} | ${rates.map((v) => (Number.isFinite(v) ? pct(v) : '(対戦無し)')).join(' | ')} | ${Number.isFinite(spread) ? spread.toFixed(2) : '―'} |`,
  );
}
console.log('');

console.log('## 合格条件（今の姿を記録する基準線。いまは全部 ❌ でも構わない）');
console.log('');
console.log('| 条件 | 基準 | 実測 | 判定 |');
console.log('|---|---|---|---|');

const minMax = (values: number[]): [number, number] => [Math.min(...values), Math.max(...values)];

{
  const [lo, hi] = minMax(personaOverallWinRate);
  const ok = lo >= 0.45 && hi <= 0.55;
  console.log(
    `| どの性格も勝ち過ぎない | 総合勝率 45〜55% | ${pct(lo)}〜${pct(hi)} | ${ok ? '✅' : '❌'} |`,
  );
}
{
  // 使用率の絶対値ではなく、全カード使用に占める割合で見る。
  // 1 ターンあたり何枚使う経済かによって絶対値は上下するので、絶対値だと
  // 「満遍なく使われているか」を測れない。均等なら 10 枚それぞれ 10%。
  const rates = ALL_CARDS.map((c) => cardOverallRate.get(c)!);
  const total = rates.reduce((s, v) => s + v, 0);
  const shares = total > 0 ? rates.map((v) => v / total) : rates;
  const [lo, hi] = minMax(shares);
  const ok = lo >= 0.05 && hi <= 0.18;
  console.log(
    `| カードが満遍なく使われる | 10 枚のシェアが 5%〜18% | ${pct(lo)}〜${pct(hi)} | ${ok ? '✅' : '❌'} |`,
  );
}
{
  const ok = bankedRate >= 0.03;
  console.log(`| 貯めるプレイが存在する | 貯めターン率 3% 以上 | ${pct(bankedRate)} | ${ok ? '✅' : '❌'} |`);
}
{
  const ok = firstMoverRate >= 0.48 && firstMoverRate <= 0.52;
  console.log(`| 席の有利が小さい | 先手勝率 48〜52% | ${pct(firstMoverRate)} | ${ok ? '✅' : '❌'} |`);
}
{
  const ok = Number.isFinite(deckCycleAvg) && deckCycleAvg >= 2.5;
  console.log(
    `| 1 周が速すぎない | デッキ 1 周 2.5 ターン以上 | ${Number.isFinite(deckCycleAvg) ? deckCycleAvg.toFixed(2) : '(サンプル無し)'} | ${ok ? '✅' : '❌'} |`,
  );
}
