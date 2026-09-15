import type { BuildingId, CardId } from '@/game/types';

import fieldUrl from '@/assets/art/field.webp';
import cathedralUrl from '@/assets/art/buildings/cathedral.webp';
import exchangeUrl from '@/assets/art/buildings/exchange.webp';
import factoryUrl from '@/assets/art/buildings/factory.webp';
import fortressUrl from '@/assets/art/buildings/fortress.webp';
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
import usurerUrl from '@/assets/art/cards/usurer.webp';

/** 盤面の地。縦横比 1:1.5 なので、3:4 の枠に object-fit: cover で収める。 */
export const FIELD_URL: string = fieldUrl;

export interface BuildingArt {
  url: string;
  /** 区画の幅に対する表示倍率。幅ではなく面積で揃えるので、素材ごとに違う。
   *  初期値は npm run audit-art が出す。盤面を見て微調整してよい。 */
  scale: number;
}

/** まだ素材が無い物件は登録しない。Board はその区画を空き地として描く。 */
export const BUILDING_ART: Partial<Record<BuildingId, BuildingArt>> = {
  fortress: { url: fortressUrl, scale: 1 },
  cathedral: { url: cathedralUrl, scale: 1.03 },
  tradingHouse: { url: tradingHouseUrl, scale: 0.97 },
  wall: { url: wallUrl, scale: 0.94 },
  factory: { url: factoryUrl, scale: 0.88 },
  road: { url: roadUrl, scale: 0.9 },
  exchange: { url: exchangeUrl, scale: 0.85 },
  quarry: { url: quarryUrl, scale: 0.89 },
};

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
};
