// sfx.html の下半分: 層あり／なし・鳴らし分け・BGM を聴き比べ、BGM と効果音の音量差を測る（開発用）。
// ゲームと同じ sound.ts / bgm.ts を使うので、ここで聞こえる音がそのままゲームの音。

import { renderBgm, setBgmTension, startBgm, stopBgm, duckBgm, isBgmPlaying } from './bgm';
import {
  loadedSampleCount,
  measureSampleLevels,
  playAcquire,
  playBuild,
  playCoinGain,
  playSelect,
  playUiTap,
  playUpgrade,
  playUseCard,
  playWin,
  primeAudio,
  setLayersEnabled,
} from './sound';
import { BGM_BUS_DB, bgmGapOk } from './sound-plan';

const lab = document.getElementById('lab')!;
lab.innerHTML = `
<h1>層・鳴らし分け・BGM</h1>
<p>最初にどれかのボタンを押すと音が有効になる。層は「低いドン」「高いカチ」を合成で重ねたもの。</p>
<div class="lab-row"><b>層</b>
  <label><input type="checkbox" id="layers" checked> 層を重ねる</label>
  <button data-a="acquire">買収</button><button data-a="taxman">徴税官</button><button data-a="blockader">封鎖者</button>
  <button data-a="upgrade">アップグレード</button><button data-a="build">建設</button><button data-a="win">勝ち</button>
</div>
<div class="lab-row"><b>鳴らし分け</b>
  <button data-r="tap">タップ ×6</button><button data-r="select">選択 ×6</button><button data-r="coin">コイン ×6</button><button data-r="card">投資カード ×4</button>
</div>
<div class="lab-row"><b>BGM</b>
  <button id="bgm-start">流す</button><button id="bgm-stop">止める</button>
  <button id="bgm-calm">ふだん（残り 10）</button><button id="bgm-tense">終盤（残り 2）</button>
  <button data-a="acquire" data-duck="1">買収（ダッキング）</button><button data-a="upgrade" data-duck="1">Lv2（ダッキング）</button>
  <button id="bgm-finale">決着の鐘</button>
</div>
<div class="lab-row"><b>音量の測定</b><button id="measure">測る</button></div>
<pre id="levels"></pre>
`;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

lab.querySelector<HTMLInputElement>('#layers')!.addEventListener('change', (e) => {
  setLayersEnabled((e.target as HTMLInputElement).checked);
});

const ACTIONS: Record<string, () => void> = {
  acquire: playAcquire,
  taxman: () => playUseCard('taxman'),
  blockader: () => playUseCard('blockader'),
  upgrade: playUpgrade,
  build: playBuild,
  win: playWin,
};
for (const b of lab.querySelectorAll<HTMLButtonElement>('button[data-a]')) {
  b.addEventListener('click', () => {
    primeAudio();
    const a = b.dataset.a!;
    if (a === 'win' && isBgmPlaying()) return; // 勝ちは BGM を止めるので、BGM 中は鳴らさない
    ACTIONS[a]!();
  });
}

const REPEAT: Record<string, [() => void, number]> = {
  tap: [playUiTap, 6],
  select: [playSelect, 6],
  coin: [() => playCoinGain(3), 6],
  card: [() => playUseCard('banker'), 4],
};
for (const b of lab.querySelectorAll<HTMLButtonElement>('button[data-r]')) {
  b.addEventListener('click', async () => {
    primeAudio();
    const [fn, n] = REPEAT[b.dataset.r!]!;
    for (let i = 0; i < n; i++) {
      fn();
      await wait(450);
    }
  });
}

lab.querySelector('#bgm-start')!.addEventListener('click', () => {
  primeAudio();
  startBgm(10);
});
lab.querySelector('#bgm-stop')!.addEventListener('click', () => stopBgm(0.6));
lab.querySelector('#bgm-calm')!.addEventListener('click', () => setBgmTension(10));
lab.querySelector('#bgm-tense')!.addEventListener('click', () => setBgmTension(2));
lab.querySelector('#bgm-finale')!.addEventListener('click', () => duckBgm('finale'));

function rmsDb(buf: AudioBuffer): number {
  const ch = buf.getChannelData(0);
  let sum = 0;
  for (let i = 0; i < ch.length; i++) sum += ch[i]! * ch[i]!;
  return 20 * Math.log10(Math.sqrt(sum / ch.length));
}

function peakDb(buf: AudioBuffer): number {
  const ch = buf.getChannelData(0);
  let p = 0;
  for (let i = 0; i < ch.length; i++) p = Math.max(p, Math.abs(ch[i]!));
  return 20 * Math.log10(p);
}

export interface LevelReport {
  sfx: Record<string, { rmsDb: number; peakDb: number }>;
  /** ゲーム中によく鳴る効果音（カード・建設・コイン）の実効音量の平均（dB）。 */
  sfxMainDb: number;
  bgmCalmDb: number;
  bgmTenseDb: number;
  bgmPeakDb: number;
  gapCalmDb: number;
  gapTenseDb: number;
  ok: boolean;
}

/** 効果音（読み込んだ音 × 音ごとの音量）と BGM（8 小節を書き出したもの）の実効音量を比べる。 */
export async function measureLevels(): Promise<LevelReport> {
  primeAudio();
  for (let i = 0; i < 50 && loadedSampleCount() < 16; i++) await wait(100);
  const sfx = measureSampleLevels();
  const main = ['cardBuff', 'cardAttack', 'chain', 'shield', 'horn', 'build', 'coin', 'coinBig'].filter((n) => sfx[n]);
  // dB の平均ではなく、エネルギーの平均を dB に戻す
  const energy = main.reduce((s, n) => s + Math.pow(10, sfx[n]!.rmsDb / 10), 0) / Math.max(1, main.length);
  const sfxMainDb = 10 * Math.log10(energy);
  const calm = await renderBgm(8, 10);
  const tense = await renderBgm(8, 2);
  const bgmCalmDb = rmsDb(calm);
  const bgmTenseDb = rmsDb(tense);
  const report: LevelReport = {
    sfx,
    sfxMainDb,
    bgmCalmDb,
    bgmTenseDb,
    bgmPeakDb: Math.max(peakDb(calm), peakDb(tense)),
    gapCalmDb: sfxMainDb - bgmCalmDb,
    gapTenseDb: sfxMainDb - bgmTenseDb,
    ok: bgmGapOk(sfxMainDb, bgmCalmDb) && bgmGapOk(sfxMainDb, bgmTenseDb),
  };
  return report;
}

(window as unknown as { __measureLevels: typeof measureLevels }).__measureLevels = measureLevels;

lab.querySelector('#measure')!.addEventListener('click', async () => {
  const r = await measureLevels();
  const lines = Object.entries(r.sfx)
    .sort()
    .map(([n, v]) => `${n.padEnd(11)} RMS ${v.rmsDb.toFixed(1)}dB  ピーク ${v.peakDb.toFixed(1)}dB`);
  lines.push(
    '',
    `効果音（カード・建設・コイン）の平均 ${r.sfxMainDb.toFixed(1)}dB`,
    `BGM ふだん ${r.bgmCalmDb.toFixed(1)}dB / 終盤 ${r.bgmTenseDb.toFixed(1)}dB（バス ${BGM_BUS_DB}dB 込み）、ピーク ${r.bgmPeakDb.toFixed(1)}dB`,
    `差 ふだん ${r.gapCalmDb.toFixed(1)}dB / 終盤 ${r.gapTenseDb.toFixed(1)}dB → ${r.ok ? '基準内（6〜12dB）' : '基準外'}`,
  );
  lab.querySelector('#levels')!.textContent = lines.join('\n');
});
