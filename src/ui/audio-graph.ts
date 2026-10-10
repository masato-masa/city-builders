// 音の配線。AudioContext と、効果音・BGM の 2 本のバス、全体のコンプレッサー＋リミッター。
//
//   効果音 → sfxBus ─┐
//                    ├→ master → comp（ならす）→ limiter（割れ止め）→ destination
//   BGM → bgmFilter → bgmDuck → bgmBus ─┘
//
// AudioContext はページ読み込み時ではなく、最初のユーザー操作で作る（作れなければ何もしない）。

import { BGM_BUS_DB, dbToGain, SFX_BUS_DB } from './sound-plan';

export interface AudioGraph {
  ctx: AudioContext;
  sfxBus: GainNode;
  /** BGM の音量（設定・ホームかどうか）。 */
  bgmBus: GainNode;
  /** 山場で一拍下げる専用のゲイン。 */
  bgmDuck: GainNode;
  /** 残り手番で開け閉めするローパス。 */
  bgmFilter: BiquadFilterNode;
  master: GainNode;
  comp: DynamicsCompressorNode;
  limiter: DynamicsCompressorNode;
}

let graph: AudioGraph | null = null;
let unavailable = false;
const onCreate: ((g: AudioGraph) => void)[] = [];

/** グラフが作られたときに呼ぶ（音源の読み込みなど）。 */
export function whenGraphCreated(fn: (g: AudioGraph) => void): void {
  onCreate.push(fn);
  if (graph) fn(graph);
}

function build(ctx: AudioContext): AudioGraph {
  const master = ctx.createGain();
  master.gain.value = 1;
  // 全体をならす: -18dB を超えたぶんを 3:1 で抑える（大きい音が重なっても飛び出さない）
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 6;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.15;
  // 割れ止め: -2dB の上はほぼ通さない
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;

  const sfxBus = ctx.createGain();
  sfxBus.gain.value = dbToGain(SFX_BUS_DB);
  const bgmFilter = ctx.createBiquadFilter();
  bgmFilter.type = 'lowpass';
  bgmFilter.frequency.value = 2200;
  bgmFilter.Q.value = 0.5;
  const bgmDuck = ctx.createGain();
  bgmDuck.gain.value = 1;
  const bgmBus = ctx.createGain();
  bgmBus.gain.value = dbToGain(BGM_BUS_DB);

  sfxBus.connect(master);
  bgmFilter.connect(bgmDuck);
  bgmDuck.connect(bgmBus);
  bgmBus.connect(master);
  master.connect(comp);
  comp.connect(limiter);
  limiter.connect(ctx.destination);
  return { ctx, sfxBus, bgmBus, bgmDuck, bgmFilter, master, comp, limiter };
}

/** グラフを返す（無ければ作る）。止まっていたら再開を試みる。作れなければ null。 */
export function getGraph(): AudioGraph | null {
  if (unavailable) return null;
  if (graph) {
    if (graph.ctx.state === 'suspended') {
      graph.ctx.resume().catch(() => {
        // 再開できなくても致命的ではない
      });
    }
    return graph;
  }
  try {
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) {
      unavailable = true;
      return null;
    }
    graph = build(new Ctor());
    for (const fn of onCreate) fn(graph);
    if (import.meta.env.DEV) (window as unknown as { __cbAudio?: unknown }).__cbAudio = graph;
    return graph;
  } catch {
    unavailable = true;
    return null;
  }
}

/** 作られていればグラフを返す（作らない）。 */
export function peekGraph(): AudioGraph | null {
  return graph;
}
