/** 難易度の段差を測る常設ツール。
 *
 *   npm run ladder              # 既定 200 試合 / 組
 *   npm run ladder -- 400       # 試合数を指定
 *   npm run ladder -- 100 hard  # 名前に「hard」を含む組だけ
 *
 * ゲーム内の CPU（optionsFor の やさしい・ふつう・つよい）を、
 *   1. 難易度同士
 *   2. 「何もしない（毎手番すぐ手番を終える）」相手
 *   3. scripts/searched-profiles.json の重み（npm run search の結果。揺らぎ 0・先読みなし）
 * と戦わせ、行の側から見た勝率を出す。あわせて つよい の 1 手番の思考時間を測る。
 *
 * 先手・後手は同数ずつ。試合の seed は「組の番号・先手後手・何試合目か」だけから決まるので、
 * 同じコマンドは必ず同じ結果になる。勝率の誤差の目安は ±2×√(p(1−p)/n)（約 95%）。 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { chooseAction, optionsFor, type AiOptions, type Difficulty } from '../src/ai/choose';
import type { Profile } from '../src/ai/evaluate';
import { DEFAULT_BALANCE } from '../src/game/balance';
import { reduce } from '../src/game/reducer';
import { createRng, type Rng } from '../src/game/rng';
import { opponentOf, winnerOf } from '../src/game/selectors';
import { createGame } from '../src/game/setup';
import type { Action, GameState, PlayerId } from '../src/game/types';

const balance = DEFAULT_BALANCE;

// ---------------------------------------------------------------------------
// 対戦相手
// ---------------------------------------------------------------------------

interface Player {
  name: string;
  /** null は「何もしない」。毎手番すぐ endTurn する */
  options: AiOptions | null;
  /** 1 手番ぶんの思考時間を記録するか */
  timed?: boolean;
}

const LABEL: Record<Difficulty, string> = { easy: 'やさしい', normal: 'ふつう', hard: 'つよい' };
const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];
const diffPlayer = (d: Difficulty): Player => ({ name: LABEL[d], options: optionsFor(d), timed: d === 'hard' });
const PASS: Player = { name: 'パスだけ', options: null };

function loadSearched(): Player[] {
  const path = fileURLToPath(new URL('./searched-profiles.json', import.meta.url));
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as { name: string; profile: Profile }[];
  return raw.map((r) => ({
    name: `探索:${r.name}`,
    options: { noise: 0, harassRate: 1, lookahead: false, profile: r.profile },
  }));
}
const SEARCHED = loadSearched();

// ---------------------------------------------------------------------------
// 1 試合
// ---------------------------------------------------------------------------

/** つよいの思考時間（ミリ秒）。1 手番 = startTurn のあと endTurn までの chooseAction の合計 */
const turnMs: number[] = [];
const callMs: number[] = [];

function forceFirst(g: GameState, first: PlayerId): GameState {
  if (g.current === first) return g;
  const next = structuredClone(g);
  next.current = first;
  next.players[first].coins = balance.startingCoins.first;
  next.players[opponentOf(first)].coins = balance.startingCoins.second;
  return next;
}

function playTurnOf(state: GameState, p: Player, rng: Rng): GameState {
  let next = reduce(state, { type: 'startTurn' }, balance);
  if (p.options) {
    let total = 0;
    for (let i = 0; i < 40; i++) {
      const t0 = p.timed ? performance.now() : 0;
      const action: Action = chooseAction(next, p.options, rng, balance);
      if (p.timed) {
        const dt = performance.now() - t0;
        callMs.push(dt);
        total += dt;
      }
      if (action.type === 'endTurn') break;
      const applied = reduce(next, action, balance);
      if (applied === next) break;
      next = applied;
    }
    if (p.timed) turnMs.push(total);
  }
  return reduce(next, { type: 'endTurn' }, balance);
}

/** A から見た結果（1 勝 / 0.5 引き分け / 0 負け） */
function playOne(seed: number, a: Player, b: Player, aFirst: boolean): number {
  let g = forceFirst(createGame(seed, balance), aFirst ? 'you' : 'cpu');
  const rng = createRng(seed * 65537 + 11);
  const of: Record<PlayerId, Player> = { you: a, cpu: b };
  for (let guard = 0; g.phase === 'playing' && guard < 100; guard++) {
    g = playTurnOf(g, of[g.current], rng);
  }
  const w = winnerOf(g, balance);
  return w === 'you' ? 1 : w === 'draw' || w === null ? 0.5 : 0;
}

// ---------------------------------------------------------------------------
// 組み合わせ
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const GAMES = Number(args.find((x) => /^\d+$/.test(x)) ?? 200);
const filter = args.find((x) => !/^\d+$/.test(x));

interface Pair {
  section: string;
  a: Player;
  b: Player;
  /** 目標の範囲（行の側の勝率）。表示用 */
  goal?: [number, number];
}

const [easy, normal, hard] = DIFFS.map(diffPlayer) as [Player, Player, Player];
const PAIRS: Pair[] = [
  { section: '難易度同士', a: normal, b: easy, goal: [0.7, 0.85] },
  { section: '難易度同士', a: hard, b: normal, goal: [0.7, 0.85] },
  { section: '難易度同士', a: hard, b: easy },
  { section: '対パス', a: easy, b: PASS, goal: [0.9, 1] },
  { section: '対パス', a: normal, b: PASS, goal: [0.9, 1] },
  { section: '対パス', a: hard, b: PASS, goal: [0.9, 1] },
  ...DIFFS.flatMap((d, i) =>
    SEARCHED.map((s): Pair => ({
      section: '対探索重み',
      a: [easy, normal, hard][i]!,
      b: s,
      ...(d === 'hard' ? { goal: [0.5, 1] as [number, number] } : {}),
    })),
  ),
];

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

console.log(`# 難易度の段差（${GAMES} 試合 / 組、先手 ${Math.floor(GAMES / 2)}・後手 ${GAMES - Math.floor(GAMES / 2)}）\n`);
console.log('| 区分 | 行 | 相手 | 勝率 | 誤差（±2σ） | 目標 | 判定 |');
console.log('|---|---|---|---|---|---|---|');

const startedAt = Date.now();
for (const pair of PAIRS) {
  const label = `${pair.a.name} 対 ${pair.b.name}`;
  if (filter && !label.includes(filter) && !pair.section.includes(filter)) continue;
  // seed は組の名前のハッシュから決める（表の並びを変えても同じ組は同じ試合になる）
  let h = 0;
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const base = (h % 1000) * 1_000_000;
  let score = 0;
  for (let k = 0; k < GAMES; k++) {
    const aFirst = k % 2 === 0;
    score += playOne(base + k, pair.a, pair.b, aFirst);
  }
  const p = score / GAMES;
  const err = 2 * Math.sqrt(Math.max(p * (1 - p), 0.0025) / GAMES);
  const goal = pair.goal;
  const goalText = goal ? (goal[1] >= 1 ? `${pct(goal[0])} 以上` : `${pct(goal[0])}〜${pct(goal[1])}`) : '―';
  const judge = goal ? (p >= goal[0] && p <= goal[1] ? '✅' : '❌') : '';
  console.log(`| ${pair.section} | ${pair.a.name} | ${pair.b.name} | ${pct(p)} | ±${pct(err)} | ${goalText} | ${judge} |`);
}

if (turnMs.length > 0) {
  const sorted = (xs: number[]) => [...xs].sort((x, y) => x - y);
  const q = (xs: number[], r: number) => xs[Math.min(xs.length - 1, Math.floor(xs.length * r))]!;
  const st = sorted(turnMs);
  const sc = sorted(callMs);
  const avg = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  console.log('');
  console.log('## つよいの思考時間（Node.js。ブラウザでもほぼ同じ桁）');
  console.log('');
  console.log('| 単位 | 回数 | 平均 | 95% | 最大 |');
  console.log('|---|---|---|---|---|');
  console.log(`| 1 手（chooseAction 1 回） | ${sc.length} | ${avg(sc).toFixed(2)}ms | ${q(sc, 0.95).toFixed(2)}ms | ${sc[sc.length - 1]!.toFixed(2)}ms |`);
  console.log(`| 1 手番（手番中の合計） | ${st.length} | ${avg(st).toFixed(1)}ms | ${q(st, 0.95).toFixed(1)}ms | ${st[st.length - 1]!.toFixed(1)}ms |`);
}
console.log('');
console.log(`所要時間 ${((Date.now() - startedAt) / 1000).toFixed(1)} 秒`);
