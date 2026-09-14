// 参考画面から色と寸法を「数値として」抜き出す。常設の調査ツール。
//
//   node scripts/extract-ref-colors.mjs crop  refs/image1.png 0 2000 1179 556
//   node scripts/extract-ref-colors.mjs pick  refs/image1.png 100,2300 200,2300
//   node scripts/extract-ref-colors.mjs scan  refs/image1.png row 2300
//   node scripts/extract-ref-colors.mjs scan  refs/image1.png col 590
//
// 目で見て似せると質感が決定的に劣る。必ずここを通して数値で持ってくること。
//
// 参考画面は 3 倍解像度（1179x2556）なので、CSS ピクセルは実測値 ÷ 3。

import { mkdirSync } from 'node:fs';
import { basename } from 'node:path';

import sharp from 'sharp';

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/** 相対輝度。色を寄せるときに 14% 以上離れているかを見るために使う。 */
const luminance = (r, g, b) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

async function raw(file) {
  const img = sharp(file);
  const { width, height } = await img.metadata();
  const data = await img.ensureAlpha().raw().toBuffer();
  const at = (x, y) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  return { width, height, at };
}

/** 画面の一部を切り出して見られるようにする。座標の当たりを付けるために使う。 */
async function crop(file, x, y, w, h) {
  mkdirSync('refs/crops', { recursive: true });
  const out = `refs/crops/${basename(file, '.png')}-${x}-${y}-${w}x${h}.png`;
  await sharp(file)
    .extract({ left: +x, top: +y, width: +w, height: +h })
    .resize({ width: Math.min(+w, 700) })
    .toFile(out);
  console.log(out);
}

/** 指定した座標の色を並べる。 */
async function pick(file, points) {
  const { at } = await raw(file);
  console.log('| 座標 (3x) | CSS px | 色 | 相対輝度 |');
  console.log('|---|---|---|---|');
  for (const p of points) {
    const [x, y] = p.split(',').map(Number);
    const [r, g, b] = at(x, y);
    const l = luminance(r, g, b);
    console.log(
      `| ${x},${y} | ${(x / 3).toFixed(1)},${(y / 3).toFixed(1)} | ${hex(r, g, b)} | ${l.toFixed(3)} |`,
    );
  }
}

/** 1 本の行／列を走査して、色が変わった位置を並べる。
 *  余白・枠線の太さ・要素の境目を数値で取るために使う。 */
async function scan(file, axis, index) {
  const { width, height, at } = await raw(file);
  const n = axis === 'row' ? width : height;
  const get = (i) => (axis === 'row' ? at(i, +index) : at(+index, i));
  const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 24;

  let start = 0;
  let cur = get(0);
  const runs = [];
  for (let i = 1; i < n; i++) {
    const c = get(i);
    if (!near(c, cur)) {
      runs.push({ start, end: i - 1, len: i - start, color: cur });
      start = i;
      cur = c;
    }
  }
  runs.push({ start, end: n - 1, len: n - start, color: cur });

  console.log(`${axis} ${index} / 全長 ${n}（3x）`);
  console.log('| 開始 | 終了 | 長さ(3x) | 長さ(CSS) | 色 |');
  console.log('|---|---|---|---|---|');
  for (const r of runs) {
    if (r.len < 3) continue;
    console.log(
      `| ${r.start} | ${r.end} | ${r.len} | ${(r.len / 3).toFixed(1)} | ${hex(...r.color)} |`,
    );
  }
}

const [mode, file, ...rest] = process.argv.slice(2);
if (mode === 'crop') await crop(file, ...rest);
else if (mode === 'pick') await pick(file, rest);
else if (mode === 'scan') await scan(file, rest[0], rest[1]);
else {
  console.error('mode は crop / pick / scan のいずれか');
  process.exit(1);
}
