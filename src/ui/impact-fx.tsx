// 衝撃（ヒットストップ・盤面の揺れ・触覚）と決着の静止。
// ヒットストップは「盤面の見た目だけ」を止める: 盤面には 1 手前の状態を数十 ms 見せたまま、
// 当たった区画に止まった閃光を置く。手札・コイン・操作は新しい状態で先に進む（操作は止めない）。
// 揺れは盤面の層（.board）にだけ transform を掛ける。寸法は変わらない。

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

import type { GameState, PlayerId } from '@/game/types';

import { FINALE_STILL_MS, IMPACT, impactOf, shakeKeyframes, type ImpactLevel, type ImpactSpec } from './feel';
import { hapticFinale, hapticImpact } from './haptics';
import { playBell } from './sound';

export interface ImpactFlashInfo {
  id: number;
  level: ImpactLevel;
  /** 盤面コンテナ（.board-area）の左上からの位置（px）。 */
  x: number;
  y: number;
  /** ヒットストップが終わって消え始めたか。 */
  released: boolean;
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function shake(el: Element | null | undefined, spec: ImpactSpec): void {
  if (!el || reducedMotion() || typeof (el as HTMLElement).animate !== 'function') return;
  (el as HTMLElement).animate(
    shakeKeyframes(spec.shakePx).map((transform) => ({ transform })),
    { duration: spec.shakeMs, easing: 'linear' },
  );
}

/** 閃光を置く位置。区画があればその台座の中心、無ければ盤面の中央。 */
function flashPoint(area: HTMLElement | null, slotId: number | null): { x: number; y: number } {
  if (!area) return { x: 0, y: 0 };
  const a = area.getBoundingClientRect();
  const el = slotId === null ? null : area.querySelector(`[data-slot="${slotId}"]`);
  if (!el) return { x: a.width / 2, y: a.height / 2 };
  const b = el.getBoundingClientRect();
  return { x: b.left - a.left + b.width / 2, y: b.top - a.top + b.height * 0.55 };
}

/** 盤面の手触り。戻り値の boardState を <Board> に渡す（ヒットストップ・決着の静止の間は 1 手前を見せる）。
 *  vibrateFor は「その人が起こした衝撃で震わせるか」（CPU の手では震わせない、の方針を守るため）。 */
export function useBoardFeel(
  state: GameState,
  areaRef: RefObject<HTMLElement | null>,
  vibrateFor: (actor: PlayerId) => boolean,
) {
  const [hold, setHold] = useState<GameState | null>(null);
  const [flash, setFlash] = useState<ImpactFlashInfo | null>(null);
  const [still, setStill] = useState(false);
  const prev = useRef(state);
  const seq = useRef(0);
  const pendingShake = useRef<ImpactSpec | null>(null);
  const holding = useRef(false);
  holding.current = hold !== null;
  const timers = useRef(new Set<number>());
  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };
  useEffect(() => {
    const set = timers.current;
    return () => set.forEach((t) => window.clearTimeout(t));
  }, []);

  // 描画の前（layout effect）に決めて、最初の 1 枚から 1 手前の盤面を見せる。
  useLayoutEffect(() => {
    const before = prev.current;
    prev.current = state;
    if (before === state) return;
    const hit = impactOf(before, state);
    const finale = state.phase === 'finished' && before.phase !== 'finished';
    if (!hit && !finale) return;
    const spec = hit ? IMPACT[hit.level] : null;
    const holdMs = Math.max(spec?.hitstopMs ?? 0, finale ? FINALE_STILL_MS : 0);
    seq.current += 1;
    const id = seq.current;
    setHold((h) => h ?? before);
    if (finale) setStill(true);
    if (hit && spec) {
      setFlash({ id, level: hit.level, ...flashPoint(areaRef.current, hit.slotId), released: false });
      if (vibrateFor(hit.actor)) hapticImpact(spec.haptic);
    }
    // 止めた絵が描かれる直前（次のフレーム）から数える。描画が重い端末でも、止まって見える長さを保つ。
    const release = () =>
      later(holdMs, () => {
        setHold(null);
        if (spec) {
          setFlash((f) => (f && f.id === id ? { ...f, released: true } : f));
          // 揺れは、盤面が新しい状態に切り替わった描画（下の layout effect）から始める。
          // すでに切り替わっている（重なった衝撃の 2 つ目）ならすぐ揺らす。
          if (holding.current) pendingShake.current = spec;
          else shake(areaRef.current?.querySelector('.board'), spec);
          later(240, () => setFlash((f) => (f && f.id === id ? null : f)));
        }
        if (finale) {
          setStill(false);
          playBell();
          hapticFinale();
        }
      });
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(release);
    else release();
  }, [state]);

  useLayoutEffect(() => {
    if (hold !== null || !pendingShake.current) return;
    shake(areaRef.current?.querySelector('.board'), pendingShake.current);
    pendingShake.current = null;
  }, [hold]);

  return { boardState: hold ?? state, flash, still };
}

/** 当たった区画の閃光。ヒットストップの間は止まった絵のまま置き、明けたら消える。 */
export function ImpactFlash({ flash }: { flash: ImpactFlashInfo | null }) {
  if (!flash) return null;
  return (
    <span
      key={flash.id}
      className={`impact-flash impact-${flash.level}${flash.released ? ' is-released' : ''}`}
      style={{ left: flash.x, top: flash.y }}
      aria-hidden="true"
    />
  );
}
