import type { BuildingId } from '@/game/types';

import fieldUrl from '@/assets/art/field.webp';
import exchangeUrl from '@/assets/art/buildings/exchange.webp';
import factoryUrl from '@/assets/art/buildings/factory.webp';
import fortressUrl from '@/assets/art/buildings/fortress.webp';
import quarryUrl from '@/assets/art/buildings/quarry.webp';
import roadUrl from '@/assets/art/buildings/road.webp';
import tradingHouseUrl from '@/assets/art/buildings/tradingHouse.webp';
import wallUrl from '@/assets/art/buildings/wall.webp';

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
  tradingHouse: { url: tradingHouseUrl, scale: 0.97 },
  wall: { url: wallUrl, scale: 0.94 },
  factory: { url: factoryUrl, scale: 0.88 },
  road: { url: roadUrl, scale: 0.9 },
  exchange: { url: exchangeUrl, scale: 0.85 },
  quarry: { url: quarryUrl, scale: 0.89 },
};
