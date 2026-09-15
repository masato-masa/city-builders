import { motion } from 'motion/react';

import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { scoreOf } from '@/game/selectors';
import type { GameState } from '@/game/types';

import { RollingNumber } from './RollingNumber';

/** 相手（CPU）の帯。色の印・名前・所持コイン・VP を出す（残り区画数は出さない）。
 *  下にはこの手番で CPU が何をしたかのログを 1 行ずつ出す。ログの領域は
 *  中身が無くても同じ高さを取り、CPU の手番でなくても盤面の縦位置が動かない。 */
export function OpponentStrip({
  state,
  balance = DEFAULT_BALANCE,
  log,
}: {
  state: GameState;
  balance?: Balance;
  /** この手番で CPU が行った行動。古い順。 */
  log: string[];
}) {
  return (
    <div className="opponent">
      <div className="opponent-row">
        <span className="owner-mark owner-mark-cpu" aria-hidden="true" />
        <span className="opponent-name">CPU</span>
        <RollingNumber className="opponent-coins" value={state.players.cpu.coins} />
        <span className="opponent-vp">{scoreOf(state, 'cpu', balance)} VP</span>
      </div>
      <div className="cpu-log" aria-live="polite">
        {log.map((line, i) => (
          <motion.span
            key={i}
            className="cpu-log-line"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          >
            {line}
          </motion.span>
        ))}
      </div>
    </div>
  );
}
