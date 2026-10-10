import type { MetaProgress } from '@/storage/meta';

import { type AchievementContext, newAchievements } from './achievements';
import { applyMatch, type RankChange } from './rank';

export interface MatchSettlement {
  meta: MetaProgress;
  rank: RankChange;
  /** この試合で新しく手に入った実績の id。 */
  unlocked: string[];
}

/** CPU 戦 1 試合ぶんを、段位と実績に反映する（純粋関数。保存は呼び出し側）。 */
export function settleMatch(meta: MetaProgress, c: AchievementContext): MatchSettlement {
  const rank = applyMatch(meta.rank, c.outcome, c.difficulty, c.streak);
  const unlocked = newAchievements(c, meta.achievements);
  return {
    meta: {
      rank: rank.after,
      bestStep: Math.max(meta.bestStep, rank.after.step),
      achievements: [...meta.achievements, ...unlocked],
    },
    rank,
    unlocked,
  };
}
