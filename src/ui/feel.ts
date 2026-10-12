// 手触り（衝撃・カード使用の 3 段・決着）の判定と数値。React や DOM に触らない純粋関数だけを置き、
// テストで値の上限（docs/autopilot/standards.md §1）を確かめられるようにする。

import { CARD_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { cardCostFor } from '@/game/reducer';
import { doubleSourceOf, slotEffectStopped } from '@/game/selectors';
import type { CardId, GameState, PlayerId } from '@/game/types';

import { forecast } from './CoinBar';
import { CARD_CHARGE_MS, tempo, type Tempo } from './tempo';

export { CARD_CHARGE_MS, CARD_CHARGE_SCALE } from './tempo';

/* ---------------- 衝撃（ヒットストップ・画面揺れ・触覚） ---------------- */

export type ImpactLevel = 'light' | 'heavy';

export interface ImpactSpec {
  /** 盤面の見た目を止めておく時間。操作は止めない。 */
  hitstopMs: number;
  /** 盤面の層だけを揺らす振幅（px）。 */
  shakePx: number;
  /** 揺れの長さ。 */
  shakeMs: number;
  /** 触覚のパターン（navigator.vibrate に渡す）。 */
  haptic: number[];
}

/** 基準: ヒットストップ 軽 50ms / 重 80〜100ms、揺れ 軽 2〜3px / 重 8〜10px で 50〜100ms。 */
export const IMPACT: Record<ImpactLevel, ImpactSpec> = {
  light: { hitstopMs: 50, shakePx: 3, shakeMs: 80, haptic: [14] },
  heavy: { hitstopMs: 90, shakePx: 8, shakeMs: 100, haptic: [28, 30, 16] },
};

export interface Impact {
  level: ImpactLevel;
  /** 起こした側（その手番の人）。 */
  actor: PlayerId;
  /** 衝撃が当たった区画。徴税官のように区画が無いときは null（盤面の中央に出す）。 */
  slotId: number | null;
}

const PLAYERS: readonly PlayerId[] = ['you', 'cpu'];

/** 1 手の前後の盤面から、衝撃の演出を出すかと強さを決める。同じ手番の中の変化だけを見る
 *  （手番の切り替わり・収入の段では出さない）。複数当たったら強いほうを返す。
 *  - 物件の買収（持ち主が別の人へ替わる）: 重
 *  - 封鎖者で相手の物件の効果を止めた: 重
 *  - 封鎖者で空き地を押さえた: 軽
 *  - 徴税官が通った（相手の取り立て予定が増えた）: 軽
 *  衛兵・城壁で防がれたときは盤面が変わらないので出さない。 */
export function impactOf(prev: GameState, next: GameState): Impact | null {
  if (prev.turn !== next.turn || prev.current !== next.current) return null;
  const actor = prev.current;
  let best: Impact | null = null;
  const take = (level: ImpactLevel, slotId: number | null) => {
    if (!best || (best.level === 'light' && level === 'heavy')) best = { level, actor, slotId };
  };
  next.market.forEach((slot, i) => {
    const before = prev.market[i]?.owner ?? null;
    if (before !== null && slot.owner !== null && before !== slot.owner) take('heavy', slot.slotId);
  });
  for (const id of PLAYERS) {
    const a = prev.players[id];
    const b = next.players[id];
    if (b.pendingTax > a.pendingTax) take('light', null);
  }
  // 封鎖者: 地区の封鎖が新しく掛かった。相手の物件の効果が止まれば重、空き地だけなら軽
  // （区画は地区の最初の区画で代表する）
  const before = prev.blockades ?? [];
  for (const bl of next.blockades ?? []) {
    if (before.some((x) => x.district === bl.district && x.target === bl.target)) continue;
    const slots = DEFAULT_BALANCE.districts[bl.district]?.slots ?? [];
    const hit = slots.some((id) => {
      const s = next.market[id];
      return !!s && s.owner === bl.target && slotEffectStopped(next, s);
    });
    take(hit ? 'heavy' : 'light', slots[0] ?? null);
  }
  return best;
}

/** 揺れのキーフレーム（transform）。振幅を減衰させながら左右に 4 回振って 0 に戻る。
 *  毎回同じ形（乱数を使わない）。 */
export function shakeKeyframes(px: number): string[] {
  const steps: [number, number][] = [
    [0, 0],
    [1, -0.4],
    [-0.8, 0.3],
    [0.55, -0.2],
    [-0.3, 0.1],
    [0, 0],
  ];
  return steps.map(([x, y]) => `translate(${round(x * px)}px, ${round(y * px)}px)`);
}

const round = (v: number) => Math.round(v * 10) / 10;

/* ---------------- カード使用の 3 段（溜め → 発動 → 余韻） ---------------- */


export interface CardSequence {
  chargeMs: number;
  /** 盤面へ飛んで弾けるまで（溜めのあと）。 */
  launchMs: number;
  /** 効果を反映する時刻（使用の指示から）。ここで操作が戻る。 */
  effectAt: number;
  /** 余韻の長さ。合計が上限を超えないよう、長い手（伝令）では短くする。 */
  aftermathMs: number;
  totalMs: number;
}

/** カード 1 枚の使用演出の時間割。discard は伝令（山の底へ送る札を続けて飛ばす）。
 *  t は間合い（既定は設定の速さ。余韻の最長・合計の上限も t が持つ）。 */
export function cardSequence(discard: boolean, t: Tempo = tempo()): CardSequence {
  const chargeMs = CARD_CHARGE_MS;
  const launchMs = t.cardEffectDelayMs - CARD_CHARGE_MS;
  const effectAt = (discard ? t.discardAtMs : 0) + t.cardEffectDelayMs;
  const aftermathMs = Math.max(0, Math.min(t.cardAftermathMs, t.cardSequenceMaxMs - effectAt));
  return { chargeMs, launchMs, effectAt, aftermathMs, totalMs: effectAt + aftermathMs };
}

export type AftermathTone = 'gain' | 'hit' | 'guard' | 'blocked';

export interface Aftermath {
  text: string;
  tone: AftermathTone;
}

const sign = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

/** カードを使った前後の盤面から、余韻に出す一言（数字）を決める。出すものが無ければ null。
 *  払ったコストはコインの表示が弾むので、ここではカードの効果だけを言う。 */
export function cardAftermath(
  prev: GameState,
  next: GameState,
  card: CardId,
  balance: Balance,
): Aftermath | null {
  const actor = prev.current;
  const foe: PlayerId = actor === 'you' ? 'cpu' : 'you';
  const a0 = prev.players[actor];
  const a1 = next.players[actor];
  const f0 = prev.players[foe];
  const f1 = next.players[foe];
  // 影武者は写した札の効果で言う（払ったコストは影武者の分で数える）
  const eff = card === 'double' ? (doubleSourceOf(prev, actor) ?? card) : card;
  if (eff === 'taxman' || eff === 'blockader') {
    if (f1.pendingTax > f0.pendingTax) return { text: `相手の収入 ${sign(f0.pendingTax - f1.pendingTax)}`, tone: 'hit' };
    if ((next.blockades ?? []).length > (prev.blockades ?? []).length) {
      const d = next.blockades[next.blockades.length - 1]!.district;
      return { text: `${balance.districts[d]?.name ?? '地区'}を封鎖`, tone: 'hit' };
    }
    return { text: '防がれた', tone: 'blocked' };
  }
  if (eff === 'inspector') {
    // どの区画が変わったか（Lv が下がった／払われた額が減った）を前後の盤面から探す
    for (const slot of next.market) {
      const before = prev.market[slot.slotId];
      if (!before || before.owner !== foe) continue;
      if (slot.level < before.level) return { text: `Lv${before.level} → Lv${slot.level}`, tone: 'hit' };
      if (slot.paid < before.paid) return { text: `買収価格 ${sign(slot.paid - before.paid)}`, tone: 'hit' };
    }
    return f1.guarded ? { text: '防がれた', tone: 'blocked' } : { text: 'もう下げられない', tone: 'blocked' };
  }
  if (eff === 'boss') {
    const took = next.titles.findIndex((t, i) => t === actor && prev.titles[i] !== actor);
    return took >= 0 ? { text: `${balance.districts[took]?.name ?? ''}の称号を奪った`, tone: 'hit' } : { text: '防がれた', tone: 'blocked' };
  }
  if (eff === 'informer') {
    const sent = f0.queue[0];
    return f1.queue[0] !== sent && sent ? { text: `${CARD_NAMES[sent]}を山の底へ`, tone: 'hit' } : { text: '防がれた', tone: 'blocked' };
  }
  if (eff === 'guard' && a1.guarded && !a0.guarded) return { text: '守りを固めた', tone: 'guard' };
  if (a1.upgradeDiscount > a0.upgradeDiscount) {
    return { text: `アップグレード費 ${sign(a0.upgradeDiscount - a1.upgradeDiscount)}`, tone: 'gain' };
  }
  if (a1.buildDiscount > a0.buildDiscount) return { text: `建設費 ${sign(a0.buildDiscount - a1.buildDiscount)}`, tone: 'gain' };
  if (a1.acquireDiscount > a0.acquireDiscount) {
    return { text: `買収価格 ${sign(a0.acquireDiscount - a1.acquireDiscount)}`, tone: 'gain' };
  }
  // 今すぐ入るコイン（払ったコストを除く）と、次の収入の見込みの変化。
  const paid = cardCostFor(prev, actor, card, balance);
  const now = a1.coins - a0.coins + paid;
  const later = forecast(next, actor, balance) - forecast(prev, actor, balance);
  if (now > 0) return { text: `コイン ${sign(now)}`, tone: 'gain' };
  if (later !== 0) return { text: `次の収入 ${sign(later)}`, tone: later > 0 ? 'gain' : 'hit' };
  if (a1.festivalQueued && !a0.festivalQueued) return { text: '次の収入で祝祭', tone: 'gain' };
  if (eff === 'clerk') return { text: '商館が無い', tone: 'blocked' };
  if (eff === 'herald') return null;
  return { text: CARD_NAMES[eff], tone: 'gain' };
}

/* ---------------- 決着 ---------------- */

/** 決着の一瞬の静止。 */
export const FINALE_STILL_MS = 150;

/* ---------------- 画面の文言 ---------------- */

/** 「のこり N ターン」の時計をタップしたときの説明。lastNoAcquire は「最後の手番は買収できない」の規則が効いているか。 */
export function turnClockHint(left: number, lastNoAcquire = true): string {
  if (left <= 0) return '試合は終わりました';
  return `おたがい あと ${left} ターンで試合終了（全部建っても終わり${lastNoAcquire ? '・最後の手番は買収不可' : ''}）`;
}

/** 街道のシートの「山の底へ送る」が押せないときの理由。押せるなら null。 */
export function roadReason(hasRoad: boolean, usesLeft: number, myTurn: boolean): string | null {
  if (!hasRoad) return '街道を建てると使えます';
  if (!myTurn) return '自分のターンに使えます';
  if (usesLeft <= 0) return 'このターンはもう使えません';
  return null;
}

/** 対象選択モードの案内（右上の時計と重ならないよう短く）。 */
export const TARGET_LABEL = {
  blockade: '封鎖: 地区の区画をタップ',
  inspect: '検査: 相手の物件をタップ',
  district: '顔役: 同点の地区をタップ',
  herald: '伝令: 山の底へ送る札をタップ',
} as const;
