import { describe, expect, it } from 'vitest';

import { evaluateState, nextStartsOf, reachOf } from '@/ai/evaluate';
import { DEFAULT_BALANCE } from '@/game/balance';
import { reduce } from '@/game/reducer';
import { createGame } from '@/game/setup';
import type { GameState } from '@/game/types';

const B = DEFAULT_BALANCE;
const LAST_TURN = B.maxTurnsPerPlayer * 2;

/** 'you' の手番の局面。 */
function yourTurn(turn = 5): GameState {
  const g = createGame(3, B);
  g.current = 'you';
  g.turn = turn;
  return g;
}

describe('CPU の盲点: 手番を終えた後の建築家の割引', () => {
  it('自分の手番中は割引込みで reach を数える', () => {
    const g = yourTurn();
    const cheapest = Math.min(...g.market.map((s) => B.buildings[s.buildingId].cost));
    g.players.you.coins = cheapest - B.architectDiscount;
    g.players.you.buildDiscount = B.architectDiscount;
    expect(reachOf(g, 'you', B)).toBeGreaterThan(0);
  });

  it('手番を終えた後は、残っている割引を reach に数えない', () => {
    const g = yourTurn();
    const cheapest = Math.min(...g.market.map((s) => B.buildings[s.buildingId].cost));
    g.players.you.coins = cheapest - B.architectDiscount;
    g.players.you.buildDiscount = B.architectDiscount;
    const ended = reduce(g, { type: 'endTurn' }, B);
    // endTurn は buildDiscount を消さない（次の startTurn で消える）が、次に買うときには乗らない
    expect(ended.players.you.buildDiscount).toBe(B.architectDiscount);
    expect(reachOf(ended, 'you', B)).toBe(0);
  });
});

describe('CPU の盲点: 試合の終わり', () => {
  it('次の開始フェーズが来るかを手番の上限と全区画の埋まりで判定する', () => {
    expect(nextStartsOf(yourTurn(5), 'you', B)).toBe(1);
    expect(nextStartsOf(yourTurn(5), 'cpu', B)).toBe(1);
    // 自分の最後の手番（後手の 40 手目）: 自分にも相手にも次は来ない
    expect(nextStartsOf(yourTurn(LAST_TURN), 'you', B)).toBe(0);
    expect(nextStartsOf(yourTurn(LAST_TURN), 'cpu', B)).toBe(0);
    // 先手の最後の手番（39 手目）: 自分には来ないが、相手（40 手目）には来る
    expect(nextStartsOf(yourTurn(LAST_TURN - 1), 'you', B)).toBe(0);
    expect(nextStartsOf(yourTurn(LAST_TURN - 1), 'cpu', B)).toBe(1);
    // 全物件を自分が持つ（手番の終わりで勝ち）なら次は来ない。全区画が埋まっただけでは終わらない
    const mono = yourTurn(5);
    for (const s of mono.market) s.owner = 'you';
    expect(nextStartsOf(mono, 'you', B)).toBe(0);
    const split = yourTurn(5);
    split.market.forEach((s, i) => (s.owner = i % 2 === 0 ? 'you' : 'cpu'));
    expect(nextStartsOf(split, 'you', { ...B, winVp: 999 })).toBe(1);
    // 手番の人の VP が目標に届いていれば次は来ない
    expect(nextStartsOf(split, 'you', { ...B, winVp: 1 })).toBe(0);
  });

  it('最後の手番で使った投資・祝祭は評価に入らない', () => {
    const base = yourTurn(LAST_TURN - 1);
    const invested = structuredClone(base);
    invested.players.you.pendingIncome = ['miner', 'banker'];
    invested.players.you.festivalQueued = true;
    expect(evaluateState(invested, 'you', B)).toBe(evaluateState(base, 'you', B));

    // 次の手番がある局面では、同じ投資が評価を上げる
    const early = yourTurn(5);
    const earlyInvested = structuredClone(early);
    earlyInvested.players.you.pendingIncome = ['miner', 'banker'];
    expect(evaluateState(earlyInvested, 'you', B)).toBeGreaterThan(evaluateState(early, 'you', B));
  });

  it('最後の手番の高利貸の借りは評価を下げない（返す時が来ない）', () => {
    const base = yourTurn(LAST_TURN - 1);
    const indebted = structuredClone(base);
    indebted.players.you.pendingDebt = B.usurerDebt;
    expect(evaluateState(indebted, 'you', B)).toBe(evaluateState(base, 'you', B));

    const early = yourTurn(5);
    const earlyIndebted = structuredClone(early);
    earlyIndebted.players.you.pendingDebt = B.usurerDebt;
    expect(evaluateState(earlyIndebted, 'you', B)).toBeLessThan(evaluateState(early, 'you', B));
  });

  it('相手に次の手番が無ければ、徴税官の徴収は得にならない', () => {
    const base = yourTurn(LAST_TURN);
    const taxed = structuredClone(base);
    taxed.players.cpu.pendingTax = B.taxmanAmount;
    expect(evaluateState(taxed, 'you', B)).toBe(evaluateState(base, 'you', B));
  });
});
