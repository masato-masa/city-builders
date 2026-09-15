// 効果音。すべて WebAudio で合成する。音声ファイルは 1 つも置かない
// （読み込みゼロ・容量ゼロ・遅延ゼロ）。
//
// AudioContext はページ読み込み時ではなく、最初にどれかの play* が呼ばれた
// タイミング（＝最初のユーザー操作）で作る。作れなかった場合・設定で切って
// ある場合は、何もせず黙って続行する（例外を投げない）。
//
// 音は互いにぶつかる。直前に鳴らした音から一定時間内は次を間引き、
// 3 つ以上が同時に濁るのを防ぐ（勝ち負けだけは必ず鳴らす）。

import type { CardId } from '@/game/types';

import { isSoundEnabled } from './settings';

let ctx: AudioContext | null = null;
let unavailable = false;

function getContext(): AudioContext | null {
  if (unavailable) return null;
  if (ctx) {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        // 再開できなくても致命的ではない
      });
    }
    return ctx;
  }
  try {
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) {
      unavailable = true;
      return null;
    }
    ctx = new Ctor();
    return ctx;
  } catch {
    unavailable = true;
    return null;
  }
}

/** 最初のユーザー操作（ホームの難易度ボタンなど）で、なるべく早く AudioContext を
 *  用意しておく。失敗しても何もしない。 */
export function primeAudio(): void {
  if (!isSoundEnabled()) return;
  try {
    getContext();
  } catch {
    // 何もしない
  }
}

let lastPlayedAt = 0;
const THROTTLE_MS = 60;

/** 直前の音から近すぎるときは間引く。force で強制的に鳴らす（勝ち負け用）。 */
function gate(force = false): boolean {
  const now = performance.now();
  if (!force && now - lastPlayedAt < THROTTLE_MS) return false;
  lastPlayedAt = now;
  return true;
}

interface ToneOptions {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  freqEnd?: number;
}

function tone(audioCtx: AudioContext, opts: ToneOptions): void {
  const { freq, duration, type = 'sine', gain = 0.16, delay = 0, freqEnd } = opts;
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  osc.type = type;
  const t0 = audioCtx.currentTime + delay;
  osc.frequency.setValueAtTime(Math.max(freq, 1), t0);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + duration);
  }
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0005), t0 + Math.min(0.014, duration / 3));
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp);
  amp.connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

/** 呼び出し全体を try/catch で包む。鳴らせなくても例外は外に出さない。 */
function play(force: boolean, body: (audioCtx: AudioContext) => void): void {
  if (!isSoundEnabled()) return;
  if (!gate(force)) return;
  try {
    const audioCtx = getContext();
    if (!audioCtx) return;
    body(audioCtx);
  } catch {
    // 鳴らせなくても続行
  }
}

/** カードを選ぶ: ごく短い、軽いクリック */
export function playSelect(): void {
  play(false, (c) => {
    tone(c, { freq: 900, duration: 0.045, type: 'triangle', gain: 0.07 });
  });
}

// カードを使ったときの音の高さ。投資系（採掘師・銀行家・祝祭など）は明るく高く、
// 妨害系（徴税官・封鎖者・買収者）は低く沈める。他は中間。
const CARD_BASE_FREQ: Record<CardId, number> = {
  banker: 720,
  miner: 660,
  festival: 640,
  architect: 560,
  guard: 520,
  herald: 470,
  usurer: 420,
  spy: 360,
  taxman: 330,
  blockader: 300,
};

/** カードを使う: 上へ抜ける短い音。カードの種類で高さを変える。 */
export function playUseCard(card: CardId): void {
  play(false, (c) => {
    const base = CARD_BASE_FREQ[card];
    tone(c, { freq: base, freqEnd: base * 1.7, duration: 0.14, type: 'sine', gain: 0.16 });
    tone(c, { freq: base * 2, freqEnd: base * 2.6, duration: 0.1, type: 'sine', gain: 0.05, delay: 0.02 });
  });
}

/** 物件を建てる: いちばん気持ちいい音。低音の厚みから立ち上がる。 */
export function playBuild(): void {
  play(false, (c) => {
    tone(c, { freq: 90, duration: 0.22, type: 'sine', gain: 0.22 });
    tone(c, { freq: 180, freqEnd: 260, duration: 0.28, type: 'triangle', gain: 0.14, delay: 0.01 });
    tone(c, { freq: 520, freqEnd: 640, duration: 0.18, type: 'sine', gain: 0.08, delay: 0.05 });
  });
}

/** コインが増える: 硬貨が触れ合うような細かい高音。増えた額が大きいほど粒を増やす（上限あり）。 */
export function playCoinGain(delta: number): void {
  play(false, (c) => {
    const count = Math.max(1, Math.min(5, Math.round(delta / 5) + 1));
    for (let i = 0; i < count; i++) {
      const freq = 1250 + ((i * 197) % 620);
      tone(c, { freq, duration: 0.09, type: 'sine', gain: 0.08, delay: i * 0.04 });
    }
  });
}

/** 高利貸の返済で引かれる: 沈む音 */
export function playDebtSink(): void {
  play(false, (c) => {
    tone(c, { freq: 460, freqEnd: 140, duration: 0.4, type: 'sine', gain: 0.15 });
  });
}

/** 打てない札を押した: 短い、不快でない拒否音 */
export function playReject(): void {
  play(false, (c) => {
    tone(c, { freq: 200, duration: 0.06, type: 'triangle', gain: 0.11 });
    tone(c, { freq: 170, duration: 0.07, type: 'triangle', gain: 0.11, delay: 0.09 });
  });
}

/** ターンを終える: 場面が切り替わる合図 */
export function playEndTurn(): void {
  play(false, (c) => {
    tone(c, { freq: 500, freqEnd: 330, duration: 0.22, type: 'sine', gain: 0.13 });
  });
}

/** 勝ち: 明るく上がる 3 音 */
export function playWin(): void {
  play(true, (c) => {
    [520, 660, 880].forEach((freq, i) => {
      tone(c, { freq, duration: 0.28, type: 'triangle', gain: 0.15, delay: i * 0.11 });
    });
  });
}

/** 負け: 沈む 3 音 */
export function playLose(): void {
  play(true, (c) => {
    [420, 340, 240].forEach((freq, i) => {
      tone(c, { freq, freqEnd: freq * 0.85, duration: 0.32, type: 'sine', gain: 0.15, delay: i * 0.13 });
    });
  });
}
