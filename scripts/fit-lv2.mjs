// Lv2 の絵（CB-5）を Lv1 の絵と同じキャンバス・同じ足元に収め直す。常設。
//
//   node scripts/fit-lv2.mjs watchtower
//
// ChatGPT は縦横比を守らず返すことがある（見張り塔は 1536x1024 → 1024x1536）。
// 表示倍率（src/ui/art.ts の scale）は Lv1 と共有しているので、CSS でずらさず、
// 絵の不透明部分を Lv1 と同じ高さに縮め、Lv1 と同じ足元・同じ左右中心に置いた画像を作り直す。
// 元の生成画像は refs/art/v2/lv2/<id>.raw.png に残す。

import { copyFileSync, existsSync } from 'node:fs';

import sharp from 'sharp';

async function bbox(path) {
  const img = sharp(path);
  const { width, height } = await img.metadata();
  const d = await img.ensureAlpha().raw().toBuffer();
  let x0 = width;
  let x1 = 0;
  let y0 = height;
  let y1 = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (d[(y * width + x) * 4 + 3] < 128) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { width, height, x0, x1, y0, y1 };
}

for (const id of process.argv.slice(2)) {
  const out = `refs/art/v2/lv2/${id}.png`;
  const raw = `refs/art/v2/lv2/${id}.raw.png`;
  if (!existsSync(raw)) copyFileSync(out, raw);
  const base = await bbox(`refs/art/v2/${id}.png`);
  const lv2 = await bbox(raw);
  const k = (base.y1 - base.y0 + 1) / (lv2.y1 - lv2.y0 + 1);
  const w = Math.round((lv2.x1 - lv2.x0 + 1) * k);
  const h = base.y1 - base.y0 + 1;
  const body = await sharp(raw)
    .extract({ left: lv2.x0, top: lv2.y0, width: lv2.x1 - lv2.x0 + 1, height: lv2.y1 - lv2.y0 + 1 })
    .resize(w, h)
    .png()
    .toBuffer();
  const cx = (base.x0 + base.x1) / 2;
  await sharp({ create: { width: base.width, height: base.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: body, left: Math.round(cx - w / 2), top: base.y0 }])
    .png()
    .toFile(out);
  console.log(`${id}: ${lv2.width}x${lv2.height} → ${base.width}x${base.height}（不透明部分 ${w}x${h}、Lv1 は ${base.x1 - base.x0 + 1}x${h}）`);
}
