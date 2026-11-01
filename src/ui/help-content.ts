// あそびかた（?）の中身。文は balance から組み立てる（テスト用メニューで数値を変えても食い違わない）。
// カード一覧の説明は、手札の長押しの説明と同じ文（cardTextFor・cardStaticNoteOf）を使う。

import { BUILDING_NAMES, CARD_NAMES, DEFAULT_DECK, type Balance } from '@/game/balance';
import { cardLinesFor, cardTextFor, KEYWORD_LABELS, KEYWORD_ORDER, keywordDefs, type TextLine } from '@/game/card-text';
import type { CardId } from '@/game/types';

import { cardStaticNoteOf } from './card-input';

export type HelpSectionId = 'win' | 'turn' | 'plots' | 'districts' | 'marks' | 'words' | 'cards';

/** 項目の順（勝ち方 → 1 手番の流れ → 建てる/上げる/買う → 地区 → カード一覧）。 */
export const HELP_SECTIONS: readonly { id: HelpSectionId; title: string }[] = [
  { id: 'win', title: '勝ち方' },
  { id: 'turn', title: '1 手番の流れ' },
  { id: 'plots', title: '建てる・上げる・買う' },
  { id: 'districts', title: '地区の称号' },
  { id: 'marks', title: '色と印の意味' },
  { id: 'words', title: '言葉の意味' },
  { id: 'cards', title: 'カード一覧' },
];

/** 一画面で見渡せる要点（3 行）。 */
export function helpSummary(balance: Balance): string[] {
  return [
    'カードでコインを稼ぎ、物件を建てて VP を集める',
    'カードは盤面へドラッグして使う。長押しで説明',
    `先に ${balance.winVp} VP に届くか全物件を持てば勝ち。決着が付かなければ各 ${balance.maxTurnsPerPlayer} ターンで終わり、VP の多いほうの勝ち`,
  ];
}

export interface HelpCard {
  card: CardId;
  name: string;
  cost: number;
  text: string;
  lines: TextLine[];
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
    lines: cardLinesFor(card, balance),
    note: cardStaticNoteOf(card),
  }));
}

/** 色と印の意味（あそびかたの 1 画面）。例の数字は固定の見本で、ルールの値ではない。 */
/** 揺れる区画（CB-12）の説明。地区ごとに「元 ↔ 入れ替わる建物: 効果」の 1 行。数値は balance から（Lv1 の値）。 */
export function swingHelpLines(balance: Balance): string[] {
  return (balance.swingSlots ?? []).map(({ slot, alt }) => {
    const from = BUILDING_NAMES[balance.market[slot]!];
    const b = balance.buildings[alt];
    const effect: Record<string, string> = {
      watchtower: `自分の物件すべての買収に要るコイン +${balance.watchtowerGuard}`,
      cityHall: `VP ${b.vp} ＋ 同じ地区の自分の他の物件 1 件につき +${balance.cityHallVpPerBuilding}`,
      tollgate: `相手の採掘師・銀行家の収入から 1 枚につき ${balance.tollgateToll} を自分へ`,
    };
    return `${from} ↔ ${BUILDING_NAMES[alt]}（建設 ${b.cost}）: ${effect[alt] ?? ''}`;
  });
}

export const MARK_LEGEND: readonly { kind: 'lv' | 'good' | 'bad'; sample: string; mark?: string; meaning: string }[] = [
  { kind: 'lv', sample: '+5', meaning: '金: Lv で上がった値。「+4 → +5」は次の Lv で変わる分' },
  { kind: 'good', sample: '1', mark: '▼', meaning: '緑: 持ち主に得な変化。▼ はコストが下がった（長押しで元の値と理由）' },
  { kind: 'bad', sample: '5', mark: '▲', meaning: '赤: 持ち主に損な変化。▲ はコストが上がった' },
];

/** 言葉の意味（キーワードの定義表。説明文の下線語をタップしたときの 1 行と同じもの）。 */
export function helpWords(balance: Balance): { id: string; label: string; def: string }[] {
  const defs = keywordDefs(balance);
  return KEYWORD_ORDER.map((id) => ({ id, label: KEYWORD_LABELS[id], def: defs[id] }));
}
