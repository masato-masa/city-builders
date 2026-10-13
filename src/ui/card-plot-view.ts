// 手札のカードの Lv 帯と、区画の名札の「何をどの順に出すか」の判定（画面に直書きせず、ここで決めてテストする）。

import type { Balance } from '@/game/balance';
import { levelProgress } from '@/game/card-text';
import type { PlayerId } from '@/game/types';

import type { PlotFigures } from './slot-actions';

/** カードの Lv 帯のバー。segments=区切りの数（次の Lv まで何回要るか）、filled=満ちた区画。
 *  最大 Lv は区切りなしの満タン（segments 1 / filled 1 / maxed）。 */
export interface LevelBar {
  level: number;
  segments: number;
  filled: number;
  maxed: boolean;
}

export function levelBarOf(balance: Balance, level: number, xp: number): LevelBar {
  const p = levelProgress(balance, xp);
  if (!p) return { level, segments: 1, filled: 1, maxed: true };
  return { level, segments: p.total, filled: Math.max(0, Math.min(p.total, p.filled)), maxed: false };
}

/** 区画の名札。並びは「VP・コイン・アップグレード」で固定。購入で変わるのは VP の札の色（持ち主）だけ。
 *  コインの札は購入前が建設費、購入後が買収に要るコイン（最大 Lv は鍵）。コインの印は前後で同じ。
 *  アップグレードは名札の右に足す（出ていなくても VP とコインの位置は動かさない）。 */
export interface PlotTag {
  order: readonly ['vp', 'coin', 'upgrade'];
  /** VP の札の色。未建設は null（無色）。 */
  vpOwner: PlayerId | null;
  coin: { kind: 'build' | 'value'; value: number } | { kind: 'locked' };
  /** アップグレード費。出さないなら null。 */
  upgrade: number | null;
}

export function plotTagOf(figures: PlotFigures, owner: PlayerId | null): PlotTag {
  const order = ['vp', 'coin', 'upgrade'] as const;
  if (figures.kind === 'unbuilt') {
    return { order, vpOwner: null, coin: { kind: 'build', value: figures.build }, upgrade: null };
  }
  return {
    order,
    vpOwner: owner,
    coin: figures.value === null ? { kind: 'locked' } : { kind: 'value', value: figures.value },
    upgrade: figures.upgrade,
  };
}
