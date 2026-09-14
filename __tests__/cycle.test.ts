import { describe, expect, it } from 'vitest';

import { ALL_CARDS, DEFAULT_BALANCE } from '@/game/balance';
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
  'usurer',
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
      'usurer',
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
    expect(handOf(after, 'you')).toEqual(['miner', 'usurer', 'architect', 'spy']);
  });

  it('8 枚すべて使うと、伝令のぶん 1 つずれて一周する', () => {
    let g = fixture(ORDER, 200);
    for (const card of ORDER) {
      // 伝令の番（手札は herald / taxman / blockader / miner）では miner が妥当な対象になる
      g = reduce(g, { type: 'useCard', card, heraldTarget: 'miner', blockadeSlot: 0 }, DEFAULT_BALANCE);
    }
    // 8 枚ぶんの移動に加えて、伝令が対象をもう 1 枚底へ送るので合計 9 歩進む。
    // デッキは 8 枚なので、ちょうど 1 つぶんずれた位置になる。
    expect(handOf(g, 'you')).toEqual(ORDER.slice(1, 5));
  });

  it('同じカードは 1 ターンに 1 回しか使えない', () => {
    let g = fixture(ORDER, 200);
    for (const card of ORDER) {
      g = reduce(g, { type: 'useCard', card, heraldTarget: 'miner', blockadeSlot: 0 }, DEFAULT_BALANCE);
    }
    // 一巡して高利貸が手札に戻っているが、このターンはもう使えない
    expect(handOf(g, 'you')).toContain('usurer');
    expect(canUseCard(g, 'usurer', DEFAULT_BALANCE)).toBe(false);
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
    const after = reduce(g, { type: 'useCard', card: 'banker' }, DEFAULT_BALANCE);
    expect(after.players.you.coins).toBe(10 - DEFAULT_BALANCE.cards.banker.cost);
  });

  it('工場を持つと、そのターン最初の 1 枚だけコストが下がる', () => {
    const g = fixture(ORDER, 20);
    g.market.find((s) => s.buildingId === 'factory')!.owner = 'you';
    expect(cardCostFor(g, 'you', 'banker', DEFAULT_BALANCE)).toBe(
      DEFAULT_BALANCE.cards.banker.cost - DEFAULT_BALANCE.factoryDiscount,
    );
    const after = reduce(g, { type: 'useCard', card: 'banker' }, DEFAULT_BALANCE);
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

describe('10 枚デッキでの循環', () => {
  function fixtureAllCards(): GameState {
    const g = createGame(1);
    g.current = 'you';
    g.players.you.deck = [...ALL_CARDS];
    g.players.you.coins = 999;
    return g;
  }

  it('使った 1 枚は山の底へ回り、デッキは 10 枚のまま', () => {
    const g = fixtureAllCards();
    const after = reduce(g, { type: 'useCard', card: 'miner' }, DEFAULT_BALANCE);
    expect(after.players.you.deck).toEqual([...ALL_CARDS.slice(1), 'miner']);
    expect(after.players.you.deck).toHaveLength(10);
    expect(handOf(after, 'you')).toHaveLength(4);
  });

  it('10 種類すべてを 1 回ずつ使っても、10 枚の固定循環が保たれる', () => {
    let g = fixtureAllCards();
    for (const card of ALL_CARDS) {
      if (card === 'herald') {
        const target = handOf(g, 'you').find((c) => c !== 'herald')!;
        g = reduce(g, { type: 'useCard', card, heraldTarget: target }, DEFAULT_BALANCE);
      } else if (card === 'blockader') {
        const slot = g.market.find((s) => s.owner === null)!.slotId;
        g = reduce(g, { type: 'useCard', card, blockadeSlot: slot }, DEFAULT_BALANCE);
      } else {
        g = reduce(g, { type: 'useCard', card }, DEFAULT_BALANCE);
      }
    }
    // 使ったカードは必ず山の底へ回るだけで、増えたり消えたりしない
    expect(g.players.you.deck).toHaveLength(10);
    expect(new Set(g.players.you.deck)).toEqual(new Set(ALL_CARDS));
    expect(handOf(g, 'you')).toHaveLength(4);
  });
});
