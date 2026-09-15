// refs/art/ の原寸素材を、盤面での実際の表示サイズまで縮めて webp にする。常設。
//
//   npm run optimize-art
//
// 手作業で縮めると再現できない（CLAUDE.md）。原寸の原本は refs/art/ に残したまま、
// src/assets/art/ 側だけを毎回この内容で作り直す。
//
// 建物 2 種（fortress・tradingHouse）は原寸の長辺がどちらも 1448px なので、
// 同じ「長辺 320px」を指定すれば同じ倍率で縮まる。倍率がずれると
// scripts/audit-art.mjs が出す面積比が狂い、src/ui/art.ts の scale が嘘になる。

import { existsSync } from 'node:fs';

import sharp from 'sharp';

// 生成 AI が出す透過素材は、輪郭に半透明の画素が帯状に残る。そこへ元の背景色が
// 混ざっているため、盤面に載せると赤や黄の縁として見える。
// α を急峻な直線で叩き、薄い画素を 0 に落として縁を削る。
// ALPHA_CUT より薄い画素は消え、それより濃い画素は一気に不透明へ寄る。
const ALPHA_GAIN = 3;
const ALPHA_CUT = 0.55;

/** 縁のフリンジを削った画像を返す。α を持たない素材には使わない。 */
async function withCleanEdges(input) {
  const meta = await sharp(input).metadata();
  const { width, height } = meta;
  const rgb = await sharp(input).removeAlpha().raw().toBuffer();
  const alpha = await sharp(input)
    .ensureAlpha()
    .extractChannel('alpha')
    .linear(ALPHA_GAIN, -ALPHA_GAIN * ALPHA_CUT * 255)
    .raw()
    .toBuffer();
  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}

const JOBS = [
  {
    label: '盤面 (field)',
    input: 'refs/art/field-user.png',
    output: 'src/assets/art/field.webp',
    longEdge: 1067,
    quality: 82,
    alpha: false,
  },
  {
    label: '城塞 (fortress)',
    input: 'refs/art/fortress-trial2.png',
    output: 'src/assets/art/buildings/fortress.webp',
    longEdge: 320,
    quality: 85,
    alpha: true,
  },
  {
    label: '商館 (tradingHouse)',
    input: 'refs/art/tradinghouse-trial.png',
    output: 'src/assets/art/buildings/tradingHouse.webp',
    longEdge: 320,
    quality: 85,
    alpha: true,
  },
  {
    label: '城壁 (wall)',
    input: 'refs/art/wall-trial.webp',
    output: 'src/assets/art/buildings/wall.webp',
    longEdge: 320,
    quality: 85,
    alpha: true,
  },
  {
    label: '工場 (factory)',
    input: 'refs/art/factory-trial.webp',
    output: 'src/assets/art/buildings/factory.webp',
    longEdge: 320,
    quality: 85,
    alpha: true,
  },
  {
    label: '街道 (road)',
    input: 'refs/art/road-trial.webp',
    output: 'src/assets/art/buildings/road.webp',
    longEdge: 320,
    quality: 85,
    alpha: true,
  },
  {
    label: '取引所 (exchange)',
    input: 'refs/art/exchange-trial.webp',
    output: 'src/assets/art/buildings/exchange.webp',
    longEdge: 320,
    quality: 85,
    alpha: true,
  },
  {
    label: '石切場 (quarry)',
    input: 'refs/art/quarry-trial.webp',
    output: 'src/assets/art/buildings/quarry.webp',
    longEdge: 320,
    quality: 85,
    alpha: true,
  },
  {
    label: '大聖堂 (cathedral)',
    input: 'refs/art/cathedral-trial.png',
    output: 'src/assets/art/buildings/cathedral.webp',
    longEdge: 320,
    quality: 85,
    alpha: true,
  },
];

const fmtKB = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;

console.log('| 素材 | 出力 | 画素数 | 容量 |');
console.log('|---|---|---|---|');

for (const job of JOBS) {
  if (!existsSync(job.input)) {
    console.error(`${job.input} が見つかりません。原寸素材は refs/art/ に置くこと。`);
    process.exit(1);
  }

  const source = job.alpha ? await withCleanEdges(job.input) : job.input;
  let pipeline = sharp(source).resize(job.longEdge, job.longEdge, {
    fit: 'inside',
    withoutEnlargement: true,
  });
  pipeline = job.alpha ? pipeline.ensureAlpha() : pipeline.removeAlpha();
  pipeline = pipeline.webp({ quality: job.quality });

  const info = await pipeline.toFile(job.output);
  console.log(
    `| ${job.label} | ${job.output} | ${info.width}x${info.height} | ${fmtKB(info.size)} |`,
  );
}

console.log('');
console.log('npm run audit-art で建物 2 種の倍率が変わっていないことを確認すること。');
