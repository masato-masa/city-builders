import type { AiOptions, Difficulty } from '@/ai/choose';
import { chooseAction } from '@/ai/choose';
import { BUILDING_NAMES, CARD_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { reduce } from '@/game/reducer';
import type { Rng } from '@/game/rng';
import type { Action, GameState } from '@/game/types';

/** CPU の 1 手ぶんの結果。UI が順番に出す実況ログと、その時点の盤面。 */
export interface CpuStep {
  state: GameState;
  log: string;
}

/** 1 手を短い日本語の実況文にする。表示専用で、ゲームの判定には使わない。 */
function describeAction(before: GameState, action: Action): string {
  if (action.type === 'useCard') return `${CARD_NAMES[action.card]}を使った`;
  if (action.type === 'build') {
    const slot = before.market[action.slotId];
    return slot ? `${BUILDING_NAMES[slot.buildingId]}を建てた` : '物件を建てた';
  }
  if (action.type === 'useRoad') return `街道で${CARD_NAMES[action.target]}を送った`;
  return 'ターンを終えた';
}

/** CPU の 1 手番を、行動ごとに区切って返す。
 *
 *  `src/ai/choose.ts` の `playTurn` と同じ手順（startTurn → chooseAction を繰り返す →
 *  endTurn）を UI 側で 1 手ずつ回し、各手のあとの状態と実況文を順番に並べる。
 *  `src/ai` 自体は変更せず、既に公開されている `chooseAction` を呼ぶだけにしてある。
 *  最後の要素は必ず endTurn 後の状態（「ターンを終えた」を含む）。 */
export function playTurnSteps(
  state: GameState,
  difficulty: Difficulty | AiOptions,
  rng: Rng,
  balance: Balance = DEFAULT_BALANCE,
): CpuStep[] {
  const steps: CpuStep[] = [];
  let cur = reduce(state, { type: 'startTurn' }, balance);
  // playTurn と同じ安全網（行動の種類は有限なので、これだけ回せば必ず終わる）
  for (let i = 0; i < 40; i++) {
    const action = chooseAction(cur, difficulty, rng, balance);
    if (action.type === 'endTurn') break;
    const applied = reduce(cur, action, balance);
    if (applied === cur) break;
    steps.push({ state: applied, log: describeAction(cur, action) });
    cur = applied;
  }
  steps.push({ state: reduce(cur, { type: 'endTurn' }, balance), log: 'ターンを終えた' });
  return steps;
}
