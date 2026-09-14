// 所有色が盤面から十分離れているかを測る。常設。
//
//   npm run audit-contrast
//
// CLAUDE.md の基準: 盤面の色を寄せるときは相対輝度で 14% 以上離すこと。

import sharp from 'sharp';

const FIELD = 'src/assets/art/field.webp';

/** 所有者の土台の色。styles.css の --owner-* と手動で揃えている値なので、
 *  --owner-you / --owner-cpu を変えたらここも合わせて直すこと。 */
const OWNERS = [
  ['自分', '#2a72ba'],
  ['CPU', '#a8441a'],
];

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const luminance = ([r, g, b]) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

// 盤面を粗く刻んで、明るい側と暗い側の代表色を取る。
// removeAlpha() が無いとアルファ付き画像で 1px 4 バイトになり、
// 3 バイト固定の index がずれて無言で間違った色を拾う。
const raw = await sharp(FIELD).removeAlpha().resize(16, 16, { fit: 'cover' }).raw().toBuffer();
const px = [];
for (let i = 0; i < 256; i++) px.push([raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]]);
px.sort((a, b) => luminance(a) - luminance(b));
const spots = [
  ['盤面の暗い側', px[12]],
  ['盤面の平均', px[128]],
  ['盤面の明るい側', px[243]],
];

console.log('| 所有色 | 相手 | 輝度差 | 判定（14% 以上で合格） |');
console.log('|---|---|---|---|');
let ng = 0;
for (const [name, hex] of OWNERS) {
  const l = luminance(toRgb(hex));
  for (const [spotName, rgb] of spots) {
    const diff = Math.abs(l - luminance(rgb)) * 100;
    const ok = diff >= 14;
    if (!ok) ng++;
    console.log(
      `| ${name} ${hex} | ${spotName} | ${diff.toFixed(1)}% | ${ok ? '合格' : '**不合格**'} |`,
    );
  }
}
console.log('');
if (ng > 0) {
  console.log(`${ng} 件が基準を下回っている。土台に濃い縁を足すか、色を変えること。`);
} else {
  console.log('すべて基準を満たしている。');
}
