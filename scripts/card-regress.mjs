// 手札カードの操作の回帰テスト（playwright）。札の枠の構造を変えるときは、先にこれを通してから変える。
//   使い方: npm run dev を起動しておき、  node scripts/card-regress.mjs [URL]
//   playwright-core は playwright-cli のものを使う（無ければ PLAYWRIGHT_CORE に場所を指定）。
// 確かめること: ①タップ → 案内が出る ②長押し → 説明が出る ③ドラッグ → 盤面へ落とすと札が使われる
//             ④ドラッグしてもページがスクロール・ズームしない ⑤札の押せる範囲が 44px 以上
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = process.env.PLAYWRIGHT_CORE ?? 'C:/Users/将斗/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core';
const { chromium } = require(core);
const url = process.argv[2] ?? 'http://localhost:5185/city-builders/?mute';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'OK ' : 'NG '} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByText('ふつう', { exact: false }).first().click();
await page.waitForSelector('.card-slot');
await page.waitForFunction(
  () => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('ターン終了'));
    return b && !b.disabled;
  },
  null,
  { timeout: 60000 },
);
// 手引きを閉じる
await page.mouse.click(195, 30);
await page.waitForTimeout(500);

const handNames = () => page.$$eval('[data-hand-card]', (els) => els.map((e) => e.getAttribute('data-hand-card')));
const box = async (i) => (await page.$$('[data-hand-card]'))[i].boundingBox();

// ⑤ 押せる範囲
const b0 = await box(0);
check('札の押せる範囲が 44px 以上', b0.width >= 44 && b0.height >= 44, `${Math.round(b0.width)}x${Math.round(b0.height)}`);

// ① タップ
const before = await handNames();
await page.mouse.click(b0.x + b0.width / 2, b0.y + b0.height / 2);
await page.waitForTimeout(400);
const hint = await page.$$eval('.hand-hint', (els) => els.map((e) => e.textContent.trim()).join('|'));
check('タップで案内（手札の上の吹き出し）が出る', hint.length > 0, hint.slice(0, 40));
check('タップでは札は使われない', JSON.stringify(await handNames()) === JSON.stringify(before));

// ② 長押し
await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
await page.mouse.down();
await page.waitForTimeout(700);
const peek = await page.evaluate(() => document.body.innerText.includes('次の Lv まで'));
await page.mouse.up();
check('長押しで札の説明（次の Lv まで）が出る', peek);
await page.waitForTimeout(400);

// ③ ドラッグ（盤面の中央へ）
const scrollBefore = await page.evaluate(() => [scrollX, scrollY, visualViewport.scale]);
let used = false;
for (let i = 0; i < 4 && !used; i++) {
  const b = await box(i);
  const names = await handNames();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  for (const dy of [-60, -200, -330, -380]) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + dy, { steps: 4 });
  const lifted = await page.$('.card-drag.is-lifted');
  if (i === 0) check('ドラッグで札が持ち上がる', !!lifted);
  await page.mouse.up();
  await page.waitForTimeout(900);
  // 対象選びが始まる札（伝令など）は、手札の別の札をタップして終える
  const target = await page.evaluate(() => document.body.innerText.includes('札をタップ'));
  if (target) {
    const bs = await page.$$('[data-hand-card]');
    const last = await bs[bs.length - 1].boundingBox();
    await page.mouse.click(last.x + last.width / 2, last.y + last.height / 2);
    await page.waitForTimeout(900);
  }
  const after = await handNames();
  if (JSON.stringify(after) !== JSON.stringify(names)) used = true;
}
check('ドラッグして盤面へ落とすと札が使われる（手札が替わる）', used);
const scrollAfter = await page.evaluate(() => [scrollX, scrollY, visualViewport.scale]);
check('ドラッグでページがスクロール・ズームしない', JSON.stringify(scrollBefore) === JSON.stringify(scrollAfter), JSON.stringify(scrollAfter));

await browser.close();
const ng = results.filter((r) => !r).length;
console.log(ng === 0 ? `\n全 ${results.length} 項目 OK` : `\n${ng} 項目 NG`);
process.exit(ng === 0 ? 0 : 1);
