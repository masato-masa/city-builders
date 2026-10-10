import type { Difficulty } from '@/ai/choose';

/** 段位ロード（CPU 戦だけ）。数値はすべてここで決める。
 *
 *  - 段（村 → 町 → 市 → 都 → 王都）は 3 つの「位」に分かれ、位ごとに星を集める。
 *  - 勝つと星が増える。難易度が高いほど多い（RANK_RULES.winStars）。
 *  - 3 連勝目からは星が倍（連勝ボーナス）。
 *  - 負けると星が 1 つ減る。星 0 で負けると 1 つ前の位へ下がるが、
 *    段の最初の位（床）より下には落ちない。いちど届いた段から落ちることは無い。
 *  - 引き分けは動かない。 */
export const RANK_RULES = {
  tiers: [
    { name: '村', levels: 3, stars: 3 },
    { name: '町', levels: 3, stars: 4 },
    { name: '市', levels: 3, stars: 5 },
    { name: '都', levels: 3, stars: 6 },
    // 最上段は 1 位だけ。星は上限なく積み上がる（stars は表示の区切り）。
    { name: '王都', levels: 1, stars: 10 },
  ],
  winStars: { easy: 1, normal: 3, hard: 4 } as Record<Difficulty, number>,
  lossStars: 1,
  /** この連勝数（その試合を含む）から星が倍になる。 */
  bonusFromStreak: 3,
  bonusMultiplier: 2,
} as const;

/** 位の通し番号（0 = 村 1）と、その位で集めた星。 */
export interface RankState {
  step: number;
  stars: number;
}

export const INITIAL_RANK: RankState = { step: 0, stars: 0 };

export interface StepInfo {
  /** 何番目の段か（0 = 村）。 */
  tier: number;
  tierName: string;
  /** 段の中の位（1 始まり）。 */
  level: number;
  /** 表示名（「町 2」。最上段は「王都」）。 */
  label: string;
  /** 次の位に上がるのに要る星。最上段は表示の区切り。 */
  need: number;
  /** この位が段の最初（床）か。 */
  isFloor: boolean;
  isTop: boolean;
}

export const STEPS: readonly StepInfo[] = RANK_RULES.tiers.flatMap((t, tier) =>
  Array.from({ length: t.levels }, (_, i) => ({
    tier,
    tierName: t.name,
    level: i + 1,
    label: t.levels > 1 ? `${t.name} ${i + 1}` : t.name,
    need: t.stars,
    isFloor: i === 0,
    isTop: tier === RANK_RULES.tiers.length - 1 && i === t.levels - 1,
  })),
);

export const TOP_STEP = STEPS.length - 1;

export function stepInfo(step: number): StepInfo {
  return STEPS[Math.min(Math.max(0, step), TOP_STEP)]!;
}

/** 段の床（その段の最初の位）の通し番号。 */
export function floorOf(step: number): number {
  const tier = stepInfo(step).tier;
  return STEPS.findIndex((s) => s.tier === tier);
}

/** 試合 1 つで段位がどう動いたか。結果画面の演出に使う。 */
export interface RankChange {
  before: RankState;
  after: RankState;
  /** 実際に動いた星の数（勝ち +、負け −、床で止まったら 0）。 */
  delta: number;
  /** 連勝ボーナスが効いたか。 */
  bonus: boolean;
  /** 負けたが床で止まった。 */
  floor: boolean;
  /** 位が上がった／下がった。 */
  promoted: boolean;
  demoted: boolean;
  /** 段（村→町 など）が上がった。 */
  tierUp: boolean;
}

/** 勝ちで得る星（難易度 × 連勝ボーナス）。streakAfter はこの試合を含めた連勝数。 */
export function winStarsFor(difficulty: Difficulty, streakAfter: number): { stars: number; bonus: boolean } {
  const base = RANK_RULES.winStars[difficulty];
  const bonus = streakAfter >= RANK_RULES.bonusFromStreak;
  return { stars: bonus ? base * RANK_RULES.bonusMultiplier : base, bonus };
}

/** CPU 戦の結果を 1 つ反映する（純粋関数）。 */
export function applyMatch(
  rank: RankState,
  outcome: 'win' | 'lose' | 'draw',
  difficulty: Difficulty,
  streakAfter: number,
): RankChange {
  const before = { ...rank };
  const base = { before, delta: 0, bonus: false, floor: false, promoted: false, demoted: false, tierUp: false };
  if (outcome === 'draw') return { ...base, after: { ...rank } };

  if (outcome === 'win') {
    const { stars: gain, bonus } = winStarsFor(difficulty, streakAfter);
    let { step, stars } = rank;
    stars += gain;
    while (step < TOP_STEP && stars >= stepInfo(step).need) {
      stars -= stepInfo(step).need;
      step += 1;
    }
    return {
      ...base,
      after: { step, stars },
      delta: gain,
      bonus,
      promoted: step > rank.step,
      tierUp: stepInfo(step).tier > stepInfo(rank.step).tier,
    };
  }

  // 負け: 星を減らす。星が無ければ 1 つ前の位へ。ただし床より下には落ちない。
  let { step, stars } = rank;
  let lost = 0;
  for (let i = 0; i < RANK_RULES.lossStars; i++) {
    if (stars > 0) {
      stars -= 1;
      lost += 1;
    } else if (step > floorOf(step)) {
      step -= 1;
      stars = stepInfo(step).need - 1;
      lost += 1;
    } else {
      break;
    }
  }
  return {
    ...base,
    after: { step, stars },
    delta: lost === 0 ? 0 : -lost,
    floor: lost < RANK_RULES.lossStars,
    demoted: step < rank.step,
  };
}
