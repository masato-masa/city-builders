import { describe, expect, it } from 'vitest';

import {
  BGM_BARS,
  BGM_BUS_DB,
  bgmGapOk,
  bgmMood,
  dbToGain,
  duckEnvelope,
  gainToDb,
  jitterLayer,
  LAYERS,
  layersFor,
  mergeDuck,
  nextVariantIndex,
  SFX_BUS_DB,
  shouldPlay,
  THROTTLE_MS,
  VARIANTS,
  type ImpactAction,
} from '@/ui/sound-plan';
import { refreshBgm, setBgmTension, startBgm, stopBgm, duckBgm } from '@/ui/bgm';
import { playAcquire, playBell, playUpgrade } from '@/ui/sound';

describe('層', () => {
  it('衝撃の大きい 6 動作に層がある', () => {
    const actions: ImpactAction[] = ['acquire', 'taxman', 'blockader', 'upgrade', 'build', 'win'];
    for (const a of actions) expect(layersFor(a).length).toBeGreaterThan(0);
  });

  it('買収は カチ・ドン・ノイズ の 3 層、いちばん重い', () => {
    expect(LAYERS.acquire.map((l) => l.kind).sort()).toEqual(['click', 'rumble', 'thump']);
    const heaviest = (a: ImpactAction) => Math.max(...LAYERS[a].filter((l) => l.kind === 'thump').map((l) => l.gain), 0);
    for (const a of ['taxman', 'blockader', 'upgrade', 'build', 'win'] as const) {
      expect(heaviest('acquire')).toBeGreaterThanOrEqual(heaviest(a));
    }
  });

  it('層は速い立ち上がり・短い余韻（0.25 秒以下、頭から 0.1 秒以内に始まる）', () => {
    for (const list of Object.values(LAYERS)) {
      for (const l of list) {
        expect(l.dur).toBeLessThanOrEqual(0.25);
        expect(l.at).toBeLessThanOrEqual(0.1);
        if (l.kind === 'thump') expect(l.freqEnd!).toBeLessThan(l.freq);
      }
    }
  });

  it('ゆらぎは小さい（音程 ±6%、音量 ±12%、開始のずれ 6ms 以内）', () => {
    const spec = LAYERS.build[0]!;
    for (const r of [0, 0.5, 0.999]) {
      const j = jitterLayer(spec, () => r);
      expect(j.freq / spec.freq).toBeGreaterThanOrEqual(0.94);
      expect(j.freq / spec.freq).toBeLessThanOrEqual(1.06);
      expect(j.gain / spec.gain).toBeGreaterThanOrEqual(0.88);
      expect(j.gain / spec.gain).toBeLessThanOrEqual(1.12);
      expect(j.at - spec.at).toBeGreaterThanOrEqual(0);
      expect(j.at - spec.at).toBeLessThanOrEqual(0.006);
      expect(j.freqEnd! / spec.freqEnd!).toBeCloseTo(j.freq / spec.freq, 6);
    }
  });
});

describe('変化', () => {
  it('繰り返し鳴る音は 3〜5 通り', () => {
    for (const name of ['tap', 'select', 'coin', 'coinBig', 'cardBuff', 'cardAttack']) {
      expect(VARIANTS[name]!.length).toBeGreaterThanOrEqual(3);
      expect(VARIANTS[name]!.length).toBeLessThanOrEqual(5);
    }
  });

  it('タップ・選択は頭の打音を削らない（開始のずれ 2ms 以内）', () => {
    for (const v of [...VARIANTS.tap!, ...VARIANTS.select!]) expect(v.offsetMs).toBeLessThanOrEqual(2);
  });

  it('同じ変化が 2 回続かず、すべての番号が出る', () => {
    const seen = new Set<number>();
    let prev = -1;
    for (let i = 0; i < 400; i++) {
      const x = (i * 0.6180339887) % 1;
      const n = nextVariantIndex(4, prev, () => x);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(4);
      expect(n).not.toBe(prev);
      seen.add(n);
      prev = n;
    }
    expect(seen.size).toBe(4);
    expect(nextVariantIndex(1, 0, () => 0.9)).toBe(0);
  });
});

describe('間引き', () => {
  it('60ms 未満は落とし、force は必ず通す', () => {
    expect(shouldPlay(1000 + THROTTLE_MS - 1, 1000, false)).toBe(false);
    expect(shouldPlay(1000 + THROTTLE_MS, 1000, false)).toBe(true);
    expect(shouldPlay(1001, 1000, true)).toBe(true);
  });
});

describe('音量', () => {
  it('dB の変換', () => {
    expect(dbToGain(0)).toBe(1);
    expect(gainToDb(dbToGain(-9))).toBeCloseTo(-9, 6);
    expect(gainToDb(0)).toBe(-Infinity);
  });

  it('BGM のバスは効果音より 6〜12dB 下', () => {
    expect(bgmGapOk(SFX_BUS_DB, BGM_BUS_DB)).toBe(true);
    expect(bgmGapOk(0, -5)).toBe(false);
    expect(bgmGapOk(0, -13)).toBe(false);
  });
});

describe('BGM', () => {
  it('8〜16 小節のループ', () => {
    expect(BGM_BARS.length).toBeGreaterThanOrEqual(8);
    expect(BGM_BARS.length).toBeLessThanOrEqual(16);
  });

  it('残り 3 手番以下で緊張（テンポを上げ、フィルタを開く）', () => {
    const calm = bgmMood(10);
    const tense = bgmMood(3);
    expect(calm.tense).toBe(false);
    expect(bgmMood(4).tense).toBe(false);
    expect(tense.tense).toBe(true);
    expect(bgmMood(1).tense).toBe(true);
    expect(tense.bpm).toBeGreaterThan(calm.bpm);
    expect(tense.cutoffHz).toBeGreaterThan(calm.cutoffHz);
    // 決着後（0）は緊張させない
    expect(bgmMood(0).tense).toBe(false);
  });

  it('ダッキングは一拍（買収・Lv2）、決着は 2 拍で深く', () => {
    const a = duckEnvelope('acquire', 92);
    expect(a.holdMs).toBe(Math.round(60000 / 92));
    expect(a.depthDb).toBeLessThan(0);
    const u = duckEnvelope('upgrade', 100);
    expect(u.holdMs).toBe(600);
    const f = duckEnvelope('finale', 92);
    expect(f.holdMs).toBe(Math.round((60000 / 92) * 2));
    expect(f.depthDb).toBeLessThan(a.depthDb);
  });

  it('ダッキングが重なったら、深い方と遅い終わりを残す', () => {
    const first = mergeDuck(null, 0, duckEnvelope('acquire', 92));
    const merged = mergeDuck(first, 100, duckEnvelope('upgrade', 92));
    expect(merged.depthDb).toBe(first.depthDb);
    expect(merged.untilMs).toBeGreaterThan(first.untilMs);
    // 終わったあとの新しいダッキングは前を引き継がない
    const later = mergeDuck(first, 99999, duckEnvelope('upgrade', 92));
    expect(later.depthDb).toBe(duckEnvelope('upgrade', 92).depthDb);
  });

  it('AudioContext が無い環境でも BGM の呼び出しは例外を投げない', () => {
    expect(() => startBgm(10)).not.toThrow();
    expect(() => setBgmTension(2)).not.toThrow();
    expect(() => duckBgm('acquire')).not.toThrow();
    expect(() => playAcquire()).not.toThrow();
    expect(() => playUpgrade()).not.toThrow();
    expect(() => playBell()).not.toThrow();
    expect(() => refreshBgm()).not.toThrow();
    expect(() => stopBgm()).not.toThrow();
  });
});
