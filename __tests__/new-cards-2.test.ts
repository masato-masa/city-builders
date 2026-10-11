import { describe, expect, it } from 'vitest';

import { evaluateState, exposedVpOf } from '@/ai/evaluate';
import { CARD_POOL, cardTextFor, CORE_CARDS, DEFAULT_BALANCE } from '@/game/balance';
import { canUseCard, cardCostFor, legalActions, reduce } from '@/game/reducer';
import { bossDistrictsOf, clerkGainOf, doubleSourceOf, scoreOf } from '@/game/selectors';
import { createGame, drawDeck, validateDeck } from '@/game/setup';
import type { CardId, GameState, PlayerId } from '@/game/types';

const B = DEFAULT_BALANCE;

/** 新しい 4 枚が入ったデッキ（両者同じ）。 */
const DECK: CardId[] = ['usurer', 'herald', 'miner', 'architect', 'boss', 'informer', 'double', 'clerk', 'inspector', 'spy'];

/** you の手番。hand を手札に、残りを待機列に。 */
function fixture(hand: CardId[], coins: number): GameState {
  const g = createGame(1, B, 'you', { you: DECK, cpu: DECK });
  g.players.you.hand = [...hand];
  g.players.you.queue = DECK.filter((c) => !hand.includes(c));
  g.players.you.coins = coins;
  return g;
}

function own(g: GameState, slotId: number, owner: PlayerId, level = 1, paid = 7): void {
  const s = g.market[slotId]!;
  s.owner = owner;
  s.level = level;
  s.paid = paid;
  s.touchedTurn = 0;
}

describe('顔役', () => {
  it('件数が同数の地区の称号を今すぐ自分へ。+VP が入る', () => {
    let g = fixture(['boss', 'miner', 'usurer', 'herald'], 5);
    own(g, 0, 'cpu');
    own(g, 1, 'you');
    g.titles = ['cpu', null, null];
    expect(bossDistrictsOf(g, 'you', B)).toEqual([0]);
    const vp0 = scoreOf(g, 'you', B);
    g = reduce(g, { type: 'useCard', card: 'boss', district: 0 }, B);
    expect(g.titles[0]).toBe('you');
    expect(scoreOf(g, 'you', B)).toBe(vp0 + B.districtTitleVp);
    expect(g.players.you.coins).toBe(5 - B.cards.boss.cost);
  });

  it('同数のあいだは保ち、相手が 1 件増やすと戻る', () => {
    let g = fixture(['boss', 'miner', 'usurer', 'herald'], 5);
    own(g, 0, 'cpu');
    own(g, 1, 'you');
    g.titles = ['cpu', null, null];
    g = reduce(g, { type: 'useCard', card: 'boss', district: 0 }, B);
    g = reduce(g, { type: 'endTurn' }, B);
    g = reduce(g, { type: 'startTurn' }, B);
    expect(g.titles[0]).toBe('you');
    g.players.cpu.coins = 99;
    g = reduce(g, { type: 'build', slotId: 2 }, B);
    expect(g.titles[0]).toBe('cpu');
  });

  it('同数でない・0 件・もう自分の称号の地区には使えない', () => {
    const g = fixture(['boss', 'miner', 'usurer', 'herald'], 5);
    expect(canUseCard(g, 'boss', B)).toBe(false); // 0 対 0
    own(g, 0, 'cpu');
    expect(canUseCard(g, 'boss', B)).toBe(false); // 0 対 1
    own(g, 1, 'you');
    g.titles = ['you', null, null];
    expect(canUseCard(g, 'boss', B)).toBe(false); // 同数だが自分の称号
    g.titles = ['cpu', null, null];
    expect(canUseCard(g, 'boss', B)).toBe(true);
    expect(reduce(g, { type: 'useCard', card: 'boss', district: 1 }, B)).toBe(g);
    expect(reduce(g, { type: 'useCard', card: 'boss' }, B)).toBe(g);
    const targets = legalActions(g, B).filter((a) => a.type === 'useCard' && a.card === 'boss');
    expect(targets).toEqual([{ type: 'useCard', card: 'boss', district: 0 }]);
  });

  it('衛兵で防がれる（コストは払う）', () => {
    let g = fixture(['boss', 'miner', 'usurer', 'herald'], 5);
    own(g, 0, 'cpu');
    own(g, 1, 'you');
    g.titles = ['cpu', null, null];
    g.players.cpu.guarded = true;
    g = reduce(g, { type: 'useCard', card: 'boss', district: 0 }, B);
    expect(g.titles[0]).toBe('cpu');
    expect(g.players.you.coins).toBe(5 - B.cards.boss.cost);
  });

  it('相手の手札の顔役は、自分の同数の称号を晒されたものとして数える', () => {
    const g = fixture(['miner', 'usurer', 'herald', 'architect'], 0);
    // 商人街を 1 対 1（称号は自分）。ほかは全部自分の最終段階（買収の対象を消す）
    for (let i = 3; i < 10; i++) own(g, i, 'you', 3, 99);
    own(g, 0, 'cpu', 3, 99);
    own(g, 1, 'you', 3, 99);
    g.titles = ['you', 'you', 'you'];
    g.players.cpu.coins = B.cards.boss.cost;
    g.players.cpu.hand = ['boss', 'miner', 'usurer', 'herald'];
    const withBoss = exposedVpOf(g, 'you', B);
    g.players.cpu.hand = ['spy', 'miner', 'usurer', 'herald'];
    expect(withBoss - exposedVpOf(g, 'you', B)).toBe(B.districtTitleVp);
  });
});

describe('密告者', () => {
  it('相手の「次」の札を相手の待機列の底へ。手札は動かない', () => {
    let g = fixture(['informer', 'miner', 'usurer', 'herald'], 3);
    const hand0 = [...g.players.cpu.hand];
    const q0 = [...g.players.cpu.queue];
    g = reduce(g, { type: 'useCard', card: 'informer' }, B);
    expect(g.players.cpu.hand).toEqual(hand0);
    expect(g.players.cpu.queue).toEqual([...q0.slice(1), q0[0]]);
    expect(g.players.you.coins).toBe(3 - B.cards.informer.cost);
  });

  it('衛兵で防がれる', () => {
    let g = fixture(['informer', 'miner', 'usurer', 'herald'], 3);
    g.players.cpu.guarded = true;
    const q0 = [...g.players.cpu.queue];
    g = reduce(g, { type: 'useCard', card: 'informer' }, B);
    expect(g.players.cpu.queue).toEqual(q0);
  });

  it('密告者がある試合では、相手の次の札が脅威なほど評価が下がる（無い試合では数えない）', () => {
    const g = fixture(['informer', 'miner', 'usurer', 'herald'], 3);
    g.players.cpu.queue = ['spy', 'herald', ...g.players.cpu.queue.filter((c) => c !== 'spy' && c !== 'herald')];
    const threat = evaluateState(g, 'you', B);
    const swapped = structuredClone(g);
    swapped.players.cpu.queue = ['herald', 'spy', ...g.players.cpu.queue.slice(2)];
    expect(evaluateState(swapped, 'you', B)).toBeGreaterThan(threat);
    // 自分のデッキに密告者が無ければ、相手の待機列の並びは評価に効かない
    const none = structuredClone(g);
    none.players.you.hand = ['clerk', 'miner', 'usurer', 'herald'];
    none.players.you.queue = none.players.you.queue.filter((c) => c !== 'clerk');
    const none2 = structuredClone(none);
    none2.players.cpu.queue = swapped.players.cpu.queue;
    expect(evaluateState(none2, 'you', B)).toBe(evaluateState(none, 'you', B));
  });
});

describe('影武者', () => {
  it('ターンの最初には使えない（写す札が無い）', () => {
    const g = fixture(['double', 'architect', 'usurer', 'herald'], 20);
    expect(doubleSourceOf(g, 'you')).toBeNull();
    expect(canUseCard(g, 'double', B)).toBe(false);
  });

  it('建築家のあと: 割引がもう一度乗る。コストは影武者 + 建築家の元のコスト', () => {
    let g = fixture(['double', 'architect', 'usurer', 'herald'], 20);
    g = reduce(g, { type: 'useCard', card: 'architect' }, B);
    expect(doubleSourceOf(g, 'you')).toBe('architect');
    const cost = cardCostFor(g, 'you', 'double', B);
    expect(cost).toBe(B.cards.double.cost + B.cards.architect.cost);
    const coins = g.players.you.coins;
    g = reduce(g, { type: 'useCard', card: 'double' }, B);
    expect(g.players.you.buildDiscount).toBe(B.architectDiscount * 2);
    expect(g.players.you.coins).toBe(coins - cost);
    expect(g.players.you.usedThisTurn).toEqual(['architect', 'double']);
  });

  it('高利貸のあと: コインも借りも 2 回分', () => {
    let g = fixture(['double', 'usurer', 'miner', 'herald'], 1);
    g = reduce(g, { type: 'useCard', card: 'usurer' }, B);
    g = reduce(g, { type: 'useCard', card: 'double' }, B);
    expect(g.players.you.coins).toBe(1 + B.usurerGain * 2 - B.cards.double.cost);
    expect(g.players.you.pendingDebt).toBe(B.usurerDebt * 2);
  });

  it('採掘師のあと: 次の収入が 2 枚分', () => {
    let g = fixture(['double', 'miner', 'usurer', 'herald'], 10);
    g = reduce(g, { type: 'useCard', card: 'miner' }, B);
    g = reduce(g, { type: 'useCard', card: 'double' }, B);
    expect(g.players.you.pendingIncome).toEqual(['miner', 'miner']);
  });

  it('対象の要る札は対象を取り直す（検査官 → 別の物件／同じ物件）', () => {
    let g = fixture(['double', 'inspector', 'usurer', 'herald'], 20);
    own(g, 7, 'cpu', 3, 57);
    own(g, 8, 'cpu', 2, 36);
    g = reduce(g, { type: 'useCard', card: 'inspector', inspectSlot: 7 }, B);
    const targets = legalActions(g, B)
      .filter((a) => a.type === 'useCard' && a.card === 'double')
      .map((a) => (a.type === 'useCard' ? a.inspectSlot : -1));
    expect(targets).toEqual([7, 8]);
    // 対象が無いと何も起きない
    expect(reduce(g, { type: 'useCard', card: 'double' }, B)).toBe(g);
    const twice = reduce(g, { type: 'useCard', card: 'double', inspectSlot: 7 }, B);
    expect(twice.market[7]!.level).toBe(1);
  });

  it('顔役のあと: 別の同数の地区が無ければ使えない', () => {
    let g = fixture(['double', 'boss', 'usurer', 'herald'], 20);
    own(g, 0, 'cpu');
    own(g, 1, 'you');
    g.titles = ['cpu', null, null];
    g = reduce(g, { type: 'useCard', card: 'boss', district: 0 }, B);
    expect(canUseCard(g, 'double', B)).toBe(false);
  });

  it('伝令・祝祭・衛兵は写せない。影武者のあとにもう一度は無い', () => {
    for (const c of B.doubleExcluded) expect(['herald', 'double', 'festival', 'guard']).toContain(c);
    let g = fixture(['double', 'herald', 'usurer', 'miner'], 20);
    g = reduce(g, { type: 'useCard', card: 'herald', heraldTarget: 'usurer' }, B);
    expect(canUseCard(g, 'double', B)).toBe(false);
  });

  it('払えなければ使えない（写す札の元のコストを含めて）', () => {
    let g = fixture(['double', 'miner', 'usurer', 'herald'], B.cards.miner.cost);
    g = reduce(g, { type: 'useCard', card: 'miner' }, B);
    expect(g.players.you.coins).toBe(0);
    expect(canUseCard(g, 'double', B)).toBe(false);
  });
});

describe('番頭', () => {
  it('商館 1 件につき +2。止められた商館は数えない。商館が無ければ 0', () => {
    let g = fixture(['clerk', 'miner', 'usurer', 'herald'], 1);
    expect(clerkGainOf(g, 'you', B)).toBe(0);
    own(g, 0, 'you');
    own(g, 1, 'you');
    expect(clerkGainOf(g, 'you', B)).toBe(2 * B.clerkPerHouse);
    // 封鎖で効果が止まった商館は数えない（商人街を封鎖されると 2 件とも止まる）
    g.blockades = [{ district: 0, target: 'you', untilTurn: g.turn + 1, beforeIncome: true }];
    expect(clerkGainOf(g, 'you', B)).toBe(0);
    g.blockades = [];
    g = reduce(g, { type: 'useCard', card: 'clerk' }, B);
    expect(g.players.you.coins).toBe(1 - B.cards.clerk.cost + 2 * B.clerkPerHouse);
  });

  it('上限の件数で止まる', () => {
    const g = fixture(['clerk', 'miner', 'usurer', 'herald'], 1);
    own(g, 0, 'you');
    own(g, 1, 'you');
    expect(clerkGainOf(g, 'you', { ...B, clerkMaxHouses: 1 })).toBe(B.clerkPerHouse);
  });
});

describe('抽選デッキ', () => {
  it('同じ seed から同じ 10 枚。コア 4 枚は必ず入り、デッキとして使える', () => {
    for (let seed = 0; seed < 300; seed++) {
      const d = drawDeck(seed);
      expect(d).toEqual(drawDeck(seed));
      expect(d).toHaveLength(10);
      for (const c of CORE_CARDS) expect(d).toContain(c);
      expect(validateDeck(d, B)).toBeNull();
    }
  });

  it('コスト 0 の高利貸は必ず入る（手詰まりを潰す札）', () => {
    for (let seed = 0; seed < 300; seed++) expect(drawDeck(seed)).toContain('usurer');
  });

  it('1000 通りの seed で 200 通り以上のデッキが出て、コア以外の 12 種がどれも 40〜60% で入る', () => {
    const seen = new Set<string>();
    const count = new Map<CardId, number>();
    for (let seed = 0; seed < 1000; seed++) {
      const d = drawDeck(seed);
      seen.add(d.join(','));
      for (const c of d) count.set(c, (count.get(c) ?? 0) + 1);
    }
    expect(seen.size).toBeGreaterThanOrEqual(200);
    for (const c of CARD_POOL) {
      if (CORE_CARDS.includes(c)) continue;
      expect(count.get(c) ?? 0).toBeGreaterThan(400);
      expect(count.get(c) ?? 0).toBeLessThan(600);
    }
  });
});

describe('説明文（2 段目）', () => {
  it('効く範囲と数値を書く', () => {
    expect(cardTextFor('boss', B)).toContain('同じ');
    expect(cardTextFor('boss', B)).toContain('衛兵');
    expect(cardTextFor('informer', B)).toContain('「次」');
    expect(cardTextFor('double', B)).toContain('元のコスト');
    expect(cardTextFor('clerk', B)).toContain(`+${B.clerkPerHouse}`);
    expect(cardTextFor('guard', B)).toContain('顔役');
  });
});
