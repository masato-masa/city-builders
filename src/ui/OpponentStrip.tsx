import { ownedSlots } from '@/game/selectors';
import type { GameState } from '@/game/types';

export function OpponentStrip({ state }: { state: GameState }) {
  return (
    <div className="opponent">
      <span className="opponent-badge">CPU</span>
      <span className="opponent-coins">コイン {state.players.cpu.coins}</span>
      <span className="opponent-owned">
        {ownedSlots(state, 'cpu').map((s) => (
          <i key={s.slotId} className="owned-dot" />
        ))}
      </span>
    </div>
  );
}
