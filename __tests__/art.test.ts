import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import type { CardId } from '@/game/types';
import { BUILDING_ART, CARD_ART, FIELD_URL } from '@/ui/art';

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

  it('人物カード 10 種すべての絵がそろっている', () => {
    for (const id of Object.keys(DEFAULT_BALANCE.cards) as CardId[]) {
      expect(CARD_ART[id], id).toBeTruthy();
    }
    expect(Object.keys(CARD_ART).length).toBe(Object.keys(DEFAULT_BALANCE.cards).length);
  });
});
