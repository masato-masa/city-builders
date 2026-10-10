// 区画のシートに出す「アップグレード」「買収」のボタンの中身（文言・価格・押せるか・押せない理由）。
// 画面に直書きせず、ここで決めてテストする。判定そのものは src/game の canUpgrade / canAcquire に任せ、
// ここは「なぜ押せないか」を言葉にするだけ。

import { BUILDING_NAMES, buildingTextFor, buildingVp, type Balance } from '@/game/balance';
import { canAcquire, canUpgrade } from '@/game/reducer';
import { acquirePriceOf, opponentOf, slotLocked, upgradePriceOf, vpOfSlot } from '@/game/selectors';
import type { Action, GameState, PlayerId } from '@/game/types';

/** Lv の上限。これ以上は上げられない（upgradePriceOf が Infinity を返す）。 */
export const MAX_LEVEL = 2;

export interface SlotButton {
  /** 払う額 */
  price: number;
  /** 押せるか（手番中で、条件を満たしている） */
  enabled: boolean;
  /** ボタンの文言。コインが足りないときは「あと N コイン」 */
  label: string;
  /** 押せない理由（1 行）。コイン不足はボタンの文言で言うので null。手番外も null */
  reason: string | null;
}

/** 区画を動かせない残りの手番数（1 人の手番を 1 と数える）。動かせるなら 0。 */
export function lockRemaining(state: GameState, slotId: number, balance: Balance): number {
  const slot = state.market[slotId];
  if (!slot || !slotLocked(state, slot, balance)) return 0;
  return balance.slotLockTurns - (state.turn - slot.touchedTurn);
}

/** 自分の物件のアップグレードのボタン。Lv2（上限）なら null（ボタンを出さない）。 */
export function upgradeButton(
  state: GameState,
  slotId: number,
  viewer: PlayerId,
  balance: Balance,
): SlotButton | null {
  const slot = state.market[slotId];
  if (!slot || slot.owner !== viewer || slot.level >= MAX_LEVEL) return null;
  const price = upgradePriceOf(slot, balance);
  const myTurn = state.phase === 'playing' && state.current === viewer;
  const enabled = myTurn && canUpgrade(state, slotId, balance);
  const label = `アップグレード（${price}コイン）`;
  if (!myTurn || enabled) return { price, enabled, label, reason: null };
  if (slotLocked(state, slot, balance)) {
    return {
      price,
      enabled,
      label,
      reason:
        slot.touchedTurn === state.turn
          ? 'この手番に建てた・動かした区画は、次の手番から上げられます'
          : `動かしたばかりの区画です（あと ${lockRemaining(state, slotId, balance)} 手番）`,
    };
  }
  const short = price - state.players[viewer].coins;
  return { price, enabled, label: `あと ${short} コイン`, reason: null };
}

/** 相手の物件の買収のボタン。相手の物件でなければ null。 */
export function acquireButton(
  state: GameState,
  slotId: number,
  viewer: PlayerId,
  balance: Balance,
): SlotButton | null {
  const slot = state.market[slotId];
  const foe = opponentOf(viewer);
  if (!slot || slot.owner !== foe) return null;
  const price = acquirePriceOf(slot, balance);
  const myTurn = state.phase === 'playing' && state.current === viewer;
  const enabled = myTurn && canAcquire(state, slotId, balance);
  const label = `買収（${price}コイン）`;
  if (!myTurn || enabled) return { price, enabled, label, reason: null };
  if (state.players[foe].guarded) {
    return { price, enabled, label, reason: '相手は衛兵で守られています（相手の次の手番まで）' };
  }
  if (slotLocked(state, slot, balance)) {
    return {
      price,
      enabled,
      label,
      reason: `動かされたばかりの区画です（あと ${lockRemaining(state, slotId, balance)} 手番）`,
    };
  }
  const short = price - state.players[viewer].coins;
  return { price, enabled, label: `あと ${short} コイン`, reason: null };
}

/** 買収の価格の内訳を 1 行で。カードの「買収者」と混同しないよう、物件を奪う行動だと書く。 */
export function acquireNote(state: GameState, slotId: number, balance: Balance): string | null {
  const slot = state.market[slotId];
  if (!slot || slot.owner === null) return null;
  return `これまでに払われた ${slot.paid} コイン ＋ ${balance.acquireMarkup}。代金は相手に渡り、物件と VP が移ります`;
}

export interface LevelEffect {
  level: number;
  vp: string;
  text: string;
}

/** 区画のいまの Lv と、上げたあと（level + 1）の効果を並べて見せるための値。
 *  上限なら next は null。未建設なら Lv1 の効果だけ（next も null）。 */
export function levelEffects(
  state: GameState,
  slotId: number,
  balance: Balance,
): { current: LevelEffect; next: LevelEffect | null } {
  const slot = state.market[slotId]!;
  const level = slot.owner === null ? 1 : slot.level;
  const vpAt = (lv: number): string => {
    if (slot.buildingId === 'cathedral') {
      const per = lv >= 2 ? balance.level2.cathedralVpPerBuilding : balance.cathedralVpPerBuilding;
      return `他の物件 1 件につき ${per} VP`;
    }
    return `${buildingVp(balance, slot.buildingId, lv)} VP`;
  };
  const current: LevelEffect = {
    level,
    vp: slot.owner !== null && slot.buildingId !== 'cathedral' ? `${vpOfSlot(state, slot, balance)} VP` : vpAt(level),
    text: buildingTextFor(slot.buildingId, balance, level),
  };
  const next =
    slot.owner === null || level >= MAX_LEVEL
      ? null
      : { level: level + 1, vp: vpAt(level + 1), text: buildingTextFor(slot.buildingId, balance, level + 1) };
  return { current, next };
}

/** CPU（相手）の行動を、盤面の上の吹き出しに出す文。誰が何をしたかを主語から言う。
 *  build / upgrade / acquire 以外は null（呼び出し側は実況ログをそのまま出す）。 */
export function cpuActionCallout(before: GameState, action: Action, actor = 'CPU'): string | null {
  if (action.type !== 'build' && action.type !== 'upgrade' && action.type !== 'acquire') return null;
  const slot = before.market[action.slotId];
  if (!slot) return null;
  const name = BUILDING_NAMES[slot.buildingId];
  if (action.type === 'upgrade') return `${actor} が${name}をアップグレードした`;
  if (action.type === 'acquire') return `${actor} があなたの${name}を買収した`;
  return null;
}
