import { DEFAULT_BALANCE, NEW_CARDS_DECK, type Balance } from '@/game/balance';
import { drawDeck } from '@/game/setup';
import type { CardId } from '@/game/types';

// 2026-10-11 のルール変更（建物の収益・鉱山・封鎖の作り替え）で Balance の形が変わったので、古い上書きは読まない
const KEY = 'city-builders:balance:v2';

/** 数値の上書き。遊びながら調整するための仕組み。
 *  壊れた値が入っていても既定値に戻せるよう、浅くマージするだけにする。
 *  ただしカードのコスト（cards）だけは 1 段深く重ねる。カードを足したあとに古い保存が残っていると、
 *  新しいカードのコストが無くて使えなくなるため。 */
export function loadBalance(): Balance {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_BALANCE;
    const saved = JSON.parse(raw) as Partial<Balance>;
    return { ...DEFAULT_BALANCE, ...saved, cards: { ...DEFAULT_BALANCE.cards, ...saved.cards } };
  } catch {
    return DEFAULT_BALANCE;
  }
}

export function saveBalance(balance: Balance): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(balance));
  } catch {
    // 保存できなくても遊べる
  }
}

export function resetBalance(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
}

// ---------------------------------------------------------------------------
// テスト用のデッキ（新しいカードを実機で試す）
// ---------------------------------------------------------------------------

const DECK_KEY = 'city-builders:test-deck';

/** 'default' は既定の 10 枚、'newCards' は祝祭・徴税官の代わりに職人・検査官を入れた 10 枚（NEW_CARDS_DECK）、
 *  'draw' は抽選（試合の seed から、コア 4 枚 + 残り 12 種から 6 枚。両者共通）。 */
export type TestDeck = 'default' | 'newCards' | 'draw';

export function loadTestDeck(): TestDeck {
  try {
    const v = localStorage.getItem(DECK_KEY);
    return v === 'newCards' || v === 'draw' ? v : 'default';
  } catch {
    return 'default';
  }
}

export function saveTestDeck(deck: TestDeck): void {
  try {
    if (deck === 'default') localStorage.removeItem(DECK_KEY);
    else localStorage.setItem(DECK_KEY, deck);
  } catch {
    // 保存できなくても遊べる（既定のデッキのまま）
  }
}

/** 試合に渡すデッキ。既定なら undefined（createGame の既定に任せる）。抽選は試合の seed で決まる。 */
export function testDeckCards(seed: number, deck: TestDeck = loadTestDeck()): readonly CardId[] | undefined {
  if (deck === 'newCards') return NEW_CARDS_DECK;
  if (deck === 'draw') return drawDeck(seed);
  return undefined;
}
