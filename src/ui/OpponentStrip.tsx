import { AnimatePresence, motion } from 'motion/react';

import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { scoreOf } from '@/game/selectors';
import type { CardId, GameState } from '@/game/types';

import { CARD_ART } from './art';
import { forecast } from './CoinBar';
import { InfoBoard } from './InfoBoard';

/** 相手（CPU）の情報ボード。画面の最上段（要望 3）。自分の帯と同じ骨格
 *  （要望 4）の 2 段目に CPU の行動ログを出す。残りターンは盤面右上の
 *  TurnBadge へ移した（要望 F）。最新の 1 手だけ大きく、それより前は
 *  小さく残す（要望 7）。 */
export function OpponentStrip({
  state,
  balance = DEFAULT_BALANCE,
  log,
  flashCard,
}: {
  state: GameState;
  balance?: Balance;
  /** この手番で CPU が行った行動。古い順。 */
  log: string[];
  /** CPU がいまカードを使った、その一瞬だけ立つ。絵を大きく出す（要望 7）。 */
  flashCard: CardId | null;
}) {
  const latest = log.length > 0 ? log[log.length - 1] : null;
  const rest = log.length > 1 ? log.slice(0, -1) : [];
  const income = forecast(state, 'cpu', balance);
  return (
    <div className="opponent-wrap">
      <InfoBoard
        owner="cpu"
        coins={state.players.cpu.coins}
        vp={scoreOf(state, 'cpu', balance)}
        right={<span className="opp-forecast">次ターン収入 {income >= 0 ? `+${income}` : income}</span>}
        sub={
          <div className="cpu-log" aria-live="polite">
            {rest.length > 0 ? (
              <span className="cpu-log-line cpu-log-line-old">{rest[rest.length - 1]}</span>
            ) : null}
            {latest ? (
              <motion.span
                key={log.length}
                className="cpu-log-line cpu-log-line-latest"
                initial={{ opacity: 0, y: 6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              >
                {latest}
              </motion.span>
            ) : null}
          </div>
        }
      />
      {/* カードを使った瞬間、その絵をボードのすぐ下で一瞬大きく出す（要望 7）。
          読み取れる速さが優先で、文字のログだけに頼らない。 */}
      <AnimatePresence>
        {flashCard && CARD_ART[flashCard] ? (
          <motion.div
            key={flashCard}
            className="cpu-card-flash"
            initial={{ opacity: 0, scale: 0.5, y: -8 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.12, 1, 0.9], y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.85, times: [0, 0.18, 0.72, 1] }}
          >
            <img className="cpu-card-flash-art" src={CARD_ART[flashCard]} alt="" />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
