import { useEffect, useRef } from 'react';

import type { Balance } from '@/game/balance';
import type { GameState } from '@/game/types';

import { createMatchLog, type MatchLog, recordTransition } from './match-log';

/** 画面に反映された状態の差分を、試合の記録に積む。
 *  記録は再描画を起こさない（ref）。結果画面を出す時点で ref.current.log を読む。 */
export function useMatchLog(state: GameState, balance: Balance) {
  const ref = useRef<{ prev: GameState; log: MatchLog } | null>(null);
  if (ref.current === null) ref.current = { prev: state, log: createMatchLog(state, balance) };
  useEffect(() => {
    const r = ref.current!;
    r.log = recordTransition(r.log, r.prev, state, balance);
    r.prev = state;
  }, [state]);
  return () => ref.current!.log;
}
