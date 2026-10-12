// あそびかた（?）の中身。文は balance から組み立てる（テスト用メニューで数値を変えても食い違わない）。
// カード一覧の説明は、手札の長押しの説明と同じ文（cardTextFor・cardStaticNoteOf）を使う。

import { CARD_NAMES, cardTextFor, DEFAULT_DECK, type Balance } from '@/game/balance';
import type { CardId } from '@/game/types';

import { cardStaticNoteOf } from './card-input';

export type HelpSectionId = 'win' | 'turn' | 'plots' | 'districts' | 'cards';

/** 項目の順（勝ち方 → 1 手番の流れ → 建てる/上げる/買う → 地区 → カード一覧）。 */
export const HELP_SECTIONS: readonly { id: HelpSectionId; title: string }[] = [
  { id: 'win', title: '勝ち方' },
  { id: 'turn', title: '1 手番の流れ' },
  { id: 'plots', title: '建てる・上げる・買う' },
  { id: 'districts', title: '地区の称号' },
  { id: 'cards', title: 'カード一覧' },
];

/** 一画面で見渡せる要点（3 行）。 */
export function helpSummary(balance: Balance): string[] {
  return [
    'カードでコインを稼ぎ、物件を建てて VP を集める',
    'カードは盤面へドラッグして使う。長押しで説明',
    `${balance.market.length} 件すべてが建つか、各 ${balance.maxTurnsPerPlayer} ターンで終わり${
      balance.lastTurnNoAcquire ? '（最後の手番は買収できない）' : ''
    }。VP の多いほうの勝ち`,
  ];
}

export interface HelpCard {
  card: CardId;
  name: string;
  cost: number;
  text: string;
  note: string | null;
}

/** カード一覧。デッキの並びのまま、重複を除いて出す。 */
export function helpCards(deck: readonly CardId[] | undefined, balance: Balance): HelpCard[] {
  const cards = [...new Set(deck && deck.length > 0 ? deck : DEFAULT_DECK)];
  return cards.map((card) => ({
    card,
    name: CARD_NAMES[card],
    cost: balance.cards[card].cost,
    text: cardTextFor(card, balance),
    note: cardStaticNoteOf(card),
  }));
}
