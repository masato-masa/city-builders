import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { legalActions } from '@/game/reducer';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

const ORDER: CardId[] = [
  'herald',
  'blockader',
  'miner',
  'merchant',
  'banker',
  'architect',
  'spy',
  'taxman',
];

function fixture(coins: number): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.players.you.deck = [...ORDER];
  g.players.you.coins = coins;
  return g;
}

describe('合法手', () => {
  it('常に endTurn を含む', () => {
    const g = fixture(0);
    expect(legalActions(g, DEFAULT_BALANCE).some((a) => a.type === 'endTurn')).toBe(true);
  });

  it('コインが 0 なら endTurn しか無い', () => {
    const g = fixture(0);
    expect(legalActions(g, DEFAULT_BALANCE)).toEqual([{ type: 'endTurn' }]);
  });

  it('伝令は送る対象ごとに別の行動になる', () => {
    const g = fixture(5);
    const heralds = legalActions(g, DEFAULT_BALANCE).filter(
      (a) => a.type === 'useCard' && a.card === 'herald',
    );
    // 手札は herald / blockader / miner / merchant なので、送れるのは 3 枚
    expect(heralds).toHaveLength(3);
  });

  it('封鎖者は未建設スロットごとに別の行動になる', () => {
    const g = fixture(5);
    const blocks = legalActions(g, DEFAULT_BALANCE).filter(
      (a) => a.type === 'useCard' && a.card === 'blockader',
    );
    expect(blocks).toHaveLength(10);
  });

  it('建てられる物件が行動に出る', () => {
    const g = fixture(100);
    const builds = legalActions(g, DEFAULT_BALANCE).filter((a) => a.type === 'build');
    expect(builds).toHaveLength(10);
  });

  it('終了後は合法手が無い', () => {
    const g = fixture(100);
    g.phase = 'finished';
    expect(legalActions(g, DEFAULT_BALANCE)).toEqual([]);
  });
});
