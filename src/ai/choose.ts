import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { legalActions, reduce } from '@/game/reducer';
import type { Rng } from '@/game/rng';
import type { Action, CardId, GameState, PlayerId } from '@/game/types';

import { evaluateState, weightsAt, type Profile, type Weights } from './evaluate';
import { CPU_PROFILE } from './profiles';

export type Difficulty = 'easy' | 'normal' | 'hard';

/** 難易度ごとの揺らぎ。3 段とも同じ重み（CPU_PROFILE）を使い、段差はここと下の 2 つで付ける。
 *  値は scripts/difficulty-ladder.ts（npm run ladder）で測って決めた:
 *  ふつう→やさしい、つよい→ふつう がそれぞれ 70〜85% になるように（200 試合/組で 78.5% / 76.5%。
 *  ふつうの揺らぎ 8 では つよい→ふつう が 69.5% で下に外れた）。
 *  地区の称号を入れたら ふつう→やさしい が縮んだ（400 試合: 称号なし 72.6% → あり 68.5%）ので、
 *  やさしいの揺らぎを 20 → 26 にした（同 75.1%。32 では 78.6%）。 */
const NOISE: Record<Difficulty, number> = { easy: 26, normal: 10, hard: 0 };

/** 妨害カードを検討する確率。easy は妨害をあまり撃たない。 */
const HARASS_RATE: Record<Difficulty, number> = { easy: 0.5, normal: 0.8, hard: 1 };

/** 先読みの評価を、直後の静的な評価に混ぜる割合。 */
const LOOKAHEAD_BLEND = 0.4;

/** 先読みで 1 手番のうちに打つ手の上限（自分の残り・相手の手番それぞれ）。
 *  実際の手番は 2〜4 手が多い。上限は思考時間の安全網。 */
const LOOKAHEAD_STEPS = 6;

/** 先読みする候補の数。静的な評価で上位のものだけ読む。
 *  全部読む場合と強さは誤差の範囲で同じ（つよい 対 揺らぎ 6 の同じ重み、200 試合×2: 全部 69.8/74.5%、上位 3 つ 69.5/71.3%）で、
 *  1 手番の思考時間は 最大 450ms → 83ms（Node.js、10 試合）に下がる。 */
const LOOKAHEAD_TOP = 3;

/** 指し手選択を細かく指定するための束。難易度はこれの既定セットの名前でしかない。 */
export interface AiOptions {
  /** 評価値に乗せる揺らぎの幅 */
  noise: number;
  /** 妨害カードを検討する確率 */
  harassRate: number;
  /** 相手の次の手番まで読むか */
  lookahead: boolean;
  profile: Profile;
  /** カードごとの加点。計測ツール（scripts/card-value.ts）専用で、通常の CPU は使わない。
   *  大きな負値で「そのカードを使わない」、正値で「優先して使う」を作れる。 */
  cardBonus?: Partial<Record<CardId, number>>;
}

/** 難易度から AiOptions を作る。重みは 3 段とも CPU_PROFILE。 */
export function optionsFor(difficulty: Difficulty): AiOptions {
  return {
    noise: NOISE[difficulty],
    harassRate: HARASS_RATE[difficulty],
    lookahead: difficulty === 'hard',
    profile: CPU_PROFILE,
  };
}

function resolveOptions(difficulty: Difficulty | AiOptions): AiOptions {
  return typeof difficulty === 'string' ? optionsFor(difficulty) : difficulty;
}

function isHarass(action: Action): boolean {
  return (
    action.type === 'useCard' && (action.card === 'taxman' || action.card === 'blockader')
  );
}

/** state が from の手番なら、endTurn を通して次の手番に渡す。
 *  すでに他者の手番・試合が終わっている場合はそのまま返す。 */
function handOver(state: GameState, from: PlayerId, balance: Balance): GameState {
  if (state.phase === 'playing' && state.current === from) {
    return reduce(state, { type: 'endTurn' }, balance);
  }
  return state;
}

/** 手番の持ち主が、weights で貪欲に最善手を打ち続け、手番を終えるまで進める。
 *  「手番を終える」より良い手が無くなるか、上限に達したら手番を終えて返す。 */
function greedyFinishTurn(state: GameState, weights: Weights, balance: Balance): GameState {
  const actor = state.current;
  let cur = state;
  for (let i = 0; i < LOOKAHEAD_STEPS && cur.phase === 'playing' && cur.current === actor; i++) {
    const stop = reduce(cur, { type: 'endTurn' }, balance);
    let best = stop;
    let bestScore = evaluateState(stop, actor, balance, weights);
    for (const action of legalActions(cur, balance)) {
      if (action.type === 'endTurn') continue;
      const next = reduce(cur, action, balance);
      if (next === cur) continue;
      const score = evaluateState(next, actor, balance, weights);
      if (score > bestScore) {
        bestScore = score;
        best = next;
      }
    }
    if (best === stop) return stop;
    cur = best;
  }
  return handOver(cur, actor, balance);
}

/** つよいの先読み。after（自分の行動を 1 つ打った直後の局面）から、
 *  「自分の手番の残りを打ち切る → 相手が収入を受け取り、相手の手番を打ち切る」
 *  まで進めた局面を、自分（player）視点で評価する。
 *
 *  手番単位で読むのが要点。以前の版は 1 手ずつ（自分の 1 手 → 相手の 1 手 → 自分の 1 手）で、
 *  「建築家を使ってから建てる」のような組み合わせを途中で切り、相手の収入（startTurn）も
 *  入れずに相手の応手を測っていたため、先読みなしより弱かった
 *  （CPU_PROFILE 同士、先読みあり 対 なし: 1 手ずつの版 40% → 手番単位 67%、各 200〜300 試合）。
 *
 *  相手・自分の残りの手は、どちらもこちらと同じ重み（weights）で貪欲に選ぶ近似。
 *  実際の相手の重みは分からない（人間かもしれない）ので、「お互い同じ物差しで最善を選ぶ」と置く。
 *  試合が途中で終われば、そこまでの局面をそのまま評価する。 */
export function lookaheadScore(
  after: GameState,
  player: PlayerId,
  weights: Weights,
  balance: Balance,
): number {
  const mine = after.current === player ? greedyFinishTurn(after, weights, balance) : after;
  if (mine.phase !== 'playing' || mine.current === player) {
    return evaluateState(mine, player, balance, weights);
  }
  const foeStart = reduce(mine, { type: 'startTurn' }, balance);
  const foeDone = greedyFinishTurn(foeStart, weights, balance);
  return evaluateState(foeDone, player, balance, weights);
}

export function chooseAction(
  state: GameState,
  difficulty: Difficulty | AiOptions,
  rng: Rng,
  balance: Balance = DEFAULT_BALANCE,
): Action {
  const options = resolveOptions(difficulty);
  const player = state.current;
  // Profile → Weights への変換はここ（呼び出し側）の責務。この意思決定 1 回の間は
  // 進行度が変わらないので、決定の起点となる state から 1 度だけ求めて使い回す。
  const weights = weightsAt(options.profile, state, balance);
  const actions = legalActions(state, balance).filter(
    (a) => !isHarass(a) || rng.next() < options.harassRate,
  );
  if (actions.length === 0) return { type: 'endTurn' };

  // endTurn の評価は「このターンをここで終える価値」なので、
  // 手番が移った後の局面をそのまま自分視点で測る
  let scored = actions.map((action) => {
    const after = reduce(state, action, balance);
    return { action, after, score: evaluateState(after, player, balance, weights) };
  });
  if (options.lookahead) {
    // 先読みは重いので、静的な評価で上位の候補だけを読む（下位は選ばない）
    scored = [...scored].sort((a, b) => b.score - a.score).slice(0, LOOKAHEAD_TOP);
    for (const s of scored) {
      const follow = lookaheadScore(s.after, player, weights, balance);
      s.score = s.score * (1 - LOOKAHEAD_BLEND) + follow * LOOKAHEAD_BLEND;
    }
  }

  let best: Action = { type: 'endTurn' };
  let bestScore = -Infinity;

  for (const { action, score: base } of scored) {
    let score = base;
    score += (rng.next() - 0.5) * options.noise;
    if (action.type === 'useCard') score += options.cardBonus?.[action.card] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }
  return best;
}

/** 開始フェーズから終了フェーズまでを一気に進める。 */
export function playTurn(
  state: GameState,
  difficulty: Difficulty | AiOptions,
  rng: Rng,
  balance: Balance = DEFAULT_BALANCE,
): GameState {
  const options = resolveOptions(difficulty);
  let next = reduce(state, { type: 'startTurn' }, balance);
  // 行動は有限（カード 8 種・建設 10 件・街道 1 回）なので、上限は安全網
  for (let i = 0; i < 40; i++) {
    const action = chooseAction(next, options, rng, balance);
    if (action.type === 'endTurn') break;
    const applied = reduce(next, action, balance);
    if (applied === next) break;
    next = applied;
  }
  return reduce(next, { type: 'endTurn' }, balance);
}
