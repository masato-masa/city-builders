// BGM。音声ファイルを持たず、WebAudio だけで合成する短いループ（ヘ長調・4/4・8 小節、sound-plan.ts の BGM_BARS）。
// 柔らかいパッド（三角波の和音）＋ 8 分の分散和音 ＋ ベース（1・3 拍）＋ 2・4 拍のウッドブロック ＋ 裏拍のシェイカー。
//
// - プレイ画面でだけ流す（Game / PvpGame が startBgm / stopBgm を呼ぶ）。ホームでは流さない。
// - 効果音より -9dB のバス（BGM_BUS_DB）に流す。
// - 残り手番が少ないとテンポを上げ、ローパスを開き、刻みを倍にする（bgmMood）。
// - 山場（買収・Lv2・決着）で一拍だけ下げる（duckBgm）。
// - 1 小節ずつ、鳴らす少し前にまとめて予約する（タイマーのぶれで拍がずれない）。

import { getGraph, peekGraph } from './audio-graph';
import {
  ARP_PATTERN,
  BGM_BEATS_PER_BAR,
  BGM_BUS_DB,
  barAt,
  beatSeconds,
  bgmMood,
  dbToGain,
  duckEnvelope,
  mergeDuck,
  midiToHz,
  type BgmMood,
  type DuckKind,
} from './sound-plan';
import { isBgmEnabled, isSoundEnabled } from './settings';

// ---------------------------------------------------------------------------
// 1 小節の譜面を予約する（OfflineAudioContext でも同じものを鳴らせるよう BaseAudioContext を取る）

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function noise(c: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(c);
  if (!buf) {
    buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.25), c.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    noiseCache.set(c, buf);
  }
  return buf;
}

function note(
  c: BaseAudioContext,
  dest: AudioNode,
  t: number,
  o: { freq: number; dur: number; gain: number; type: OscillatorType; attack: number; freqEnd?: number },
): void {
  const osc = c.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.dur);
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(o.gain, t + o.attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(amp);
  amp.connect(dest);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
  stats.notes++;
}

function pad(c: BaseAudioContext, dest: AudioNode, t: number, freq: number, dur: number): void {
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  osc.detune.value = (freq % 7) - 3; // わずかにずらして厚みを出す
  const amp = c.createGain();
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(0.045, t + 0.3);
  amp.gain.setValueAtTime(0.045, t + dur - 0.35);
  amp.gain.linearRampToValueAtTime(0, t + dur + 0.05);
  osc.connect(amp);
  amp.connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.1);
  stats.notes++;
}

function shaker(c: BaseAudioContext, dest: AudioNode, t: number, gain: number): void {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 6500;
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.connect(hp);
  hp.connect(amp);
  amp.connect(dest);
  src.start(t, Math.random() * 0.15, 0.07);
  stats.notes++;
}

/** index 小節目（ループ）を t0 から予約する。小節の長さ（秒）を返す。 */
export function scheduleBar(c: BaseAudioContext, dest: AudioNode, index: number, t0: number, mood: BgmMood): number {
  const bar = barAt(index);
  const beat = beatSeconds(mood.bpm);
  const len = beat * BGM_BEATS_PER_BAR;
  // パッド: 小節いっぱい
  for (const m of bar.chord) pad(c, dest, t0, midiToHz(m), len);
  // ベース: 1・3 拍
  for (const b of [0, 2]) {
    note(c, dest, t0 + b * beat, { freq: midiToHz(bar.bass), dur: beat * 1.6, gain: 0.2, type: 'sine', attack: 0.012 });
  }
  // 分散和音: 8 分（1 オクターブ上）。最後の小節の後半は解決の C へ
  ARP_PATTERN.forEach((k, i) => {
    if (k === null) return;
    const resolve = bar.name === 'Csus4' && i >= 4;
    const chord = resolve ? [60, 64, 67] : bar.chord;
    note(c, dest, t0 + (i * beat) / 2, { freq: midiToHz(chord[k]! + 12), dur: 0.32, gain: 0.07, type: 'triangle', attack: 0.006 });
  });
  // ウッドブロック: 2・4 拍
  for (const b of [1, 3]) {
    note(c, dest, t0 + b * beat, { freq: 1100, freqEnd: 700, dur: 0.05, gain: 0.05, type: 'sine', attack: 0.002 });
  }
  // シェイカー: 裏拍（緊張時は 8 分すべて）
  for (let i = 0; i < 8; i++) {
    if (mood.hatDensity === 1 && i % 2 === 0) continue;
    shaker(c, dest, t0 + (i * beat) / 2, i % 2 === 1 ? 0.05 : 0.03);
  }
  stats.bars++;
  return len;
}

/** 確認用の数（開発中だけ window.__cbBgm で見る）。 */
const stats = { bars: 0, notes: 0, ducks: 0, starts: 0, stops: 0 };

// ---------------------------------------------------------------------------
// 流す・止める

const LOOKAHEAD_S = 0.4;
const TICK_MS = 100;

interface Session {
  out: GainNode;
  timer: number;
  nextAt: number;
  bar: number;
}

let session: Session | null = null;
/** プレイ画面にいる（流したい）か。設定で切った・戻したときに使う。 */
let wanted = false;
let mood: BgmMood = bgmMood(99);
let duck: { untilMs: number; depthDb: number } | null = null;

function begin(): void {
  if (session) return;
  if (!isSoundEnabled() || !isBgmEnabled()) return;
  const g = getGraph();
  if (!g) return;
  const { ctx } = g;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, ctx.currentTime);
  out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.2);
  out.connect(g.bgmFilter);
  g.bgmBus.gain.setValueAtTime(dbToGain(BGM_BUS_DB), ctx.currentTime);
  g.bgmFilter.frequency.setValueAtTime(mood.cutoffHz, ctx.currentTime);
  const s: Session = { out, timer: 0, nextAt: ctx.currentTime + 0.15, bar: 0 };
  const tick = () => {
    while (s.nextAt < ctx.currentTime + LOOKAHEAD_S) {
      s.nextAt += scheduleBar(ctx, s.out, s.bar, s.nextAt, mood);
      s.bar++;
    }
  };
  tick();
  s.timer = window.setInterval(tick, TICK_MS);
  session = s;
  stats.starts++;
}

function end(fadeS: number): void {
  const s = session;
  if (!s) return;
  session = null;
  window.clearInterval(s.timer);
  const ctx = s.out.context;
  const now = ctx.currentTime;
  s.out.gain.cancelScheduledValues(now);
  s.out.gain.setValueAtTime(Math.max(s.out.gain.value, 0.0001), now);
  s.out.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.02, fadeS));
  window.setTimeout(() => s.out.disconnect(), (fadeS + 3) * 1000);
  stats.stops++;
}

/** プレイ画面に入った。BGM を流し始める（設定で切っていれば流さない）。 */
export function startBgm(turnsLeft = 99): void {
  wanted = true;
  mood = bgmMood(turnsLeft);
  try {
    begin();
  } catch {
    // 鳴らせなくても続行
  }
}

/** プレイ画面を出た・決着した。fadeS 秒で消す。 */
export function stopBgm(fadeS = 0.6): void {
  wanted = false;
  try {
    end(fadeS);
  } catch {
    // 何もしない
  }
}

/** 設定の入切が変わった。流したい場面なら流し直す・止める。 */
export function refreshBgm(): void {
  try {
    if (wanted && isSoundEnabled() && isBgmEnabled()) begin();
    else end(0.3);
  } catch {
    // 何もしない
  }
}

/** 残り手番を伝える。少なくなると次の小節からテンポが上がり、フィルタが開く。 */
export function setBgmTension(turnsLeft: number): void {
  const next = bgmMood(turnsLeft);
  if (next.tense === mood.tense) return;
  mood = next;
  const g = peekGraph();
  if (!g) return;
  try {
    g.bgmFilter.frequency.setTargetAtTime(mood.cutoffHz, g.ctx.currentTime, 0.6);
  } catch {
    // 何もしない
  }
}

/** 山場で BGM を一拍だけ引く。流れていなければ何もしない。 */
export function duckBgm(kind: DuckKind): void {
  if (!session) return;
  const g = peekGraph();
  if (!g) return;
  try {
    const env = duckEnvelope(kind, mood.bpm);
    const nowMs = performance.now();
    duck = mergeDuck(duck, nowMs, env);
    const p = g.bgmDuck.gain;
    const now = g.ctx.currentTime;
    const low = dbToGain(duck.depthDb);
    const holdUntil = now + (duck.untilMs - nowMs) / 1000;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(low, now + env.attackMs / 1000);
    p.setValueAtTime(low, holdUntil);
    p.linearRampToValueAtTime(1, holdUntil + env.releaseMs / 1000);
    stats.ducks++;
  } catch {
    // 何もしない
  }
}

export function isBgmPlaying(): boolean {
  return session !== null;
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __cbBgm?: unknown }).__cbBgm = { stats, mood: () => mood, playing: isBgmPlaying };
}

/** 確認用: BGM を OfflineAudioContext で bars 小節ぶん書き出す（バスの音量・フィルタ込み、モノラル）。 */
export async function renderBgm(bars: number, turnsLeft = 99, sampleRate = 32000): Promise<AudioBuffer> {
  const m = bgmMood(turnsLeft);
  const len = beatSeconds(m.bpm) * BGM_BEATS_PER_BAR * bars;
  const off = new OfflineAudioContext(1, Math.ceil((len + 0.5) * sampleRate), sampleRate);
  const filter = off.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = m.cutoffHz;
  filter.Q.value = 0.5;
  const bus = off.createGain();
  bus.gain.value = dbToGain(BGM_BUS_DB);
  filter.connect(bus);
  bus.connect(off.destination);
  let t = 0;
  for (let i = 0; i < bars; i++) t += scheduleBar(off, filter, i, t, m);
  return off.startRendering();
}
