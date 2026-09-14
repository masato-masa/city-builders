import type { Difficulty } from '@/ai/choose';

export interface Progress {
  wins: number;
  losses: number;
  lastDifficulty: Difficulty;
}

const KEY = 'city-builders:progress';
const EMPTY: Progress = { wins: 0, losses: 0, lastDifficulty: 'normal' };

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<Progress>) };
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

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
}
