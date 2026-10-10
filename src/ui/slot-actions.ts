// 区画のシートに出す「アップグレード」「買収」のボタンの中身（文言・価格・押せるか・押せない理由）。
// 画面に直書きせず、ここで決めてテストする。判定そのものは src/game の canUpgrade / canAcquire に任せ、
// ここは「なぜ押せないか」を言葉にするだけ。

import { BUILDING_NAMES, buildingTextFor, buildingVp, type Balance } from '@/game/balance';
import { canAcquire, canUpgrade } from '@/game/reducer';
import {
  acquireCostFor,
  acquirePriceOf,
  districtCounts,
  districtOfSlot,
  opponentOf,
  slotLocked,
  titleHolder,
  titleVpSwing,
  upgradePriceOf,
  vpOfSlot,
} from '@/game/selectors';
import type { Action, GameState, PlayerId } from '@/game/types';

/** これ以上上げられないか。上限のレベル数は直書きせず、upgradePriceOf が Infinity を返すかで見る
 *  （Lv の上限は src/game 側が決める）。 */
export function isMaxLevel(state: GameState, slotId: number, balance: Balance): boolean {
  const slot = state.market[slotId];
  return !!slot && slot.owner !== null && !Number.isFinite(upgradePriceOf(slot, balance));
}

/** 区画の名札に出す数字。
 *  - 未建設: 建設費（いま払う額）
 *  - 建った物件: 市場価値（＝買収に要るコイン）とアップグレード費（最大レベルなら null＝出さない）
 *  市場価値は、相手の物件なら viewer がいま払う額（買収者の割引込み）、自分の物件なら相手が払う額（割引なし）。 */
export type PlotFigures =
  | { kind: 'unbuilt'; build: number }
  | { kind: 'built'; value: number; upgrade: number | null };

export function plotFigures(
  state: GameState,
  slotId: number,
  viewer: PlayerId,
  balance: Balance,
  buildCost: (slotId: number) => number,
): PlotFigures {
  const slot = state.market[slotId]!;
  if (slot.owner === null) return { kind: 'unbuilt', build: buildCost(slotId) };
  const value = slot.owner === viewer ? acquirePriceOf(slot, balance) : acquireCostFor(state, viewer, slot, balance);
  const up = upgradePriceOf(slot, balance);
  return { kind: 'built', value, upgrade: Number.isFinite(up) ? up : null };
}

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

/** 自分の物件のアップグレードのボタン。最大レベルなら null（ボタンを出さない）。 */
export function upgradeButton(
  state: GameState,
  slotId: number,
  viewer: PlayerId,
  balance: Balance,
): SlotButton | null {
  const slot = state.market[slotId];
  if (!slot || slot.owner !== viewer) return null;
  const price = upgradePriceOf(slot, balance);
  if (!Number.isFinite(price)) return null;
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
  // 買収者を使ったターンは割引後の額を出す（相手の手番中に見るときは割引なし）
  const price = acquireCostFor(state, viewer, slot, balance);
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

/** 買収の価格の内訳を 1 行で。手番の側が買収者を使っていれば、その割引も内訳に出す。 */
export function acquireNote(state: GameState, slotId: number, balance: Balance): string | null {
  const slot = state.market[slotId];
  if (!slot || slot.owner === null) return null;
  const discount = state.players[state.current].acquireDiscount;
  const spy = discount > 0 && slot.owner !== state.current ? ` − 買収者 ${discount}` : '';
  return `これまでに払われた ${slot.paid} コイン ＋ ${balance.acquireMarkup}${spy}。代金は相手に渡り、物件と VP が移ります`;
}

/** 区画のシートに出す地区の 1 行。取れば称号が来る／奪われると称号を失う、を先に言い、
 *  どちらでもなければ地区の件数と称号の持ち主を言う。names は持ち主の呼び名。 */
export function districtNote(
  state: GameState,
  slotId: number,
  viewer: PlayerId,
  balance: Balance,
  names: Record<PlayerId, string>,
): string | null {
  const d = districtOfSlot(slotId, balance);
  const slot = state.market[slotId];
  if (d < 0 || !slot || balance.districtTitleVp <= 0) return null;
  const name = balance.districts[d]!.name;
  const foe = opponentOf(viewer);
  const vp = balance.districtTitleVp;
  if (slot.owner !== viewer) {
    if (titleVpSwing(state, slotId, viewer, viewer, balance) > 0) {
      return `${slot.owner === null ? '建てる' : '買収する'}と${name}の称号（+${vp} VP）が${names[viewer]}に来ます`;
    }
  } else if (titleVpSwing(state, slotId, foe, viewer, balance) < 0) {
    return `買収されると${name}の称号（${vp} VP）を失います`;
  }
  const counts = districtCounts(state, d, balance);
  const holder = titleHolder(state, d);
  const tally = `${names[viewer]} ${counts[viewer]} 件・${names[foe]} ${counts[foe]} 件`;
  return holder === null
    ? `${name}: ${tally}。多く持つ側に称号（+${vp} VP）`
    : `${name}: ${tally}。称号は${names[holder]}`;
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
    slot.owner === null || isMaxLevel(state, slotId, balance)
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
