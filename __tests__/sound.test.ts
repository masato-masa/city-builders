import { describe, expect, it } from 'vitest';

import {
  playBuild,
  playCoinGain,
  playDebtSink,
  playEndTurn,
  playLose,
  playReject,
  playSelect,
  playUseCard,
  playWin,
  primeAudio,
} from '@/ui/sound';

// jsdom には AudioContext が無いので、ここでの呼び出しはすべて「作れなかった」
// 経路を通る。それでも例外を投げずに黙って続行することを確かめる。
describe('効果音（AudioContext が無い環境）', () => {
  it('どの play* を呼んでも例外を投げない', () => {
    expect(() => primeAudio()).not.toThrow();
    expect(() => playSelect()).not.toThrow();
    expect(() => playUseCard('miner')).not.toThrow();
    expect(() => playUseCard('taxman')).not.toThrow();
    expect(() => playBuild()).not.toThrow();
    expect(() => playCoinGain(3)).not.toThrow();
    expect(() => playCoinGain(999)).not.toThrow();
    expect(() => playDebtSink()).not.toThrow();
    expect(() => playReject()).not.toThrow();
    expect(() => playEndTurn()).not.toThrow();
    expect(() => playWin()).not.toThrow();
    expect(() => playLose()).not.toThrow();
  });

  it('すべてのカード種で高さが定義されている（例外にならない）', () => {
    const cards = [
      'miner',
      'banker',
      'architect',
      'herald',
      'festival',
      'guard',
      'usurer',
      'spy',
      'taxman',
      'blockader',
    ] as const;
    for (const card of cards) {
      expect(() => playUseCard(card)).not.toThrow();
    }
  });
});
