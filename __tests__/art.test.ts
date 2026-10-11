import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE, DEFAULT_DECK } from '@/game/balance';
import type { CardId } from '@/game/types';
import { BUILDING_ART, CARD_ART, CARD_PLACEHOLDER, cardArtOf, FIELD_URL, hasBuildingArt, hasCardArt } from '@/ui/art';

describe('素材の対応表', () => {
  it('盤面の地の URL がある', () => {
    expect(FIELD_URL).toBeTruthy();
  });

  it('登録されている素材は、市場に出る物件のものだけ', () => {
    const inMarket = new Set(DEFAULT_BALANCE.market);
    for (const id of Object.keys(BUILDING_ART)) {
      expect(inMarket.has(id as never)).toBe(true);
    }
  });

  it('登録されている素材はすべて URL と正の倍率を持つ', () => {
    for (const [id, art] of Object.entries(BUILDING_ART)) {
      expect(art, id).toBeDefined();
      expect(art!.url, id).toBeTruthy();
      expect(art!.scale, id).toBeGreaterThan(0);
    }
  });

  it('まだ素材が無い物件があってよい（空き地で表示する）', () => {
    const done = Object.keys(BUILDING_ART).length;
    expect(done).toBeGreaterThan(0);
    expect(done).toBeLessThanOrEqual(new Set(DEFAULT_BALANCE.market).size);
  });

  it('市場の物件はすべて絵を持つ（鉱山は石切場の絵を仮に使い、空き地に見えない）', () => {
    for (const id of new Set(DEFAULT_BALANCE.market)) {
      expect(BUILDING_ART[id]?.url, id).toBeTruthy();
    }
    expect(hasBuildingArt('mine')).toBe(false);
    expect(BUILDING_ART.mine?.url).toBe(BUILDING_ART.quarry?.url);
  });

  it('登録されているカード絵は、すべて実在するカード ID のもの', () => {
    const allCards = new Set(Object.keys(DEFAULT_BALANCE.cards));
    for (const id of Object.keys(CARD_ART)) {
      expect(allCards.has(id)).toBe(true);
    }
  });

  it('登録されているカード絵は、すべて URL を持つ', () => {
    for (const [id, url] of Object.entries(CARD_ART)) {
      expect(url, id).toBeTruthy();
    }
  });

  it('既定のデッキの 10 種はすべて本物の絵がそろっている', () => {
    for (const id of DEFAULT_DECK) {
      expect(CARD_ART[id], id).toBeTruthy();
      expect(cardArtOf(id), id).toBe(CARD_ART[id]);
    }
  });

  it('絵がまだ無いカードは、文字と色だけの仮の面（SVG）で必ず何か出る', () => {
    for (const id of Object.keys(DEFAULT_BALANCE.cards) as CardId[]) {
      const url = cardArtOf(id);
      expect(url, id).toBeTruthy();
      if (!hasCardArt(id)) {
        expect(url.startsWith('data:image/svg+xml'), id).toBe(true);
        expect(decodeURIComponent(url), id).toContain(CARD_PLACEHOLDER[id]?.mark ?? '');
      }
    }
    expect(hasCardArt('craftsman')).toBe(false);
    expect(hasCardArt('inspector')).toBe(false);
  });
});
