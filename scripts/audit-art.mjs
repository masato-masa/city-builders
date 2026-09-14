// 建物の素材を測って、盤面での表示倍率（scale）の初期値を出す。常設。
//
//   npm run audit-art
//
// 幅を揃えると横長の建物が小さく見えるので、不透明部分の「面積」で揃える。
// 城塞を 1.0 として、面積が同じになる倍率を出す。

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';

const DIR = 'src/assets/art/buildings';

/** 不透明部分の外接矩形・面積・縦横比を測る。 */
async function measure(path) {
  const img = sharp(path);
  const { width, height } = await img.metadata();
  const d = await img.ensureAlpha().raw().toBuffer();
  let x0 = width;
  let x1 = 0;
  let y0 = height;
  let y1 = 0;
  let opaque = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (d[(y * width + x) * 4 + 3] < 200) continue;
      opaque++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  return { w, h, ratio: h / w, area: opaque * 4 };
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();
const rows = [];
for (const f of files) {
  rows.push({ name: f.replace('.png', ''), ...(await measure(join(DIR, f))) });
}

const base = rows.find((r) => r.name === 'fortress') ?? rows[0];
if (!base) {
  console.error(`${DIR} に素材がありません。`);
  process.exit(1);
}

console.log('| 素材 | 不透明部分 | 縦横比 | 面積比 | scale の初期値 |');
console.log('|---|---|---|---|---|');
for (const r of rows) {
  const areaRatio = r.area / base.area;
  // 面積を揃えるので、長さの倍率は平方根
  const scale = Math.sqrt(1 / areaRatio);
  console.log(
    `| ${r.name} | ${r.w}x${r.h} | 1 : ${r.ratio.toFixed(2)} | ${areaRatio.toFixed(2)} | ${scale.toFixed(2)} |`,
  );
}
console.log('');
console.log('城塞を 1.00 の基準にしている。盤面プレビューを見て微調整すること。');
