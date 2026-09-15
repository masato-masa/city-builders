/** 重みの自動探索。
 *
 *   npm run search              # 既定 200 試合 / 評価
 *   npm run search -- 300
 *
 * 「戦略」を人間が定義するのをやめて、4 つの異なる出発点から重み（Profile）を
 * 座標上昇法で自動探索し、どこへ収束するかを見る。全部が同じ場所へ収束したら
 * 勝ち筋は 1 本しかない。別々の場所に留まって拮抗するなら複数の戦略が成立している。
 *
 * 乱数は src/game/rng.ts の seeded PRNG のみを使う。試合の seed は
 * 「出発点の番号・パス番号・項目番号・試した値の番号・先手後手・何試合目か」という
 * 「引数」だけから決まるので、同じコマンドを 2 回走らせれば必ず同じ結果になる。 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { type AiOptions } from '../src/ai/choose';
import { playTurn } from '../src/ai/choose';
import { DEFAULT_PROFILE, DEFAULT_WEIGHTS, type Profile, type Weights } from '../src/ai/evaluate';
import { DEFAULT_BALANCE, type Balance } from '../src/game/balance';
import { createRng } from '../src/game/rng';
import { opponentOf, winnerOf } from '../src/game/selectors';
import { createGame } from '../src/game/setup';
import type { GameState, PlayerId } from '../src/game/types';

// ---------------------------------------------------------------------------
// 探索する 8 項目・出発点
// ---------------------------------------------------------------------------

/** 探索する 8 項目。残り（opponentVp / stuck / opponentStuck / debt / guarded /
 *  opponentIncome）は探索の次元を絞るため DEFAULT_WEIGHTS の値で固定する。 */
const SEARCHED_KEYS = [
  'vp',
  'coin',
  'opponentCoin',
  'pendingIncome',
  'incomePerTurn',
  'reach',
  'opponentReach',
  'opponentBound',
] as const satisfies readonly (keyof Weights)[];

type SearchedKey = (typeof SEARCHED_KEYS)[number];

/** early と late、それぞれ 8 項目で合計 16 次元。early を先、late を後にする。 */
const DIMENSIONS: { phase: 'early' | 'late'; key: SearchedKey }[] = [
  ...SEARCHED_KEYS.map((key) => ({ phase: 'early' as const, key })),
  ...SEARCHED_KEYS.map((key) => ({ phase: 'late' as const, key })),
];

function withOverrides(overrides: Partial<Record<SearchedKey, number>>): Weights {
  return { ...DEFAULT_WEIGHTS, ...overrides };
}

interface StartingPoint {
  name: string;
  profile: Profile;
}

/** 4 つの出発点。「戦略」を人間が決め打ちするのではなく、探索の初期値として
 *  与えるだけ。ここから座標上昇法で自動的に動かしていく。 */
const STARTING_POINTS: StartingPoint[] = [
  {
    name: '回転',
    profile: {
      early: withOverrides({
        pendingIncome: DEFAULT_WEIGHTS.pendingIncome * 2,
        incomePerTurn: DEFAULT_WEIGHTS.incomePerTurn * 2,
        coin: DEFAULT_WEIGHTS.coin * 0.5,
      }),
      late: withOverrides({
        pendingIncome: DEFAULT_WEIGHTS.pendingIncome * 2,
        incomePerTurn: DEFAULT_WEIGHTS.incomePerTurn * 2,
        coin: DEFAULT_WEIGHTS.coin * 0.5,
      }),
    },
  },
  {
    name: '妨害',
    profile: {
      early: withOverrides({
        opponentCoin: DEFAULT_WEIGHTS.opponentCoin * 2,
        opponentReach: DEFAULT_WEIGHTS.opponentReach * 2,
        opponentBound: DEFAULT_WEIGHTS.opponentBound * 2,
      }),
      late: withOverrides({
        opponentCoin: DEFAULT_WEIGHTS.opponentCoin * 2,
        opponentReach: DEFAULT_WEIGHTS.opponentReach * 2,
        opponentBound: DEFAULT_WEIGHTS.opponentBound * 2,
      }),
    },
  },
  {
    name: '大器晩成',
    profile: {
      early: withOverrides({
        coin: DEFAULT_WEIGHTS.coin * 2,
        reach: DEFAULT_WEIGHTS.reach * 0.5,
      }),
      late: withOverrides({
        reach: DEFAULT_WEIGHTS.reach * 2,
        vp: DEFAULT_WEIGHTS.vp * 1.5,
      }),
    },
  },
  {
    name: '均衡',
    profile: { early: DEFAULT_WEIGHTS, late: DEFAULT_WEIGHTS },
  },
];

// ---------------------------------------------------------------------------
// 適合度（固定の参照相手への勝率）
// ---------------------------------------------------------------------------

/** forceFirst: createGame は seed から先手をランダムに決めるが、
 *  先手/後手を明示的に同数ずつ用意したいので、ここで上書きする。
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

function playOneGame(
  seed: number,
  optionsA: AiOptions,
  optionsB: AiOptions,
  firstIsA: boolean,
  balance: Balance,
): 'A' | 'B' | 'draw' {
  let g = createGame(seed, balance);
  g = forceFirst(g, firstIsA ? 'you' : 'cpu', balance);
  const rng = createRng(seed * 65537 + 11);
  const optionsOf: Record<PlayerId, AiOptions> = { you: optionsA, cpu: optionsB };

  let guard = 0;
  while (g.phase === 'playing' && guard < 100) {
    guard++;
    g = playTurn(g, optionsOf[g.current], rng, balance);
  }

  const raw = winnerOf(g, balance);
  if (raw === 'draw' || raw === null) return 'draw';
  return raw === 'you' ? 'A' : 'B';
}

function optionsForProfile(profile: Profile): AiOptions {
  return { noise: 0, harassRate: 1, lookahead: false, profile };
}

/** candidate が reference（固定の参照相手）に対してどれくらい勝てるか。
 *  先手・後手を同数ずつ戦わせる。evalSeed だけから全試合の seed が決まるので、
 *  同じ evalSeed・同じ games からは必ず同じ勝率が出る。 */
function fitnessOf(candidate: Profile, reference: Profile, evalSeed: number, games: number, balance: Balance): number {
  const optionsA = optionsForProfile(candidate);
  const optionsB = optionsForProfile(reference);
  const firstHalf = Math.floor(games / 2);
  const secondHalf = games - firstHalf;

  let wins = 0;
  for (let i = 0; i < firstHalf; i++) {
    const seed = evalSeed * 1_000_000 + i;
    const result = playOneGame(seed, optionsA, optionsB, true, balance);
    wins += result === 'A' ? 1 : result === 'draw' ? 0.5 : 0;
  }
  for (let i = 0; i < secondHalf; i++) {
    const seed = evalSeed * 1_000_000 + 500_000 + i;
    const result = playOneGame(seed, optionsA, optionsB, false, balance);
    wins += result === 'A' ? 1 : result === 'draw' ? 0.5 : 0;
  }
  return wins / games;
}

// ---------------------------------------------------------------------------
// 座標上昇法
// ---------------------------------------------------------------------------

const PASSES = 3;

/** 現在値から試す 3 通りの値。0 のときは −1/0/+1。
 *  先頭に現在値を置く（同点のときは変化させない = 安定性のため）。 */
function candidatesFor(current: number): number[] {
  if (current === 0) return [0, -1, 1];
  return [current, current * 0.5, current * 2];
}

interface SearchResult {
  name: string;
  start: Profile;
  before: number;
  converged: Profile;
  after: number;
  passesRun: number;
}

/** 出発点の番号・パス番号・項目番号・試した値の番号だけから評価用の seed を決める。 */
function evalSeedFor(startIdx: number, pass: number, dimIdx: number, valIdx: number): number {
  return ((startIdx * PASSES + pass) * DIMENSIONS.length + dimIdx) * 3 + valIdx;
}

function cloneProfile(p: Profile): Profile {
  return { early: { ...p.early }, late: { ...p.late } };
}

function search(startIdx: number, start: StartingPoint, games: number, balance: Balance): SearchResult {
  const reference = DEFAULT_PROFILE;

  let current = cloneProfile(start.profile);
  let passesRun = 0;
  // 「探索前」の勝率 = 最初に評価する候補（pass0/dim0/valIdx0 は現在値そのもの）の適合度。
  // 「探索後」の勝率 = 最後に採用した候補の適合度（そのときまでに他の次元は確定済みなので、
  // 完成した Profile 全体の適合度と一致する）。どちらも探索の過程で得られる値をそのまま使い、
  // 余計な評価（＝余計な試合）を増やさない。
  let before = -Infinity;
  let after = -Infinity;

  for (let pass = 0; pass < PASSES; pass++) {
    let changedAny = false;
    for (let dimIdx = 0; dimIdx < DIMENSIONS.length; dimIdx++) {
      const dim = DIMENSIONS[dimIdx]!;
      const side = current[dim.phase];
      const curVal = side[dim.key];
      const candidates = candidatesFor(curVal);

      let bestVal = candidates[0]!;
      let bestFitness = -Infinity;
      for (let valIdx = 0; valIdx < candidates.length; valIdx++) {
        const val = candidates[valIdx]!;
        const trial = cloneProfile(current);
        trial[dim.phase][dim.key] = val;
        const seed = evalSeedFor(startIdx, pass, dimIdx, valIdx);
        const fitness = fitnessOf(trial, reference, seed, games, balance);
        if (before === -Infinity) before = fitness; // 一番最初の評価
        if (fitness > bestFitness) {
          bestFitness = fitness;
          bestVal = val;
        }
      }

      after = bestFitness;
      if (bestVal !== curVal) changedAny = true;
      current[dim.phase][dim.key] = bestVal;
    }
    passesRun++;
    if (!changedAny) break;
  }

  return { name: start.name, start: start.profile, before, converged: current, after, passesRun };
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------

const GAMES_PER_EVAL = Number(process.argv[2] ?? 200);
const balance = DEFAULT_BALANCE;

const startedAt = Date.now();
const results = STARTING_POINTS.map((sp, i) => search(i, sp, GAMES_PER_EVAL, balance));
const elapsedMs = Date.now() - startedAt;

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const num = (v: number) => v.toFixed(3);

console.log(`# 重みの自動探索\n`);
console.log(`試合数: 評価 1 回あたり ${GAMES_PER_EVAL} 試合（先手 ${Math.floor(GAMES_PER_EVAL / 2)} / 後手 ${GAMES_PER_EVAL - Math.floor(GAMES_PER_EVAL / 2)}）`);
console.log(`所要時間: ${(elapsedMs / 1000).toFixed(1)} 秒`);
console.log('');

console.log('## 表 A: 収束した重み');
console.log('');
console.log(`| 項目 | ${results.map((r) => r.name).join(' | ')} | ばらつき |`);
console.log(`|---|${results.map(() => '---').join('|')}|---|`);

let matchedDims = 0;
const ratioLabels: string[] = [];
for (const dim of DIMENSIONS) {
  const values = results.map((r) => r.converged[dim.phase][dim.key]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  let spread: string;
  let matched: boolean;
  if (lo >= 0) {
    // 全部 0 以上なら最大 ÷ 最小（0 除算は「値が 0 に集まった」ことにする）
    const ratio = lo === 0 ? (hi === 0 ? 1 : Infinity) : hi / lo;
    spread = `${Number.isFinite(ratio) ? ratio.toFixed(2) : '∞'}（比）`;
    matched = ratio <= 2;
  } else {
    // 0 や負が混ざるなら最大 − 最小で代用
    const diff = hi - lo;
    spread = `${diff.toFixed(2)}（差）`;
    // 差ベースのときは DEFAULT_WEIGHTS の絶対値を単位にして「2 倍以内」を判定する
    const scale = Math.abs(DEFAULT_WEIGHTS[dim.key]) || 1;
    matched = diff <= scale;
  }
  if (matched) matchedDims++;
  ratioLabels.push(spread);
  const label = `${dim.phase === 'early' ? '序盤' : '終盤'}.${dim.key}`;
  console.log(`| ${label} | ${values.map(num).join(' | ')} | ${spread} |`);
}
console.log('');

console.log('## 表 B: 参照相手（均衡＝DEFAULT_PROFILE）への勝率');
console.log('');
console.log(`| 出発点 | 探索前 | 探索後 | 実施パス数 |`);
console.log(`|---|---|---|---|`);
for (const r of results) {
  console.log(`| ${r.name} | ${pct(r.before)} | ${pct(r.after)} | ${r.passesRun} |`);
}
console.log('');

console.log('## 判定');
console.log('');
console.log(
  `16 項目中 ${matchedDims} 項目が一致（4 つの出発点の値が互いに 2 倍以内 / DEFAULT_WEIGHTS の絶対値以内に収まっている項目数）`,
);
if (matchedDims >= 12) {
  console.log('');
  console.log('**同じ場所へ収束した＝勝ち筋は 1 本。**');
} else {
  console.log('');
  console.log('**別々の場所に留まった＝複数の戦略が成立している可能性がある。**');
}
console.log('');

// ---------------------------------------------------------------------------
// scripts/searched-profiles.json への保存
// ---------------------------------------------------------------------------

const outPath = fileURLToPath(new URL('./searched-profiles.json', import.meta.url));
const payload = results.map((r) => ({ name: r.name, profile: r.converged }));
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
console.error(`探索結果を ${outPath} に保存しました。`);
