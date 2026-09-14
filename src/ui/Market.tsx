import { BUILDING_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { buildCostFor } from '@/game/reducer';
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
        // 封鎖中は建てられないので、押せない理由が見えるように区別する
        const blocked = !owned && state.players.you.blockedSlot === slot.slotId;
        const cls = owned ? `slot owned-${slot.owner}` : blocked ? 'slot is-blocked' : 'slot';
        return (
          <button key={slot.slotId} className={cls} onClick={() => onPick(slot.slotId)}>
            <span className="slot-name">{BUILDING_NAMES[slot.buildingId]}</span>
            <span className="slot-cost">
              {owned ? '建設済' : buildCostFor(state, 'you', slot.slotId, balance)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
