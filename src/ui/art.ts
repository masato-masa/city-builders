import type { BuildingId } from '@/game/types';

import fieldUrl from '@/assets/art/field.png';
import fortressUrl from '@/assets/art/buildings/fortress.png';
import tradingHouseUrl from '@/assets/art/buildings/tradingHouse.png';

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
};
