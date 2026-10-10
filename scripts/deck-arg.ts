/** 計測ツール共通: --deck= の解釈。
 *
 *   （省略）         既定の 10 枚（createGame の既定。今までの seed・結果と同じ）
 *   --deck=new       新カード入りの 10 枚（NEW_CARDS_DECK）
 *   --deck=draw      抽選（試合ごとに seed から drawDeck。両者共通）
 *   --deck=a,b,...   カードを並べた固定のデッキ（両者共通）
 *
 * デッキは両者同じ。抽選の 1 試合のデッキは、その試合の seed だけから決まる（再現できる）。 */
import { CARD_NAMES, CARD_POOL, DEFAULT_DECK, NEW_CARDS_DECK, type Balance } from '../src/game/balance';
import { drawDeck, validateDeck, type Decks } from '../src/game/setup';
import type { CardId } from '../src/game/types';

export interface DeckSpec {
  /** 'default' | 'new' | 'draw' | 'list' */
  kind: 'default' | 'new' | 'draw' | 'list';
  /** 表示用の 1 行 */
  label: string;
  /** その試合のデッキ。既定なら undefined（createGame に任せる） */
  deckFor: (seed: number) => readonly CardId[] | undefined;
  /** 表に並べるカード（デッキに入りうるもの） */
  cards: readonly CardId[];
}

export function deckSpecFromArgs(args: readonly string[], balance: Balance): DeckSpec {
  const arg = args.find((a) => a.startsWith('--deck='))?.slice('--deck='.length);
  if (!arg || arg === 'default') {
    return { kind: 'default', label: '既定の 10 枚', deckFor: () => undefined, cards: DEFAULT_DECK };
  }
  if (arg === 'draw') {
    return {
      kind: 'draw',
      label: '抽選（コア 4 + 残り 12 種から 6、試合ごと）',
      deckFor: (seed) => drawDeck(seed, balance),
      cards: CARD_POOL,
    };
  }
  const list: readonly CardId[] =
    arg === 'new' ? NEW_CARDS_DECK : (arg.split(',').map((c) => c.trim()) as CardId[]);
  for (const c of list) if (!(CARD_POOL as readonly string[]).includes(c)) throw new Error(`知らないカード: ${c}`);
  const err = validateDeck(list, balance);
  if (err) throw new Error(err);
  return {
    kind: arg === 'new' ? 'new' : 'list',
    label: list.map((c) => CARD_NAMES[c]).join('・'),
    deckFor: () => list,
    cards: list,
  };
}

/** createGame に渡す形。 */
export function decksOf(deck: readonly CardId[] | undefined): Decks {
  return deck ? { you: deck, cpu: deck } : {};
}
