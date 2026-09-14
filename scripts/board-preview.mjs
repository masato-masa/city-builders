// 盤面の背景に建物を重ねて、実機の大きさで見るための確認ツール。常設。
//
//   node scripts/board-preview.mjs
//
// 素材が揃う前でも、置き場所と大きさの当たりを付けられるようにしておく。
// 出力は refs/art/_board-preview.png（git 管理外）。

import { existsSync } from 'node:fs';

import sharp from 'sharp';

// 画面 393 CSS 幅のうち、盤面に割く領域。二倍解像度で作る。
const W = 786;
const H = 1048;

const FIELD = 'refs/art/field-trial.png';
const BUILDINGS = [
  'refs/art/fortress-trial2.png',
  'refs/art/tradinghouse-trial.png',
];

/** 区画の位置。横三 / 四 / 三の千鳥。値は盤面に対する割合。 */
const PLOTS = [
  { x: 0.16, y: 0.12 },
  { x: 0.5, y: 0.08 },
  { x: 0.84, y: 0.12 },
  { x: 0.11, y: 0.4 },
  { x: 0.37, y: 0.36 },
  { x: 0.63, y: 0.36 },
  { x: 0.89, y: 0.4 },
  { x: 0.16, y: 0.68 },
  { x: 0.5, y: 0.64 },
  { x: 0.84, y: 0.68 },
];

/** 建物 1 棟の幅（盤面幅に対する割合）。 */
const PLOT_W = 0.17;

if (!existsSync(FIELD)) {
  console.error(`${FIELD} がありません。盤面の背景を先に用意してください。`);
  process.exit(1);
}
for (const b of BUILDINGS) {
  if (!existsSync(b)) {
    console.error(`${b} がありません。`);
    process.exit(1);
  }
}

const base = sharp(FIELD).resize({ width: W, height: H, fit: 'cover' });
const bw = Math.round(W * PLOT_W);

// 種類ごとに 1 度だけ縮小して使い回す
const sprites = [];
for (const path of BUILDINGS) {
  const buf = await sharp(path).resize({ width: bw }).png().toBuffer();
  const { height } = await sharp(buf).metadata();
  sprites.push({ buf, height });
}

// 建物は区画の「足元」を基準に置く。上へ伸びる。
const layers = PLOTS.map(({ x, y }, i) => {
  const s = sprites[i % sprites.length];
  return {
    input: s.buf,
    left: Math.round(W * x - bw / 2),
    top: Math.round(H * y - s.height / 2),
  };
});

await base.composite(layers).png().toFile('refs/art/_board-preview.png');
console.log('refs/art/_board-preview.png を書き出しました');
console.log(`盤面 ${W}x${H}（CSS ${W / 2}x${H / 2}） / 建物の幅 ${bw}（CSS ${bw / 2}）`);
