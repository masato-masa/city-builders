import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { legalActions, reduce } from '@/game/reducer';
import type { Rng } from '@/game/rng';
import type { Action, GameState } from '@/game/types';

import { DEFAULT_WEIGHTS, evaluateState, type Weights } from './evaluate';

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
  weights: Weights;
}

/** 難易度から AiOptions を作る。今までの NOISE / HARASS_RATE / hard 分岐をそのまま写したもの。 */
export function optionsFor(difficulty: Difficulty): AiOptions {
  return {
    noise: NOISE[difficulty],
    harassRate: HARASS_RATE[difficulty],
    lookahead: difficulty === 'hard',
    weights: DEFAULT_WEIGHTS,
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

export function chooseAction(
  state: GameState,
  difficulty: Difficulty | AiOptions,
  rng: Rng,
  balance: Balance = DEFAULT_BALANCE,
): Action {
  const options = resolveOptions(difficulty);
  const player = state.current;
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
    let score = evaluateState(after, player, balance, options.weights);
    if (options.lookahead && action.type !== 'endTurn') {
      // 1 手だけ先を読む。自分の最善応手ぶんを少し上乗せする
      const follow = legalActions(after, balance)
        .map((a) => evaluateState(reduce(after, a, balance), player, balance, options.weights))
        .reduce((m, v) => Math.max(m, v), -Infinity);
      if (follow > -Infinity) score = score * 0.6 + follow * 0.4;
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
