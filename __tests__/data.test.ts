import { describe, expect, it } from 'vitest';

import { ALL_CARDS, BUILDING_NAMES, CARD_NAMES, DEFAULT_BALANCE } from '@/game/balance';

describe('データ定義', () => {
  it('人物カードは 10 種', () => {
    expect(ALL_CARDS).toHaveLength(10);
    expect(new Set(ALL_CARDS).size).toBe(10);
  });

  it('すべての人物カードにコストと日本語名がある', () => {
    for (const id of ALL_CARDS) {
      expect(DEFAULT_BALANCE.cards[id].cost).toBeGreaterThanOrEqual(0);
      expect(CARD_NAMES[id]).toBeTruthy();
    }
  });

  it('市場は 10 スロット', () => {
    expect(DEFAULT_BALANCE.market).toHaveLength(10);
  });

  it('市場の構成は城塞2・工場1・商館3・その他4', () => {
    const count = (id: string) => DEFAULT_BALANCE.market.filter((m) => m === id).length;
    expect(count('fortress')).toBe(2);
    expect(count('factory')).toBe(1);
    expect(count('tradingHouse')).toBe(3);
    expect(DEFAULT_BALANCE.market.length - count('fortress') - count('factory') - count('tradingHouse')).toBe(4);
  });

  it('市場に出る物件はすべて定義と日本語名を持つ', () => {
    for (const id of DEFAULT_BALANCE.market) {
      expect(DEFAULT_BALANCE.buildings[id].cost).toBeGreaterThan(0);
      expect(BUILDING_NAMES[id]).toBeTruthy();
    }
  });

  it('手札は 4 枚', () => {
    expect(DEFAULT_BALANCE.handSize).toBe(4);
  });
});
