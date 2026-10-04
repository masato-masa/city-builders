// 効果音の候補（refs/sfx/<名前>_<番号>.mp3 または .ogg）から 1 本ずつ選び、整えて src/assets/sfx/<名前>.wav に書き出す（常設スクリプト）。
//
//   node scripts/build-sfx.mjs                 全部作り直す（候補を測って自動で選ぶ）
//   node scripts/build-sfx.mjs build=3         build だけ候補 3 に決め打ちする（scripts/sfx-picks.json に記録して次回も使う）
//   node scripts/build-sfx.mjs select=tap_1    別の音の候補で代用する
//
// 候補の出どころ: ElevenLabs の Sound Effects で、下の PROMPTS の指示文から 1 回 4 本ずつ生成したもの。
// refs/ は git 管理外なので、作り直すときは同じ指示文で生成し直す。
// 形式は拡張子でなくファイル先頭のマジックバイトで判定する（"OggS" → Ogg Opus、"ID3" か 0xFFEx → MP3）。
//
// 選び方: 頭と終わりの無音を除いた「実際に鳴っている長さ」と「打音の数」を測り、音ごとの目標（TARGET）に
// いちばん近いものを選ぶ（耳で選び直したいときは sfx-picks.json で決め打ちする）。
// 整え方: 頭の無音を切る → ピークを 0.9 にそろえる → 最大長（TARGET.max）で切って終わりをフェード → 32kHz・16bit・モノラルの WAV。

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MPEGDecoder } from 'mpg123-decoder';
import { OggOpusDecoder } from 'ogg-opus-decoder';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CAND_DIR = join(ROOT, 'refs', 'sfx');
const OUT_DIR = join(ROOT, 'src', 'assets', 'sfx');
const PICKS_FILE = join(ROOT, 'scripts', 'sfx-picks.json');
const OUT_RATE = 32000;

// 生成に使った指示文（記録）。どれも末尾に共通の SUFFIX を付けた。
export const SUFFIX = ', medieval fantasy strategy mobile game sound effect, clean, no music';
export const PROMPTS = {
  tap: 'tiny soft wooden UI button tap, short click',
  select: 'picking up a playing card from a wooden table, quick paper card flick, very short',
  cardBuff: 'playing a helpful magic card, bright warm sparkle whoosh with a soft chime, positive',
  cardAttack: 'playing a sneaky attack card, dark quick whoosh ending in a low punchy hit',
  chain: 'heavy iron chains wrapping tight and a padlock clicking shut',
  shield: 'knight raising a metal shield, single bright clang with short ring',
  horn: 'short medieval herald trumpet call, two proud notes',
  build: 'medieval building constructed, heavy stone and wood thud landing with a small hammer tap and settling dust, satisfying',
  coin: 'gold coins clinking into a pouch, a few bright short coin clinks',
  coinBig: 'pouring a big handful of gold coins onto a treasure pile, rich cheerful jingle with sparkle',
  coinLose: 'gold coins slipping out of a torn pouch and falling away, descending jingle, slightly sad',
  reject: 'soft muted wooden error knock, two low gentle taps',
  endTurn: 'turning a parchment page, soft paper whoosh',
  yourTurn: 'single bright small bell ding announcing your turn',
  win: 'victory fanfare, short triumphant medieval brass with drums',
  lose: 'defeat jingle, short sad descending brass, gentle',
};

/** 目標の長さ（ms）・打音の数・最大長（ms）。src/ui/sound.ts の SAMPLE_MAX_MS と sfx-preview.ts の TARGET もそろえる。 */
export const TARGET = {
  tap: { ms: 150, hits: 1, max: 220 },
  select: { ms: 200, hits: 1, max: 300 },
  cardBuff: { ms: 900, hits: 1, max: 1200 },
  cardAttack: { ms: 700, hits: 2, max: 900 },
  chain: { ms: 1000, hits: 3, max: 1300 },
  shield: { ms: 600, hits: 1, max: 900 },
  horn: { ms: 1000, hits: 2, max: 1400 },
  build: { ms: 900, hits: 2, max: 1200 },
  coin: { ms: 500, hits: 3, max: 700 },
  coinBig: { ms: 1200, hits: 5, max: 1600 },
  coinLose: { ms: 900, hits: 4, max: 1200 },
  reject: { ms: 400, hits: 2, max: 550 },
  endTurn: { ms: 450, hits: 1, max: 650 },
  yourTurn: { ms: 600, hits: 1, max: 900 },
  win: { ms: 2200, hits: 4, max: 2600 },
  lose: { ms: 2000, hits: 3, max: 2600 },
};

const CAND_RE = /^(\w+?)_(\d+)\.(mp3|ogg)$/;

function mono(channelData) {
  if (channelData.length === 1) return channelData[0];
  const out = new Float32Array(channelData[0].length);
  for (const ch of channelData) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channelData.length;
  return out;
}

/** マジックバイトで形式を見分ける。 */
function kindOf(bytes) {
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'ogg';
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'mp3';
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'mp3';
  return null;
}

let ogg = null;
let mp3 = null;
async function decode(file) {
  const bytes = new Uint8Array(readFileSync(file));
  const kind = kindOf(bytes);
  if (kind === 'ogg') {
    if (!ogg) {
      ogg = new OggOpusDecoder();
      await ogg.ready;
    } else await ogg.reset();
    return ogg.decodeFile(bytes);
  }
  if (kind === 'mp3') {
    if (!mp3) {
      mp3 = new MPEGDecoder();
      await mp3.ready;
    } else await mp3.reset();
    return mp3.decode(bytes);
  }
  throw new Error(`形式がわからない: ${file}`);
}

function measure(x, sr, t) {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const th = peak * 0.02;
  let s = 0;
  while (s < x.length && Math.abs(x[s]) < th) s++;
  let e = x.length;
  while (e > s && Math.abs(x[e - 1]) < th * 0.5) e--;
  const effMs = ((e - s) / sr) * 1000;
  const win = Math.floor(sr * 0.01);
  let hits = 0;
  let prev = 0;
  let quiet = 99;
  for (let i = s; i + win < e; i += win) {
    let sum = 0;
    for (let j = 0; j < win; j++) sum += x[i + j] * x[i + j];
    const rms = Math.sqrt(sum / win) / peak;
    if (rms > 0.18 && rms > prev * 2.2 && quiet >= 6) {
      hits++;
      quiet = 0;
    } else quiet++;
    prev = rms;
  }
  const score = Math.abs(Math.log(Math.max(30, effMs) / t.ms)) + 0.35 * Math.abs(hits - t.hits);
  return { peak, s, e, effMs, hits, score };
}

/** 切り詰め・正規化・フェード・リサンプル（簡単な低域通過つきの線形補間）。 */
function tidy(x, sr, m, maxMs) {
  const start = Math.max(0, m.s - Math.floor(sr * 0.004));
  const maxLen = Math.floor((sr * maxMs) / 1000);
  const cut = m.e - start > maxLen;
  const len = Math.min(m.e - start, maxLen);
  const y = new Float32Array(len);
  for (let i = 0; i < len; i++) y[i] = (x[start + i] / m.peak) * 0.9;
  const fade = Math.min(len, Math.floor(sr * (cut ? 0.12 : 0.015)));
  for (let i = 0; i < fade; i++) y[len - 1 - i] *= i / fade;
  // 44.1k / 48k → 32k。3 タップの平均で軽く高域を落としてから間引く
  const ratio = sr / OUT_RATE;
  const outLen = Math.floor(len / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const p = i * ratio;
    const k = Math.floor(p);
    const f = p - k;
    const a = (y[k - 1] ?? y[k]) * 0.25 + y[k] * 0.5 + (y[k + 1] ?? y[k]) * 0.25;
    const b = y[k] * 0.25 + (y[k + 1] ?? y[k]) * 0.5 + (y[k + 2] ?? y[k + 1] ?? y[k]) * 0.25;
    out[i] = a + (b - a) * f;
  }
  return out;
}

function wav(samples, rate) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return buf;
}

async function main() {
  const picks = existsSync(PICKS_FILE) ? JSON.parse(readFileSync(PICKS_FILE, 'utf8')) : {};
  for (const arg of process.argv.slice(2)) {
    const [name, n] = arg.split('=');
    if (!TARGET[name]) throw new Error(`知らない音: ${name}`);
    picks[name] = /^\d+$/.test(n) ? Number(n) : n;
  }
  writeFileSync(PICKS_FILE, JSON.stringify(picks, null, 2) + '\n');

  mkdirSync(OUT_DIR, { recursive: true });
  const files = existsSync(CAND_DIR) ? readdirSync(CAND_DIR).filter((f) => CAND_RE.test(f)) : [];
  let total = 0;
  console.log('音         候補: 長さms/打音 (★採用)');
  for (const name of Object.keys(TARGET)) {
    // 決め打ちに "tap_1" のように別の音の候補を書くと、それを使う（生成がうまくいかなかった音の代用）
    const alias = typeof picks[name] === 'string' ? picks[name] : null;
    const cands = alias
      ? files.filter((f) => f.startsWith(`${alias}.`))
      : files.filter((f) => CAND_RE.exec(f)[1] === name).sort();
    if (cands.length === 0) {
      console.log(`${name}: 候補なし`);
      continue;
    }
    const results = [];
    for (const f of cands) {
      const { channelData, sampleRate } = await decode(join(CAND_DIR, f));
      const x = mono(channelData);
      results.push({ n: Number(CAND_RE.exec(f)[2]), x, sr: sampleRate, m: measure(x, sampleRate, TARGET[name]) });
    }
    const best = alias
      ? results[0]
      : (picks[name] && results.find((r) => r.n === picks[name])) || results.reduce((a, b) => (b.m.score < a.m.score ? b : a));
    const out = wav(tidy(best.x, best.sr, best.m, TARGET[name].max), OUT_RATE);
    writeFileSync(join(OUT_DIR, `${name}.wav`), out);
    total += out.length;
    const line = results.map((r) => `${r.n === best.n ? '★' : ' '}${r.n}:${Math.round(r.m.effMs)}/${r.m.hits}`).join('  ');
    const outMs = Math.round(((out.length - 44) / 2 / OUT_RATE) * 1000);
    console.log(`${name.padEnd(10)} ${line}  → ${outMs}ms ${(out.length / 1024).toFixed(0)}KB${picks[name] ? '（決め打ち）' : ''}`);
  }
  ogg?.free();
  mp3?.free();
  console.log(`合計 ${(total / 1024).toFixed(0)}KB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
