import { useCallback, useEffect, useRef } from 'react';

import { incomeStageStates, type IncomeStage } from '@/game/reducer';
import type { Balance } from '@/game/balance';
import type { CardId, GameState } from '@/game/types';

import type { DropHit } from './card-input';
import { playCoinGain, playDebtSink } from './sound';
import { tempo, type Tempo } from './tempo';

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

/** 手札の札を離した点の下にあるもの（盤面か・区画・ドラッグ中の札とは別の手札の札）。
 *  何をするかは card-input.ts の resolveDrop が決める。 */
export function dropHitAt(
  x: number,
  y: number,
  board: HTMLElement | null,
  dragged: CardId,
): DropHit {
  let slotId: number | null = null;
  let handCard: CardId | null = null;
  for (const el of document.elementsFromPoint(x, y)) {
    const h = el as HTMLElement;
    const holder = h.closest?.('[data-hand-card]') as HTMLElement | null;
    if (holder) {
      const c = holder.dataset.handCard as CardId;
      if (c !== dragged && handCard === null) handCard = c;
      continue;
    }
    const slot = h.closest?.('[data-slot]') as HTMLElement | null;
    if (slot && slotId === null) slotId = Number(slot.dataset.slot);
  }
  const r = board?.getBoundingClientRect();
  const onBoard = !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  return { onBoard, slotId: onBoard ? slotId : null, handCard };
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
  t: Tempo = tempo(),
): { cancel: () => void; flush: () => void } {
  const timers: number[] = [];
  const { incomeApplyMs: INCOME_APPLY_MS, incomeBeatMs: INCOME_BEAT_MS, incomeTailMs: INCOME_TAIL_MS } = t;
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
