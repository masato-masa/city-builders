import type { Profile } from './evaluate';

/** ゲーム内の CPU（やさしい・ふつう・つよい）が共通で使う重み。
 *
 *  出どころ: `npm run search`（scripts/weight-search.ts）を 2026-10-11 のルール変更（封鎖の作り替え・建物の収益・鉱山・
 *  称号を VP で・銀行家を VP 分に）の後に 2 回（200 試合/評価 → 続きから 300 試合/評価）回し、出発点「大器晩成」が
 *  収束した重み（scripts/searched-profiles.json の "大器晩成"）を写した。4 つのうち lab 150 の総合勝率が最も高かった（53.6%）。
 *  ゲーム本体は JSON を読まない（探索をやり直しても、ここを書き換えるまで CPU は変わらない）。
 *
 *  難易度の差はこの重みではなく、揺らぎ・妨害の頻度・先読みで付ける（choose.ts の optionsFor）。 */
export const CPU_PROFILE: Profile = {
  early: {
    vp: 2.5,
    coin: 0.25,
    opponentCoin: -1.6,
    pendingIncome: 1.2,
    incomePerTurn: 6,
    opponentVp: -8,
    reach: 2,
    opponentReach: -1.6,
    opponentIncome: -2,
    debt: -1.2,
    guarded: 0,
    stuck: -1.5,
    opponentStuck: 1,
    exposed: -2,
  },
  late: {
    vp: 0.9375,
    coin: 2,
    opponentCoin: -1.6,
    pendingIncome: 0.3,
    incomePerTurn: 12,
    opponentVp: -8,
    reach: 2,
    opponentReach: -0.4,
    opponentIncome: -2,
    debt: -1.2,
    guarded: 0,
    stuck: -1.5,
    opponentStuck: 1,
    exposed: -2,
  },
};
