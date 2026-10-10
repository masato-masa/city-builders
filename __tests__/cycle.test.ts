import { describe, expect, it } from 'vitest';

import { ALL_CARDS, DEFAULT_BALANCE } from '@/game/balance';
import { canUseCard, cardCostFor, reduce } from '@/game/reducer';
import { handOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

/** テスト用に、手番プレイヤーの手札・待機列とコインを固定する。
 *  先頭 4 枚が手札の枠 0〜3、残りが待機列になる。 */
function fixture(deck: CardId[], coins: number): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.players.you.hand = deck.slice(0, 4);
  g.players.you.queue = deck.slice(4);
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
  it('使ったカードがあった枠にだけ待機列の先頭が補充され、他の枠は動かない', () => {
    const g = fixture(ORDER, 20);
    const after = reduce(g, { type: 'useCard', card: 'miner' }, DEFAULT_BALANCE);
    // miner は枠 0 にあった。枠 0 だけ待機列の先頭（spy）に置き換わる
    expect(after.players.you.hand[0]).toBe('spy');
    // 他の枠は 1px も動かない
    expect(after.players.you.hand.slice(1)).toEqual(g.players.you.hand.slice(1));
    // 使ったカードは待機列の最後尾へ
    expect(after.players.you.queue.at(-1)).toBe('miner');
    expect(handOf(after, 'you')).toHaveLength(4);
  });

  it('手札の 3 枚目を使っても、他の 3 枚はそれぞれ元の枠に残る', () => {
    const g = fixture(ORDER, 20);
    const after = reduce(g, { type: 'useCard', card: 'banker' }, DEFAULT_BALANCE);
    // banker は枠 2 にあった。枠 2 だけ待機列の先頭（spy）に置き換わり、他は不動
    expect(after.players.you.hand).toEqual(['miner', 'usurer', 'spy', 'architect']);
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
    // 建築家（コスト 2）に工場の割引 2 → 0。それ以上は引かない
    expect(cardCostFor(g, 'you', 'architect', DEFAULT_BALANCE)).toBe(0);
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
    g.players.you.hand = ALL_CARDS.slice(0, 4);
    g.players.you.queue = [...ALL_CARDS.slice(4)];
    g.players.you.coins = 999;
    return g;
  }

  it('使った 1 枚は待機列の最後尾へ回り、手札 4 枚・待機列 6 枚は変わらない', () => {
    const g = fixtureAllCards();
    const after = reduce(g, { type: 'useCard', card: 'miner' }, DEFAULT_BALANCE);
    expect(after.players.you.hand).toHaveLength(4);
    expect(after.players.you.queue).toHaveLength(6);
    const all = [...handOf(after, 'you'), ...after.players.you.queue];
    expect(all).toHaveLength(10);
    expect(new Set(all)).toEqual(new Set(ALL_CARDS));
    expect(after.players.you.queue.at(-1)).toBe('miner');
    expect(handOf(after, 'you')).toHaveLength(4);
  });

  it('10 種類すべてを 1 回ずつ使っても、10 枚の固定循環が保たれる', () => {
    let g = fixtureAllCards();
    const remaining = new Set(ALL_CARDS);
    // 手札に実際にあるカードを、まだ使っていないものから順に選んで使う
    // （固定シフトを前提にした決め打ちの順番には頼らない）。
    while (remaining.size > 0) {
      const card = handOf(g, 'you').find((c) => remaining.has(c))!;
      remaining.delete(card);
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
    // 使ったカードは必ず待機列の底へ回るだけで、増えたり消えたりしない
    const all = [...handOf(g, 'you'), ...g.players.you.queue];
    expect(all).toHaveLength(10);
    expect(new Set(all)).toEqual(new Set(ALL_CARDS));
    expect(handOf(g, 'you')).toHaveLength(4);
  });
});
