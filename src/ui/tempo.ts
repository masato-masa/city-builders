// プレイ画面の間（ま）の出どころ。「同時に処理されて見えない」という指摘を受け、
// 出来事を 1 つずつ（手番の帯 → 収入 → 行動 → その効果）の順に出すための待ち時間をここに集める。
// テンポを変えたいときは、個別の演出ではなくここを触る。
//
// 速さは設定の「早送り」で 2 通り。
// - ふつう（既定）: 待ち時間の短縮（fca2c37）より前の間合い。CPU が何をしたか、カードが何をしたかを読める速さ
//   （ユーザーの実機の感想「速すぎて理解できない。前の状態と同じく、ライバルズ同様ゆっくり」）。
// - はやい: 短縮後の間合い（慣れた人向け）。
// どちらでも、演出の途中で盤面に触れると残りを飛ばせる。

import { getSpeed, type Speed } from './settings';

export type { Speed } from './settings';

export interface Tempo {
  /** 手番の帯を出している時間。TurnBanner がこの時間で自分を消す。 */
  bannerMs: number;
  /** 手番が替わってから、収入の最初の段を出すまでの間。 */
  turnIntroMs: number;
  /** カードを使う動き（手札から盤面へ飛ぶ）を見せてから、効果（コイン・状態）を反映するまでの間。 */
  cardEffectDelayMs: number;
  /** 物件を建てる指示を出してから、着地・コインの減少を反映するまでの間。 */
  buildEffectDelayMs: number;
  /** CPU の 1 手が出る（絵と帯が出る）前の間。直前の効果が読み取れる長さ。 */
  cpuStepGapMs: number;
  /** CPU の 1 手を見せてから効果を反映するまでの間。 */
  cpuEffectDelayMs: number;
  /** 手番交代のあと、CPU の最初の 1 手（収入の 1 段目）を出すまでの間。 */
  cpuFirstGapMs: number;
  /** CPU の「ターンを終えた」を出してから手番を渡すまでの間。 */
  cpuEndDelayMs: number;
  /** カードが盤面へ飛ぶ演出の長さ（秒）。山の底へ送る札（伝令の対象・街道）に使う。 */
  cardFlightS: number;
  /** 収入の 1 段を見せる帯が出てから、コインへ反映するまでの間。 */
  incomeApplyMs: number;
  /** 収入の 1 段ぶんの長さ（帯 → 反映 → 読む間）。次の段はこのあとに出る。 */
  incomeBeatMs: number;
  /** 最後の段を反映してから、帯を消して操作を戻すまでの間。 */
  incomeTailMs: number;
  /** 伝令で、使う札が飛んでから「捨てる札」が飛び始めるまでの間。 */
  discardAtMs: number;
  /** カード使用の余韻（効果の一言が出て消える）の最長。 */
  cardAftermathMs: number;
  /** カード 1 枚の使用演出の合計の上限（溜め〜余韻の終わり）。余韻はタップで飛ばせる。 */
  cardSequenceMaxMs: number;
}

/** 速さごとの間合い。「ふつう」は fca2c37 より前の値（帯 1500・CPU 1 手 750+800・収入 1 段 1400 …）。
 *  「はやい」は今までの既定（fca2c37 と 81aeff7 の値）。 */
export const TEMPO: Record<Speed, Tempo> = {
  normal: {
    bannerMs: 1500,
    // 帯が出きってから収入の帯を出す（重ねない）。
    turnIntroMs: 1650,
    cardEffectDelayMs: 800,
    buildEffectDelayMs: 450,
    cpuStepGapMs: 750,
    cpuEffectDelayMs: 800,
    cpuFirstGapMs: 1800,
    cpuEndDelayMs: 600,
    cardFlightS: 0.7,
    incomeApplyMs: 550,
    incomeBeatMs: 1400,
    incomeTailMs: 600,
    discardAtMs: 800,
    cardAftermathMs: 1000,
    cardSequenceMaxMs: 2600,
  },
  fast: {
    bannerMs: 800,
    turnIntroMs: 150,
    cardEffectDelayMs: 500,
    buildEffectDelayMs: 300,
    cpuStepGapMs: 150,
    cpuEffectDelayMs: 350,
    cpuFirstGapMs: 200,
    cpuEndDelayMs: 250,
    cardFlightS: 0.5,
    incomeApplyMs: 120,
    incomeBeatMs: 260,
    incomeTailMs: 150,
    discardAtMs: 450,
    cardAftermathMs: 650,
    cardSequenceMaxMs: 1400,
  },
};

/** いまの設定の間合い。呼ぶたびに設定を読むので、試合の途中で切り替えても次の演出から効く。 */
export function tempo(speed: Speed = getSpeed()): Tempo {
  return TEMPO[speed];
}

/* ---- 速さで変えない値 ---- */

/** 勝敗が付いてから結果画面を出すまでの間。最後の 1 手を見せる。 */
export const RESULT_DELAY_MS = 1400;

/** カード使用の 1 段目「溜め」: 札がその場で縮んで光る長さ（ボタンの縮みの基準 80〜120ms）。
 *  2 段目「発動」（盤面へ飛んで弾ける）は cardEffectDelayMs − これ。 */
export const CARD_CHARGE_MS = 100;

/** 溜めで縮める倍率（基準 0.9 前後）。 */
export const CARD_CHARGE_SCALE = 0.9;

/** 数字の増減ポップが出ている時間（ミリ秒）。 */
export const DELTA_POP_MS = 1300;
