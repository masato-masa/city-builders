import type { Profile } from './evaluate';

/** ゲーム内の CPU（やさしい・ふつう・つよい）が共通で使う重み。
 *
 *  出どころ: `npm run search`（scripts/weight-search.ts、2026-10-10、200 試合/評価）が
 *  出発点「回転」から収束させた重み（scripts/searched-profiles.json の "回転"）を写した。
 *  探索結果の 4 つのうち総当たりで最も強かった（200 試合: 妨害に 57.3%、大器晩成に 66.0%、
 *  均衡に 65.8%）。JSON に残っている opponentBound は評価関数から消えた項目なので落とした。
 *  ゲーム本体は JSON を読まない（探索をやり直しても、ここを書き換えるまで CPU は変わらない）。
 *
 *  難易度の差はこの重みではなく、揺らぎ・妨害の頻度・先読みで付ける（choose.ts の optionsFor）。 */
export const CPU_PROFILE: Profile = {
  early: {
    vp: 10,
    coin: 0.125,
    opponentCoin: -1.6,
    pendingIncome: 2.4,
    incomePerTurn: 3,
    opponentVp: -8,
    reach: 4,
    opponentReach: -0.8,
    opponentIncome: -2,
    debt: -1.2,
    guarded: 0,
    stuck: -1.5,
    opponentStuck: 1,
    exposed: -4,
  },
  late: {
    vp: 1.25,
    coin: 0.5,
    opponentCoin: -0.8,
    pendingIncome: 2.4,
    incomePerTurn: 6,
    opponentVp: -8,
    reach: 1,
    opponentReach: -1.6,
    opponentIncome: -2,
    debt: -1.2,
    guarded: 0,
    stuck: -1.5,
    opponentStuck: 1,
    exposed: -4,
  },
};
