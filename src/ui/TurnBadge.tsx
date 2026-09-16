import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { turnsRemaining } from '@/game/selectors';
import type { GameState } from '@/game/types';

import { TurnClockIcon } from './icons';

/** 残りターン数。盤面コンテナの右上に絶対配置で出す（要望 F）。
 *  以前は相手の情報ボードの右端にあったが、そこは所有者色の地に変わり
 *  （要望 A）窮屈だったので、盤面側に出して独立させた。
 *  Game.tsx・PvpGame.tsx の両方で同じ見た目にするための共通部品。 */
export function TurnBadge({
  state,
  balance = DEFAULT_BALANCE,
}: {
  state: GameState;
  balance?: Balance;
}) {
  return (
    <span className="board-turn-badge turn-clock" aria-label={`残り ${turnsRemaining(state, balance)} ターン`}>
      <TurnClockIcon />
      <span className="turn-clock-num">{turnsRemaining(state, balance)}</span>
    </span>
  );
}
