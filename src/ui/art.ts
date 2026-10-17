import { CARD_NAMES } from '@/game/balance';
import type { BuildingId, CardId } from '@/game/types';

import fieldUrl from '@/assets/art/field.webp';
import cathedralUrl from '@/assets/art/buildings/cathedral.webp';
import exchangeUrl from '@/assets/art/buildings/exchange.webp';
import factoryUrl from '@/assets/art/buildings/factory.webp';
import fortressUrl from '@/assets/art/buildings/fortress.webp';
import mineUrl from '@/assets/art/buildings/mine.webp';
import quarryUrl from '@/assets/art/buildings/quarry.webp';
import roadUrl from '@/assets/art/buildings/road.webp';
import tradingHouseUrl from '@/assets/art/buildings/tradingHouse.webp';
import wallUrl from '@/assets/art/buildings/wall.webp';
import architectUrl from '@/assets/art/cards/architect.webp';
import bankerUrl from '@/assets/art/cards/banker.webp';
import festivalUrl from '@/assets/art/cards/festival.webp';
import guardUrl from '@/assets/art/cards/guard.webp';
import heraldUrl from '@/assets/art/cards/herald.webp';
import minerUrl from '@/assets/art/cards/miner.webp';
import spyUrl from '@/assets/art/cards/spy.webp';
import taxmanUrl from '@/assets/art/cards/taxman.webp';
import blockaderUrl from '@/assets/art/cards/blockader.webp';
import usurerUrl from '@/assets/art/cards/usurer.webp';
import craftsmanUrl from '@/assets/art/cards/craftsman.webp';
import inspectorUrl from '@/assets/art/cards/inspector.webp';
import bossUrl from '@/assets/art/cards/boss.webp';
import informerUrl from '@/assets/art/cards/informer.webp';
import doubleUrl from '@/assets/art/cards/double.webp';
import clerkUrl from '@/assets/art/cards/clerk.webp';
import coinUrl from '@/assets/art/ui/coin.webp';

/** 盤面の地。縦横比 2:3（711×1067）。盤面（.board、2:3）に cover で敷くので切れない。画面全体の背景にも使う。 */
export const FIELD_URL: string = fieldUrl;

/** 情報ボードのコインバッジに敷く、コインそのものの絵（要望「コイン背景は画像で」）。 */
export const COIN_URL: string = coinUrl;

export interface BuildingArt {
  url: string;
  /** 区画の幅に対する表示倍率。幅ではなく面積で揃えるので、素材ごとに違う。
   *  初期値は npm run audit-art が出す。盤面を見て微調整してよい。 */
  scale: number;
}

/** 物件の絵。まだ素材が無い物件は BUILDING_ART_STANDIN で近い物件の絵を仮に使う
 *  （どちらにも無ければ Board はその区画を空き地として描く）。 */
const OWN_BUILDING_ART: Partial<Record<BuildingId, BuildingArt>> = {
  fortress: { url: fortressUrl, scale: 1.0 },
  cathedral: { url: cathedralUrl, scale: 1.08 },
  tradingHouse: { url: tradingHouseUrl, scale: 0.88 },
  wall: { url: wallUrl, scale: 0.96 },
  factory: { url: factoryUrl, scale: 0.98 },
  road: { url: roadUrl, scale: 0.91 },
  exchange: { url: exchangeUrl, scale: 0.95 },
  quarry: { url: quarryUrl, scale: 0.97 },
  mine: { url: mineUrl, scale: 0.91 },
};

/** 絵がまだ無い物件に仮に使う、近い物件の絵。鉱山は石切場（同じ「掘る」場所）。
 *  空き地のように描かれると「建っていない」と読めてしまうため（2026-10-11）。本物の絵ができたら OWN_BUILDING_ART に足し、ここから消す。 */
export const BUILDING_ART_STANDIN: Partial<Record<BuildingId, BuildingId>> = {};

export const BUILDING_ART: Partial<Record<BuildingId, BuildingArt>> = { ...OWN_BUILDING_ART };
for (const [id, from] of Object.entries(BUILDING_ART_STANDIN) as [BuildingId, BuildingId][]) {
  if (!BUILDING_ART[id] && OWN_BUILDING_ART[from]) BUILDING_ART[id] = OWN_BUILDING_ART[from];
}

/** 本物の絵があるか（仮の絵ではないか）。 */
export function hasBuildingArt(id: BuildingId): boolean {
  return !!OWN_BUILDING_ART[id];
}

/** 人物カードの絵。建物と違い scale は持たない。カードの枠いっぱいに
 *  object-fit: cover で敷くので、素材ごとの倍率調整が要らない。
 *  まだ素材が無いカード（封鎖者）は登録しない。Hand はその札を名前だけで描く。 */
export const CARD_ART: Partial<Record<CardId, string>> = {
  miner: minerUrl,
  banker: bankerUrl,
  architect: architectUrl,
  herald: heraldUrl,
  festival: festivalUrl,
  guard: guardUrl,
  usurer: usurerUrl,
  spy: spyUrl,
  taxman: taxmanUrl,
  blockader: blockaderUrl,
  craftsman: craftsmanUrl,
  inspector: inspectorUrl,
  boss: bossUrl,
  informer: informerUrl,
  double: doubleUrl,
  clerk: clerkUrl,
};

/** 絵がまだ無いカードの仮の面（文字と色だけ）。上下 2 色のグラデーションに、名前の 1 文字を大きく置く。
 *  絵ができたら CARD_ART に登録すれば、こちらは使われなくなる（ここから消してよい）。 */
export interface CardPlaceholder {
  /** 大きく出す 1 文字 */
  mark: string;
  /** グラデーションの上の色・下の色 */
  top: string;
  bottom: string;
}

export const CARD_PLACEHOLDER: Partial<Record<CardId, CardPlaceholder>> = {};

/** 仮の面の既定（CARD_PLACEHOLDER にも無いカード）。名前の頭の 1 文字を灰色の地に置く。 */
function placeholderOf(card: CardId): CardPlaceholder {
  return CARD_PLACEHOLDER[card] ?? { mark: (CARD_NAMES[card] ?? '?').slice(0, 1), top: '#7d8796', bottom: '#2e3542' };
}

/** 仮の面を SVG の data URL にする。手札・「次」・長押しの説明・飛ぶ札・CPU の吹き出しは
 *  どれも <img src> で絵を出すので、URL にしておけばどの場所の寸法も絵のあるカードと同じになる。
 *  縦横比はカードと同じ 68:84。下の 1/4 は名前の帯が重なるので、文字はやや上に置く。 */
export function placeholderCardUrl(p: CardPlaceholder): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 68 84" width="136" height="168">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${p.top}"/><stop offset="1" stop-color="${p.bottom}"/></linearGradient></defs>` +
    `<rect width="68" height="84" fill="url(#g)"/>` +
    `<rect x="4" y="4" width="60" height="76" rx="5" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="1.2"/>` +
    `<circle cx="34" cy="35" r="19" fill="#000000" fill-opacity="0.18"/>` +
    `<text x="34" y="35" text-anchor="middle" dominant-baseline="central" font-size="26" font-weight="800" ` +
    `font-family="'Hiragino Sans','Yu Gothic','Noto Sans JP',sans-serif" fill="#ffffff" fill-opacity="0.92">${p.mark}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const placeholderUrls = new Map<CardId, string>();

/** カードの絵の URL。絵がまだ無いカードは仮の面（文字と色だけ）を返すので、必ず何か出る。 */
export function cardArtOf(card: CardId): string {
  const art = CARD_ART[card];
  if (art) return art;
  let url = placeholderUrls.get(card);
  if (!url) {
    url = placeholderCardUrl(placeholderOf(card));
    placeholderUrls.set(card, url);
  }
  return url;
}

/** 本物の絵があるか（仮の面ではないか）。 */
export function hasCardArt(card: CardId): boolean {
  return !!CARD_ART[card];
}
