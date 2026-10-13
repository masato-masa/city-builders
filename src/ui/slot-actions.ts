// 区画のシートに出す「アップグレード」「買収」のボタンの中身（文言・価格・押せるか・押せない理由）。
// 画面に直書きせず、ここで決めてテストする。判定そのものは src/game の canUpgrade / canAcquire に任せ、
// ここは「なぜ押せないか」を言葉にするだけ。

import { BUILDING_NAMES, buildingEffect, buildingTextFor, buildingVp, type Balance } from '@/game/balance';
import { canAcquire, canUpgrade } from '@/game/reducer';
import {
  acquireBlockOf,
  acquireCostFor,
  marketValueOf,
  districtOfSlot,
  opponentOf,
  slotLocked,
  slotMaxed,
  titleHolder,
  titleVpSwing,
  upgradeCostFor,
  upgradePriceOf,
  vpOfSlot,
} from '@/game/selectors';
import type { Action, BuildingId, GameState, PlayerId } from '@/game/types';

import { districtMeasureLabel, districtTally, tallyText } from './district-view';

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
  /** value は買収に要るコイン。最終段階で買収できない物件は null */
  | { kind: 'built'; value: number | null; upgrade: number | null };

export function plotFigures(
  state: GameState,
  slotId: number,
  viewer: PlayerId,
  balance: Balance,
  buildCost: (slotId: number) => number,
): PlotFigures {
  const slot = state.market[slotId]!;
  if (slot.owner === null) return { kind: 'unbuilt', build: buildCost(slotId) };
  const up = upgradePriceOf(slot, balance);
  const maxed = !Number.isFinite(up);
  // 自分の物件は相手が買うときの額（上乗せは買う側の物件の数で変わる。相手の手番外なので買収者の割引は乗らない）
  const value = maxed
    ? null
    : slot.owner === viewer
      ? acquireCostFor(state, opponentOf(viewer), slot, balance)
      : acquireCostFor(state, viewer, slot, balance);
  // 自分の物件のアップグレード費は、このターンの職人の割引込み
  const upNow = slot.owner === viewer ? upgradeCostFor(state, viewer, slot, balance) : up;
  return { kind: 'built', value, upgrade: Number.isFinite(upNow) ? upNow : null };
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
  // 職人を使ったターンは割引後の額（相手の手番中は割引なし。割引は手番の終わりで消える）
  const price = upgradeCostFor(state, viewer, slot, balance);
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
  if (acquireBlockOf(state, slotId, viewer, balance) === 'maxLevel') {
    return { price, enabled, label: '買収できません', reason: '最終段階まで上げた物件は買収できません' };
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
  const buyer = opponentOf(slot.owner);
  const discount = state.players[buyer].acquireDiscount;
  const spy = discount > 0 && buyer === state.current ? ` − 買収者 ${discount}` : '';
  return `市場価値 ${marketValueOf(slot, balance)} × ${balance.acquireMultiplier}${spy}。払ったコインは消え（相手には渡らない）、物件と VP が移ります`;
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
  // 最終段階の物件は買収されないので、「買収すると／されると称号が動く」は言わない
  const movable = !slotMaxed(slot, balance);
  if (movable && slot.owner !== viewer && titleVpSwing(state, slotId, viewer, viewer, balance) > 0) {
    return `${slot.owner === null ? '建てる' : '買収する'}と${name}の称号（+${vp} VP）が${names[viewer]}に来ます`;
  }
  if (movable && slot.owner === viewer && titleVpSwing(state, slotId, foe, viewer, balance) < 0) {
    return `買収されると${name}の称号（${vp} VP）を失います`;
  }
  // 件数か VP の合計か（いまのルールで称号を決める値）は district-view が決める
  const { measure, values } = districtTally(state, d, balance);
  const holder = titleHolder(state, d);
  const tally = `${names[viewer]} ${tallyText(measure, values[viewer])}・${names[foe]} ${tallyText(measure, values[foe])}`;
  return holder === null
    ? `${name}: ${tally}。${districtMeasureLabel(balance)}が多い側に称号（+${vp} VP）`
    : `${name}: ${tally}。称号は${names[holder]}`;
}

/** 建物の詳細に並べる固定の数値の 1 行。label は常に同じ並び（VP・建築コスト・買収コスト・増築コスト・収益）。 */
export interface SpecRow {
  label: string;
  value: string;
}

/** 建物の収入は VP がそのまま入る（建物の詳細に添える 1 行）。 */
export const VP_IS_INCOME_NOTE = 'VP ＝ 毎ターンの収入';

/** 建物そのものの固定の数値（盤面の状態によらない）。Lv ごとに変わる値は「Lv1 / Lv2 / Lv3」の順に並べる。
 *  レベル数は balance.maxLevel から（直書きしない）。 */
export function buildingSpecRows(id: BuildingId, balance: Balance): SpecRow[] {
  const levels = Array.from({ length: Math.max(1, balance.maxLevel) }, (_, i) => i + 1);
  const vp =
    id === 'cathedral'
      ? `他の物件 1 件につき ${levels.map((lv) => buildingEffect(balance, 'cathedralVpPerBuilding', lv)).join(' / ')}`
      : levels.map((lv) => buildingVp(balance, id, lv)).join(' / ');
  const upgrades = levels
    .slice(1)
    .map((lv) => `Lv${lv} ${lv >= 3 ? balance.upgrades3[id].cost : balance.upgrades[id].cost}`)
    .join(' ・ ');
  const rows: SpecRow[] = [
    { label: 'VP', value: levels.length > 1 ? `${vp}（Lv${levels.join('/')}）` : vp },
    { label: '建築コスト', value: `${balance.buildings[id].cost}` },
    {
      label: '買収コスト',
      value: `市場価値 × ${balance.acquireMultiplier}（${levels
        .slice(0, Math.max(1, levels.length - 1))
        .map((lv) => marketValueOf({ slotId: 0, buildingId: id, owner: null, level: lv, touchedTurn: 0 }, balance) * balance.acquireMultiplier)
        .join(' / ')}。Lv${balance.maxLevel} は買収されない）`,
    },
  ];
  if (upgrades) rows.push({ label: '増築コスト', value: upgrades });
  // 商館だけ VP が低い代わりに、効果で追加の収入が入る
  if (id === 'tradingHouse') {
    rows.push({ label: '追加収入', value: `毎ターン +${levels.map((lv) => buildingEffect(balance, 'tradingHouseIncome', lv)).join(' / ')}` });
  }
  return rows;
}

/** 区画の今の状態の 1 行（建物の詳細の一番上）。持ち主・Lv・今の市場価値（＝買収に要るコイン）。
 *  最終段階なら「最終段階のため買収不可」。未建設なら今の建設費。 */
export function slotStatusLine(
  state: GameState,
  slotId: number,
  viewer: PlayerId,
  balance: Balance,
  names: Record<PlayerId, string>,
  buildCost: number,
): string {
  const slot = state.market[slotId]!;
  if (slot.owner === null) return `空き地 ・ いま建てると ${buildCost} コイン`;
  const head = `${names[slot.owner]}の物件 ・ Lv${slot.level}`;
  if (slotMaxed(slot, balance)) return `${head} ・ 最終段階のため買収不可`;
  const buyer = opponentOf(slot.owner);
  const price = acquireCostFor(state, buyer, slot, balance);
  return `${head} ・ 市場価値 ${marketValueOf(slot, balance)} ・ 買収 ${price}（×${balance.acquireMultiplier}）`;
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
      const per =
        lv >= 3
          ? balance.level3.cathedralVpPerBuilding
          : lv >= 2
            ? balance.level2.cathedralVpPerBuilding
            : balance.cathedralVpPerBuilding;
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
