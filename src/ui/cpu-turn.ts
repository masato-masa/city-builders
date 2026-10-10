import type { AiOptions, Difficulty } from '@/ai/choose';
import { chooseAction } from '@/ai/choose';
import { BUILDING_NAMES, CARD_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { incomeStageStates, reduce, type IncomeStage } from '@/game/reducer';
import type { Rng } from '@/game/rng';
import type { Action, GameState } from '@/game/types';

import { stageText } from './income-text';

/** CPU の 1 手ぶんの結果。UI が順番に出す実況ログと、その時点の盤面。
 *  action は UI 側が手触り（効果音）を選ぶために持たせる。判定には使わない。 */
export interface CpuStep {
  state: GameState;
  log: string;
  action: Action;
  /** 収入の段のとき、その段（基礎収入・建物収入…）。action は 'startTurn'。 */
  stage?: IncomeStage;
}

/** 1 手を短い日本語の実況文にする。表示専用で、ゲームの判定には使わない。 */
export function describeAction(before: GameState, action: Action): string {
  if (action.type === 'useCard') {
    if (action.inspectSlot !== undefined) {
      const slot = before.market[action.inspectSlot];
      return slot ? `${CARD_NAMES[action.card]}であなたの${BUILDING_NAMES[slot.buildingId]}を検査` : `${CARD_NAMES[action.card]}を使った`;
    }
    return action.heraldTarget
      ? `${CARD_NAMES[action.card]}で${CARD_NAMES[action.heraldTarget]}を山の底へ`
      : `${CARD_NAMES[action.card]}を使った`;
  }
  if (action.type === 'build') {
    const slot = before.market[action.slotId];
    return slot ? `${BUILDING_NAMES[slot.buildingId]}を建てた` : '物件を建てた';
  }
  if (action.type === 'upgrade') {
    const slot = before.market[action.slotId];
    return slot ? `${BUILDING_NAMES[slot.buildingId]}をアップグレードした` : '物件をアップグレードした';
  }
  if (action.type === 'acquire') {
    // カードの「買収者」とは別。相手の物件を代金を払って奪う行動
    const slot = before.market[action.slotId];
    return slot ? `${BUILDING_NAMES[slot.buildingId]}を買収した` : '物件を買収した';
  }
  if (action.type === 'startTurn') return '収入を得た';
  if (action.type === 'useRoad') return `街道で${CARD_NAMES[action.target]}を送った`;
  return 'ターンを終えた';
}

/** CPU の 1 手番を、行動ごとに区切って返す。
 *
 *  `src/ai/choose.ts` の `playTurn` と同じ手順（startTurn → chooseAction を繰り返す →
 *  endTurn）を UI 側で 1 手ずつ回し、各手のあとの状態と実況文を順番に並べる。
 *  `src/ai` 自体は変更せず、既に公開されている `chooseAction` を呼ぶだけにしてある。
 *  先頭は収入の段（startTurn、段ごとに 1 手）、最後の要素は必ず endTurn 後の状態（「ターンを終えた」を含む）。 */
export function playTurnSteps(
  state: GameState,
  difficulty: Difficulty | AiOptions,
  rng: Rng,
  balance: Balance = DEFAULT_BALANCE,
): CpuStep[] {
  const steps: CpuStep[] = [];
  // 収入は行動より前に、段ごと（基礎収入 → 建物収入 → …）の独立した手として出す。
  // 手番が替わる → 収入 → 行動、の順で見せるため。最後の段の盤面が startTurn を済ませた状態。
  const startAction: Action = { type: 'startTurn' };
  const stageSteps = incomeStageStates(state, balance);
  for (const { stage, state: after } of stageSteps) {
    steps.push({ state: after, log: stageText(stage, balance), action: startAction, stage });
  }
  let cur = reduce(state, startAction, balance);
  // playTurn と同じ安全網（行動の種類は有限なので、これだけ回せば必ず終わる）
  for (let i = 0; i < 40; i++) {
    const action = chooseAction(cur, difficulty, rng, balance);
    if (action.type === 'endTurn') break;
    const applied = reduce(cur, action, balance);
    if (applied === cur) break;
    steps.push({ state: applied, log: describeAction(cur, action), action });
    cur = applied;
  }
  const endAction: Action = { type: 'endTurn' };
  steps.push({ state: reduce(cur, endAction, balance), log: 'ターンを終えた', action: endAction });
  return steps;
}
