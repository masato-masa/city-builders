/** シード付き乱数。mulberry32。
 *  同じシードからは必ず同じ列が出る。これが試合の再現性の土台になる。 */
export interface Rng {
  /** 0 以上 1 未満 */
  next(): number;
  /** 0 以上 maxExclusive 未満の整数 */
  int(maxExclusive: number): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (maxExclusive) => Math.floor(next() * maxExclusive) };
}

/** Fisher-Yates。元配列は書き換えない。 */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
}
