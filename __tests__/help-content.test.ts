import { describe, expect, it } from 'vitest';

import { cardTextFor, DEFAULT_BALANCE, DEFAULT_DECK } from '@/game/balance';
import { cardStaticNoteOf } from '@/ui/card-input';
import { HELP_SECTIONS, helpCards, helpSummary } from '@/ui/help-content';

const B = DEFAULT_BALANCE;

describe('あそびかた（?）', () => {
  it('項目の順: 勝ち方 → 1 手番 → 建てる/上げる/買う → 地区 → カード一覧', () => {
    expect(HELP_SECTIONS.map((s) => s.id)).toEqual(['win', 'turn', 'plots', 'districts', 'cards']);
  });

  it('要点は 3 行で、数字は balance から', () => {
    const s = helpSummary({ ...B, maxTurnsPerPlayer: 12 });
    expect(s).toHaveLength(3);
    expect(s[2]).toContain('12 ターン');
    expect(s[2]).toContain(`${B.winVp} VP`);
  });

  it('カード一覧は長押しの説明と同じ文', () => {
    const list = helpCards(undefined, B);
    expect(list.map((c) => c.card)).toEqual([...DEFAULT_DECK]);
    for (const c of list) {
      expect(c.text).toBe(cardTextFor(c.card, B));
      expect(c.note).toBe(cardStaticNoteOf(c.card));
      expect(c.cost).toBe(B.cards[c.card].cost);
    }
  });

  it('デッキを渡したらその札だけ（重複なし）', () => {
    expect(helpCards(['miner', 'boss', 'miner'], B).map((c) => c.card)).toEqual(['miner', 'boss']);
    expect(helpCards([], B)).toHaveLength(DEFAULT_DECK.length);
  });
});
