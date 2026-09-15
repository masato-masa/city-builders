import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { legalActions, reduce } from '@/game/reducer';
import type { Rng } from '@/game/rng';
import type { Action, GameState, PlayerId } from '@/game/types';

import { DEFAULT_PROFILE, evaluateState, weightsAt, type Profile, type Weights } from './evaluate';

export type Difficulty = 'easy' | 'normal' | 'hard';

/** 難易度ごとの揺らぎ。easy ほど評価をぶらして弱くする。 */
const NOISE: Record<Difficulty, number> = { easy: 45, normal: 3, hard: 0 };

/** 妨害カードを検討する確率。easy は妨害をあまり撃たない。 */
const HARASS_RATE: Record<Difficulty, number> = { easy: 0.25, normal: 0.8, hard: 1 };

/** 指し手選択を細かく指定するための束。難易度はこれの既定セットの名前でしかない。 */
export interface AiOptions {
  /** 評価値に乗せる揺らぎの幅 */
  noise: number;
  /** 妨害カードを検討する確率 */
  harassRate: number;
  /** 1 手先を読むか */
  lookahead: boolean;
  profile: Profile;
}

/** 難易度から AiOptions を作る。今までの NOISE / HARASS_RATE / hard 分岐をそのまま写したもの。 */
export function optionsFor(difficulty: Difficulty): AiOptions {
  return {
    noise: NOISE[difficulty],
    harassRate: HARASS_RATE[difficulty],
    lookahead: difficulty === 'hard',
    profile: DEFAULT_PROFILE,
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

/** 相手の応手候補を絞る工夫の上限。1手あたりの実測が重かったときだけ効かせる
 *  安全弁で、実測（.superpowers/sdd/hard-lookahead-report.md）では市場10区画・
 *  手札4枚という盤面規模なら絞らなくても150msに収まったため、既定は
 *  Infinity（絞らない）のまま使っていない。将来カードや市場が増えて重くなった
 *  ときのための保険として残す。 */
const MAX_REPLY_CANDIDATES = Number.POSITIVE_INFINITY;

/** state（actor の手番）から、actor が「自分の重みで最善」と判断する1手を
 *  打った後の局面を返す。候補が MAX_REPLY_CANDIDATES を超える場合は、
 *  行動そのものの合法性チェックだけで絞れる範囲で数を抑える
 *  （現状は使っていないが、MAX_REPLY_CANDIDATES を実数に下げれば効く）。 */
function bestReplyState(
  state: GameState,
  actor: PlayerId,
  weights: Weights,
  balance: Balance,
): GameState {
  let candidates = legalActions(state, balance);
  if (candidates.length > MAX_REPLY_CANDIDATES) {
    candidates = candidates.slice(0, MAX_REPLY_CANDIDATES);
  }

  let best = state;
  let bestScore = -Infinity;
  for (const action of candidates) {
    const next = reduce(state, action, balance);
    const score = evaluateState(next, actor, balance, weights);
    if (score > bestScore) {
      bestScore = score;
      best = next;
    }
  }
  return best;
}

/** state が from の手番なら、endTurn を通して次の手番に渡す。
 *  すでに他者の手番・試合が終わっている場合はそのまま返す。 */
function handOver(state: GameState, from: PlayerId, balance: Balance): GameState {
  if (state.phase === 'playing' && state.current === from) {
    return reduce(state, { type: 'endTurn' }, balance);
  }
  return state;
}

/** つよいの2手先読み。after（自分の行動を打った直後の局面）から、
 *  「自分の手 → ターンを終える → 相手の最善手 → ターンを終える → 自分の最善手」
 *  まで一直線に読み、最後の局面を自分（player）視点で評価する。
 *  1段目は「相手に妨害される」局面、2段目は「妨害されたあと自分がどう
 *  立て直せるか」を織り込むためのもの。
 *
 *  相手・未来の自分の「最善」は、どちらもこちらと同じ重み（weights）で測る。
 *  実際の相手の重みは分からない（人間かもしれないし、性格の違う CPU かも
 *  しれない）ので、「お互い同じ物差しで最善を選ぶ」という前提を置く近似。
 *  各段は total-order のミニマックスではなく、その時点の手番の持ち主が
 *  自分自身の評価だけを見て貪欲に選ぶ一直線読み（相手は「自分がこう返される
 *  かもしれないから」までは読まない）。
 *
 *  どこかの段で試合が終わる・手番が渡らない場合は、そこまでの局面をそのまま
 *  自分視点で評価して返す（それ以上読むものが無いため）。 */
export function lookaheadScore(
  after: GameState,
  player: PlayerId,
  weights: Weights,
  balance: Balance,
): number {
  // 1段目: 相手に手番を渡し、相手の最善手を読む
  const handedToFoe = handOver(after, player, balance);
  if (handedToFoe.phase !== 'playing' || handedToFoe.current === player) {
    return evaluateState(handedToFoe, player, balance, weights);
  }
  const foe = handedToFoe.current;
  const afterFoeBest = bestReplyState(handedToFoe, foe, weights, balance);

  // 2段目: 自分に手番を戻し、相手に妨害されたあとの自分の最善手（立て直し）を読む
  const handedBack = handOver(afterFoeBest, foe, balance);
  if (handedBack.phase !== 'playing' || handedBack.current !== player) {
    return evaluateState(handedBack, player, balance, weights);
  }
  const afterSelfBest = bestReplyState(handedBack, player, weights, balance);
  return evaluateState(afterSelfBest, player, balance, weights);
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

  let best: Action = { type: 'endTurn' };
  let bestScore = -Infinity;

  for (const action of actions) {
    const after = reduce(state, action, balance);
    // endTurn の評価は「このターンをここで終える価値」なので、
    // 手番が移った後の局面をそのまま自分視点で測る
    let score = evaluateState(after, player, balance, weights);
    if (options.lookahead) {
      // 自分の手 → 相手の最善手 → 自分の最善手、まで2段読む。詳細は
      // lookaheadScore を参照。
      const follow = lookaheadScore(after, player, weights, balance);
      score = score * 0.6 + follow * 0.4;
    }
    score += (rng.next() - 0.5) * options.noise;
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
