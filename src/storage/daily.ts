import { isDateKey } from '@/meta/daily';

/** 日替わりの一戦の記録。その日の分だけ持つ（日付が変われば空として扱う）。 */
export interface DailyRecord {
  /** 'YYYY-MM-DD'（端末のローカル日付） */
  date: string;
  /** その日の自己ベスト（VP 差）。まだ終えていなければ null。 */
  best: number | null;
  /** その日に終えた回数（制限はしない。見せるためだけ）。 */
  plays: number;
}

const KEY = 'city-builders:daily';

export function emptyDaily(date: string): DailyRecord {
  return { date, best: null, plays: 0 };
}

function int(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null;
}

/** 保存データを検証して、今日の記録として読む（純粋関数）。
 *  壊れたデータ・古い形式・別の日の記録は、今日の空の記録になる。 */
export function parseDaily(raw: string | null, today: string): DailyRecord {
  if (!raw) return emptyDaily(today);
  let p: unknown;
  try {
    p = JSON.parse(raw);
  } catch {
    return emptyDaily(today);
  }
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return emptyDaily(today);
  const o = p as Record<string, unknown>;
  if (!isDateKey(o.date) || o.date !== today) return emptyDaily(today);
  const plays = int(o.plays);
  const best = int(o.best);
  return { date: today, best, plays: plays !== null && plays > 0 ? plays : best !== null ? 1 : 0 };
}

/** 1 試合ぶんを足す（純粋関数）。improved は自己ベストを更新したか（初回も更新に数える）。 */
export function withDailyResult(
  rec: DailyRecord,
  today: string,
  score: number,
): { record: DailyRecord; improved: boolean; previousBest: number | null } {
  const cur = rec.date === today ? rec : emptyDaily(today);
  const improved = cur.best === null || score > cur.best;
  return {
    record: { date: today, best: improved ? score : cur.best, plays: cur.plays + 1 },
    improved,
    previousBest: cur.best,
  };
}

export function loadDaily(today: string): DailyRecord {
  try {
    return parseDaily(localStorage.getItem(KEY), today);
  } catch {
    return emptyDaily(today);
  }
}

export function saveDaily(rec: DailyRecord): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rec));
  } catch {
    // 保存できなくても遊べる
  }
}

export function clearDaily(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
}
