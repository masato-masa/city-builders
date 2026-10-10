import { emptyOnboarding, type Onboarding, TIP_ORDER, type TipId } from '@/meta/onboarding';

const KEY = 'city-builders:onboarding';

/** 保存データを検証して読む（純粋関数）。壊れた・古い形式・知らない手引きの id は捨てる。 */
export function parseOnboarding(raw: string | null): Onboarding {
  if (!raw) return emptyOnboarding();
  let p: unknown;
  try {
    p = JSON.parse(raw);
  } catch {
    return emptyOnboarding();
  }
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return emptyOnboarding();
  const o = p as Record<string, unknown>;
  const known: readonly string[] = TIP_ORDER;
  const seen = Array.isArray(o.seen)
    ? [...new Set(o.seen.filter((x): x is TipId => typeof x === 'string' && known.includes(x)))]
    : [];
  return { seen, finished: o.finished === true, replay: o.replay === true };
}

export function loadOnboarding(): Onboarding {
  try {
    return parseOnboarding(localStorage.getItem(KEY));
  } catch {
    return emptyOnboarding();
  }
}

export function saveOnboarding(onb: Onboarding): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(onb));
  } catch {
    // 保存できなくても遊べる
  }
}

/** テスト用メニューの「手引きをもう一度」。戦績があっても次の CPU 戦で最初から出す。 */
export function replayOnboarding(): void {
  saveOnboarding({ ...emptyOnboarding(), replay: true });
}
