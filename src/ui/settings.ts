// 効果音・振動の入切。localStorage に保存し、次に開いたときも保たれる。
// 既定はどちらも「入」。キーは既存の city-builders:progress / city-builders:balance と揃える。

const SOUND_KEY = 'city-builders:sound';
const HAPTICS_KEY = 'city-builders:haptics';

function readFlag(key: string): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return true;
    return raw === '1';
  } catch {
    return true;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // 保存できなくても遊べる
  }
}

// モジュール読み込み時ではなく、値が最初に要求されたタイミングで localStorage を読む。
// （テスト環境やサーバーサイドでも安全に import できるようにするため）
let soundEnabled: boolean | null = null;
let hapticsEnabled: boolean | null = null;

export function isSoundEnabled(): boolean {
  if (soundEnabled === null) soundEnabled = readFlag(SOUND_KEY);
  return soundEnabled;
}

export function isHapticsEnabled(): boolean {
  if (hapticsEnabled === null) hapticsEnabled = readFlag(HAPTICS_KEY);
  return hapticsEnabled;
}

export function setSoundEnabled(value: boolean): void {
  soundEnabled = value;
  writeFlag(SOUND_KEY, value);
}

export function setHapticsEnabled(value: boolean): void {
  hapticsEnabled = value;
  writeFlag(HAPTICS_KEY, value);
}

// BGM の入切。効果音を切っているときは BGM も鳴らない（効果音の設定が全体の音の入切を兼ねる）。
const BGM_KEY = 'city-builders:bgm';
let bgmEnabled: boolean | null = null;

export function isBgmEnabled(): boolean {
  if (bgmEnabled === null) bgmEnabled = readFlag(BGM_KEY);
  return bgmEnabled;
}

export function setBgmEnabled(value: boolean): void {
  bgmEnabled = value;
  writeFlag(BGM_KEY, value);
}

// 演出の速さ（設定の「早送り」）。既定は「ふつう」（読める速さ）。「はやい」は慣れた人向け。
export type Speed = 'normal' | 'fast';
const SPEED_KEY = 'city-builders:speed';
let speed: Speed | null = null;

export function getSpeed(): Speed {
  if (speed === null) {
    try {
      speed = localStorage.getItem(SPEED_KEY) === 'fast' ? 'fast' : 'normal';
    } catch {
      speed = 'normal';
    }
  }
  return speed;
}

export function setSpeed(value: Speed): void {
  speed = value;
  try {
    localStorage.setItem(SPEED_KEY, value);
  } catch {
    // 保存できなくても遊べる
  }
}
