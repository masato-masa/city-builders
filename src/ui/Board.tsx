import { motion } from 'motion/react';

import { BUILDING_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { vpOfSlot } from '@/game/selectors';
import type { GameState } from '@/game/types';

import { BUILDING_ART } from './art';
import { PLOTS, PLOT_WIDTH } from './board-layout';

/** 大聖堂だけ VP が「自分の他の物件 1 件につき +N」で決まるため、未所有だと
 *  vpOfSlot が 0 を返す。未建設のときだけ、その決まり方が分かる表示に変える
 *  （要望 5。ここだけ建設前後で文字の内容が変わる、唯一の例外）。 */
function vpTextFor(state: GameState, slotId: number, balance: Balance): string {
  const slot = state.market[slotId]!;
  if (slot.owner === null) {
    // vpOfSlot は未所有だと必ず 0 を返す（大聖堂に限らず）ので、未建設のときは
    // balance 側の基準値を出す。大聖堂だけ基準値が 0（自分の他の物件 1 件に
    // つき +N で決まるため）なので、決まり方が分かる形に変える。
    if (slot.buildingId === 'cathedral') return `+${balance.cathedralVpPerBuilding}/件`;
    return `${balance.buildings[slot.buildingId].vp} VP`;
  }
  return `${vpOfSlot(state, slot, balance)} VP`;
}

export function Board({
  state,
  balance = DEFAULT_BALANCE,
  highlightSlot,
  onPick,
}: {
  state: GameState;
  balance?: Balance;
  /** CPU がいま建てた区画。一瞬だけ光らせる（要望 7）。 */
  highlightSlot?: number | null;
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
        // ボタン自体に物件名と VP を含む aria-label を付ける。
        const ariaLabel = `${BUILDING_NAMES[slot.buildingId]} ${vpTextFor(state, slot.slotId, balance)}`;
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
            {/* 名前。常に出す。色だけ所有者で変える（要望 5）。 */}
            <span className={`plot-name${owned ? ` owner-${slot.owner}` : ''}`}>
              {BUILDING_NAMES[slot.buildingId]}
            </span>
            {/* 建物の絵。未建設でも最初から置き、状態が変わっても矩形は動かさない。
                沈める／光らせるは filter と drop-shadow の色だけで表す（要望 5）。 */}
            {art ? (
              <motion.img
                className={`plot-art${owned ? ` owner-${slot.owner}` : ' is-unbuilt'}`}
                src={art.url}
                alt=""
                style={{ width: `${art.scale * 100}%`, x: '-50%' }}
                animate={{ scale: owned ? 1 : 0.92 }}
                transition={{ type: 'spring', stiffness: 360, damping: 15 }}
              />
            ) : null}
            {/* CPU がいま建てた区画だけ、一瞬光らせる（要望 7）。絵そのものは染めない。 */}
            {highlightSlot === slot.slotId ? (
              <motion.span
                key={`flash-${state.turn}`}
                className="plot-flash"
                initial={{ opacity: 0.9 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
            ) : null}
            {/* コストと VP。常に両方出す（要望 5）。 */}
            <span className="plot-badges">
              <span className="plot-cost">{balance.buildings[slot.buildingId].cost}</span>
              <span className={`plot-vp${owned ? ` owner-${slot.owner}` : ''}`}>
                {vpTextFor(state, slot.slotId, balance)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
