import { DEFAULT_PROFILE, type Profile } from './evaluate';

/** ゲーム内の CPU（やさしい・ふつう・つよい）が共通で使う重み。
 *
 *  出どころ: `npm run search`（scripts/weight-search.ts）を 2026-10-11 のルール変更（封鎖の作り替え・建物の収益・鉱山・
 *  称号を VP で・銀行家を VP 分に）の後に 2 回（200 試合/評価 → 続きから 300 試合/評価）回し、出発点「大器晩成」が
 *  収束した重み（scripts/searched-profiles.json の "大器晩成"）を写した。4 つのうち lab 150 の総合勝率が最も高かった（53.6%）。
 *  ゲーム本体は JSON を読まない（探索をやり直しても、ここを書き換えるまで CPU は変わらない）。
 *
 *  2026-10-11（雪だるまの対策）: 規則を変えたあと探索し直した 4 つは、互いの試合が一方的（大差 70〜85%）になる打ち方
 *  （VP より相手の VP を削ることとコインを重く見て、負けている側が建てなくなる）に収束した。この重みは、探索し直した 4 つに
 *  平均 46.5%（41〜49%、揺らぎ 0・各 100 試合）でほぼ互角、DEFAULT_PROFILE に 58%。同士の試合（ふつう）は 1 人 17.7 手番・大差 19%・
 *  逆転 33% で、探索し直した重みを使うと大差 70〜85% になるので、こちらを残した。
 *  買収されたときに受け取る代金（exposedCoins）だけ既定の 0.4 を足した。
 *
 *  難易度の差はこの重みではなく、揺らぎ・妨害の頻度・先読みで付ける（choose.ts の optionsFor）。 */
/** 旧ルールで探索した重み（参考として残す。ゲームでは使わない）。 */
export const CPU_PROFILE_SEARCHED: Profile = {
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
    exposedCoins: 0.4,
    cardGrowth: 0.5,
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
    exposedCoins: 0.4,
    cardGrowth: 0.5,
  },
};

/** ゲーム内の CPU の重み。2026-10-12 の規則変更（買収を市場価値の 2 倍・代金は渡さない・収益を上げる）の後は
 *  既定の重み（DEFAULT_PROFILE）。探索した重み（旧ルールのもの、規則変更後に探し直したもの）はどれもふつう同士で
 *  大差 85〜95%・逆転 15〜20% になり（手番 11〜12）、既定の重みは手番 15.7・大差 42%・逆転 24%・先手 51%（lab --shape 400）。
 *  CPU の強さの差は難易度（揺らぎ・先読み）で付ける。 */
export const CPU_PROFILE: Profile = DEFAULT_PROFILE;
