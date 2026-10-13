import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE as B } from '@/game/balance';
import { createGame } from '@/game/setup';
import { levelBarOf, plotTagOf } from '@/ui/card-plot-view';
import { plotFigures } from '@/ui/slot-actions';

describe('カードの Lv 帯のバー（levelBarOf）', () => {
  const [l2, l3] = B.cardLevelUses;

  it('区切りの数は次の Lv までの必要回数。使うたびに 1 区画満ちる', () => {
    expect(levelBarOf(B, 1, 0)).toEqual({ level: 1, segments: l2, filled: 0, maxed: false });
    expect(levelBarOf(B, 1, 1)).toMatchObject({ segments: l2, filled: Math.min(1, l2) });
    expect(levelBarOf(B, 2, l2)).toEqual({ level: 2, segments: l3 - l2, filled: 0, maxed: false });
    expect(levelBarOf(B, 2, l2 + 1)).toMatchObject({ segments: l3 - l2, filled: 1 });
  });

  it('最大 Lv は区切りなしの満タン', () => {
    expect(levelBarOf(B, 3, l3)).toEqual({ level: 3, segments: 1, filled: 1, maxed: true });
    expect(levelBarOf(B, 3, l3 + 5).maxed).toBe(true);
  });

  it('必要回数 2 なら 2 区画、3 なら 3 区画（balance に追従）', () => {
    const two = { ...B, cardLevelUses: [2, 5] as [number, number] };
    expect(levelBarOf(two, 1, 1)).toMatchObject({ segments: 2, filled: 1 });
    expect(levelBarOf(two, 2, 2)).toMatchObject({ segments: 3, filled: 0 });
    expect(levelBarOf(two, 2, 4)).toMatchObject({ segments: 3, filled: 2 });
  });
});

describe('区画の名札（plotTagOf）', () => {
  const cost = (id: number) => B.buildings[createGame(1, B, 'you').market[id]!.buildingId].cost;
  const tagAt = (mutate: (g: ReturnType<typeof createGame>) => void) => {
    const g = createGame(1, B, 'you');
    mutate(g);
    return plotTagOf(plotFigures(g, 0, 'you', B, cost), g.market[0]!.owner);
  };

  it('並びは購入前後・Lv・最大でいつも VP・コイン・アップグレード', () => {
    const tags = [
      tagAt(() => {}),
      tagAt((g) => (g.market[0]!.owner = 'you')),
      tagAt((g) => (g.market[0]!.owner = 'cpu')),
      tagAt((g) => {
        g.market[0]!.owner = 'you';
        g.market[0]!.level = 2;
      }),
      tagAt((g) => {
        g.market[0]!.owner = 'you';
        g.market[0]!.level = B.maxLevel;
      }),
    ];
    for (const t of tags) expect(t.order).toEqual(['vp', 'coin', 'upgrade']);
  });

  it('購入前は無色の VP と建設費のコイン。購入後は VP の札が持ち主の色になる', () => {
    const before = tagAt(() => {});
    expect(before.vpOwner).toBeNull();
    expect(before.coin).toEqual({ kind: 'build', value: cost(0) });
    expect(before.upgrade).toBeNull();
    expect(tagAt((g) => (g.market[0]!.owner = 'you')).vpOwner).toBe('you');
    expect(tagAt((g) => (g.market[0]!.owner = 'cpu')).vpOwner).toBe('cpu');
    const after = tagAt((g) => (g.market[0]!.owner = 'you'));
    expect(after.coin.kind).toBe('value');
    expect(after.upgrade).not.toBeNull();
  });

  it('最大 Lv は鍵（コインの札の場所）で、アップグレードは出さない', () => {
    const t = tagAt((g) => {
      g.market[0]!.owner = 'you';
      g.market[0]!.level = B.maxLevel;
    });
    expect(t.coin).toEqual({ kind: 'locked' });
    expect(t.upgrade).toBeNull();
  });
});
