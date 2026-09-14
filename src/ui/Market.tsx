import { BUILDING_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import type { GameState } from '@/game/types';

export function Market({
  state,
  balance = DEFAULT_BALANCE,
  onPick,
}: {
  state: GameState;
  balance?: Balance;
  onPick: (slotId: number) => void;
}) {
  return (
    <div className="market">
      {state.market.map((slot) => {
        const owned = slot.owner !== null;
        const cls = owned ? `slot owned-${slot.owner}` : 'slot';
        return (
          <button key={slot.slotId} className={cls} onClick={() => onPick(slot.slotId)}>
            <span className="slot-name">{BUILDING_NAMES[slot.buildingId]}</span>
            <span className="slot-cost">
              {owned ? '建設済' : balance.buildings[slot.buildingId].cost}
            </span>
          </button>
        );
      })}
    </div>
  );
}
