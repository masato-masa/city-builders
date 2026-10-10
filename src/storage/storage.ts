import type { Difficulty } from '@/ai/choose';

export interface Progress {
  wins: number;
  losses: number;
  lastDifficulty: Difficulty;
  /** CPU 戦の連勝数。負けで 0、引き分けでは変わらない。 */
  streak: number;
  /** これまでの最高連勝数。 */
  bestStreak: number;
}

const KEY = 'city-builders:progress';
const EMPTY: Progress = { wins: 0, losses: 0, lastDifficulty: 'normal', streak: 0, bestStreak: 0 };
const DIFFICULTIES: readonly string[] = ['easy', 'normal', 'hard'];

/** 0 以上の整数でなければ 0（壊れた・古い保存データでも落ちない）。 */
function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw) as unknown;
    if (typeof p !== 'object' || p === null) return EMPTY;
    const o = p as Record<string, unknown>;
    const lastDifficulty =
      typeof o.lastDifficulty === 'string' && DIFFICULTIES.includes(o.lastDifficulty)
        ? (o.lastDifficulty as Difficulty)
        : EMPTY.lastDifficulty;
    const streak = count(o.streak);
    return {
      wins: count(o.wins),
      losses: count(o.losses),
      lastDifficulty,
      streak,
      bestStreak: Math.max(streak, count(o.bestStreak)),
    };
  } catch {
    return EMPTY;
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // 保存できなくても遊べる
  }
}

/** CPU 戦の結果を 1 件足した進行を返す（純粋関数。保存は呼び出し側）。 */
export function withResult(
  progress: Progress,
  result: 'win' | 'lose' | 'draw',
  difficulty: Difficulty,
): Progress {
  const streak = result === 'win' ? progress.streak + 1 : result === 'lose' ? 0 : progress.streak;
  return {
    wins: progress.wins + (result === 'win' ? 1 : 0),
    losses: progress.losses + (result === 'lose' ? 1 : 0),
    lastDifficulty: difficulty,
    streak,
    bestStreak: Math.max(progress.bestStreak, streak),
  };
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
}
