// 盤面の地（石畳）から、木の影のような青い斑を消す。常設。
//
//   node scripts/deshadow-field.mjs          # refs/art/field-deshadow.png と src/assets/art/field.webp を作り直す
//   node scripts/deshadow-field.mjs mask     # 影の濃さの推定を refs/crops/field-mask.png に書き出す（確認用）
//
// 手作業で塗らない（CLAUDE.md）。影は「日光が遮られて青い天空光だけになった部分」なので、
// 画素の明るさを  I_c = 反射率_c × 光_c(a)、光_c(a) = 日なた_c × (1 − a × (1 − s_c))  と置く。
//   a   … その画素がどれだけ影に入っているか（0 = 日なた、1 = 完全な影）
//   s_c … 完全な影での光の残り（チャンネルごと。実測の 影平均 ÷ 日なた平均）
// 反射率は石ごとに違うが、R/B の比をぼかせば石の色の差は均され、光の色だけが残る。
//   1. 暖かさ（R − B）で日なた・影の代表画素を選び、s_c と ln(R/B) の基準値を実測する
//   2. ぼかした ln(R/B) から a を逆算する（モデルの式を表引きで解く）
//   3. 画素ごとに 1 / (1 − a × (1 − s_c)) を掛けて日なたの光に戻す
// 掛け算で戻すので石の目地や欠けの模様はそのまま残り、半影（影の縁）も
// a が中間値になって同じ式で戻るので、縁に線が残らない。
//
// 原本は refs/art/field-user.png（ユーザー提供・1024×1536）。scripts/optimize-art.mjs の
// field ジョブは、このスクリプトの出力 refs/art/field-deshadow.png を入力にする。

import { mkdirSync } from 'node:fs';

import sharp from 'sharp';

const INPUT = 'refs/art/field-user.png';
const CLEAN = 'refs/art/field-deshadow.png';
const OUTPUT = 'src/assets/art/field.webp';
// optimize-art.mjs の field ジョブと同じ値。
const LONG_EDGE = 1067;
const QUALITY = 82;

// 代表画素を選ぶ暖かさ（R − B、広くぼかした値）のしきい値。
// 実測（31px 四方の平均）: 日なた +23〜+44 / 影 −30〜−35。
const LIT_MIN_WARM = 24;
const SHADOW_MAX_WARM = -24;
// ln(R/B) をぼかす半径。目地（暗い線、幅 3〜5px）で推定が揺れない大きさ。
const BLUR_SIGMA = 3;
// a がこれ未満は日なたの石の色のばらつきとみなして補正しない（滑らかに 0 へ落とす）。
const DEAD = 0.1;
// ln(R/B) を 8bit に詰めるときの倍率（ln 比 ±1.27 まで表せる）。
const Q_SCALE = 100;

const smooth = (t) => t * t * (3 - 2 * t);

async function blur1(buf, W, H, sigma) {
  return sharp(buf, { raw: { width: W, height: H, channels: 1 } })
    .blur(sigma)
    .extractChannel(0)
    .raw()
    .toBuffer();
}

async function main() {
  const wantMask = process.argv.includes('mask');
  const { data, info } = await sharp(INPUT).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const N = W * H;

  // 1. 代表画素の選別（広くぼかした暖かさ）と、ln(R/B) の準備
  const warm = Buffer.alloc(N);
  const q = Buffer.alloc(N);
  for (let i = 0; i < N; i++) {
    const r = data[i * 3];
    const b = data[i * 3 + 2];
    warm[i] = Math.max(0, Math.min(255, r - b + 128));
    q[i] = Math.max(0, Math.min(255, Math.round(Math.log((r + 1) / (b + 1)) * Q_SCALE + 128)));
  }
  const warmWide = await blur1(warm, W, H, 10);
  const qBlur = await blur1(q, W, H, BLUR_SIGMA);

  const pick = (test) => {
    const sum = [0, 0, 0];
    let qs = 0;
    let n = 0;
    for (let i = 0; i < N; i++) {
      if (!test(warmWide[i] - 128)) continue;
      for (let c = 0; c < 3; c++) sum[c] += data[i * 3 + c];
      qs += (qBlur[i] - 128) / Q_SCALE;
      n++;
    }
    return { mean: sum.map((v) => v / n), q: qs / n, n };
  };
  const lit = pick((w) => w >= LIT_MIN_WARM);
  const shadow = pick((w) => w <= SHADOW_MAX_WARM);
  const s = lit.mean.map((v, c) => shadow.mean[c] / v);
  const fmt = (a, d = 1) => a.map((v) => v.toFixed(d)).join(', ');
  console.log(`日なた ${lit.n} px: 平均 [${fmt(lit.mean)}] ln(R/B) ${lit.q.toFixed(3)}`);
  console.log(`影     ${shadow.n} px: 平均 [${fmt(shadow.mean)}] ln(R/B) ${shadow.q.toFixed(3)}`);
  console.log(`影での光の残り s = [${fmt(s, 3)}]`);

  // 2. ln(R/B) → a の表。q(a) = q_lit + ln(1 − a(1 − s_r)) − ln(1 − a(1 − s_b))
  //    a = 1 で実測の q_shadow に一致するよう、モデルの差分を実測の差分に合わせて伸縮する。
  const STEPS = 1000;
  const model = (a) => Math.log(1 - a * (1 - s[0])) - Math.log(1 - a * (1 - s[2]));
  const span = model(1);
  const table = Array.from({ length: STEPS + 1 }, (_, k) => lit.q + (model(k / STEPS) / span) * (shadow.q - lit.q));
  const solve = (qv) => {
    // table は単調減少（影ほど青い）。二分探索。
    if (qv >= table[0]) return 0;
    if (qv <= table[STEPS]) return 1;
    let lo = 0;
    let hi = STEPS;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (table[mid] > qv) lo = mid;
      else hi = mid;
    }
    return lo / STEPS;
  };

  // 3. 画素ごとに日なたの光へ戻す
  const out = Buffer.alloc(N * 3);
  const mask = wantMask ? Buffer.alloc(N) : null;
  for (let i = 0; i < N; i++) {
    let a = solve((qBlur[i] - 128) / Q_SCALE);
    a = a <= DEAD ? 0 : a < DEAD * 2 ? smooth((a - DEAD) / DEAD) * a : a;
    if (mask) mask[i] = Math.round(a * 255);
    for (let c = 0; c < 3; c++) {
      const gain = 1 / (1 - a * (1 - s[c]));
      out[i * 3 + c] = Math.max(0, Math.min(255, Math.round(data[i * 3 + c] * gain)));
    }
  }

  if (mask) {
    mkdirSync('refs/crops', { recursive: true });
    await sharp(mask, { raw: { width: W, height: H, channels: 1 } }).png().toFile('refs/crops/field-mask.png');
    console.log('refs/crops/field-mask.png');
  }

  const img = sharp(out, { raw: { width: W, height: H, channels: 3 } });
  await img.clone().png().toFile(CLEAN);
  const res = await img
    .clone()
    .resize(W > H ? { width: LONG_EDGE } : { height: LONG_EDGE })
    .webp({ quality: QUALITY })
    .toFile(OUTPUT);
  console.log(`${CLEAN}\n${OUTPUT} ${res.width}x${res.height} ${(res.size / 1024).toFixed(1)}KB`);

  // 確認: 影だった画素の、補正後の平均（日なたの平均に近いほど良い）
  const after = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < N; i++) {
    if (warmWide[i] - 128 > SHADOW_MAX_WARM) continue;
    for (let c = 0; c < 3; c++) after[c] += out[i * 3 + c];
    n++;
  }
  console.log(`補正後の影の平均 [${fmt(after.map((v) => v / n))}]（日なた [${fmt(lit.mean)}]）`);
}

main();
