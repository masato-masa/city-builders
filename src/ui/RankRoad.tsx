import { motion } from 'motion/react';

import { ACHIEVEMENTS, achievementName } from '@/meta/achievements';
import { RANK_RULES, type RankChange, type RankState, STEPS, stepInfo } from '@/meta/rank';
import type { MetaProgress } from '@/storage/meta';

import { StarIcon } from './icons';
import { Sheet } from './Sheets';

/** 段の星。最上段（王都）は数だけ出す。
 *  gained = 今回増えた星の位置（ポンと出す）、lost = 今回減った星の位置（消えていく）。 */
export function RankStars({
  rank,
  gained = [],
  lost = null,
  delay = 0,
}: {
  rank: RankState;
  gained?: number[];
  lost?: number | null;
  delay?: number;
}) {
  const info = stepInfo(rank.step);
  if (info.isTop) {
    return (
      <span className="rank-stars is-top">
        <StarIcon className="rank-star is-on" />
        <span className="rank-stars-count">{rank.stars}</span>
      </span>
    );
  }
  return (
    <span className="rank-stars" aria-label={`星 ${rank.stars} / ${info.need}`}>
      {Array.from({ length: info.need }, (_, i) => {
        const on = i < rank.stars;
        const isNew = gained.includes(i);
        const isLost = lost === i;
        return (
          <span key={i} className="rank-star-slot">
            <StarIcon className="rank-star" />
            {on ? (
              <motion.span
                className="rank-star-fill"
                initial={isNew ? { scale: 0, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: delay + gained.indexOf(i) * 0.12, type: 'spring', stiffness: 600, damping: 14 }}
              >
                <StarIcon className="rank-star is-on" />
              </motion.span>
            ) : isLost ? (
              <motion.span
                className="rank-star-fill"
                initial={{ scale: 1, opacity: 1 }}
                animate={{ scale: 0.4, opacity: 0 }}
                transition={{ delay, duration: 0.45, ease: 'easeIn' }}
              >
                <StarIcon className="rank-star is-on" />
              </motion.span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

/** 結果画面の段位の 1 行と、新しく手に入った実績の 1 行。どちらも高さは固定。 */
export function RankResult({ change, unlocked, delay }: { change: RankChange; unlocked: string[]; delay: number }) {
  const { before, after, delta } = change;
  const sameStep = before.step === after.step;
  const gained =
    delta > 0
      ? sameStep
        ? Array.from({ length: after.stars - before.stars }, (_, k) => before.stars + k)
        : Array.from({ length: after.stars }, (_, k) => k)
      : [];
  const lost = delta < 0 && sameStep ? after.stars : null;
  const pill = change.promoted
    ? `+${delta}★ 昇段！`
    : delta > 0
      ? `+${delta}★${change.bonus ? `（連勝 ×${RANK_RULES.bonusMultiplier}）` : ''}`
      : change.floor
        ? '床で止まった'
        : delta < 0
          ? `${delta}★`.replace('-', '−')
          : '±0★';
  const tone = change.promoted ? 'is-up' : delta > 0 ? 'is-gain' : change.floor ? 'is-floor' : 'is-loss';
  return (
    <div className="result-rank">
      <motion.div
        className="result-rank-row"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, type: 'spring', stiffness: 420, damping: 30 }}
      >
        <motion.span
          key={after.step}
          className={`rank-badge${change.promoted ? ' is-up' : ''}`}
          initial={change.promoted ? { scale: 1.6, rotate: -8 } : false}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: delay + 0.35, type: 'spring', stiffness: 520, damping: 12 }}
        >
          {stepInfo(after.step).label}
        </motion.span>
        <RankStars rank={after} gained={gained} lost={lost} delay={delay + 0.2} />
        <motion.span
          className={`result-rank-delta ${tone}`}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: delay + 0.45, type: 'spring', stiffness: 520, damping: 18 }}
        >
          {pill}
        </motion.span>
      </motion.div>
      <div className="result-achv-slot">
        {unlocked.length ? (
          <motion.span
            className="result-achv"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: delay + 0.7, type: 'spring', stiffness: 420, damping: 26 }}
          >
            実績 {unlocked.map((id) => `「${achievementName(id)}」`).join('')}
          </motion.span>
        ) : null}
      </div>
    </div>
  );
}

/** ホームの戦績から開く、段位ロードと実績の一覧。 */
export function RankSheet({ meta, onClose }: { meta: MetaProgress; onClose: () => void }) {
  const current = stepInfo(meta.rank.step);
  const best = stepInfo(meta.bestStep);
  const have = new Set(meta.achievements);
  const w = RANK_RULES.winStars;
  return (
    <Sheet title="段位ロード" subtitle="CPU 戦で星を集めて、村を王都へ" onClose={onClose}>
      <div className="rank-sheet">
        <div className="rank-now">
          <span className="rank-badge">{current.label}</span>
          <RankStars rank={meta.rank} />
          {meta.bestStep > meta.rank.step ? <span className="rank-best">最高 {best.label}</span> : null}
        </div>

        <ol className="rank-road">
          {RANK_RULES.tiers.map((t, tier) => {
            const steps = STEPS.filter((s) => s.tier === tier);
            const state = tier < current.tier ? 'is-done' : tier === current.tier ? 'is-here' : '';
            return (
              <li key={t.name} className={`rank-road-tier ${state}`}>
                <span className="rank-road-name">{t.name}</span>
                <span className="rank-road-detail">
                  {steps.length > 1 ? `${steps.length} 位 × 星 ${t.stars}` : '最上段'}
                </span>
                <span className="rank-road-mark">
                  {tier < current.tier ? '済' : tier === current.tier ? 'いまここ' : ''}
                </span>
              </li>
            );
          })}
        </ol>

        <ul className="rank-rules">
          <li>
            勝つと星 +{w.easy}（やさしい）・+{w.normal}（ふつう）・+{w.hard}（つよい）。
            {RANK_RULES.bonusFromStreak} 連勝目からは {RANK_RULES.bonusMultiplier} 倍
          </li>
          <li>負けると星 −{RANK_RULES.lossStars}。届いた段の 1 位（床）からは落ちない</li>
          <li>2 人対戦では星も実績も動かない</li>
        </ul>

        <div className="rank-achv-title">
          実績 <span>{meta.achievements.length} / {ACHIEVEMENTS.length}</span>
        </div>
        <ul className="rank-achv-list">
          {ACHIEVEMENTS.map((a) => (
            <li key={a.id} className={have.has(a.id) ? 'is-got' : ''}>
              <StarIcon className="rank-achv-icon" />
              <span className="rank-achv-name">{a.name}</span>
              <span className="rank-achv-text">{a.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
