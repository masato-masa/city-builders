import { describe, expect, it } from 'vitest';

import { buildingTextFor, cardTextFor, DEFAULT_BALANCE } from '@/game/balance';
import { cardCostFor, reduce } from '@/game/reducer';
import { taxmanAmountOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { GameState } from '@/game/types';

// 雪だるまの対策（2026-10-11）: 多く持つ・多く稼ぐ側ほど強く効く妨害

function board(): GameState {
  const g = createGame(1, DEFAULT_BALANCE, 'you');
  g.turn = 5;
  g.current = 'you';
  g.players.you.coins = 20;
  g.players.you.hand = ['taxman', 'miner', 'banker', 'usurer'];
  return g;
}

describe('徴税官は相手の VP が多いほど多く引く', () => {
  it('基本 + 相手の VP × 率（端数は切り捨て）', () => {
    const B = { ...DEFAULT_BALANCE, taxmanAmount: 3, taxmanIncomeRate: 0.5, cardXpBehindBonus: 0 };
    const g = board();
    expect(taxmanAmountOf(g, 'you', B)).toBe(3);
    // 商館 2 件と石切場の VP の合計 × 0.5（端数は切り捨て）
    for (const id of [0, 1, 2]) g.market[id]!.owner = 'cpu';
    const income = [0, 1, 2].reduce((n, id) => n + B.buildings[g.market[id]!.buildingId].vp, 0);
    expect(taxmanAmountOf(g, 'you', B)).toBe(3 + Math.floor(income * 0.5));
    const after = reduce(g, { type: 'useCard', card: 'taxman' }, B);
    expect(after.players.cpu.pendingTax).toBe(3 + Math.floor(income * 0.5));
  });

  it('城壁があれば徴税官を受けない（城壁は徴税官だけを防ぐ）', () => {
    const g = board();
    g.market.find((s) => s.buildingId === 'wall')!.owner = 'cpu';
    const after = reduce(g, { type: 'useCard', card: 'taxman' }, DEFAULT_BALANCE);
    expect(after.players.cpu.pendingTax).toBe(0);
  });

  it('説明文に相手の VP で増えることが出る', () => {
    const B = { ...DEFAULT_BALANCE, taxmanAmount: 3, taxmanIncomeRate: 0.5 };
    expect(cardTextFor('taxman', B)).toContain('3 ＋ 相手の VP の半分');
    expect(cardTextFor('taxman', { ...B, taxmanIncomeRate: 0 })).toContain('コイン −3（');
  });
});

describe('衛兵のコスト', () => {
  it('物件が増えても上がらない。城壁があればコスト 0（物件の数を足さない）', () => {
    const B = DEFAULT_BALANCE;
    const g = board();
    expect(cardCostFor(g, 'you', 'guard', B)).toBe(B.cards.guard.cost);
    g.market[0]!.owner = 'you';
    g.market[1]!.owner = 'you';
    g.market[2]!.owner = 'you';
    expect(cardCostFor(g, 'you', 'guard', B)).toBe(B.cards.guard.cost);
    g.market.find((s) => s.buildingId === 'wall')!.owner = 'you';
    expect(cardCostFor(g, 'you', 'guard', B)).toBe(0);
    expect(cardCostFor(g, 'you', 'guard', B)).toBe(B.guardCostWithWall);
    expect(cardTextFor('guard', B)).not.toContain('守る物件');
  });
});

describe('城壁と城塞の役割', () => {
  it('城壁の説明は徴税官だけ。封鎖は城塞', () => {
    expect(buildingTextFor('wall', DEFAULT_BALANCE)).toContain('徴税官の効果を受けない');
    expect(buildingTextFor('wall', DEFAULT_BALANCE)).toContain('封鎖は防げない');
    expect(buildingTextFor('fortress', DEFAULT_BALANCE)).toContain('封鎖を受けない');
  });
});
