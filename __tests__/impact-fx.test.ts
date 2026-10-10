import { createElement, useRef } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { reduce } from '@/game/reducer';
import { createGame } from '@/game/setup';
import type { GameState } from '@/game/types';

vi.mock('@/ui/sound', () => ({ playBell: vi.fn(), playUiTap: vi.fn() }));
vi.mock('@/ui/haptics', () => ({ hapticFinale: vi.fn(), hapticImpact: vi.fn() }));

import { FINALE_STILL_MS, IMPACT } from '@/ui/feel';
import { hapticFinale, hapticImpact } from '@/ui/haptics';
import { useBoardFeel } from '@/ui/impact-fx';
import { playBell } from '@/ui/sound';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const B = DEFAULT_BALANCE;

/** フックの戻り値を外から覗くための最小の部品。 */
let seen: { board: GameState; still: boolean; flash: string | null }[] = [];
function Probe({ state }: { state: GameState }) {
  const ref = useRef<HTMLDivElement>(null);
  const feel = useBoardFeel(state, ref, (actor) => actor === 'you');
  seen.push({ board: feel.boardState, still: feel.still, flash: feel.flash?.level ?? null });
  return createElement('div', { ref }, createElement('div', { className: 'board' }));
}

let root: Root;
let host: HTMLDivElement;
const render = (state: GameState) => act(() => root.render(createElement(Probe, { state })));

beforeEach(() => {
  vi.useFakeTimers();
  // requestAnimationFrame もタイマーで進める
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  seen = [];
  vi.mocked(playBell).mockClear();
  vi.mocked(hapticFinale).mockClear();
  vi.mocked(hapticImpact).mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function fixture(): GameState {
  const g = createGame(1, B, 'you');
  g.current = 'you';
  g.players.you.hand = ['taxman', 'miner', 'banker', 'guard'];
  g.players.you.coins = 30;
  return g;
}

describe('盤面の手触り（useBoardFeel）', () => {
  it('衝撃では盤面だけ 1 手前を見せ、ヒットストップが明けたら新しい状態に切り替わる', () => {
    const g = fixture();
    render(g);
    const next = reduce(g, { type: 'useCard', card: 'taxman' }, B);
    render(next);
    // 最初の描画（layout effect の直後）から 1 手前を見せている
    expect(seen.at(-1)!.board).toBe(g);
    expect(seen.at(-1)!.flash).toBe('light');
    expect(hapticImpact).toHaveBeenCalledWith(IMPACT.light.haptic);
    act(() => vi.advanceTimersByTime(16 + IMPACT.light.hitstopMs - 1));
    expect(seen.at(-1)!.board).toBe(g);
    act(() => vi.advanceTimersByTime(2));
    expect(seen.at(-1)!.board).toBe(next);
  });

  it('CPU の衝撃では震わせない', () => {
    const g = fixture();
    g.current = 'cpu';
    g.players.cpu.hand = ['taxman', 'miner', 'banker', 'guard'];
    g.players.cpu.coins = 30;
    render(g);
    render(reduce(g, { type: 'useCard', card: 'taxman' }, B));
    expect(seen.at(-1)!.flash).toBe('light');
    expect(hapticImpact).not.toHaveBeenCalled();
  });

  it('決着: 一瞬の静止 → 鐘（静止の間は鐘を鳴らさない）', () => {
    const g = fixture();
    render(g);
    const done: GameState = { ...structuredClone(g), phase: 'finished' };
    render(done);
    expect(seen.at(-1)!.still).toBe(true);
    expect(seen.at(-1)!.board).toBe(g);
    act(() => vi.advanceTimersByTime(16 + FINALE_STILL_MS - 1));
    expect(playBell).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(2));
    expect(playBell).toHaveBeenCalledTimes(1);
    expect(hapticFinale).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)!.still).toBe(false);
    expect(seen.at(-1)!.board).toBe(done);
  });

  it('ふつうの手では止めない', () => {
    const g = fixture();
    render(g);
    const next = reduce(g, { type: 'useCard', card: 'miner' }, B);
    render(next);
    expect(seen.at(-1)!.board).toBe(next);
    expect(seen.at(-1)!.flash).toBeNull();
  });
});
