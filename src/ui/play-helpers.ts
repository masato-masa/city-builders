import { useCallback, useEffect, useRef } from 'react';

import { incomeStageStates, type IncomeStage } from '@/game/reducer';
import type { Balance } from '@/game/balance';
import type { GameState } from '@/game/types';

import { playCoinGain, playDebtSink } from './sound';
import { INCOME_APPLY_MS, INCOME_BEAT_MS, INCOME_TAIL_MS } from './tempo';

/** 一定時間あとに処理を走らせる。画面を離れたら（アンマウント）残りは全部捨てる。
 *  「使う → 効果」「手番 → 収入」を時間差で見せるために使う。 */
export function useLater() {
  const timers = useRef(new Set<number>());
  useEffect(() => {
    const set = timers.current;
    return () => {
      set.forEach((t) => window.clearTimeout(t));
      set.clear();
    };
  }, []);
  return useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);
}

/** 画面上の点の下にある区画の番号。無ければ null（封鎖者を区画へ直接落としたときの対象決めに使う）。 */
export function slotAtPoint(x: number, y: number): number | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const hit = (el as HTMLElement).closest?.('[data-slot]') as HTMLElement | null;
    if (hit) return Number(hit.dataset.slot);
  }
  return null;
}

/** 収入で増減したコインの音。 */
export function playIncome(delta: number): void {
  if (delta > 0) playCoinGain(delta);
  else if (delta < 0) playDebtSink();
}

export interface IncomeBeat {
  stage: IncomeStage;
  /** この段まで反映した盤面（最後の 1 つは手番開始の処理を済ませた状態） */
  state: GameState;
  index: number;
}

/** 自分の手番の収入を 1 段ずつ見せる。段ごとに onShow（帯・光・音）→ 少し置いて onApply（コインの反映）。
 *  基礎収入 → 建物収入 → 投資 → 返済、の順に、前の段が読めてから次へ進む。
 *  cancel は残りの予定を取り消す（useEffect の後始末に渡す）。
 *  flush は残りの演出を飛ばして最後の状態を反映し、onFinish まで一気に進める
 *  （演出の途中でプレイヤーが触ったとき、待たせずに操作へ戻すため）。 */
export function runIncomeSequence(
  pre: GameState,
  balance: Balance,
  startDelay: number,
  hooks: {
    onShow: (beat: IncomeBeat) => void;
    onApply: (beat: IncomeBeat) => void;
    onFinish: () => void;
  },
): { cancel: () => void; flush: () => void } {
  const timers: number[] = [];
  const beats = incomeStageStates(pre, balance).map((b, index) => ({ ...b, index }));
  beats.forEach((beat) => {
    const showAt = startDelay + beat.index * INCOME_BEAT_MS;
    timers.push(window.setTimeout(() => hooks.onShow(beat), showAt));
    timers.push(window.setTimeout(() => hooks.onApply(beat), showAt + INCOME_APPLY_MS));
  });
  const lastApply = startDelay + (beats.length - 1) * INCOME_BEAT_MS + INCOME_APPLY_MS;
  let done = false;
  timers.push(
    window.setTimeout(() => {
      done = true;
      hooks.onFinish();
    }, lastApply + INCOME_TAIL_MS),
  );
  const cancel = () => timers.forEach((t) => window.clearTimeout(t));
  const flush = () => {
    if (done) return;
    done = true;
    cancel();
    const last = beats[beats.length - 1];
    if (last) hooks.onApply(last);
    hooks.onFinish();
  };
  return { cancel, flush };
}
