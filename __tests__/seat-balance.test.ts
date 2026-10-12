import { describe, expect, it } from 'vitest';

import { exposedVpOf, evaluateState, nextStartsOf } from '@/ai/evaluate';
import { DEFAULT_BALANCE } from '@/game/balance';
import { canAcquire, canBuild, canUpgrade, reduce } from '@/game/reducer';
import { acquireBlockOf, endsAfterTurn } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { GameState } from '@/game/types';
import { acquireButton } from '@/ui/slot-actions';

// 席の有利の対策（2026-10-12）: 試合の最後の手番（ターンの上限の手番）は買収できない

const LAST = DEFAULT_BALANCE.maxTurnsPerPlayer * 2;

function board(turn: number): GameState {
  const g = createGame(1, DEFAULT_BALANCE, 'you');
  g.turn = turn;
  g.current = turn % 2 === 1 ? 'you' : 'cpu';
  g.players.you.coins = 60;
  g.players.cpu.coins = 60;
  g.market[0]!.owner = 'you';
  g.market[0]!.paid = 8;
  g.market[1]!.owner = 'cpu';
  g.market[1]!.paid = 8;
  g.market[3]!.owner = 'cpu';
  g.market[3]!.paid = 11;
  return g;
}

describe('試合の最後の手番は買収できない', () => {
  it('上限の 1 つ前（先手の最後の手番）は買える。最後の手番（後手）は買えない', () => {
    const before = board(LAST - 1);
    expect(canAcquire(before, 1, DEFAULT_BALANCE)).toBe(true);
    const last = board(LAST);
    last.current = 'you';
    expect(canAcquire(last, 1, DEFAULT_BALANCE)).toBe(false);
    expect(acquireBlockOf(last, 1, 'you', DEFAULT_BALANCE)).toBe('lastTurn');
    // 建設・アップグレードはできる
    expect(canBuild(last, 2, DEFAULT_BALANCE)).toBe(true);
    expect(canUpgrade(last, 0, DEFAULT_BALANCE)).toBe(true);
    // 規則を切れば買える
    expect(canAcquire(last, 1, { ...DEFAULT_BALANCE, lastTurnNoAcquire: false })).toBe(true);
  });

  it('買収のボタンに理由が出る', () => {
    const last = board(LAST);
    last.current = 'you';
    const b = acquireButton(last, 1, 'you', DEFAULT_BALANCE)!;
    expect(b.enabled).toBe(false);
    expect(b.reason).toContain('最後の手番');
  });

  it('CPU は、相手の次の手番が最後の手番なら自分の物件が買収されると見ない', () => {
    const g = board(LAST - 1);
    g.current = 'cpu';
    // cpu の手番（上限の 1 つ前）。相手（you）の次の手番が最後の手番なので、cpu の物件は晒されない
    expect(exposedVpOf(g, 'cpu', DEFAULT_BALANCE)).toBe(0);
    expect(exposedVpOf(g, 'cpu', { ...DEFAULT_BALANCE, lastTurnNoAcquire: false })).toBeGreaterThan(0);
  });
});

describe('相手の最後の手番が残っている局面の評価', () => {
  it('手番を渡した直後の局面は、相手の最後の手番を打たせてから勝ち負けで測る', () => {
    // 先手（you）が最後の手番を終えた直後。後手（cpu）は商館を建てれば逆転できる
    const g = board(LAST);
    g.current = 'cpu';
    g.market[3]!.owner = null;
    g.market[3]!.paid = 0;
    g.players.cpu.coins = 30;
    expect(endsAfterTurn(g, DEFAULT_BALANCE)).toBe(true);
    // 先手にはもう開始フェーズが来ない
    expect(nextStartsOf(g, 'you', DEFAULT_BALANCE)).toBe(0);
    // you 2VP・cpu 2VP。cpu は最後の手番で建てて勝つ → you から見て負け
    expect(evaluateState(g, 'you', DEFAULT_BALANCE)).toBeLessThan(-50_000);
    // 実際に打っても同じ結論（cpu が建てて終える）
    const after = reduce(reduce(reduce(g, { type: 'startTurn' }), { type: 'build', slotId: 3 }), { type: 'endTurn' });
    expect(after.phase).toBe('finished');
  });
});
