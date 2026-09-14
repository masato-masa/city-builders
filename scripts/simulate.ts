/** 対戦シミュレーター。常設の監査ツール。
 *
 *   npm run simulate
 *   npm run simulate -- 5000
 *
 * 数値を触ったら毎回走らせること。過去の測定結果は実装を変えたら古くなる。 */
import { playTurn, type Difficulty } from '../src/ai/choose';
import { DEFAULT_BALANCE } from '../src/game/balance';
import { reduce } from '../src/game/reducer';
import { createRng } from '../src/game/rng';
import { winnerOf } from '../src/game/selectors';
import { createGame } from '../src/game/setup';
import type { GameState, PlayerId } from '../src/game/types';

const GAMES = Number(process.argv[2] ?? 2000);

interface Result {
  winner: PlayerId | 'draw';
  turns: number;
  first: PlayerId;
  stuckTurns: number;
  totalTurns: number;
  harassUsed: number;
}

function runOne(seed: number, difficulty: Difficulty): Result {
  let g: GameState = createGame(seed, DEFAULT_BALANCE);
  const first = g.current;
  const rng = createRng(seed * 31 + 7);
  let stuckTurns = 0;
  let totalTurns = 0;
  let harassUsed = 0;

  while (g.phase === 'playing' && totalTurns < 200) {
    const before = g;
    // 詰まりは「行動フェーズに入った時点」で測る。開始フェーズの収入が入る前に測ると、
    // 貪欲な AI が前のターンに使い切った直後の残高を見ることになり、実態よりはるかに高く出る。
    const atAction = reduce(before, { type: 'startTurn' }, DEFAULT_BALANCE);
    g = playTurn(g, difficulty, rng, DEFAULT_BALANCE);
    totalTurns++;
    const p = atAction.players[atAction.current];
    const hand = p.deck.slice(0, DEFAULT_BALANCE.handSize);
    const unaffordable = hand.filter((c) => p.coins < DEFAULT_BALANCE.cards[c].cost).length;
    if (unaffordable >= 3) stuckTurns++;
    const used = g.players[before.current].usedThisTurn;
    if (used.includes('taxman') || used.includes('blockader')) harassUsed++;
  }

  return {
    winner: winnerOf(g, DEFAULT_BALANCE) ?? 'draw',
    turns: Math.ceil(totalTurns / 2),
    first,
    stuckTurns,
    totalTurns,
    harassUsed,
  };
}

const results: Result[] = [];
for (let seed = 0; seed < GAMES; seed++) {
  results.push(runOne(seed, 'normal'));
}

const firstWins = results.filter((r) => r.winner === r.first).length;
const draws = results.filter((r) => r.winner === 'draw').length;
const avgTurns = results.reduce((s, r) => s + r.turns, 0) / results.length;
const stuckRate =
  results.reduce((s, r) => s + r.stuckTurns, 0) / results.reduce((s, r) => s + r.totalTurns, 0);
const harassRate =
  results.reduce((s, r) => s + r.harassUsed, 0) / results.reduce((s, r) => s + r.totalTurns, 0);

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

console.log(`試合数: ${GAMES}`);
console.log('');
console.log('| 項目 | 実測 | 目標 |');
console.log('|---|---|---|');
console.log(`| 先手勝率 | ${pct(firstWins / GAMES)} | 48〜52% |`);
console.log(`| 引き分け率 | ${pct(draws / GAMES)} | 参考 |`);
console.log(`| 平均ターン数（1 人あたり） | ${avgTurns.toFixed(1)} | 12〜18 |`);
console.log(`| 手札詰まり率 | ${pct(stuckRate)} | 15% 未満 |`);
console.log(`| 妨害カード使用率 | ${pct(harassRate)} | 10〜25% |`);
