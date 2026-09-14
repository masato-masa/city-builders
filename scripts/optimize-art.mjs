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
];

const fmtKB = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;

console.log('| 素材 | 出力 | 画素数 | 容量 |');
console.log('|---|---|---|---|');

for (const job of JOBS) {
  if (!existsSync(job.input)) {
    console.error(`${job.input} が見つかりません。原寸素材は refs/art/ に置くこと。`);
    process.exit(1);
  }

  let pipeline = sharp(job.input).resize(job.longEdge, job.longEdge, {
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
