import { motion } from 'motion/react';

import { BUILDING_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { buildCostFor } from '@/game/reducer';
import { vpOfSlot } from '@/game/selectors';
import type { GameState } from '@/game/types';

import { BUILDING_ART } from './art';
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
            {/* 区画の外周の枠。所有者を示す 3 つの合図のうちの 1 つ（要望 1）。
                未建設でも同じ太さの透明な枠を置き、建っても矩形が動かないようにする。 */}
            <span className={`plot-ring${owned ? ` owner-${slot.owner}` : ''}`} />
            {owned && art ? (
              // 建った瞬間だけ、小さく飛び出してから収まる（scale のバネ）。
              // .plot-art は CSS で transform: translateX(-50%) を持つが、
              // motion がインライン transform を上書きするので、同じ中央寄せを
              // motion 側の x: '-50%' として渡し直す（scale と合成させる）。
              <motion.img
                className={`plot-art owner-${slot.owner}`}
                src={art.url}
                alt=""
                style={{ width: `${art.scale * 100}%`, x: '-50%' }}
                initial={{ scale: 0.35, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 360, damping: 15 }}
              />
            ) : (
              <span className={owned ? 'plot-noart' : 'plot-empty'}>
                {BUILDING_NAMES[slot.buildingId]}
              </span>
            )}
            <span className={`${owned ? 'plot-vp' : 'plot-cost'}${owned ? ` owner-${slot.owner}` : ''}`}>
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
