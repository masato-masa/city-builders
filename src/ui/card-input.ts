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
// - 顔役: 同数の地区の区画の上 → その地区。盤面の空いたところ → 対象選び（地区の区画をタップ）へ。
// - 影武者: 写す札（このターン直前に使った札）と同じ対象の取り方。対象の要らない札なら盤面のどこでも。

import { CARD_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { blockadeDistrictsOf, bossDistrictsOf, districtOfSlot, doubleSourceOf, effectiveCardOf } from '@/game/selectors';
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

/** 対象選びの種類。伝令は手札、封鎖者は自分のもの以外の区画、検査官は相手の物件、顔役は同数の地区。 */
export type TargetMode = 'herald' | 'blockade' | 'inspect' | 'district';

/** 盤面の区画を対象に取る種類（伝令以外）。 */
export type SlotTargetMode = Exclude<TargetMode, 'herald'>;

/** その札（影武者なら写す札）が盤面の区画を対象に取るなら、その種類。取らなければ null。 */
export function slotTargetModeOf(state: GameState, viewer: PlayerId, card: CardId): SlotTargetMode | null {
  const eff = effectiveCardOf(state, viewer, card);
  if (eff === 'blockader') return 'blockade';
  if (eff === 'inspector') return 'inspect';
  if (eff === 'boss') return 'district';
  return null;
}

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
export function resolveDrop(
  state: GameState,
  viewer: PlayerId,
  card: CardId,
  hit: DropHit,
  balance: Balance = DEFAULT_BALANCE,
): DropResult {
  if (card === 'herald') {
    if (hit.handCard !== null && hit.handCard !== 'herald') {
      return { kind: 'use', action: { type: 'useCard', card, heraldTarget: hit.handCard } };
    }
    if (hit.onBoard) return { kind: 'target', mode: 'herald' };
    return { kind: 'cancel' };
  }
  const mode = slotTargetModeOf(state, viewer, card);
  if (mode) {
    if (hit.slotId !== null) {
      const r = slotPick(state, viewer, card, mode, hit.slotId, balance);
      return r.ok ? { kind: 'use', action: r.action } : { kind: 'reject', reason: r.reason };
    }
    if (hit.onBoard) return { kind: 'target', mode };
    return { kind: 'cancel' };
  }
  if (hit.onBoard) return { kind: 'use', action: { type: 'useCard', card } };
  return { kind: 'cancel' };
}

type Pick = { ok: true; action: Extract<Action, { type: 'useCard' }> } | { ok: false; reason: string };

/** 区画を対象に取る札で、区画 slotId を選んだとき（ドロップ・対象選びのタップで共通）。
 *  card は実際に使う札（影武者なら 'double'）、mode は対象の取り方（影武者は写す札のもの）。 */
export function slotPick(
  state: GameState,
  viewer: PlayerId,
  card: CardId,
  mode: SlotTargetMode,
  slotId: number,
  balance: Balance = DEFAULT_BALANCE,
): Pick {
  const slot = state.market[slotId];
  if (mode === 'blockade') {
    // 封鎖者の対象は地区。地区のどの区画（空き地・自分の物件・相手の物件）で離してもその地区になる
    const d = districtOfSlot(slotId, balance);
    if (!slot || d < 0) return { ok: false, reason: '地区の上で離してください' };
    if (!blockadeDistrictsOf(state, viewer, balance).includes(d)) {
      return { ok: false, reason: 'その地区は封鎖済みです' };
    }
    return { ok: true, action: { type: 'useCard', card, district: d } };
  }
  if (mode === 'inspect') {
    const r = inspectPick(state, viewer, slotId);
    return r.ok ? { ok: true, action: { ...r.action, card } } : r;
  }
  const district = districtOfSlot(slotId, balance);
  if (district < 0 || !bossDistrictsOf(state, viewer, balance).includes(district)) {
    return { ok: false, reason: '顔役は、VP の合計が同じ地区に使います' };
  }
  return { ok: true, action: { type: 'useCard', card, district } };
}

/** 検査官の対象に区画を選んだとき（ドロップ・対象選びのタップで共通）。相手の物件だけが対象。 */
export function inspectPick(
  state: GameState,
  viewer: PlayerId,
  slotId: number,
): Pick {
  const slot = state.market[slotId];
  if (!slot || slot.owner === null) return { ok: false, reason: '検査官は相手の物件に使います（空き地には使えません）' };
  if (slot.owner === viewer) return { ok: false, reason: '自分の物件には使えません' };
  return { ok: true, action: { type: 'useCard', card: 'inspector', inspectSlot: slotId } };
}

/** ドラッグ中に盤面の上端に出す案内（どこで離せばよいか）。 */
export function dragGuide(card: CardId, state?: GameState, viewer?: PlayerId): string {
  if (card === 'double') {
    const src = state && viewer ? doubleSourceOf(state, viewer) : null;
    if (!src) return '影武者: 先に別の札を使う';
    const mode = slotTargetModeOf(state!, viewer!, card);
    const where = mode === 'blockade' ? '地区の上' : mode === 'inspect' ? '相手の物件の上' : mode === 'district' ? '地区の上' : '盤面';
    return `影武者（${CARD_NAMES[src]}）: ${where}で離す`;
  }
  if (card === 'herald') return '伝令: 山の底へ送る札の上で離す';
  if (card === 'blockader') return '封鎖者: 封鎖する地区の上で離す';
  if (card === 'inspector') return '検査官: 相手の物件の上で離す';
  if (card === 'boss') return '顔役: VP が同じ地区の上で離す';
  return '盤面の上で離すと使う';
}

/** 長押しの説明の下に出す「使うとき」の 1 行。影武者は写す札の取り方で言う。 */
export function useHintOf(state: GameState, viewer: PlayerId, card: CardId): string {
  if (card === 'herald') return '使うとき: 山の底へ送る札の上へドラッグ';
  if (card === 'double' && !doubleSourceOf(state, viewer)) return '使うとき: 先に別の札を使ってから、盤面へドラッグ';
  const mode = slotTargetModeOf(state, viewer, card);
  if (mode === 'blockade') return '使うとき: 相手の区画か空き地の上へドラッグ';
  if (mode === 'inspect') return '使うとき: 相手の物件の上へドラッグ';
  if (mode === 'district') return '使うとき: VP の合計が同じ地区の上へドラッグ';
  return '使うとき: 盤面へドラッグ';
}

/** 影武者の長押しの説明に添える「いま写す札」。影武者でなければ null。 */
export function doubleNoteOf(state: GameState, viewer: PlayerId, card: CardId, balance: Balance = DEFAULT_BALANCE): string | null {
  if (card !== 'double') return null;
  const src = doubleSourceOf(state, viewer);
  if (!src) return 'いま写せる札はありません（このターンにまだ使っていないか、伝令・祝祭・衛兵のあと）';
  return `いま写す札: ${CARD_NAMES[src]}（コスト ${balance.cards.double.cost} + ${balance.cards[src].cost}）`;
}

/** カードをタップしただけのときの案内。 */
export const TAP_HINT = '盤面へドラッグで使う・長押しで説明';
