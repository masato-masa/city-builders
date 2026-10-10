import type { Profile } from './evaluate';

/** ゲーム内の CPU（やさしい・ふつう・つよい）が共通で使う重み。
 *
 *  出どころ: `npm run search`（scripts/weight-search.ts、2026-10-11、200 試合/評価）が
 *  出発点「回転」から収束させた重み（scripts/searched-profiles.json の "回転"）を写した。
 *  評価関数の盲点 2 つ（手番後の建築家の割引・試合の終わりの投資と借り）を直し、Lv3 を入れた後に探し直したもの。
 *  探索結果の 4 つのうち、最終の既定値の lab 150 で総合勝率が最も高かった（53.3%）。
 *  ゲーム本体は JSON を読まない（探索をやり直しても、ここを書き換えるまで CPU は変わらない）。
 *
 *  難易度の差はこの重みではなく、揺らぎ・妨害の頻度・先読みで付ける（choose.ts の optionsFor）。 */
export const CPU_PROFILE: Profile = {
  early: {
    vp: 10,
    coin: 0.125,
    opponentCoin: -0.2,
    pendingIncome: 0.3,
    incomePerTurn: 1.5,
    opponentVp: -8,
    reach: 4,
    opponentReach: -1.6,
    opponentIncome: -2,
    debt: -1.2,
    guarded: 0,
    stuck: -1.5,
    opponentStuck: 1,
    exposed: -2,
  },
  late: {
    vp: 1.25,
    coin: 1,
    opponentCoin: -0.2,
    pendingIncome: 9.6,
    incomePerTurn: 6,
    opponentVp: -8,
    reach: 4,
    opponentReach: -0.4,
    opponentIncome: -2,
    debt: -1.2,
    guarded: 0,
    stuck: -1.5,
    opponentStuck: 1,
    exposed: -4,
  },
};
