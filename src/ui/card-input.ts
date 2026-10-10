// 手札のカードの操作の判定。React や DOM に触らない純粋関数だけを置き、テストで確かめる。
//
// カードは「盤面へドラッグして離すと使う」だけ（タップでシートを開いて「使う」を押す操作は無い）。
// - 動かさずに押し続ける（LONG_PRESS_MS）→ 説明を出す。離すと閉じる。
// - 指が DRAG_THRESHOLD_PX 以上動いた → ドラッグ。指はまっすぐ止まらないので、少しの揺れはタップのまま。
// - それより短く離した → タップ（「ドラッグで使う・長押しで説明」の案内だけ出す）。
// 対象が要るカードは、離した場所で対象を決める:
// - 伝令: 手札の別のカードの上 → その札を山の底へ。盤面の上 → 対象選び（手札をタップ）へ。
// - 封鎖者: 区画の上 → その区画。盤面の空いたところ → 対象選び（区画をタップ）へ。
// - 検査官: 相手の物件の上 → その物件。盤面の空いたところ → 対象選び（相手の物件をタップ）へ。

import type { Action, CardId, GameState, PlayerId } from '@/game/types';

/** これ以上動いたらドラッグ（CLAUDE.md の基準 7px 程度）。 */
export const DRAG_THRESHOLD_PX = 7;

/** これ以上動かさずに押し続けたら長押し（説明を出す）。 */
export const LONG_PRESS_MS = 420;

export type PressKind = 'pending' | 'drag' | 'longpress';

/** 押している途中の判定。一度 drag / longpress に決まったら呼び出し側はそれを保つ。
 *  - 閾値を超えて動いた → drag（長押しの時間を過ぎていても、まだ決まっていなければ drag）
 *  - 動かさずに LONG_PRESS_MS 経った → longpress
 *  - どちらでもない → pending（離せばタップ） */
export function classifyPress(dx: number, dy: number, elapsedMs: number): PressKind {
  if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) return 'drag';
  if (elapsedMs >= LONG_PRESS_MS) return 'longpress';
  return 'pending';
}

/** 指を離した場所の下にあったもの。 */
export interface DropHit {
  /** 盤面（.board-area）の上か */
  onBoard: boolean;
  /** 区画の上なら、その番号 */
  slotId: number | null;
  /** 手札の（ドラッグ中の札とは別の）カードの上なら、その札 */
  handCard: CardId | null;
}

/** 対象選びの種類。伝令は手札、封鎖者は自分のもの以外の区画、検査官は相手の物件。 */
export type TargetMode = 'herald' | 'blockade' | 'inspect';

export type DropResult =
  /** そのまま使う */
  | { kind: 'use'; action: Extract<Action, { type: 'useCard' }> }
  /** 対象選びのモードへ（盤面の上で離したが、対象の上ではなかった） */
  | { kind: 'target'; mode: TargetMode }
  /** 使えない場所・対象（はじく音を鳴らす） */
  | { kind: 'reject'; reason: string }
  /** 何もしない（盤面の外で離した＝やめた） */
  | { kind: 'cancel' };

/** 離した場所から、何をするかを決める。使えるか（コイン・手番）は呼び出し側が先に canUseCard で見る。 */
export function resolveDrop(state: GameState, viewer: PlayerId, card: CardId, hit: DropHit): DropResult {
  if (card === 'herald') {
    if (hit.handCard !== null && hit.handCard !== 'herald') {
      return { kind: 'use', action: { type: 'useCard', card, heraldTarget: hit.handCard } };
    }
    if (hit.onBoard) return { kind: 'target', mode: 'herald' };
    return { kind: 'cancel' };
  }
  if (card === 'blockader') {
    if (hit.slotId !== null) {
      const slot = state.market[hit.slotId];
      if (!slot || slot.owner === viewer) return { kind: 'reject', reason: '自分の区画は封鎖できません' };
      return { kind: 'use', action: { type: 'useCard', card, blockadeSlot: hit.slotId } };
    }
    if (hit.onBoard) return { kind: 'target', mode: 'blockade' };
    return { kind: 'cancel' };
  }
  if (card === 'inspector') {
    if (hit.slotId !== null) {
      const r = inspectPick(state, viewer, hit.slotId);
      return r.ok ? { kind: 'use', action: r.action } : { kind: 'reject', reason: r.reason };
    }
    if (hit.onBoard) return { kind: 'target', mode: 'inspect' };
    return { kind: 'cancel' };
  }
  if (hit.onBoard) return { kind: 'use', action: { type: 'useCard', card } };
  return { kind: 'cancel' };
}

/** 検査官の対象に区画を選んだとき（ドロップ・対象選びのタップで共通）。相手の物件だけが対象。 */
export function inspectPick(
  state: GameState,
  viewer: PlayerId,
  slotId: number,
): { ok: true; action: Extract<Action, { type: 'useCard' }> } | { ok: false; reason: string } {
  const slot = state.market[slotId];
  if (!slot || slot.owner === null) return { ok: false, reason: '検査官は相手の物件に使います（空き地には使えません）' };
  if (slot.owner === viewer) return { ok: false, reason: '自分の物件には使えません' };
  return { ok: true, action: { type: 'useCard', card: 'inspector', inspectSlot: slotId } };
}

/** ドラッグ中に盤面の上端に出す案内（どこで離せばよいか）。 */
export function dragGuide(card: CardId): string {
  if (card === 'herald') return '伝令: 山の底へ送る札の上で離す';
  if (card === 'blockader') return '封鎖者: 相手の区画か空き地の上で離す';
  if (card === 'inspector') return '検査官: 相手の物件の上で離す';
  return '盤面の上で離すと使う';
}

/** カードをタップしただけのときの案内。 */
export const TAP_HINT = '盤面へドラッグで使う・長押しで説明';
