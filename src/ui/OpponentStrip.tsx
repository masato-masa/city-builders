import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { ownedSlots, scoreOf } from '@/game/selectors';
import type { GameState } from '@/game/types';

export function OpponentStrip({ state, balance = DEFAULT_BALANCE }: { state: GameState; balance?: Balance }) {
  return (
    <div className="opponent">
      <span className="opponent-badge">CPU</span>
      <span className="opponent-coins">{state.players.cpu.coins}</span>
      <span className="opponent-stats">
        物件 {ownedSlots(state, 'cpu').length} ・ {scoreOf(state, 'cpu', balance)} VP
      </span>
    </div>
  );
}
