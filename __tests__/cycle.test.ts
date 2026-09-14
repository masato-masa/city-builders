import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { canUseCard, cardCostFor, reduce } from '@/game/reducer';
import { handOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

/** テスト用に、手番プレイヤーのデッキ順とコインを固定する。 */
function fixture(deck: CardId[], coins: number): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.players.you.deck = [...deck];
  g.players.you.coins = coins;
  return g;
}

const ORDER: CardId[] = [
  'miner',
  'merchant',
  'banker',
  'architect',
  'spy',
  'herald',
  'taxman',
  'blockader',
];

describe('循環', () => {
  it('使ったカードは最後尾へ回り、手札は 4 枚のまま', () => {
    const g = fixture(ORDER, 20);
    const after = reduce(g, { type: 'useCard', card: 'miner' }, DEFAULT_BALANCE);
    expect(after.players.you.deck).toEqual([
      'merchant',
      'banker',
      'architect',
      'spy',
      'herald',
      'taxman',
      'blockader',
      'miner',
    ]);
    expect(handOf(after, 'you')).toHaveLength(4);
  });

  it('手札の 3 枚目を使っても、他の 3 枚は手札に残る', () => {
    const g = fixture(ORDER, 20);
    const after = reduce(g, { type: 'useCard', card: 'banker' }, DEFAULT_BALANCE);
    expect(handOf(after, 'you')).toEqual(['miner', 'merchant', 'architect', 'spy']);
  });

  it('8 枚すべて使うと循環位置が元に戻る', () => {
    let g = fixture(ORDER, 200);
    for (const card of ORDER) {
      g = reduce(g, { type: 'useCard', card, heraldTarget: 'miner', blockadeSlot: 0 }, DEFAULT_BALANCE);
    }
    expect(handOf(g, 'you')).toEqual(ORDER.slice(0, 4));
  });

  it('同じカードは 1 ターンに 1 回しか使えない', () => {
    let g = fixture(ORDER, 200);
    for (const card of ORDER) {
      g = reduce(g, { type: 'useCard', card, heraldTarget: 'miner', blockadeSlot: 0 }, DEFAULT_BALANCE);
    }
    // 一巡して miner が手札に戻っているが、このターンは使えない
    expect(handOf(g, 'you')).toContain('miner');
    expect(canUseCard(g, 'miner', DEFAULT_BALANCE)).toBe(false);
  });

  it('手札に無いカードは使えない', () => {
    const g = fixture(ORDER, 20);
    expect(canUseCard(g, 'taxman', DEFAULT_BALANCE)).toBe(false);
  });

  it('コインが足りなければ使えない', () => {
    const g = fixture(ORDER, 0);
    expect(canUseCard(g, 'miner', DEFAULT_BALANCE)).toBe(false);
  });

  it('コストを払うとコインが減る', () => {
    const g = fixture(ORDER, 10);
    const after = reduce(g, { type: 'useCard', card: 'merchant' }, DEFAULT_BALANCE);
    expect(after.players.you.coins).toBe(10 - DEFAULT_BALANCE.cards.merchant.cost);
  });

  it('工場を持つと、そのターン最初の 1 枚だけコストが下がる', () => {
    const g = fixture(ORDER, 20);
    g.market.find((s) => s.buildingId === 'factory')!.owner = 'you';
    expect(cardCostFor(g, 'you', 'merchant', DEFAULT_BALANCE)).toBe(
      DEFAULT_BALANCE.cards.merchant.cost - DEFAULT_BALANCE.factoryDiscount,
    );
    const after = reduce(g, { type: 'useCard', card: 'merchant' }, DEFAULT_BALANCE);
    expect(cardCostFor(after, 'you', 'miner', DEFAULT_BALANCE)).toBe(
      DEFAULT_BALANCE.cards.miner.cost,
    );
  });

  it('工場の割引でコストは 0 未満にならない', () => {
    const g = fixture(ORDER, 20);
    g.market.find((s) => s.buildingId === 'factory')!.owner = 'you';
    expect(cardCostFor(g, 'you', 'miner', DEFAULT_BALANCE)).toBe(0);
  });

  it('元の状態を書き換えない', () => {
    const g = fixture(ORDER, 20);
    const before = structuredClone(g);
    reduce(g, { type: 'useCard', card: 'miner' }, DEFAULT_BALANCE);
    expect(g).toEqual(before);
  });
});
