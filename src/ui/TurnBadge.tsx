import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { turnsRemaining } from '@/game/selectors';
import type { GameState } from '@/game/types';

import { turnClockHint } from './feel';
import { TurnClockIcon } from './icons';
import { playUiTap } from './sound';

/** 吹き出しを出しておく時間。もう一度タップしても閉じる。 */
const HINT_MS = 2800;

/** 残りターン数。盤面コンテナの右上に絶対配置で出す（要望 F）。
 *  以前は相手の情報ボードの右端にあったが、そこは所有者色の地に変わり
 *  （要望 A）窮屈だったので、盤面側に出して独立させた。
 *  時計だけでは初見で意味が分からないという指摘を受け、タップで短い説明を出す
 *  （吹き出しは絶対配置なので盤面は動かない）。
 *  Game.tsx・PvpGame.tsx の両方で同じ見た目にするための共通部品。 */
export function TurnBadge({
  state,
  balance = DEFAULT_BALANCE,
}: {
  state: GameState;
  balance?: Balance;
}) {
  const left = turnsRemaining(state, balance);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setOpen(false), HINT_MS);
    return () => window.clearTimeout(t);
  }, [open]);
  // 残り 3 ターンからは赤く脈打たせて、終わりが近いことを知らせる（クラロワの残り時間と同じ）。
  const urgent = state.phase === 'playing' && left <= 3;
  return (
    <>
      <button
        type="button"
        className={`board-turn-badge turn-clock${urgent ? ' is-urgent' : ''}`}
        aria-label={`残り ${left} ターン`}
        aria-expanded={open}
        onClick={() => {
          playUiTap();
          setOpen((v) => !v);
        }}
      >
        <TurnClockIcon />
        <span className="turn-clock-num">{left}</span>
      </button>
      <AnimatePresence>
        {open ? (
          <motion.span
            key="hint"
            className="turn-clock-tip"
            role="status"
            initial={{ opacity: 0, y: -4, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, pointerEvents: 'none', transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 32 }}
          >
            {turnClockHint(left)}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </>
  );
}
