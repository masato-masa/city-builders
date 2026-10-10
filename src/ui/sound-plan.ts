// 音の「判定」だけを集めた純粋関数（WebAudio に触らない。テストできるように sound.ts / bgm.ts から切り出した）。
//
// - 層: 衝撃の大きい動作に、生成した音 1 本の上へ合成の「低いドン」「高いカチ」を重ねる（standards §2 の 3 層）
// - 変化: 繰り返し鳴る音を、再生時の音程・フィルタ・開始位置で 3〜5 通りに鳴らし分ける（ファイルは増やさない）
// - 間引き: 直前の音から近すぎる音を落とす
// - BGM: 和音進行・緊張度・ダッキング（山場で一拍だけ引く）
// - 音量: 効果音と BGM の差（-6〜-12dB）

// ---------------------------------------------------------------------------
// dB

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  return gain <= 0 ? -Infinity : 20 * Math.log10(gain);
}

// ---------------------------------------------------------------------------
// 層

/** 合成で重ねる層の種類。
 *  thump = 低いサインのスイープ（重さ）、rumble = 低域に絞ったノイズの塊（土ぼこり・衝突）、
 *  click = ごく短い高域のノイズ（輪郭）。 */
export type LayerKind = 'thump' | 'rumble' | 'click';

export interface LayerSpec {
  kind: LayerKind;
  /** 始まりの高さ（Hz）。rumble・click ではフィルタの中心。 */
  freq: number;
  /** 終わりの高さ（thump のみ。下へ落ちるスイープ）。 */
  freqEnd?: number;
  /** 長さ（秒）。速い立ち上がり・短い余韻にするため 0.25 秒以下。 */
  dur: number;
  /** 音量（効果音バスの中での値）。 */
  gain: number;
  /** サンプルの頭からのずれ（秒）。 */
  at: number;
}

/** 層を重ねる動作。 */
export type ImpactAction = 'acquire' | 'taxman' | 'blockader' | 'upgrade' | 'build' | 'win';

/** 動作ごとの層。生成した音（本体＝中域）の上に重ねる。
 *  音量は、生成した音の実効音量（-20〜-24dB）に対して「下支え」になる程度に抑えてある。 */
export const LAYERS: Record<ImpactAction, LayerSpec[]> = {
  // 買収: 一撃の輪郭と、奪い取る重さ。いちばん重い
  acquire: [
    { kind: 'click', freq: 4200, dur: 0.018, gain: 0.22, at: 0 },
    { kind: 'thump', freq: 120, freqEnd: 42, dur: 0.24, gain: 0.55, at: 0.004 },
    { kind: 'rumble', freq: 260, dur: 0.12, gain: 0.16, at: 0.01 },
  ],
  // 徴税官: 叩きつける一撃（買収より軽い）
  taxman: [
    { kind: 'click', freq: 3600, dur: 0.016, gain: 0.18, at: 0 },
    { kind: 'thump', freq: 105, freqEnd: 50, dur: 0.18, gain: 0.42, at: 0.004 },
  ],
  // 封鎖者: 鎖が落ちて止まる、低いノイズの衝突
  blockader: [
    { kind: 'click', freq: 2800, dur: 0.02, gain: 0.16, at: 0 },
    { kind: 'rumble', freq: 180, dur: 0.16, gain: 0.24, at: 0.006 },
    { kind: 'thump', freq: 90, freqEnd: 45, dur: 0.16, gain: 0.32, at: 0.01 },
  ],
  // アップグレード: 据わる重さは軽め、きらめきの輪郭を強めに
  upgrade: [
    { kind: 'thump', freq: 140, freqEnd: 70, dur: 0.16, gain: 0.34, at: 0 },
    { kind: 'click', freq: 6000, dur: 0.014, gain: 0.16, at: 0.002 },
    { kind: 'click', freq: 7500, dur: 0.012, gain: 0.1, at: 0.085 },
  ],
  // 建設: 石と木が据わる。ドンと土ぼこり
  build: [
    { kind: 'thump', freq: 110, freqEnd: 48, dur: 0.2, gain: 0.45, at: 0 },
    { kind: 'rumble', freq: 320, dur: 0.1, gain: 0.14, at: 0.004 },
    { kind: 'click', freq: 3200, dur: 0.012, gain: 0.1, at: 0 },
  ],
  // 勝ち: ファンファーレの頭に深いドン（重さだけ。輪郭は音源のラッパにある）
  win: [{ kind: 'thump', freq: 80, freqEnd: 36, dur: 0.25, gain: 0.5, at: 0 }],
};

export function layersFor(action: ImpactAction): LayerSpec[] {
  return LAYERS[action];
}

/** 層ごとのゆらぎ。音程 ±6%、音量 ±12%、開始 0〜6ms 遅らせる。
 *  rand は [0,1) を返す関数（テストでは固定値を渡す）。 */
export function jitterLayer(spec: LayerSpec, rand: () => number): LayerSpec {
  const pitch = 1 + (rand() * 2 - 1) * 0.06;
  return {
    ...spec,
    freq: spec.freq * pitch,
    freqEnd: spec.freqEnd === undefined ? undefined : spec.freqEnd * pitch,
    gain: spec.gain * (0.88 + rand() * 0.24),
    at: spec.at + rand() * 0.006,
  };
}

// ---------------------------------------------------------------------------
// 変化（同じ音源から 3〜5 通り）

export interface Variant {
  /** 再生速度（＝音程）。 */
  rate: number;
  /** ローパスの周波数（null = 掛けない）。こもらせて別の材質に聞かせる。 */
  lowpassHz: number | null;
  /** 音源のどこから鳴らすか（ms）。打音の多い音（コイン）で粒の並びが変わる。 */
  offsetMs: number;
  /** 音量の倍率。 */
  gain: number;
}

/** 繰り返し鳴る音の鳴らし分け。1 番目は元のまま。
 *  タップ・選択は頭の打音を削らないよう開始位置はほぼ動かさず、音程とフィルタで変える。 */
export const VARIANTS: Record<string, Variant[]> = {
  tap: [
    { rate: 1, lowpassHz: null, offsetMs: 0, gain: 1 },
    { rate: 1.07, lowpassHz: 7000, offsetMs: 0, gain: 0.95 },
    { rate: 0.94, lowpassHz: null, offsetMs: 1, gain: 1 },
    { rate: 1.12, lowpassHz: 4800, offsetMs: 0, gain: 0.92 },
  ],
  select: [
    { rate: 1, lowpassHz: null, offsetMs: 0, gain: 1 },
    { rate: 1.05, lowpassHz: 6500, offsetMs: 0, gain: 0.96 },
    { rate: 0.95, lowpassHz: null, offsetMs: 2, gain: 1 },
    { rate: 1.1, lowpassHz: 5200, offsetMs: 0, gain: 0.94 },
  ],
  coin: [
    { rate: 1, lowpassHz: null, offsetMs: 0, gain: 1 },
    { rate: 1.06, lowpassHz: null, offsetMs: 25, gain: 0.95 },
    { rate: 0.95, lowpassHz: 6000, offsetMs: 0, gain: 1 },
    { rate: 1.1, lowpassHz: null, offsetMs: 45, gain: 0.9 },
    { rate: 0.98, lowpassHz: 4500, offsetMs: 15, gain: 1 },
  ],
  coinBig: [
    { rate: 1, lowpassHz: null, offsetMs: 0, gain: 1 },
    { rate: 1.05, lowpassHz: null, offsetMs: 40, gain: 0.95 },
    { rate: 0.96, lowpassHz: 6500, offsetMs: 0, gain: 1 },
  ],
  coinLose: [
    { rate: 1, lowpassHz: null, offsetMs: 0, gain: 1 },
    { rate: 0.95, lowpassHz: 5000, offsetMs: 0, gain: 1 },
    { rate: 1.05, lowpassHz: null, offsetMs: 30, gain: 0.95 },
  ],
  cardBuff: [
    { rate: 1, lowpassHz: null, offsetMs: 0, gain: 1 },
    { rate: 1.06, lowpassHz: null, offsetMs: 0, gain: 0.95 },
    { rate: 0.95, lowpassHz: 6000, offsetMs: 0, gain: 1 },
    { rate: 1.1, lowpassHz: 8000, offsetMs: 10, gain: 0.92 },
  ],
  cardAttack: [
    { rate: 1, lowpassHz: null, offsetMs: 0, gain: 1 },
    { rate: 0.94, lowpassHz: 5000, offsetMs: 0, gain: 1 },
    { rate: 1.06, lowpassHz: null, offsetMs: 0, gain: 0.95 },
  ],
  chain: [
    { rate: 1, lowpassHz: null, offsetMs: 0, gain: 1 },
    { rate: 0.95, lowpassHz: 5500, offsetMs: 0, gain: 1 },
    { rate: 1.05, lowpassHz: null, offsetMs: 20, gain: 0.95 },
  ],
  shield: [
    { rate: 1, lowpassHz: null, offsetMs: 0, gain: 1 },
    { rate: 1.05, lowpassHz: null, offsetMs: 0, gain: 0.95 },
    { rate: 0.95, lowpassHz: 6000, offsetMs: 0, gain: 1 },
  ],
  horn: [
    { rate: 1, lowpassHz: null, offsetMs: 0, gain: 1 },
    { rate: 1.04, lowpassHz: null, offsetMs: 0, gain: 0.95 },
    { rate: 0.96, lowpassHz: 5000, offsetMs: 0, gain: 1 },
  ],
  endTurn: [
    { rate: 1, lowpassHz: null, offsetMs: 0, gain: 1 },
    { rate: 1.06, lowpassHz: 6000, offsetMs: 0, gain: 0.95 },
    { rate: 0.94, lowpassHz: null, offsetMs: 0, gain: 1 },
  ],
};

/** 次に使う変化の番号。直前と同じ番号は選ばない（同じ音が 2 回続かない）。 */
export function nextVariantIndex(count: number, prev: number, rand: () => number): number {
  if (count <= 1) return 0;
  const pick = Math.floor(rand() * (count - 1)) % (count - 1);
  return pick >= prev && prev >= 0 ? pick + 1 : pick;
}

// ---------------------------------------------------------------------------
// 間引き

export const THROTTLE_MS = 60;

/** 直前の音から THROTTLE_MS 未満なら鳴らさない。force（勝敗・手番の合図）は必ず鳴らす。
 *  層は同じ呼び出しの中で鳴るので、ここには数えない（層が間引きを食わない）。 */
export function shouldPlay(now: number, lastPlayedAt: number, force: boolean): boolean {
  return force || now - lastPlayedAt >= THROTTLE_MS;
}

// ---------------------------------------------------------------------------
// 音量（バス）

/** 効果音バスの音量（dB）。 */
export const SFX_BUS_DB = 0;
/** BGM バスの音量（dB）。BGM の譜面は素の状態で効果音とほぼ同じ実効音量（RMS）に作り、
 *  このバスで下げる。効果音より -6〜-12dB（standards §2）の真ん中を狙って -9dB。
 *  実効音量の差は sfx.html の「音量の測定」で測る。 */
export const BGM_BUS_DB = -9;
/** BGM の譜面そのものの持ち上げ（dB）。譜面の素の実効音量が効果音より約 5dB 小さかったので、
 *  ここで足してからバスで -9dB 下げる。測定（sfx.html）: 効果音の平均 -20.7dB に対し BGM -29.5dB 前後。 */
export const BGM_SCORE_DB = 5;
/** ホーム（プレイ画面の外）で BGM を流すときの音量。いまは流さない。 */
export const BGM_HOME_DB = -Infinity;

/** BGM と効果音の音量差が基準（-6〜-12dB）に入っているか。 */
export function bgmGapOk(sfxDb: number, bgmDb: number): boolean {
  const gap = sfxDb - bgmDb;
  return gap >= 6 && gap <= 12;
}

// ---------------------------------------------------------------------------
// BGM

/** BGM の譜面: ヘ長調、4/4、8 小節のループ。和音は低い方から並べた MIDI 番号。
 *  F → Am7 → B♭ → C → Dm7 → B♭ → Gm7 → Csus4（最後の 2 拍で C に解決）。 */
export const BGM_BARS: { name: string; bass: number; chord: number[] }[] = [
  { name: 'F', bass: 41, chord: [60, 65, 69] },
  { name: 'Am7', bass: 45, chord: [60, 64, 67] },
  { name: 'B♭', bass: 46, chord: [62, 65, 70] },
  { name: 'C', bass: 48, chord: [60, 64, 67] },
  { name: 'Dm7', bass: 50, chord: [60, 65, 69] },
  { name: 'B♭', bass: 46, chord: [62, 65, 70] },
  { name: 'Gm7', bass: 43, chord: [62, 65, 70] },
  { name: 'Csus4', bass: 48, chord: [60, 65, 67] },
];

export const BGM_BEATS_PER_BAR = 4;

/** 8 分音符ごとの分散和音（和音の何番目を鳴らすか。null = 休み）。 */
export const ARP_PATTERN: (number | null)[] = [0, 2, 1, 2, null, 2, 1, 0];

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export interface BgmMood {
  bpm: number;
  /** BGM 全体に掛けるローパス（Hz）。開くほど明るく、張りつめる。 */
  cutoffHz: number;
  /** 刻み（シェイカー）を 8 分の裏だけ（1）か、8 分すべて（2）か。 */
  hatDensity: 1 | 2;
  tense: boolean;
}

/** 残り手番がこれ以下になったら少し緊張させる。 */
export const TENSE_TURNS = 3;

/** 残り手番から BGM の雰囲気を決める。普段は 92BPM・こもらせた穏やかな音、
 *  終盤（残り 3 手番以下）は 100BPM・ローパスを開き、刻みを倍にする。 */
export function bgmMood(turnsLeft: number): BgmMood {
  const tense = turnsLeft > 0 && turnsLeft <= TENSE_TURNS;
  return tense
    ? { bpm: 100, cutoffHz: 4200, hatDensity: 2, tense: true }
    : { bpm: 92, cutoffHz: 2200, hatDensity: 1, tense: false };
}

export function beatSeconds(bpm: number): number {
  return 60 / bpm;
}

/** 1 小節目からの和音（ループ）。 */
export function barAt(index: number): (typeof BGM_BARS)[number] {
  const n = BGM_BARS.length;
  return BGM_BARS[((index % n) + n) % n]!;
}

// ---------------------------------------------------------------------------
// ダッキング（山場で BGM を一拍引く）

export type DuckKind = 'acquire' | 'upgrade' | 'finale';

export interface DuckEnvelope {
  /** 下げる量（dB、負）。 */
  depthDb: number;
  attackMs: number;
  /** 下げたまま保つ長さ（＝一拍）。 */
  holdMs: number;
  releaseMs: number;
}

const DUCK_SHAPE: Record<DuckKind, { depthDb: number; beats: number; releaseMs: number }> = {
  acquire: { depthDb: -12, beats: 1, releaseMs: 500 },
  upgrade: { depthDb: -9, beats: 1, releaseMs: 450 },
  // 決着: 鐘の間は大きく引き、そのまま結果画面のファンファーレへ（playWin / playLose が止める）
  finale: { depthDb: -20, beats: 2, releaseMs: 900 },
};

/** 山場の種類と今のテンポから、BGM を下げる形を決める。保つ長さは拍に合わせる。 */
export function duckEnvelope(kind: DuckKind, bpm: number): DuckEnvelope {
  const s = DUCK_SHAPE[kind];
  return { depthDb: s.depthDb, attackMs: 25, holdMs: Math.round(beatSeconds(bpm) * 1000 * s.beats), releaseMs: s.releaseMs };
}

/** ダッキングが重なったら、深い方を残す（浅い方で戻ってしまわないように）。 */
export function mergeDuck(current: { untilMs: number; depthDb: number } | null, now: number, next: DuckEnvelope): { untilMs: number; depthDb: number } {
  const until = now + next.attackMs + next.holdMs;
  if (!current || current.untilMs <= now) return { untilMs: until, depthDb: next.depthDb };
  return { untilMs: Math.max(current.untilMs, until), depthDb: Math.min(current.depthDb, next.depthDb) };
}
