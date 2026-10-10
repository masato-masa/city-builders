import { ACHIEVEMENT_IDS } from '@/meta/achievements';
import { INITIAL_RANK, type RankState, stepInfo, TOP_STEP } from '@/meta/rank';

/** 段位と実績の保存データ（CPU 戦だけで動く）。 */
export interface MetaProgress {
  rank: RankState;
  /** これまでに届いた一番上の位。 */
  bestStep: number;
  /** 手に入れた実績の id（手に入れた順）。 */
  achievements: string[];
}

const KEY = 'city-builders:meta';

export function emptyMeta(): MetaProgress {
  return { rank: { ...INITIAL_RANK }, bestStep: 0, achievements: [] };
}

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

/** 保存データを検証して読む（純粋関数。壊れた・古い形式は 0 に戻す）。 */
export function parseMeta(raw: string | null): MetaProgress {
  if (!raw) return emptyMeta();
  let p: unknown;
  try {
    p = JSON.parse(raw);
  } catch {
    return emptyMeta();
  }
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return emptyMeta();
  const o = p as Record<string, unknown>;
  const r = typeof o.rank === 'object' && o.rank !== null ? (o.rank as Record<string, unknown>) : {};
  const step = Math.min(count(r.step), TOP_STEP);
  const info = stepInfo(step);
  // 最上段以外は「次に上がるのに要る星 − 1」まで。それより多いのは壊れたデータ。
  const stars = info.isTop ? count(r.stars) : Math.min(count(r.stars), info.need - 1);
  const known = new Set(ACHIEVEMENT_IDS);
  const achievements = Array.isArray(o.achievements)
    ? [...new Set(o.achievements.filter((x): x is string => typeof x === 'string' && known.has(x)))]
    : [];
  return {
    rank: { step, stars },
    bestStep: Math.max(step, Math.min(count(o.bestStep), TOP_STEP)),
    achievements,
  };
}

export function loadMeta(): MetaProgress {
  try {
    return parseMeta(localStorage.getItem(KEY));
  } catch {
    return emptyMeta();
  }
}

export function saveMeta(m: MetaProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    // 保存できなくても遊べる
  }
}

export function clearMeta(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
}
