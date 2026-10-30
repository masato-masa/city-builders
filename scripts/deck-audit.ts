/** 抽選デッキの監査（常設）。「どのデッキでも先手 45〜55%、4 性格 42〜58% に収まるか」と、外れるデッキの共通点を測る。
 *
 *   npm run deck-audit                              # 240 通りのデッキ × 48 試合（4 性格の総当たり 6 組 × 先後 × 4）
 *   npm run deck-audit -- decks=300 games=24 workers=10
 *
 * 1 つのデッキに数十試合では誤差（±10% 以上）が大きすぎて、デッキごとの勝率を直接は判定できない。そこで
 *   1. 全試合をまとめた先手勝率・性格の勝率
 *   2. デッキごとの実測のばらつきが、純粋な誤差（二項分布）より大きいか（大きければ、デッキで偏りが出ている）
 *   3. カード 12 種の有無の足し算（最小二乗）で、ありうる全デッキ（12 種から 6 = 924 通り）の勝率を推定し、
 *      範囲を外れるデッキの割合と、その共通点（どのカードが入る/入らないと外れるか）
 *   4. カード 2 枚の組み合わせの偏り（足し算で説明できない分が大きい組）
 * を出す。乱数は seed だけから決まり、同じコマンドは同じ結果になる。並列は子プロセス（workers）。 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chooseAction, type AiOptions } from '../src/ai/choose';
import type { Profile } from '../src/ai/evaluate';
import { CARD_NAMES, CARD_POOL, CORE_CARDS } from '../src/game/balance';
import { reduce } from '../src/game/reducer';
import { createRng } from '../src/game/rng';
import { doubleSourceOf, opponentOf, winnerOf } from '../src/game/selectors';
import { createGame, drawDeck } from '../src/game/setup';
import type { CardId, GameState, PlayerId } from '../src/game/types';

import { balanceFromEnv } from './balance-override';

const balance = balanceFromEnv();
const argv = process.argv.slice(2);
const opt = (name: string, def: number) => Number(argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1) ?? def);
const DECKS = opt('decks', 240);
/** 1 デッキあたりの試合数。12 の倍数（6 組 × 先後）に切り上げる */
const GAMES = Math.ceil(opt('games', 48) / 12) * 12;
const WORKERS = opt('workers', 10);
const workerArg = argv.find((a) => a.startsWith('--worker='))?.slice('--worker='.length);

/** コア以外の 12 種（抽選で入ったり入らなかったりする札） */
const OPTIONAL: CardId[] = CARD_POOL.filter((c) => !CORE_CARDS.includes(c));

interface Persona {
  name: string;
  profile: Profile;
}
function loadPersonas(): Persona[] {
  const path = fileURLToPath(new URL('./searched-profiles.json', import.meta.url));
  if (!existsSync(path)) throw new Error('scripts/searched-profiles.json がありません（npm run search の結果）');
  return (JSON.parse(readFileSync(path, 'utf-8')) as Persona[]).map((r) => ({ name: r.name, profile: r.profile }));
}
const PERSONAS = loadPersonas();
const P = PERSONAS.length;
const PAIRS: [number, number][] = [];
for (let i = 0; i < P; i++) for (let j = i + 1; j < P; j++) PAIRS.push([i, j]);

/** 監査するデッキの並び。seed 0, 1, 2, … の抽選から重複を除いて DECKS 通り */
function deckList(): CardId[][] {
  const seen = new Set<string>();
  const out: CardId[][] = [];
  for (let s = 0; out.length < DECKS && s < DECKS * 50; s++) {
    const d = drawDeck(s, balance);
    const key = d.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

interface DeckResult {
  index: number;
  deck: CardId[];
  games: number;
  /** 先手の得点（勝ち 1・引き分け 0.5） */
  first: number;
  score: number[];
  played: number[];
  titleMoves: number;
  acquires: number;
  stuckTurns: number;
  turns: number;
  doubleSources: Partial<Record<CardId, number>>;
}

function optionsOf(p: Persona): AiOptions {
  return { noise: 0, harassRate: 1, lookahead: false, profile: p.profile };
}

function playDeck(index: number, deck: CardId[]): DeckResult {
  const r: DeckResult = {
    index,
    deck,
    games: 0,
    first: 0,
    score: new Array(P).fill(0) as number[],
    played: new Array(P).fill(0) as number[],
    titleMoves: 0,
    acquires: 0,
    stuckTurns: 0,
    turns: 0,
    doubleSources: {},
  };
  for (let k = 0; k < GAMES; k++) {
    const [i, j] = PAIRS[k % PAIRS.length]!;
    const aFirst = Math.floor(k / PAIRS.length) % 2 === 0;
    const seed = 50_000_000 + index * 1000 + k;
    let g: GameState = createGame(seed, balance, undefined, { you: deck, cpu: deck });
    const first: PlayerId = aFirst ? 'you' : 'cpu';
    if (g.current !== first) {
      g = structuredClone(g);
      g.current = first;
      g.players[first].coins = balance.startingCoins.first;
      g.players[opponentOf(first)].coins = balance.startingCoins.second;
    }
    const opts: Record<PlayerId, AiOptions> = { you: optionsOf(PERSONAS[i]!), cpu: optionsOf(PERSONAS[j]!) };
    const rng = createRng(seed * 65537 + 11);
    for (let guard = 0; g.phase === 'playing' && guard < 100; guard++) {
      const player = g.current;
      let next = reduce(g, { type: 'startTurn' }, balance);
      r.turns++;
      const p = next.players[player];
      if (p.hand.filter((c) => c !== null && p.coins < balance.cards[c].cost).length >= 3) r.stuckTurns++;
      for (let n = 0; n < 40; n++) {
        const action = chooseAction(next, opts[player], rng, balance);
        if (action.type === 'endTurn') break;
        const applied = reduce(next, action, balance);
        if (applied === next) break;
        if (action.type === 'acquire') r.acquires++;
        if (action.type === 'useCard' && action.card === 'double') {
          const src = doubleSourceOf(next, player, balance);
          if (src) r.doubleSources[src] = (r.doubleSources[src] ?? 0) + 1;
        }
        next.titles.forEach((t, d) => {
          const after = applied.titles[d] ?? null;
          if (t !== null && after !== null && t !== after) r.titleMoves++;
        });
        next = applied;
      }
      g = reduce(next, { type: 'endTurn' }, balance);
    }
    const w = winnerOf(g, balance);
    const aScore = w === 'you' ? 1 : w === 'cpu' ? 0 : 0.5;
    r.games++;
    r.first += aFirst ? aScore : 1 - aScore;
    r.score[i]! += aScore;
    r.score[j]! += 1 - aScore;
    r.played[i]! += 1;
    r.played[j]! += 1;
  }
  return r;
}

// ---------------------------------------------------------------------------
// 子プロセス: 担当のデッキを回して 1 行ずつ JSON で返す
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const started = Date.now();
  const tsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
  const self = fileURLToPath(import.meta.url);
  const results: DeckResult[] = [];
  await Promise.all(
    Array.from({ length: WORKERS }, (_, w) =>
      new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, [tsx, self, `--worker=${w}/${WORKERS}`, `decks=${DECKS}`, `games=${GAMES}`], {
          env: process.env,
          stdio: ['ignore', 'pipe', 'inherit'],
        });
        let buf = '';
        child.stdout.on('data', (d: Buffer) => {
          buf += d.toString('utf-8');
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (line) results.push(JSON.parse(line) as DeckResult);
          }
        });
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${w} exit ${code}`))));
      }),
    ),
  );
  results.sort((a, b) => a.index - b.index);
  const dump = argv.find((a) => a.startsWith('dump='))?.slice('dump='.length);
  if (dump) writeFileSync(dump, JSON.stringify(results));
  report(results, (Date.now() - started) / 1000);
}

// ---------------------------------------------------------------------------
// 集計
// ---------------------------------------------------------------------------

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** 最小二乗（12 種の有無、切片なし）。抽選のデッキは必ず 6 種入るので、切片を入れると係数が決まらない
 *  （切片は 12 の係数に 1/6 ずつ溶ける）。ガウスの消去法。 */
function fit(rows: { x: number[]; y: number; w: number }[]): number[] {
  const k = rows[0]!.x.length;
  const A = Array.from({ length: k }, () => new Array(k + 1).fill(0) as number[]);
  for (const { x, y, w } of rows) {
    const v = x;
    for (let a = 0; a < k; a++) {
      for (let b = 0; b < k; b++) A[a]![b]! += w * v[a]! * v[b]!;
      A[a]![k]! += w * v[a]! * y;
    }
  }
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[piv]![c]!)) piv = r;
    [A[c], A[piv]] = [A[piv]!, A[c]!];
    for (let r = 0; r < k; r++) {
      if (r === c || A[c]![c] === 0) continue;
      const f = A[r]![c]! / A[c]![c]!;
      for (let cc = c; cc <= k; cc++) A[r]![cc]! -= f * A[c]![cc]!;
    }
  }
  return A.map((row, i) => row[k]! / row[i]!);
}

/** 抽選で出るデッキと、その出やすさ（seed 0〜19999 の drawDeck の頻度）。抽選に偏り（役割ごとの最低枚数など）が
 *  あっても、実際に配られる割合で数える */
function drawnDecks(): { deck: CardId[]; weight: number }[] {
  const freq = new Map<string, { deck: CardId[]; weight: number }>();
  const N = 20_000;
  for (let s = 0; s < N; s++) {
    const d = drawDeck(s, balance);
    const key = d.join(',');
    const e = freq.get(key);
    if (e) e.weight += 1 / N;
    else freq.set(key, { deck: d, weight: 1 / N });
  }
  return [...freq.values()];
}

function report(results: DeckResult[], seconds: number): void {
  const games = results.reduce((s, r) => s + r.games, 0);
  console.log(`# 抽選デッキの監査（${results.length} 通りのデッキ × ${GAMES} 試合 = ${games} 試合、${seconds.toFixed(0)} 秒）\n`);

  // 1. 全体
  const first = results.reduce((s, r) => s + r.first, 0) / games;
  const overall = PERSONAS.map(
    (_, k) => results.reduce((s, r) => s + r.score[k]!, 0) / results.reduce((s, r) => s + r.played[k]!, 0),
  );
  console.log('## 全体');
  console.log('');
  console.log(`| 先手 | ${PERSONAS.map((p) => p.name).join(' | ')} | 称号の移動/試合 | 買収/試合 | 手札詰まり率 |`);
  console.log(`|---|${PERSONAS.map(() => '---').join('|')}|---|---|---|`);
  const turns = results.reduce((s, r) => s + r.turns, 0);
  console.log(
    `| ${pct(first)} | ${overall.map(pct).join(' | ')} | ${(results.reduce((s, r) => s + r.titleMoves, 0) / games).toFixed(2)} | ${(
      results.reduce((s, r) => s + r.acquires, 0) / games
    ).toFixed(2)} | ${pct(results.reduce((s, r) => s + r.stuckTurns, 0) / turns)} |`,
  );
  console.log('');

  // 2. デッキごとのばらつき（実測の分散 と 二項分布の誤差の分散）
  console.log('## デッキごとの実測のばらつき（誤差だけなら「実測の標準偏差 ≒ 誤差の標準偏差」）');
  console.log('');
  console.log('| 指標 | デッキごとの平均 | 実測の標準偏差 | 誤差の標準偏差 | デッキ由来の標準偏差（推定） | 範囲外のデッキ（実測） |');
  console.log('|---|---|---|---|---|---|');
  const spread = (name: string, vals: number[], n: number, lo: number, hi: number) => {
    const m = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / (vals.length - 1));
    const noise = Math.sqrt((m * (1 - m)) / n);
    const real = Math.sqrt(Math.max(0, sd ** 2 - noise ** 2));
    const out = vals.filter((v) => v < lo || v > hi).length;
    console.log(`| ${name} | ${pct(m)} | ${pct(sd)} | ${pct(noise)} | ${pct(real)} | ${out}/${vals.length} |`);
  };
  spread('先手勝率', results.map((r) => r.first / r.games), GAMES, 0.45, 0.55);
  PERSONAS.forEach((p, k) =>
    spread(`${p.name}の勝率`, results.map((r) => r.score[k]! / r.played[k]!), GAMES / 2, 0.42, 0.58),
  );
  console.log('');

  // 3. カードの有無の足し算で、ありうる全デッキの勝率を推定する
  const x = (deck: CardId[]): number[] => OPTIONAL.map((c) => (deck.includes(c) ? 1 : 0));
  const firstCoef = fit(results.map((r) => ({ x: x(r.deck), y: r.first / r.games, w: r.games })));
  const personaCoef = PERSONAS.map((_, k) =>
    fit(results.map((r) => ({ x: x(r.deck), y: r.score[k]! / r.played[k]!, w: r.played[k]! }))),
  );
  console.log('## カード 1 枚が入ったときの勝率の動き（足し算の係数から、12 種の平均的な札と入れ替えたときの差）');
  console.log('');
  console.log(`| カード | 先手 | ${PERSONAS.map((p) => p.name).join(' | ')} |`);
  console.log(`|---|---|${PERSONAS.map(() => '---').join('|')}|`);
  const sgn = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}`;
  const rel = (co: number[], i: number) => co[i]! - co.reduce((s, v) => s + v, 0) / co.length;
  OPTIONAL.forEach((c, i) => {
    console.log(`| ${CARD_NAMES[c]} | ${sgn(rel(firstCoef, i))} | ${personaCoef.map((co) => sgn(rel(co, i))).join(' | ')} |`);
  });
  console.log('');

  const predict = (coef: number[], deck: CardId[]) => x(deck).reduce((s, v, i) => s + v * coef[i]!, 0);
  const every = drawnDecks();
  const flagged = every.map(({ deck, weight }) => {
    const f = predict(firstCoef, deck);
    const ps = personaCoef.map((co) => predict(co, deck));
    const firstOut = f < 0.45 || f > 0.55;
    const personaOut = ps.some((v) => v < 0.42 || v > 0.58);
    return { deck, weight, f, ps, firstOut, personaOut };
  });
  const share = (fn: (d: (typeof flagged)[number]) => boolean) =>
    flagged.filter(fn).reduce((s, d) => s + d.weight, 0);
  const nFirst = share((d) => d.firstOut);
  const nPersona = share((d) => d.personaOut);
  const nEither = share((d) => d.firstOut || d.personaOut);
  console.log(`## 抽選で出るデッキ（${every.length} 通り、出やすさで重み付け）の推定`);
  console.log('');
  console.log('| 条件 | 外れるデッキの割合 |');
  console.log('|---|---|');
  console.log(`| 先手 45〜55% | ${pct(nFirst)} |`);
  console.log(`| 4 性格 42〜58% | ${pct(nPersona)} |`);
  console.log(`| どちらか | ${pct(nEither)} |`);
  console.log('');
  const out = flagged.filter((d) => d.firstOut || d.personaOut);
  if (out.length > 0) {
    const outW = out.reduce((s, d) => s + d.weight, 0);
    const inAll = (c: CardId) => share((d) => d.deck.includes(c));
    console.log('外れるデッキに入っている割合（右は抽選で出るデッキ全体での割合）:');
    console.log('');
    console.log('| カード | 外れるデッキでの割合 | 全体 |');
    console.log('|---|---|---|');
    OPTIONAL.map((c) => ({ c, r: out.filter((d) => d.deck.includes(c)).reduce((s, d) => s + d.weight, 0) / outW, all: inAll(c) }))
      .sort((a, b) => Math.abs(b.r - b.all) - Math.abs(a.r - a.all))
      .forEach(({ c, r, all }) => console.log(`| ${CARD_NAMES[c]} | ${pct(r)} | ${pct(all)} |`));
    console.log('');
    const worst = [...out]
      .sort((a, b) => {
        const dev = (d: typeof a) => Math.max(Math.abs(d.f - 0.5) / 0.05, ...d.ps.map((v) => Math.abs(v - 0.5) / 0.08));
        return dev(b) - dev(a);
      })
      .slice(0, 5);
    console.log(`| いちばん外れるデッキ（コア以外の 6 枚） | 先手 | ${PERSONAS.map((p) => p.name).join(' | ')} |`);
    console.log(`|---|---|${PERSONAS.map(() => '---').join('|')}|`);
    for (const d of worst) {
      const names = d.deck.filter((c) => !CORE_CARDS.includes(c)).map((c) => CARD_NAMES[c]).join('・');
      console.log(`| ${names} | ${pct(d.f)} | ${d.ps.map(pct).join(' | ')} |`);
    }
    console.log('');
  }

  // 4. 2 枚の組み合わせ: 足し算の推定からのずれ（実測 − 推定）が大きい組
  const pairs: { a: CardId; b: CardId; n: number; dev: number[] }[] = [];
  for (let i = 0; i < OPTIONAL.length; i++) {
    for (let j = i + 1; j < OPTIONAL.length; j++) {
      const a = OPTIONAL[i]!;
      const b = OPTIONAL[j]!;
      const rs = results.filter((r) => r.deck.includes(a) && r.deck.includes(b));
      if (rs.length === 0) continue;
      const n = rs.reduce((s, r) => s + r.games, 0);
      const dev = PERSONAS.map((_, k) => {
        const played = rs.reduce((s, r) => s + r.played[k]!, 0);
        const obs = rs.reduce((s, r) => s + r.score[k]!, 0) / played;
        const pred = rs.reduce((s, r) => s + predict(personaCoef[k]!, r.deck) * r.played[k]!, 0) / played;
        return obs - pred;
      });
      pairs.push({ a, b, n, dev });
    }
  }
  pairs.sort((p, q) => Math.max(...q.dev.map(Math.abs)) - Math.max(...p.dev.map(Math.abs)));
  console.log('## 足し算で説明できない 2 枚の組（性格の勝率の 実測 − 推定、大きい順に 6 組）');
  console.log('');
  console.log(`| 組 | 試合 | ${PERSONAS.map((p) => p.name).join(' | ')} |`);
  console.log(`|---|---|${PERSONAS.map(() => '---').join('|')}|`);
  for (const p of pairs.slice(0, 6)) {
    console.log(`| ${CARD_NAMES[p.a]}＋${CARD_NAMES[p.b]} | ${p.n} | ${p.dev.map(sgn).join(' | ')} |`);
  }
  console.log('');

  // 影武者の対象
  const dbl: Partial<Record<CardId, number>> = {};
  for (const r of results) for (const [c, n] of Object.entries(r.doubleSources) as [CardId, number][]) dbl[c] = (dbl[c] ?? 0) + n;
  const dTotal = Object.values(dbl).reduce((s, v) => s + (v ?? 0), 0);
  if (dTotal > 0) {
    console.log('## 影武者が写した札');
    console.log('');
    console.log(
      (Object.entries(dbl) as [CardId, number][])
        .sort((a, b) => b[1] - a[1])
        .map(([c, n]) => `${CARD_NAMES[c]} ${pct(n / dTotal)}`)
        .join(' / '),
    );
    console.log('');
  }
}

// 入口（集計の関数・定数が初期化されたあとで動かす）
if (workerArg) {
  const [w, n] = workerArg.split('/').map(Number) as [number, number];
  deckList().forEach((deck, index) => {
    if (index % n !== w) return;
    process.stdout.write(`${JSON.stringify(playDeck(index, deck))}\n`);
  });
} else {
  await main();
}
