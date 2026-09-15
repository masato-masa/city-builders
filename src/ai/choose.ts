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

/** つよいの1手先読み。after（自分の行動を打った直後の局面）から、
 *  必要なら endTurn を通して手番を相手に渡し、相手がその局面で最善と判断する
 *  1手を選んだと仮定して、その結果を自分（player）視点で評価する。
 *
 *  相手の「最善」は、こちらと同じ重み（weights）で測る。実際の相手の重みは
 *  分からない（人間かもしれないし、性格の違う CPU かもしれない）ので、
 *  「相手も自分と同じ物差しで最善を選ぶ」という前提を置く、想定応手の近似。
 *
 *  すでに手番が相手に渡っている（action が endTurn だった）場合はそのまま使う。
 *  手番が渡らない・試合が終わる場合は、渡せた局面をそのまま評価して返す
 *  （相手の応手は存在しないので、読むものが無い）。 */
export function lookaheadScore(
  after: GameState,
  player: PlayerId,
  weights: Weights,
  balance: Balance,
): number {
  const handedOver =
    after.phase === 'playing' && after.current === player
      ? reduce(after, { type: 'endTurn' }, balance)
      : after;

  if (handedOver.phase !== 'playing' || handedOver.current === player) {
    return evaluateState(handedOver, player, balance, weights);
  }

  const foe = handedOver.current;
  let bestFoeState = handedOver;
  let bestFoeScore = -Infinity;
  for (const foeAction of legalActions(handedOver, balance)) {
    const afterFoe = reduce(handedOver, foeAction, balance);
    const foeScore = evaluateState(afterFoe, foe, balance, weights);
    if (foeScore > bestFoeScore) {
      bestFoeScore = foeScore;
      bestFoeState = afterFoe;
    }
  }
  return evaluateState(bestFoeState, player, balance, weights);
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
      // 相手の想定応手を1つ読む（ミニマックス1段）。自分の手だけを読んでいた
      // 旧実装と違い、ここで実際に手番を相手へ渡した局面から相手の最善手を
      // 展開する。詳細は lookaheadScore を参照。
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
