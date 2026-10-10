import { describe, expect, it } from 'vitest';

import { CARD_NAMES, DEFAULT_BALANCE } from '@/game/balance';
import { reduce } from '@/game/reducer';
import { createGame, drawDeck } from '@/game/setup';
import type { CardId, GameState, PlayerId } from '@/game/types';
import { cardArtOf, hasCardArt } from '@/ui/art';
import { testDeckCards } from '@/ui/balance-store';
import { doubleNoteOf, dragGuide, resolveDrop, slotPick, slotTargetModeOf, useHintOf, type DropHit } from '@/ui/card-input';
import { describeAction } from '@/ui/cpu-turn';
import { cardAftermath, TARGET_LABEL } from '@/ui/feel';
import { createMatchLog, decisiveMoment, recordTransition } from '@/ui/match-log';

const B = DEFAULT_BALANCE;
const DECK: CardId[] = ['usurer', 'herald', 'miner', 'architect', 'boss', 'informer', 'double', 'clerk', 'inspector', 'blockader'];
const hit = (h: Partial<DropHit>): DropHit => ({ onBoard: false, slotId: null, handCard: null, ...h });

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

/** 商人街（0,1,2）を 1 対 1、称号は相手 */
function tied(): GameState {
  const g = fixture(['boss', 'double', 'usurer', 'herald'], 10);
  own(g, 0, 'cpu');
  own(g, 1, 'you');
  g.titles = ['cpu', null, null];
  return g;
}

describe('顔役のドラッグ', () => {
  it('同数の地区の区画の上で離すとその地区。ほかの地区ははじく。盤面の空いたところは対象選び', () => {
    const g = tied();
    expect(resolveDrop(g, 'you', 'boss', hit({ onBoard: true, slotId: 2 }))).toEqual({
      kind: 'use',
      action: { type: 'useCard', card: 'boss', district: 0 },
    });
    expect(resolveDrop(g, 'you', 'boss', hit({ onBoard: true, slotId: 7 })).kind).toBe('reject');
    expect(resolveDrop(g, 'you', 'boss', hit({ onBoard: true }))).toEqual({ kind: 'target', mode: 'district' });
    expect(resolveDrop(g, 'you', 'boss', hit({}))).toEqual({ kind: 'cancel' });
    expect(dragGuide('boss').length).toBeLessThanOrEqual(22);
    expect(TARGET_LABEL.district.length).toBeLessThanOrEqual(16);
    expect(useHintOf(g, 'you', 'boss')).toContain('地区');
  });
});

describe('影武者のドラッグ', () => {
  it('写す札が無ければ盤面で使う（canUseCard ではじかれる）。案内は「先に別の札」', () => {
    const g = tied();
    expect(slotTargetModeOf(g, 'you', 'double')).toBeNull();
    expect(resolveDrop(g, 'you', 'double', hit({ onBoard: true })).kind).toBe('use');
    expect(dragGuide('double', g, 'you')).toContain('先に');
    expect(doubleNoteOf(g, 'you', 'double', B)).toContain('ありません');
  });

  it('封鎖者を写すと区画を取り直す（action.card は影武者）', () => {
    let g = fixture(['blockader', 'double', 'usurer', 'herald'], 20);
    g = reduce(g, { type: 'useCard', card: 'blockader', blockadeSlot: 5 }, B);
    expect(slotTargetModeOf(g, 'you', 'double')).toBe('blockade');
    expect(resolveDrop(g, 'you', 'double', hit({ onBoard: true, slotId: 6 }))).toEqual({
      kind: 'use',
      action: { type: 'useCard', card: 'double', blockadeSlot: 6 },
    });
    expect(resolveDrop(g, 'you', 'double', hit({ onBoard: true }))).toEqual({ kind: 'target', mode: 'blockade' });
    const pick = slotPick(g, 'you', 'double', 'blockade', 7, B);
    expect(pick.ok && pick.action).toEqual({ type: 'useCard', card: 'double', blockadeSlot: 7 });
    expect(dragGuide('double', g, 'you')).toBe(`影武者（${CARD_NAMES.blockader}）: 区画の上で離す`);
    expect(dragGuide('double', g, 'you').length).toBeLessThanOrEqual(22);
    expect(doubleNoteOf(g, 'you', 'double', B)).toContain(CARD_NAMES.blockader);
  });

  it('使った余韻は写した札の効果で言う。CPU の実況は「影武者で◯◯をもう一度」', () => {
    let g = fixture(['architect', 'double', 'usurer', 'herald'], 20);
    g = reduce(g, { type: 'useCard', card: 'architect' }, B);
    const after = reduce(g, { type: 'useCard', card: 'double' }, B);
    expect(cardAftermath(g, after, 'double', B)?.text).toBe(`建設費 −${B.architectDiscount}`);
    expect(describeAction(g, { type: 'useCard', card: 'double' })).toBe(`影武者で${CARD_NAMES.architect}をもう一度`);
  });
});

describe('余韻（顔役・密告者・番頭）', () => {
  it('顔役は奪った地区、防がれたらそう言う', () => {
    const g = tied();
    const after = reduce(g, { type: 'useCard', card: 'boss', district: 0 }, B);
    expect(cardAftermath(g, after, 'boss', B)?.text).toBe(`${B.districts[0]!.name}の称号を奪った`);
    g.players.cpu.guarded = true;
    const blocked = reduce(g, { type: 'useCard', card: 'boss', district: 0 }, B);
    expect(cardAftermath(g, blocked, 'boss', B)?.tone).toBe('blocked');
  });

  it('密告者は送った札の名前', () => {
    const g = fixture(['informer', 'miner', 'usurer', 'herald'], 5);
    const sent = g.players.cpu.queue[0]!;
    const after = reduce(g, { type: 'useCard', card: 'informer' }, B);
    expect(cardAftermath(g, after, 'informer', B)?.text).toBe(`${CARD_NAMES[sent]}を山の底へ`);
  });

  it('番頭は入ったコイン。商館が無ければ「商館が無い」', () => {
    const g = fixture(['clerk', 'miner', 'usurer', 'herald'], 5);
    const none = reduce(g, { type: 'useCard', card: 'clerk' }, B);
    expect(cardAftermath(g, none, 'clerk', B)?.text).toBe('商館が無い');
    own(g, 0, 'you');
    const one = reduce(g, { type: 'useCard', card: 'clerk' }, B);
    expect(cardAftermath(g, one, 'clerk', B)?.text).toBe(`コイン +${B.clerkPerHouse}`);
  });
});

describe('試合の記録: Lv が下がった出来事', () => {
  it('検査官で Lv が下がったら、下げた側の出来事として残す。建設などの出来事には数えない', () => {
    const g = fixture(['inspector', 'miner', 'usurer', 'herald'], 10);
    own(g, 7, 'cpu', 2, 36);
    const after = reduce(g, { type: 'useCard', card: 'inspector', inspectSlot: 7 }, B);
    const log = recordTransition(createMatchLog(g, B), g, after, B);
    const down = log.events.find((e) => e.kind === 'downgrade');
    expect(down).toMatchObject({ kind: 'downgrade', actor: 'you', slotId: 7, from: 2, to: 1 });
    expect(down && down.kind === 'downgrade' && down.swing).toBeGreaterThan(0);
    // 建設・アップグレード・買収が無ければ「勝敗を分けた出来事」は無い
    expect(decisiveMoment(log, 'you', { you: 'あなた', cpu: 'CPU' })).toBeNull();
  });
});

describe('テスト用の抽選デッキ・仮のカード面', () => {
  it('抽選デッキは試合の seed で決まる。既定は undefined', () => {
    expect(testDeckCards(42, 'draw')).toEqual(drawDeck(42));
    expect(testDeckCards(42, 'default')).toBeUndefined();
  });

  it('新しい 4 枚にも仮の面がある（文字の SVG）', () => {
    for (const c of ['boss', 'informer', 'double', 'clerk'] as const) {
      expect(hasCardArt(c)).toBe(false);
      expect(cardArtOf(c)).toMatch(/^data:image\/svg\+xml/);
    }
  });
});
