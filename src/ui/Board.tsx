import { BUILDING_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { buildCostFor } from '@/game/reducer';
import { vpOfSlot } from '@/game/selectors';
import type { GameState } from '@/game/types';

import { BUILDING_ART, FIELD_URL } from './art';
import { PLOTS, PLOT_WIDTH } from './board-layout';

export function Board({
  state,
  balance = DEFAULT_BALANCE,
  onPick,
}: {
  state: GameState;
  balance?: Balance;
  onPick: (slotId: number) => void;
}) {
  return (
    <div className="board">
      <img className="board-field" src={FIELD_URL} alt="" />
      {state.market.map((slot, i) => {
        const plot = PLOTS[i];
        if (!plot) return null;
        const owned = slot.owner !== null;
        // 封鎖中は建てられないので、押せない理由が見えるように沈める
        const blocked = !owned && state.players.you.blockedSlot === slot.slotId;
        const art = BUILDING_ART[slot.buildingId];
        // 建った区画は plot-art の alt="" で物件名が読み上げに出ないので、
        // ボタン自体に物件名と VP を含む aria-label を付ける。空き地は
        // plot-cost の文字がそのまま読まれるので付けない。
        const ariaLabel = owned
          ? `${BUILDING_NAMES[slot.buildingId]} ${vpOfSlot(state, slot, balance)} VP`
          : undefined;
        return (
          <button
            key={slot.slotId}
            className={`plot${blocked ? ' is-blocked' : ''}`}
            style={{
              left: `${plot.x * 100}%`,
              top: `${plot.y * 100}%`,
              width: `${PLOT_WIDTH * 100}%`,
            }}
            aria-label={ariaLabel}
            onClick={() => onPick(slot.slotId)}
          >
            {owned ? <span className={`plot-base owner-${slot.owner}`} /> : null}
            {owned && art ? (
              <img
                className="plot-art"
                src={art.url}
                alt=""
                style={{ width: `${art.scale * 100}%` }}
              />
            ) : (
              <span className={owned ? 'plot-noart' : 'plot-empty'}>
                {BUILDING_NAMES[slot.buildingId]}
              </span>
            )}
            <span className={owned ? 'plot-vp' : 'plot-cost'}>
              {owned
                ? `${vpOfSlot(state, slot, balance)} VP`
                : buildCostFor(state, 'you', slot.slotId, balance)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
