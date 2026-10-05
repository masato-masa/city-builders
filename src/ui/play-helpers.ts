import { useCallback, useEffect, useRef } from 'react';

import { playCoinGain, playDebtSink } from './sound';

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
