// 効果音。ElevenLabs で生成して選んだ短い音声（src/assets/sfx/*.wav、scripts/build-sfx.mjs）を
// AudioContext を作った時点で読み込み、AudioBuffer にして WebAudio で鳴らす（再生の遅延はゼロ）。
// 読み込み時に頭の無音を切り、音量（ピーク）をそろえる。鳴らすたびに音程・音量を少しゆらして、
// 同じ音が続いても機械的に聞こえないようにする。音声が無い・読み込めていない音は合成音で代わりに鳴らす。
//
// AudioContext はページ読み込み時ではなく、最初にどれかの play* が呼ばれた
// タイミング（＝最初のユーザー操作）で作る。作れなかった場合・設定で切って
// ある場合は、何もせず黙って続行する（例外を投げない）。
//
// 衝撃の大きい動作（買収・徴税官・封鎖者・アップグレード・建設・勝利）は、生成した音（中域の本体）に
// 合成の「低いドン」「高いカチ」を重ねる（sound-plan.ts の LAYERS）。繰り返し鳴る音は VARIANTS で
// 3〜5 通りに鳴らし分ける。出力は効果音バス → コンプレッサー → リミッター（audio-graph.ts）。
// 山場（買収・アップグレード・決着の鐘）では BGM を一拍引く（bgm.ts の duckBgm）。
//
// 音は互いにぶつかる。直前に鳴らした音から一定時間内は次を間引き、
// 3 つ以上が同時に濁るのを防ぐ（勝ち負け・手番の合図だけは必ず鳴らす）。

import type { CardId } from '@/game/types';

import { getGraph, whenGraphCreated } from './audio-graph';
import { duckBgm, stopBgm } from './bgm';
import { isSoundEnabled } from './settings';
import {
  jitterLayer,
  layersFor,
  nextVariantIndex,
  shouldPlay,
  VARIANTS,
  type ImpactAction,
  type LayerSpec,
} from './sound-plan';

/** 効果音の出口（効果音バス）。 */
let bus: AudioNode | null = null;

function getContext(): AudioContext | null {
  const g = getGraph();
  if (!g) return null;
  bus = g.sfxBus;
  return g.ctx;
}

function out(c: AudioContext): AudioNode {
  return bus ?? c.destination;
}

whenGraphCreated((g) => loadSamples(g.ctx));

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

/** 確認用の数（開発中だけ window.__cbSfx で見る）。 */
const stats = { samples: 0, synth: 0, layers: 0, throttled: 0 };

/** 層を重ねるか（sfx.html の聴き比べで切り替える。ゲームでは常に入）。 */
let layersOn = true;
export function setLayersEnabled(on: boolean): void {
  layersOn = on;
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __cbSfx?: unknown }).__cbSfx = { stats };
}

// ---------------------------------------------------------------------------
// 生成した音声

const sampleUrls = import.meta.glob('../assets/sfx/*.wav', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const samples = new Map<string, AudioBuffer>();

/** 音ごとの音量（ピークをそろえたあとに掛ける）。生成した音は同じピークでも実効音量（RMS）が
 *  -12〜-31dB とばらつくので、RMS を測って役割ごとの目標（UI -30 前後、カード -24、建設 -20、
 *  勝敗 -22〜-24dB）に合わせた値。音を差し替えたら測り直す。 */
const SAMPLE_GAIN: Record<string, number> = {
  tap: 0.44, select: 0.36, cardBuff: 0.88, cardAttack: 0.33, chain: 1, shield: 0.58, horn: 0.27,
  build: 0.8, coin: 1, coinBig: 0.97, coinLose: 0.79, reject: 0.32, endTurn: 0.88,
  yourTurn: 0.31, win: 0.44, lose: 0.3,
};

/** 音ごとの最大の長さ（ms）。scripts/build-sfx.mjs の TARGET.max と同じ。 */
const SAMPLE_MAX_MS: Record<string, number> = {
  tap: 220, select: 300, cardBuff: 1200, cardAttack: 900, chain: 1300, shield: 900, horn: 1400,
  build: 1200, coin: 700, coinBig: 1600, coinLose: 1200, reject: 550, endTurn: 650,
  yourTurn: 900, win: 4000, lose: 4000,
};

/** 頭の無音を切り、ピークを 1 にそろえた AudioBuffer を作る。 */
function tidy(c: AudioContext, buf: AudioBuffer, name: string): AudioBuffer {
  const ch = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]!));
  if (peak <= 0) return buf;
  const th = peak * 0.02;
  let start = 0;
  while (start < ch.length && Math.abs(ch[start]!) < th) start++;
  start = Math.max(0, start - Math.floor(buf.sampleRate * 0.004));
  let end = ch.length;
  while (end > start && Math.abs(ch[end - 1]!) < th * 0.5) end--;
  const maxLen = Math.floor((buf.sampleRate * (SAMPLE_MAX_MS[name] ?? 1500)) / 1000);
  const len = Math.max(1, Math.min(end - start, maxLen));
  const out = c.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
  for (let k = 0; k < buf.numberOfChannels; k++) {
    const src = buf.getChannelData(k);
    const dst = out.getChannelData(k);
    for (let i = 0; i < len; i++) dst[i] = src[start + i]! / peak;
    // 終わりをフェードアウト（切り口のプツ音を消す。長さで切ったときは長めに）
    const fade = Math.min(len, Math.floor(buf.sampleRate * (end - start > maxLen ? 0.12 : 0.015)));
    for (let i = 0; i < fade; i++) dst[len - 1 - i]! *= i / fade;
  }
  return out;
}

function loadSamples(c: AudioContext): void {
  for (const [path, url] of Object.entries(sampleUrls)) {
    const name = path.split('/').pop()!.replace(/\.wav$/, '');
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => c.decodeAudioData(data))
      .then((buf) => samples.set(name, tidy(c, buf, name)))
      .catch(() => {
        // 読めなければ合成音のまま
      });
  }
}

/** 音ごとの、直前に使った変化の番号。 */
const lastVariant = new Map<string, number>();

/** 生成した音を鳴らす。無ければ false（呼び出し側が合成音で代わりに鳴らす）。
 *  spread は音程のゆれ幅、delay は鳴らし始めるまでの秒数。
 *  VARIANTS にある音は、音程・フィルタ・開始位置の違う 3〜5 通りから直前と違うものを選ぶ。 */
function sample(c: AudioContext, name: string, spread = 0.06, delay = 0): boolean {
  const buf = samples.get(name);
  if (!buf) return false;
  const variants = VARIANTS[name];
  let rate = 1;
  let gain = 1;
  let offset = 0;
  let lowpass: number | null = null;
  if (variants) {
    const i = nextVariantIndex(variants.length, lastVariant.get(name) ?? -1, Math.random);
    lastVariant.set(name, i);
    const v = variants[i]!;
    rate = v.rate;
    gain = v.gain;
    offset = Math.min(v.offsetMs / 1000, buf.duration * 0.3);
    lowpass = v.lowpassHz;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * spread);
  const amp = c.createGain();
  amp.gain.value = (SAMPLE_GAIN[name] ?? 0.5) * gain * (0.88 + Math.random() * 0.24);
  if (lowpass) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    src.connect(f);
    f.connect(amp);
  } else {
    src.connect(amp);
  }
  amp.connect(out(c));
  src.start(c.currentTime + delay, offset);
  stats.samples++;
  return true;
}

// ---------------------------------------------------------------------------
// 層（合成の「低いドン」「高いカチ」を生成した音に重ねる）

let noiseBuf: AudioBuffer | null = null;

function noise(c: AudioContext): AudioBuffer {
  if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
    noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.3), c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function layer(c: AudioContext, spec: LayerSpec, delay: number): void {
  const t = c.currentTime + delay + spec.at;
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  // 速い立ち上がり（クリックは 1ms、ほかは 4ms）と短い余韻
  amp.gain.exponentialRampToValueAtTime(spec.gain, t + (spec.kind === 'click' ? 0.001 : 0.004));
  amp.gain.exponentialRampToValueAtTime(0.0001, t + spec.dur);
  amp.connect(out(c));
  if (spec.kind === 'thump') {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(spec.freq, t);
    osc.frequency.exponentialRampToValueAtTime(spec.freqEnd ?? spec.freq * 0.5, t + spec.dur);
    osc.connect(amp);
    osc.start(t);
    osc.stop(t + spec.dur + 0.03);
  } else {
    const src = c.createBufferSource();
    src.buffer = noise(c);
    const f = c.createBiquadFilter();
    f.type = spec.kind === 'click' ? 'highpass' : 'lowpass';
    f.frequency.value = spec.freq;
    f.Q.value = spec.kind === 'click' ? 0.9 : 0.7;
    src.connect(f);
    f.connect(amp);
    src.start(t, Math.random() * 0.2, spec.dur + 0.03);
  }
  stats.layers++;
}

/** 動作の層をまとめて鳴らす。間引き（gate）は呼び出し元の play で 1 回だけ数える。 */
function layers(c: AudioContext, action: ImpactAction, delay = 0): void {
  if (!layersOn) return;
  for (const spec of layersFor(action)) layer(c, jitterLayer(spec, Math.random), delay);
}

let lastPlayedAt = 0;

/** 直前の音から近すぎるときは間引く。force で強制的に鳴らす（勝ち負け・手番の合図用）。 */
function gate(force = false): boolean {
  const now = performance.now();
  if (!shouldPlay(now, lastPlayedAt, force)) {
    stats.throttled++;
    return false;
  }
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
  amp.connect(out(audioCtx));
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
  stats.synth++;
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

// ---------------------------------------------------------------------------
// 合成音（生成した音が無いときの代わり）。delay は秒。

function synthCoinGain(c: AudioContext, delta: number, delay = 0): void {
  const count = Math.max(1, Math.min(5, Math.round(delta / 5) + 1));
  for (let i = 0; i < count; i++) {
    const freq = 1250 + ((i * 197) % 620);
    tone(c, { freq, duration: 0.09, type: 'sine', gain: 0.08, delay: delay + i * 0.04 });
  }
}

function synthDebtSink(c: AudioContext, delay = 0): void {
  tone(c, { freq: 460, freqEnd: 140, duration: 0.4, type: 'sine', gain: 0.15, delay });
}

/** この額以上コインが増えたら、じゃらっと大きい音（coinBig）にする。 */
const BIG_COIN_DELTA = 6;

function coinGain(c: AudioContext, delta: number, delay = 0): void {
  if (sample(c, delta >= BIG_COIN_DELTA ? 'coinBig' : 'coin', 0.06, delay)) return;
  synthCoinGain(c, delta, delay);
}

function coinLose(c: AudioContext, delay = 0): void {
  if (sample(c, 'coinLose', 0.05, delay)) return;
  synthDebtSink(c, delay);
}

// ---------------------------------------------------------------------------
// 鳴らす場所ごとの入口

/** ボタン・シートの開閉など、ゲームに関わらない UI の操作: ごく短い木のクリック */
export function playUiTap(): void {
  play(false, (c) => {
    if (sample(c, 'tap')) return;
    tone(c, { freq: 900, duration: 0.04, type: 'triangle', gain: 0.06 });
  });
}

/** カードや区画を選ぶ: カードを軽く弾く音 */
export function playSelect(): void {
  play(false, (c) => {
    if (sample(c, 'select', 0.08)) return;
    tone(c, { freq: 900, duration: 0.045, type: 'triangle', gain: 0.07 });
  });
}

// カードを使ったときの音。投資系は明るいきらめき、妨害系は暗い一撃、
// 封鎖者は鎖、衛兵は盾、伝令はラッパ。
const CARD_SAMPLE: Record<CardId, string> = {
  banker: 'cardBuff',
  miner: 'cardBuff',
  festival: 'cardBuff',
  architect: 'cardBuff',
  usurer: 'cardBuff',
  spy: 'cardAttack',
  taxman: 'cardAttack',
  blockader: 'chain',
  guard: 'shield',
  herald: 'horn',
};

// 合成音で代わりに鳴らすときの高さ。投資系は明るく高く、妨害系は低く沈める。
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

/** カードを使う。カードの種類で音を変える（徴税官は相手のコインがこぼれる音を少し遅らせて重ねる）。 */
export function playUseCard(card: CardId): void {
  play(false, (c) => {
    // 妨害の 2 枚（徴税官・封鎖者）は衝撃が大きいので、カチとドンを重ねる
    if (card === 'taxman' || card === 'blockader') layers(c, card);
    if (sample(c, CARD_SAMPLE[card])) {
      if (card === 'taxman') sample(c, 'coinLose', 0.05, 0.22);
      return;
    }
    const base = CARD_BASE_FREQ[card];
    tone(c, { freq: base, freqEnd: base * 1.7, duration: 0.14, type: 'sine', gain: 0.16 });
    tone(c, { freq: base * 2, freqEnd: base * 2.6, duration: 0.1, type: 'sine', gain: 0.05, delay: 0.02 });
  });
}

/** 物件を建てる: いちばん気持ちいい音。石と木がずしんと据わる。 */
export function playBuild(): void {
  play(false, (c) => {
    layers(c, 'build');
    if (sample(c, 'build', 0.04)) return;
    tone(c, { freq: 90, duration: 0.22, type: 'sine', gain: 0.22 });
    tone(c, { freq: 180, freqEnd: 260, duration: 0.28, type: 'triangle', gain: 0.14, delay: 0.01 });
    tone(c, { freq: 520, freqEnd: 640, duration: 0.18, type: 'sine', gain: 0.08, delay: 0.05 });
  });
}

/** 物件をアップグレードする: 建設の据わる音にきらめき（cardBuff）を重ねる。
 *  専用の音源は持たない（既存の音の流用。無ければ上がっていく合成音）。 */
export function playUpgrade(): void {
  duckBgm('upgrade');
  play(false, (c) => {
    layers(c, 'upgrade');
    const built = sample(c, 'build', 0.03);
    const shine = sample(c, 'cardBuff', 0.04, 0.08);
    if (built || shine) return;
    [660, 880, 1180].forEach((freq, i) => {
      tone(c, { freq, freqEnd: freq * 1.25, duration: 0.16, type: 'sine', gain: 0.1, delay: i * 0.07 });
    });
  });
}

/** 物件を買収する（した・された）: 一撃（cardAttack）のあとにコインが相手へ渡る音。
 *  カードの「買収者」とは別の行動だが、相手から奪う手触りは同じ系統にそろえる。 */
export function playAcquire(): void {
  duckBgm('acquire');
  play(false, (c) => {
    layers(c, 'acquire');
    const hit = sample(c, 'cardAttack', 0.04);
    const coins = sample(c, 'coinBig', 0.05, 0.2);
    if (hit || coins) return;
    tone(c, { freq: 340, freqEnd: 200, duration: 0.18, type: 'triangle', gain: 0.14 });
    synthCoinGain(c, 10, 0.2);
  });
}

/** 地区の称号が動いた: 伝令のラッパ（horn）で知らせ、取ったならきらめき（cardBuff）、
 *  奪われたならコインがこぼれる音（coinLose）を重ねる。専用の音源は持たない（既存の音の組み合わせ）。
 *  建設・買収の音と同じ瞬間に起きるので、間引きに消されないよう force で鳴らし、少し遅らせて後ろに置く。 */
export function playTitle(gained: boolean): void {
  play(true, (c) => {
    const delay = 0.32;
    const horn = sample(c, 'horn', 0.03, delay);
    const after = gained ? sample(c, 'cardBuff', 0.04, delay + 0.12) : sample(c, 'coinLose', 0.05, delay + 0.12);
    if (horn || after) return;
    const notes = gained ? [523, 659, 784] : [587, 494, 392];
    notes.forEach((freq, i) => {
      tone(c, { freq, duration: 0.16, type: 'triangle', gain: 0.1, delay: delay + i * 0.09 });
    });
  });
}

/** コインが増える。増えた額が大きい（BIG_COIN_DELTA 以上）ときはじゃらっと大きい音。 */
export function playCoinGain(delta: number): void {
  play(false, (c) => coinGain(c, delta));
}

/** 高利貸の返済で引かれる: コインがこぼれ落ちる音 */
export function playDebtSink(): void {
  play(false, (c) => coinLose(c));
}

/** 打てない札を押した: 短い、不快でない拒否音 */
export function playReject(): void {
  play(false, (c) => {
    if (sample(c, 'reject')) return;
    tone(c, { freq: 200, duration: 0.06, type: 'triangle', gain: 0.11 });
    tone(c, { freq: 170, duration: 0.07, type: 'triangle', gain: 0.11, delay: 0.09 });
  });
}

/** ターンを終える: 羊皮紙をめくる音 */
export function playEndTurn(): void {
  play(false, (c) => {
    if (sample(c, 'endTurn', 0.05)) return;
    tone(c, { freq: 500, freqEnd: 330, duration: 0.22, type: 'sine', gain: 0.13 });
  });
}

/** 自分の手番が回ってきた: 小さな鐘。incomeDelta を渡すと、手番開始で増減したコインの音を
 *  少し遅らせて続けて鳴らす（別々に呼ぶと間引きで片方が消えるため、ここでまとめる）。
 *  直前のターン終了の音と重ならないよう、鐘も少し遅らせる。 */
export function playYourTurn(incomeDelta = 0): void {
  play(true, (c) => {
    if (!sample(c, 'yourTurn', 0, 0.2)) {
      tone(c, { freq: 1320, duration: 0.35, type: 'sine', gain: 0.1, delay: 0.2 });
      tone(c, { freq: 2640, duration: 0.25, type: 'sine', gain: 0.03, delay: 0.2 });
    }
    if (incomeDelta > 0) coinGain(c, incomeDelta, 0.55);
    else if (incomeDelta < 0) coinLose(c, 0.55);
  });
}

/** 決着の鐘: 手番の鐘（yourTurn）を遅らせずに、少し低く鳴らす。無ければ低めの合成の鐘。
 *  新しい音源は持たない（既存の音の流用）。 */
export function playBell(): void {
  duckBgm('finale');
  play(true, (c) => {
    const buf = samples.get('yourTurn');
    if (buf) {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.84;
      const amp = c.createGain();
      amp.gain.value = (SAMPLE_GAIN.yourTurn ?? 0.3) * 1.2;
      src.connect(amp);
      amp.connect(out(c));
      src.start(c.currentTime);
      stats.samples++;
      return;
    }
    tone(c, { freq: 990, duration: 0.6, type: 'sine', gain: 0.12 });
    tone(c, { freq: 1980, duration: 0.4, type: 'sine', gain: 0.04 });
    tone(c, { freq: 495, duration: 0.7, type: 'sine', gain: 0.05 });
  });
}

/** 勝ち: 短いファンファーレ */
export function playWin(): void {
  // 決着: BGM はここで消し、ファンファーレだけを聴かせる
  stopBgm(0.4);
  play(true, (c) => {
    layers(c, 'win');
    if (sample(c, 'win', 0)) return;
    [520, 660, 880].forEach((freq, i) => {
      tone(c, { freq, duration: 0.28, type: 'triangle', gain: 0.15, delay: i * 0.11 });
    });
  });
}

/** 確認用: 読み込んだ音ごとの実効音量（RMS、dBFS）とピーク。SAMPLE_GAIN を掛けたあとの値で、
 *  効果音バスに入る大きさ。sfx.html の「音量の測定」で BGM と比べる。 */
export function measureSampleLevels(): Record<string, { rmsDb: number; peakDb: number }> {
  const res: Record<string, { rmsDb: number; peakDb: number }> = {};
  for (const [name, buf] of samples) {
    const ch = buf.getChannelData(0);
    const g = SAMPLE_GAIN[name] ?? 0.5;
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < ch.length; i++) {
      sum += ch[i]! * ch[i]!;
      peak = Math.max(peak, Math.abs(ch[i]!));
    }
    res[name] = { rmsDb: 20 * Math.log10(Math.sqrt(sum / ch.length) * g), peakDb: 20 * Math.log10(peak * g) };
  }
  return res;
}

/** 確認用: 音源の読み込みが済んだ数。 */
export function loadedSampleCount(): number {
  return samples.size;
}

/** 負け: 沈む短いフレーズ */
export function playLose(): void {
  stopBgm(0.4);
  play(true, (c) => {
    if (sample(c, 'lose', 0)) return;
    [420, 340, 240].forEach((freq, i) => {
      tone(c, { freq, freqEnd: freq * 0.85, duration: 0.32, type: 'sine', gain: 0.15, delay: i * 0.13 });
    });
  });
}
