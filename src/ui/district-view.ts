// 地区の称号の見せ方。称号が「何で」決まるか（物件の件数か、地区内の VP の合計か）と、
// その値・説明文を出す関数を、UI 側ではここ 1 か所にまとめる。
//
// 称号の判定そのものは src/game（nextTitles）が持つ。UI はルールを直書きせず、
// nextTitles に「件数では勝つが VP の合計では負ける」小さな盤面を渡して、どちらで決まるかを
// 確かめる（districtMeasureOf）。ルールが件数 → VP の合計に変わっても、ここを直さずに
// 説明文・値・単位がそろって切り替わる。

import { BUILDING_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { districtVpOf, nextTitles, opponentOf, titleHolder, vpOfSlot } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { BuildingId, GameState, PlayerId } from '@/game/types';

/** 称号を決める値。count = 地区内の物件の件数、vp = 地区内の物件の VP の合計。 */
export type DistrictMeasure = 'count' | 'vp';

const measureCache = new WeakMap<Balance, DistrictMeasure>();

/** いまのルールで、称号が件数と VP の合計のどちらで決まるか。
 *  ある地区で「相手 1 件（VP が高い）対 自分 2 件（VP の合計は低い）」の盤面を作り、nextTitles の答えで見分ける。
 *  そういう組が作れない balance（どの地区も 2 件しか無い等）なら件数とみなす。 */
export function districtMeasureOf(balance: Balance = DEFAULT_BALANCE): DistrictMeasure {
  const cached = measureCache.get(balance);
  if (cached) return cached;
  const measure = probeMeasure(balance);
  measureCache.set(balance, measure);
  return measure;
}

function probeMeasure(balance: Balance): DistrictMeasure {
  let base: GameState;
  try {
    base = createGame(1, balance, 'you');
  } catch {
    return 'count';
  }
  for (let d = 0; d < balance.districts.length; d++) {
    const slots = balance.districts[d]!.slots;
    if (slots.length < 3) continue;
    for (const big of slots) {
      const others = slots.filter((s) => s !== big);
      for (let i = 0; i < others.length; i++) {
        for (let j = i + 1; j < others.length; j++) {
          const g = structuredClone(base);
          g.titles = balance.districts.map(() => null);
          g.market[big]!.owner = 'cpu';
          g.market[others[i]!]!.owner = 'you';
          g.market[others[j]!]!.owner = 'you';
          const vp = (p: PlayerId) =>
            slots.reduce((n, s) => n + (g.market[s]!.owner === p ? vpOfSlot(g, g.market[s]!, balance) : 0), 0);
          if (vp('cpu') <= vp('you')) continue;
          const holder = nextTitles(g, balance)[d] ?? null;
          if (holder === 'cpu') return 'vp';
          if (holder === 'you') return 'count';
        }
      }
    }
  }
  return 'count';
}

/** 地区の自分と相手の値（件数か VP の合計）。称号の判定に使う値をそのまま出す。 */
export function districtTally(
  state: GameState,
  district: number,
  balance: Balance = DEFAULT_BALANCE,
): { measure: DistrictMeasure; values: Record<PlayerId, number> } {
  const measure = districtMeasureOf(balance);
  if (measure === 'vp') return { measure, values: districtVpOf(state, district, balance) };
  const values: Record<PlayerId, number> = { you: 0, cpu: 0 };
  for (const id of balance.districts[district]?.slots ?? []) {
    const owner = state.market[id]?.owner ?? null;
    if (owner !== null) values[owner] += 1;
  }
  return { measure, values };
}

/** 値の書き方（「2 件」「7 VP」）。 */
export function tallyText(measure: DistrictMeasure, n: number): string {
  return measure === 'count' ? `${n} 件` : `${n} VP`;
}

/** 称号の決まり方の説明文（地区の詳細シートと ? で使う）。 */
export function districtRuleText(balance: Balance = DEFAULT_BALANCE): string {
  const measure = districtMeasureOf(balance);
  const what = measure === 'count' ? '物件の数' : '物件の VP の合計';
  const min = balance.districtMinVp > 1 ? `（${balance.districtMinVp} VP 以上）` : '';
  return `地区の中の${what}が相手より多い側が称号（+${balance.districtTitleVp} VP）を持ちます${min}。同じなら今の持ち主のまま。封鎖者に効果を止められた物件の VP も数えます。`;
}

/** 手引き・? で使う、短い言い方（「物件の数」「VP の合計」）。 */
export function districtMeasureLabel(balance: Balance = DEFAULT_BALANCE): string {
  return districtMeasureOf(balance) === 'count' ? '物件の数' : 'VP の合計';
}

export interface DistrictSlotRow {
  slotId: number;
  buildingId: BuildingId;
  name: string;
  owner: PlayerId | null;
  level: number;
  /** その物件の VP（未建設は 0） */
  vp: number;
}

export interface DistrictDetail {
  name: string;
  holder: PlayerId | null;
  rule: string;
  measure: DistrictMeasure;
  /** viewer を先、相手を後に並べた値 */
  tally: { player: PlayerId; value: number; text: string }[];
  titleVp: number;
  slots: DistrictSlotRow[];
}

/** 地区の詳細シートの中身。 */
export function districtDetail(
  state: GameState,
  district: number,
  viewer: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): DistrictDetail {
  const d = balance.districts[district]!;
  const { measure, values } = districtTally(state, district, balance);
  const foe = opponentOf(viewer);
  return {
    name: d.name,
    holder: titleHolder(state, district),
    rule: districtRuleText(balance),
    measure,
    tally: [viewer, foe].map((p) => ({ player: p, value: values[p], text: tallyText(measure, values[p]) })),
    titleVp: balance.districtTitleVp,
    slots: d.slots.map((id) => {
      const s = state.market[id]!;
      return {
        slotId: id,
        buildingId: s.buildingId,
        name: BUILDING_NAMES[s.buildingId],
        owner: s.owner,
        level: s.owner === null ? 0 : s.level,
        vp: vpOfSlot(state, s, balance),
      };
    }),
  };
}
