import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { reduce } from '@/game/reducer';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

import {
  CARD_CHARGE_MS,
  CARD_CHARGE_SCALE,
  cardAftermath,
  cardSequence,
  FINALE_STILL_MS,
  IMPACT,
  impactOf,
  roadReason,
  shakeKeyframes,
  TARGET_LABEL,
  turnClockHint,
} from '@/ui/feel';
import { incomeLine } from '@/ui/income-text';
import { TEMPO } from '@/ui/tempo';

const B = DEFAULT_BALANCE;

/** 自分の手番で、手札を指定した盤面（コインは十分に持たせる）。 */
function fixture(hand: CardId[], coins = 30): GameState {
  const g = createGame(1, B, 'you');
  g.current = 'you';
  g.players.you.hand = hand.slice(0, 4);
  g.players.you.queue = (['miner', 'banker', 'architect', 'herald', 'festival', 'guard', 'usurer', 'spy', 'taxman', 'blockader'] as CardId[]).filter(
    (c) => !hand.includes(c),
  );
  g.players.you.coins = coins;
  return g;
}

describe('衝撃の強さ（impactOf）', () => {
  it('徴税官が通ったら軽', () => {
    const g = fixture(['taxman']);
    const next = reduce(g, { type: 'useCard', card: 'taxman' }, B);
    expect(impactOf(g, next)).toEqual({ level: 'light', actor: 'you', slotId: null });
  });

  it('封鎖者で空き地だけの地区を封鎖したら軽、相手の物件を止めたら重（区画は地区の最初の区画）', () => {
    const g = fixture(['blockader']);
    const empty = reduce(g, { type: 'useCard', card: 'blockader', district: 0 }, B);
    expect(impactOf(g, empty)?.level).toBe('light');
    expect(impactOf(g, empty)?.slotId).toBe(B.districts[0]!.slots[0]);

    const owned = structuredClone(g);
    owned.market[1]!.owner = 'cpu';
    const hit = reduce(owned, { type: 'useCard', card: 'blockader', district: 0 }, B);
    expect(impactOf(owned, hit)).toEqual({ level: 'heavy', actor: 'you', slotId: B.districts[0]!.slots[0] });
  });

  it('衛兵で防がれたら出さない', () => {
    const g = fixture(['taxman']);
    g.players.cpu.guarded = true;
    const next = reduce(g, { type: 'useCard', card: 'taxman' }, B);
    expect(impactOf(g, next)).toBeNull();
  });

  it('物件の買収は重', () => {
    const g = fixture(['miner']);
    const before = structuredClone(g);
    before.market[0]!.owner = 'cpu';
    const after = structuredClone(before);
    after.market[0]!.owner = 'you';
    expect(impactOf(before, after)).toEqual({ level: 'heavy', actor: 'you', slotId: 0 });
  });

  it('建設・ふつうのカード・手番の切り替わりでは出さない', () => {
    const g = fixture(['miner']);
    expect(impactOf(g, reduce(g, { type: 'useCard', card: 'miner' }, B))).toBeNull();
    expect(impactOf(g, reduce(g, { type: 'build', slotId: 0 }, B))).toBeNull();
    expect(impactOf(g, reduce(g, { type: 'endTurn' }, B))).toBeNull();
  });
});

describe('衝撃の数値は基準（standards.md §1）の範囲', () => {
  it('ヒットストップ 軽 50ms / 重 80〜100ms', () => {
    expect(IMPACT.light.hitstopMs).toBe(50);
    expect(IMPACT.heavy.hitstopMs).toBeGreaterThanOrEqual(80);
    expect(IMPACT.heavy.hitstopMs).toBeLessThanOrEqual(100);
  });

  it('揺れ 軽 2〜3px / 重 8〜10px、長さ 50〜100ms', () => {
    expect(IMPACT.light.shakePx).toBeGreaterThanOrEqual(2);
    expect(IMPACT.light.shakePx).toBeLessThanOrEqual(3);
    expect(IMPACT.heavy.shakePx).toBeGreaterThanOrEqual(8);
    expect(IMPACT.heavy.shakePx).toBeLessThanOrEqual(10);
    for (const s of Object.values(IMPACT)) {
      expect(s.shakeMs).toBeGreaterThanOrEqual(50);
      expect(s.shakeMs).toBeLessThanOrEqual(100);
    }
  });

  it('揺れは振幅を超えず、0 に戻る', () => {
    const k = shakeKeyframes(8);
    expect(k[0]).toBe('translate(0px, 0px)');
    expect(k.at(-1)).toBe('translate(0px, 0px)');
    for (const t of k) {
      const [x, y] = [...t.matchAll(/-?[\d.]+/g)].map((m) => Math.abs(Number(m[0])));
      expect(x).toBeLessThanOrEqual(8);
      expect(y).toBeLessThanOrEqual(8);
    }
  });

  it('決着の静止は 150ms 前後', () => {
    expect(FINALE_STILL_MS).toBeGreaterThanOrEqual(120);
    expect(FINALE_STILL_MS).toBeLessThanOrEqual(180);
  });
});

describe('カード使用の 3 段（cardSequence）', () => {
  it('溜めはボタンの縮みの基準（80〜120ms、0.9 前後）', () => {
    expect(CARD_CHARGE_MS).toBeGreaterThanOrEqual(80);
    expect(CARD_CHARGE_MS).toBeLessThanOrEqual(120);
    expect(CARD_CHARGE_SCALE).toBeGreaterThanOrEqual(0.88);
    expect(CARD_CHARGE_SCALE).toBeLessThanOrEqual(0.93);
  });

  it('合計は上限以内（伝令でも）、余韻はふつうの札で満額（どちらの速さでも）', () => {
    for (const t of Object.values(TEMPO)) {
      const plain = cardSequence(false, t);
      const herald = cardSequence(true, t);
      expect(plain.totalMs).toBeLessThanOrEqual(t.cardSequenceMaxMs);
      expect(herald.totalMs).toBeLessThanOrEqual(t.cardSequenceMaxMs);
      expect(plain.aftermathMs).toBe(t.cardAftermathMs);
      expect(herald.aftermathMs).toBeGreaterThan(0);
      expect(plain.chargeMs + plain.launchMs).toBe(plain.effectAt);
    }
  });
});

describe('余韻の一言（cardAftermath）', () => {
  const run = (card: CardId, setup?: (g: GameState) => void) => {
    const g = fixture([card]);
    setup?.(g);
    return cardAftermath(g, reduce(g, { type: 'useCard', card }, B), card, B);
  };

  it('投資は次の収入の増分', () => {
    expect(run('miner')).toEqual({ text: `次の収入 +${B.minerIncome}`, tone: 'gain' });
  });

  it('高利貸は今入るコイン', () => {
    expect(run('usurer')).toEqual({ text: `コイン +${B.usurerGain}`, tone: 'gain' });
  });

  it('徴税官は相手の収入、防がれたらそう言う', () => {
    expect(run('taxman')).toEqual({ text: `相手の収入 −${B.taxmanAmount}`, tone: 'hit' });
    expect(run('taxman', (g) => (g.players.cpu.guarded = true))).toEqual({ text: '防がれた', tone: 'blocked' });
  });

  it('建築家・買収者は割引、衛兵は守り', () => {
    expect(run('architect')?.text).toBe(`建設費 −${B.architectDiscount}`);
    expect(run('spy')?.text).toBe(`買収価格 −${B.spyAcquireDiscount}`);
    expect(run('guard')).toEqual({ text: '守りを固めた', tone: 'guard' });
  });
});

describe('画面の文言', () => {
  it('見込み収入は「次の収入」で言う', () => {
    expect(incomeLine(3)).toBe('次の収入 +3');
    expect(incomeLine(-2)).toBe('次の収入 -2');
    expect(incomeLine(0)).toBe('次の収入 +0');
  });

  it('時計の説明に残りターンが入る', () => {
    expect(turnClockHint(7)).toContain('あと 7 ターン');
  });

  it('街道が押せない理由', () => {
    expect(roadReason(false, 1, true)).toBe('街道を建てると使えます');
    expect(roadReason(true, 0, true)).toBe('このターンはもう使えません');
    expect(roadReason(true, 1, false)).toBe('自分のターンに使えます');
    expect(roadReason(true, 1, true)).toBeNull();
  });

  it('対象選択の案内は短い（右上の時計と重ならない幅）、封鎖を「このターンだけ」と言わない', () => {
    for (const label of Object.values(TARGET_LABEL)) expect(label.length).toBeLessThanOrEqual(16);
    expect(TARGET_LABEL.blockade).not.toContain('このターンだけ');
  });
});
