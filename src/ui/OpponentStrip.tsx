import { motion } from 'motion/react';
import type { ReactNode } from 'react';

import { CARD_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { cardLevelOf, scoreOf } from '@/game/selectors';
import type { CardId, GameState } from '@/game/types';

import { forecast } from './CoinBar';
import { incomeLine } from './income-text';
import { InfoBoard } from './InfoBoard';

/** 相手（CPU）の情報ボード。画面の最上段（要望 3）。自分の帯と同じ骨格
 *  （要望 4）の 2 段目に次ターン収入、1 段目右端に CPU の行動ログを出す
 *  （自分側と見え方を揃える）。残りターンは盤面右上の TurnBadge へ移した
 *  （要望 F）。最新の 1 手だけ大きく、それより前は小さく残す（要望 7）。
 *  使ったカード・建てた物件の絵は盤面の上端に CpuCallout で大きく出す（Fx.tsx）。 */
export function OpponentStrip({
  state,
  balance = DEFAULT_BALANCE,
  log,
  active = false,
  overlay,
}: {
  state: GameState;
  balance?: Balance;
  /** この手番で CPU が行った行動。古い順。 */
  log: string[];
  /** CPU の手番中か。ボードの縁を光らせる。 */
  active?: boolean;
  /** ボードの上に重ねるもの（CPU の 1 手の絵と帯）。 */
  overlay?: ReactNode;
}) {
  const latest = log.length > 0 ? log[log.length - 1] : null;
  const rest = log.length > 1 ? log.slice(0, -1) : [];
  const income = forecast(state, 'cpu', balance);
  // 相手の育った札（Lv2 以上）。名前の頭 1 文字と星だけ（文字は最小限）
  const grown = [...state.players.cpu.hand, ...state.players.cpu.queue]
    .filter((c): c is CardId => c !== null)
    .map((card) => ({ card, level: cardLevelOf(state, 'cpu', card, balance) }))
    .filter((x) => x.level >= 2)
    .sort((a, b) => b.level - a.level);
  return (
    <div className="opponent-wrap">
      <InfoBoard
        owner="cpu"
        coins={state.players.cpu.coins}
        vp={scoreOf(state, 'cpu', balance)}
        active={active}
        right={
          <div className="cpu-log cpu-log-right" aria-live="polite">
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
        sub={
          <>
            <span className="coinbar-forecast">{incomeLine(income)}</span>
            {grown.length > 0 ? (
              <span className="cpu-lv" aria-label="相手の育った札">
                {grown.map((g) => (
                  <span key={g.card} className={`cpu-lv-chip lv${g.level}`} title={`${CARD_NAMES[g.card]} Lv${g.level}`}>
                    {CARD_NAMES[g.card].slice(0, 1)}
                    {'★'.repeat(g.level - 1)}
                  </span>
                ))}
              </span>
            ) : null}
          </>
        }
      />
      {overlay}
    </div>
  );
}
