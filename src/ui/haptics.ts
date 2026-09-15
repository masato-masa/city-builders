// 振動。navigator.vibrate を使う。対応していない環境・設定で切ってあるときは
// 黙って何もしない（例外を投げない）。

import { isHapticsEnabled } from './settings';

function vibrate(pattern: number | number[]): void {
  if (!isHapticsEnabled()) return;
  try {
    if (typeof navigator === 'undefined') return;
    if (typeof navigator.vibrate !== 'function') return;
    navigator.vibrate(pattern);
  } catch {
    // 対応していない・拒否された場合も黙って続行
  }
}

/** カードを使う: ごく短い 1 回 */
export function hapticUseCard(): void {
  vibrate(12);
}

/** 物件を建てる: 少し長い 2 連 */
export function hapticBuild(): void {
  vibrate([16, 45, 22]);
}

/** 打てない札を押した: ごく短い 2 連 */
export function hapticReject(): void {
  vibrate([10, 35, 10]);
}

/** 勝ち: 弾むような 3 連 */
export function hapticWin(): void {
  vibrate([18, 60, 18, 60, 40]);
}

/** 負け: 長く沈む 1 回 */
export function hapticLose(): void {
  vibrate([70, 40, 30]);
}
