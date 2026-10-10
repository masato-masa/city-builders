import { describe, expect, it } from 'vitest';

import { exposedVpOf, reachOf } from '@/ai/evaluate';
import {
  ALL_CARDS,
  CARD_POOL,
  cardTextFor,
  DEFAULT_BALANCE,
  DEFAULT_DECK,
  NEW_CARDS,
  NEW_CARDS_DECK,
} from '@/game/balance';
import { canAcquire, canUpgrade, canUseCard, legalActions, reduce } from '@/game/reducer';
import { scoreOf, slotMaxed, upgradeCostFor, upgradePriceOf } from '@/game/selectors';
import { createGame, validateDeck } from '@/game/setup';
import type { CardId, GameState, PlayerId } from '@/game/types';
import { inspectPick, resolveDrop } from '@/ui/card-input';
import { cardAftermath } from '@/ui/feel';

const B = DEFAULT_BALANCE;

/** you の手番。you の手札の先頭 4 枚が hand、残りが queue。 */
function fixture(hand: CardId[], coins: number): GameState {
  const g = createGame(1, B, 'you', { you: NEW_CARDS_DECK, cpu: NEW_CARDS_DECK });
  const rest = NEW_CARDS_DECK.filter((c) => !hand.includes(c));
  g.players.you.hand = [...hand];
  g.players.you.queue = rest;
  g.players.you.coins = coins;
  return g;
}

function own(g: GameState, slotId: number, owner: PlayerId, level: number, paid: number): void {
  const s = g.market[slotId]!;
  s.owner = owner;
  s.level = level;
  s.paid = paid;
  s.touchedTurn = 0;
}

describe('createGame のデッキ', () => {
  it('省略しても既定の 10 枚を渡しても、同じ試合になる（既定の挙動は変わらない）', () => {
    for (const seed of [0, 7, 12345]) {
      expect(createGame(seed, B, undefined, { you: DEFAULT_DECK, cpu: DEFAULT_DECK })).toEqual(createGame(seed));
    }
    expect(DEFAULT_DECK).toEqual(ALL_CARDS);
  });

  it('既定のデッキに新しいカードは入っていない', () => {
    for (const c of NEW_CARDS) expect(DEFAULT_DECK).not.toContain(c);
  });

  it('渡したデッキの札だけが手札と待機列に入る（両者別々に渡せる）', () => {
    const g = createGame(3, B, undefined, { you: NEW_CARDS_DECK });
    const youAll = [...g.players.you.hand, ...g.players.you.queue];
    const cpuAll = [...g.players.cpu.hand, ...g.players.cpu.queue];
    expect(new Set(youAll)).toEqual(new Set(NEW_CARDS_DECK));
    expect(new Set(cpuAll)).toEqual(new Set(DEFAULT_DECK));
  });

  it('同じカード 2 枚・枚数不足のデッキは受け付けない', () => {
    expect(validateDeck(['miner', 'miner', 'banker', 'usurer', 'guard'])).not.toBeNull();
    expect(validateDeck(['miner', 'banker', 'usurer', 'guard'])).not.toBeNull();
    expect(validateDeck(NEW_CARDS_DECK)).toBeNull();
    expect(() => createGame(1, B, undefined, { you: ['miner', 'miner', 'banker', 'usurer', 'guard'] })).toThrow();
  });

  it('新カード入りのデッキは祝祭・徴税官を職人・検査官に入れ替えた 10 枚', () => {
    expect(NEW_CARDS_DECK).toHaveLength(10);
    expect(NEW_CARDS_DECK).toContain('craftsman');
    expect(NEW_CARDS_DECK).toContain('inspector');
    expect(NEW_CARDS_DECK).not.toContain('festival');
    expect(NEW_CARDS_DECK).not.toContain('taxman');
    expect(CARD_POOL).toEqual([...ALL_CARDS, ...NEW_CARDS]);
  });
});

describe('職人', () => {
  it('このターンのアップグレード費が下がり、払った実額が paid に積まれる', () => {
    let g = fixture(['craftsman', 'miner', 'banker', 'usurer'], 20);
    own(g, 0, 'you', 1, 7);
    const full = upgradePriceOf(g.market[0]!, B);
    g = reduce(g, { type: 'useCard', card: 'craftsman' }, B);
    expect(g.players.you.coins).toBe(20 - B.cards.craftsman.cost);
    expect(upgradeCostFor(g, 'you', g.market[0]!, B)).toBe(full - B.craftsmanDiscount);
    const before = g.players.you.coins;
    g = reduce(g, { type: 'upgrade', slotId: 0 }, B);
    expect(g.market[0]!.level).toBe(2);
    expect(g.players.you.coins).toBe(before - (full - B.craftsmanDiscount));
    expect(g.market[0]!.paid).toBe(7 + full - B.craftsmanDiscount);
  });

  it('Lv2→Lv3 にも効く。0 未満にはならない', () => {
    const g = fixture(['craftsman', 'miner', 'banker', 'usurer'], 20);
    own(g, 0, 'you', 2, 14);
    g.players.you.upgradeDiscount = 999;
    expect(upgradeCostFor(g, 'you', g.market[0]!, B)).toBe(0);
    g.players.you.upgradeDiscount = B.craftsmanDiscount;
    expect(upgradeCostFor(g, 'you', g.market[0]!, B)).toBe(B.upgrades3.tradingHouse.cost - B.craftsmanDiscount);
  });

  it('割引はそのターンだけ（手番の終わりで消える）。足りないコインでも割引で上げられる', () => {
    let g = fixture(['craftsman', 'miner', 'banker', 'usurer'], B.cards.craftsman.cost + B.upgrades.tradingHouse.cost - B.craftsmanDiscount);
    own(g, 0, 'you', 1, 7);
    g = reduce(g, { type: 'useCard', card: 'craftsman' }, B);
    expect(canUpgrade(g, 0, B)).toBe(true);
    g = reduce(g, { type: 'endTurn' }, B);
    expect(g.players.you.upgradeDiscount).toBe(0);
  });

  it('CPU の reach は自分の手番の中でだけ職人の割引を数える', () => {
    let g = fixture(['craftsman', 'miner', 'banker', 'usurer'], B.cards.craftsman.cost + B.upgrades.tradingHouse.cost - B.craftsmanDiscount);
    own(g, 0, 'you', 1, 7);
    // 空き地を減らして、建設の候補が reach に混ざらないようにする
    for (let i = 1; i < 10; i++) own(g, i, 'cpu', 3, 99);
    const reach0 = reachOf(g, 'you', B);
    g = reduce(g, { type: 'useCard', card: 'craftsman' }, B);
    expect(reachOf(g, 'you', B)).toBeGreaterThan(reach0);
    // 手番が相手に渡ったあと、残った割引を数えない（盲点①と同じ）
    const handed = structuredClone(g);
    handed.current = 'cpu';
    expect(reachOf(handed, 'you', B)).toBe(reach0);
  });
});

describe('検査官', () => {
  it('相手の Lv2 を Lv1 に戻す。払われた額はそのまま', () => {
    let g = fixture(['inspector', 'miner', 'banker', 'usurer'], 10);
    own(g, 7, 'cpu', 2, 36);
    const vp0 = scoreOf(g, 'cpu', B);
    g = reduce(g, { type: 'useCard', card: 'inspector', inspectSlot: 7 }, B);
    expect(g.market[7]!.level).toBe(1);
    expect(g.market[7]!.paid).toBe(36);
    expect(scoreOf(g, 'cpu', B)).toBeLessThan(vp0);
    expect(g.players.you.coins).toBe(10 - B.cards.inspector.cost);
  });

  it('Lv3 は Lv2 に戻り、また買収できるようになる', () => {
    let g = fixture(['inspector', 'miner', 'banker', 'usurer'], 99);
    own(g, 7, 'cpu', 3, 57);
    expect(slotMaxed(g.market[7]!, B)).toBe(true);
    expect(canAcquire(g, 7, B)).toBe(false);
    g = reduce(g, { type: 'useCard', card: 'inspector', inspectSlot: 7 }, B);
    expect(g.market[7]!.level).toBe(2);
    expect(slotMaxed(g.market[7]!, B)).toBe(false);
    expect(canAcquire(g, 7, B)).toBe(true);
  });

  it('Lv1 なら払われた額 −5（0 未満にはしない）', () => {
    let g = fixture(['inspector', 'miner', 'banker', 'usurer'], 10);
    own(g, 0, 'cpu', 1, 7);
    own(g, 1, 'cpu', 1, 2);
    g = reduce(g, { type: 'useCard', card: 'inspector', inspectSlot: 0 }, B);
    expect(g.market[0]!.level).toBe(1);
    expect(g.market[0]!.paid).toBe(7 - B.inspectorPaidCut);
    let h = fixture(['inspector', 'miner', 'banker', 'usurer'], 10);
    own(h, 1, 'cpu', 1, 2);
    h = reduce(h, { type: 'useCard', card: 'inspector', inspectSlot: 1 }, B);
    expect(h.market[1]!.paid).toBe(0);
  });

  it('衛兵で防がれる（コストは払う）。城壁では防げない', () => {
    let g = fixture(['inspector', 'miner', 'banker', 'usurer'], 10);
    own(g, 7, 'cpu', 2, 36);
    g.players.cpu.guarded = true;
    g = reduce(g, { type: 'useCard', card: 'inspector', inspectSlot: 7 }, B);
    expect(g.market[7]!.level).toBe(2);
    expect(g.players.you.coins).toBe(10 - B.cards.inspector.cost);

    let w = fixture(['inspector', 'miner', 'banker', 'usurer'], 10);
    own(w, 7, 'cpu', 2, 36);
    own(w, 3, 'cpu', 1, 10); // 城壁
    w = reduce(w, { type: 'useCard', card: 'inspector', inspectSlot: 7 }, B);
    expect(w.market[7]!.level).toBe(1);
  });

  it('対象は相手の物件だけ。相手の物件が無ければ使えない', () => {
    const g = fixture(['inspector', 'miner', 'banker', 'usurer'], 10);
    expect(canUseCard(g, 'inspector', B)).toBe(false);
    own(g, 0, 'you', 1, 7);
    own(g, 7, 'cpu', 1, 18);
    expect(canUseCard(g, 'inspector', B)).toBe(true);
    // 自分の物件・空き地は対象外（何も起きない）
    expect(reduce(g, { type: 'useCard', card: 'inspector', inspectSlot: 0 }, B)).toBe(g);
    expect(reduce(g, { type: 'useCard', card: 'inspector', inspectSlot: 5 }, B)).toBe(g);
    const targets = legalActions(g, B)
      .filter((a) => a.type === 'useCard' && a.card === 'inspector')
      .map((a) => (a.type === 'useCard' ? a.inspectSlot : -1));
    expect(targets).toEqual([7]);
  });

  it('相手の手札の検査官は、自分の Lv2 以上を晒されたものとして数える（衛兵の価値）', () => {
    const g = fixture(['miner', 'banker', 'usurer', 'guard'], 0);
    own(g, 7, 'you', 2, 36);
    for (let i = 0; i < 10; i++) if (i !== 7) own(g, i, 'you', 3, 99); // 買収の対象を消す
    g.players.cpu.coins = B.cards.inspector.cost;
    g.players.cpu.hand = ['inspector', 'miner', 'banker', 'usurer'];
    g.players.cpu.queue = NEW_CARDS_DECK.filter((c) => !g.players.cpu.hand.includes(c));
    const withInspector = exposedVpOf(g, 'you', B);
    g.players.cpu.hand = ['architect', 'miner', 'banker', 'usurer'];
    expect(withInspector).toBeGreaterThan(exposedVpOf(g, 'you', B));
  });
});

describe('検査官の操作（ドラッグ）', () => {
  it('相手の物件の上で離すと使う。自分の物件・空き地ははじく。盤面の空いたところは対象選び', () => {
    const g = fixture(['inspector', 'miner', 'banker', 'usurer'], 10);
    own(g, 0, 'you', 1, 7);
    own(g, 7, 'cpu', 2, 36);
    expect(resolveDrop(g, 'you', 'inspector', { onBoard: true, slotId: 7, handCard: null })).toEqual({
      kind: 'use',
      action: { type: 'useCard', card: 'inspector', inspectSlot: 7 },
    });
    expect(resolveDrop(g, 'you', 'inspector', { onBoard: true, slotId: 0, handCard: null }).kind).toBe('reject');
    expect(resolveDrop(g, 'you', 'inspector', { onBoard: true, slotId: 5, handCard: null }).kind).toBe('reject');
    expect(resolveDrop(g, 'you', 'inspector', { onBoard: true, slotId: null, handCard: null })).toEqual({
      kind: 'target',
      mode: 'inspect',
    });
    expect(inspectPick(g, 'you', 7).ok).toBe(true);
  });

  it('使った余韻に Lv の下がり方・アップグレード費の割引を出す', () => {
    const g = fixture(['inspector', 'craftsman', 'banker', 'usurer'], 10);
    own(g, 7, 'cpu', 2, 36);
    const after = reduce(g, { type: 'useCard', card: 'inspector', inspectSlot: 7 }, B);
    expect(cardAftermath(g, after, 'inspector', B)?.text).toBe('Lv2 → Lv1');
    const crafted = reduce(g, { type: 'useCard', card: 'craftsman' }, B);
    expect(cardAftermath(g, crafted, 'craftsman', B)?.text).toBe(`アップグレード費 −${B.craftsmanDiscount}`);
  });
});

describe('説明文', () => {
  it('新しいカードの説明は効く範囲と数値を書く', () => {
    expect(cardTextFor('craftsman', B)).toContain(`−${B.craftsmanDiscount}`);
    expect(cardTextFor('craftsman', B)).toContain('Lv2→3');
    expect(cardTextFor('inspector', B)).toContain('Lv3→2');
    expect(cardTextFor('inspector', B)).toContain('衛兵');
  });
});
