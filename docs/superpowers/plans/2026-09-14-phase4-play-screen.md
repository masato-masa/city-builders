# Phase 4 プレイ画面の作り込み 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** プレイ画面を、盤面と素材を主役にした見た目に作り替える。ゲームのルールは一切変えない。

**Architecture:** `shared-ui` の `.play`（全要素を縦中央に寄せる）の中にこのゲーム専用の器 `.board-shell` を 1 枚入れ、その器が領域を占めて中で縦を配り直す。盤面は縦横比 3:4 の器で、10 区画を割合座標の `position: absolute` で置く。建物の素材は ESM import して Vite にハッシュ付き URL を作らせる（`BASE_URL` を手で書かない）。

**Tech Stack:** Vite 6 / React 19 / TypeScript 5.7 / Vitest 3 / sharp（素材の監査スクリプト）

**Spec:** `docs/superpowers/specs/2026-09-14-phase4-play-screen-design.md`

## Global Constraints

- 日本語で書く。UI の文言・コメント・コミットメッセージすべて日本語。UI に英単語を出さない
- **`src/game/` のルールを変えない。** 追加してよいのは派生値（純粋な読み取り関数）だけ
- **`src/ai/` を変更しない**
- **`src/ui/shared/` を編集しない。** `C:\claude\shared-ui\` からの生成物
- **レイアウトが操作で 1px も動かないこと。** これがこのプロジェクトの最優先事項。状態によって `height` `padding` `margin` `border` の太さを変えない。状態で変えてよいのは `color` `background` `opacity` `box-shadow` `transform` だけ
- 条件描画でボタンを出し入れしない。常に描画して `disabled` にする
- 数値リテラルをゲームロジックに書かない（`balance.ts` から読む）。UI の寸法はこの限りでない
- プレイ画面の 1 行目に置くのは戻る・タイトル・? の 3 つ。設定は Phase 5 で戻す
- `tsconfig.json` は `strict` / `noUncheckedIndexedAccess` / `noUnusedLocals` がすべて true。未使用の import が 1 つでもあるとビルドが落ちる
- 環境は Windows。日本語を含むファイルの作成は Write ツールを使う。bash heredoc を使わない。PowerShell では `&&` が使えない
- コミットメッセージ末尾に空行を挟んで `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` を付ける
- `git push` と `npm run deploy` は Task 9 まで実行しない

### 実測した参考値（`refs/measured.md`）

| 対象 | 値（CSS） |
|---|---|
| 手札のカード 1 枚 | 68 × 84（縦長、比 1 : 1.235） |
| カードの間隔 | 5 |
| コストバッジの直径 | 19 |

### 縦の配分（375×812）

| 要素 | 高さ |
|---|---|
| ヘッダー 1 行目 | 56 |
| ステータスバー | 30 |
| 相手エリア | 44 |
| **盤面** | **残り全部** |
| コインバー | 52 |
| 手札 | 112 |

---

## ファイル構成

```
src/
  vite-env.d.ts            新規。png の import を型として通す
  assets/art/
    field.png              盤面の地（ユーザー作成の石畳）
    buildings/
      fortress.png         城塞
      tradingHouse.png     商館
  ui/
    art.ts                 新規。素材の URL と表示倍率の対応表
    board-layout.ts        新規。区画の割合座標
    Board.tsx              新規。Market.tsx を置き換える
    Hand.tsx               作り替え（縦長カード＋コストバッジ）
    CoinBar.tsx            作り替え（街道・終了ボタンを内包）
    OpponentStrip.tsx      作り替え（物件数と VP）
    Game.tsx               骨格を .board-shell に
    styles.css             全面改訂
  game/
    selectors.ts           vpOfSlot を追加し、scoreOf をそれで書き直す
__tests__/
  board-layout.test.ts     新規
  art.test.ts              新規
  setup.test.ts            vpOfSlot の検査を追加
scripts/
  audit-art.mjs            新規。素材を測って scale の初期値を出す
```

**なぜこの分け方か。** `art.ts`（素材の対応表）と `board-layout.ts`（区画の座標）を
データとして切り出すと、素材が増えるたびに触るのは対応表 1 か所で済む。
`Board.tsx` は描画だけを持ち、どこに何を置くかは知らない。

> **仕様書からの逸脱が 1 点。** 仕様書は `Market.tsx` を改造すると読めるが、
> グリッドから絶対配置へ変わって中身が残らないので、`Board.tsx` として作り直し
> `Market.tsx` は削除する。

---

## Task 1: 素材の取り込みと監査ツール

**Files:**
- Create: `src/vite-env.d.ts`, `src/assets/art/field.png`, `src/assets/art/buildings/fortress.png`, `src/assets/art/buildings/tradingHouse.png`, `src/ui/art.ts`, `scripts/audit-art.mjs`
- Test: `__tests__/art.test.ts`

**Interfaces:**
- Consumes: `BuildingId`（`@/game/types`）
- Produces:
  - `FIELD_URL: string`
  - `interface BuildingArt { url: string; scale: number }`
  - `BUILDING_ART: Partial<Record<BuildingId, BuildingArt>>`
  - `npm run audit-art` が素材を測って表を出す

素材は `refs/art/` に試作がある。`refs/` は git 管理外なので、`src/assets/art/` へコピーして
リポジトリに入れる。

- [ ] **Step 1: 素材をコピーする**

```bash
mkdir -p src/assets/art/buildings
cp refs/art/field-user.png src/assets/art/field.png
cp refs/art/fortress-trial2.png src/assets/art/buildings/fortress.png
cp refs/art/tradinghouse-trial.png src/assets/art/buildings/tradingHouse.png
```

- [ ] **Step 2: png の import を型として通す**

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 3: 監査スクリプトを書く**

`scripts/audit-art.mjs`:

```js
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
```

`package.json` の `scripts` に 1 行足す（`simulate` の下）。

```json
    "audit-art": "node scripts/audit-art.mjs",
```

- [ ] **Step 4: 監査スクリプトを走らせて scale の初期値を得る**

Run: `npm run audit-art`
Expected: `fortress` と `tradingHouse` の 2 行が出て、それぞれの `scale` が出る

**出た値を次の Step でそのまま使う。** 城塞は必ず 1.00 になる。

- [ ] **Step 5: 失敗するテストを書く**

`__tests__/art.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { BUILDING_ART, FIELD_URL } from '@/ui/art';

describe('素材の対応表', () => {
  it('盤面の地の URL がある', () => {
    expect(FIELD_URL).toBeTruthy();
  });

  it('登録されている素材は、市場に出る物件のものだけ', () => {
    const inMarket = new Set(DEFAULT_BALANCE.market);
    for (const id of Object.keys(BUILDING_ART)) {
      expect(inMarket.has(id as never)).toBe(true);
    }
  });

  it('登録されている素材はすべて URL と正の倍率を持つ', () => {
    for (const [id, art] of Object.entries(BUILDING_ART)) {
      expect(art, id).toBeDefined();
      expect(art!.url, id).toBeTruthy();
      expect(art!.scale, id).toBeGreaterThan(0);
    }
  });

  it('まだ素材が無い物件があってよい（空き地で表示する）', () => {
    const done = Object.keys(BUILDING_ART).length;
    expect(done).toBeGreaterThan(0);
    expect(done).toBeLessThanOrEqual(new Set(DEFAULT_BALANCE.market).size);
  });
});
```

- [ ] **Step 6: テストが落ちることを確かめる**

Run: `npm test -- art`
Expected: FAIL（`@/ui/art` が解決できない）

- [ ] **Step 7: `src/ui/art.ts` を書く**

下の値は実測済み（城塞 面積 753556 / 商館 面積 801984 → 商館の倍率は √(753556/801984) = 0.97）。
Step 4 の出力がこれと違っていたら、**出力のほうを採用する**こと。

```ts
import type { BuildingId } from '@/game/types';

import fieldUrl from '@/assets/art/field.png';
import fortressUrl from '@/assets/art/buildings/fortress.png';
import tradingHouseUrl from '@/assets/art/buildings/tradingHouse.png';

/** 盤面の地。縦横比 1:1.5 なので、3:4 の枠に object-fit: cover で収める。 */
export const FIELD_URL: string = fieldUrl;

export interface BuildingArt {
  url: string;
  /** 区画の幅に対する表示倍率。幅ではなく面積で揃えるので、素材ごとに違う。
   *  初期値は npm run audit-art が出す。盤面を見て微調整してよい。 */
  scale: number;
}

/** まだ素材が無い物件は登録しない。Board はその区画を空き地として描く。 */
export const BUILDING_ART: Partial<Record<BuildingId, BuildingArt>> = {
  fortress: { url: fortressUrl, scale: 1 },
  tradingHouse: { url: tradingHouseUrl, scale: 0.97 },
};
```

- [ ] **Step 8: テストが通ることを確かめる**

Run: `npm test`
Expected: PASS（既存 82 件 ＋ 新規 4 件 ＝ 86 件）
Run: `npm run build`
Expected: 型エラー無し

- [ ] **Step 9: コミット**

```bash
git add -A
git commit -m "feat: 建物と盤面の素材を取り込み、監査スクリプトを追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: 区画の座標表

**Files:**
- Create: `src/ui/board-layout.ts`
- Test: `__tests__/board-layout.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `interface Plot { x: number; y: number }`
  - `PLOTS: readonly Plot[]`（長さ 10）
  - `PLOT_WIDTH: number`（区画 1 つの幅。盤面の幅に対する割合）

座標は盤面に対する割合。`balance.market` の配列順（index 0〜9）がそのまま区画 0〜9 に対応する。
横 3 / 4 / 3 の千鳥に置く。

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/board-layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { PLOTS, PLOT_WIDTH } from '@/ui/board-layout';

describe('区画の座標', () => {
  it('市場の件数と同じ数だけある', () => {
    expect(PLOTS).toHaveLength(DEFAULT_BALANCE.market.length);
  });

  it('すべて盤面の内側にある', () => {
    for (const [i, p] of PLOTS.entries()) {
      expect(p.x, `区画 ${i} の x`).toBeGreaterThan(PLOT_WIDTH / 2);
      expect(p.x, `区画 ${i} の x`).toBeLessThan(1 - PLOT_WIDTH / 2);
      expect(p.y, `区画 ${i} の y`).toBeGreaterThan(0);
      expect(p.y, `区画 ${i} の y`).toBeLessThan(1);
    }
  });

  it('どの二つも重ならない', () => {
    for (let i = 0; i < PLOTS.length; i++) {
      for (let j = i + 1; j < PLOTS.length; j++) {
        const a = PLOTS[i]!;
        const b = PLOTS[j]!;
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        // 横に近いときは、縦が十分離れていること
        const apart = dx >= PLOT_WIDTH || dy >= PLOT_WIDTH * 0.9;
        expect(apart, `区画 ${i} と ${j} が近すぎる`).toBe(true);
      }
    }
  });

  it('横 3 / 4 / 3 の三段になっている', () => {
    const rows = new Map<number, number>();
    for (const p of PLOTS) {
      const band = p.y < 0.3 ? 0 : p.y < 0.55 ? 1 : 2;
      rows.set(band, (rows.get(band) ?? 0) + 1);
    }
    expect(rows.get(0)).toBe(3);
    expect(rows.get(1)).toBe(4);
    expect(rows.get(2)).toBe(3);
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- board-layout`
Expected: FAIL（`@/ui/board-layout` が解決できない）

- [ ] **Step 3: `src/ui/board-layout.ts` を書く**

```ts
/** 区画 1 つの幅。盤面の幅に対する割合。 */
export const PLOT_WIDTH = 0.2;

export interface Plot {
  /** 盤面の幅に対する割合。区画の中心 */
  x: number;
  /** 盤面の高さに対する割合。区画の中心 */
  y: number;
}

/** 10 区画を横 3 / 4 / 3 の千鳥に置く。行を揃えないので一覧表に見えず、
 *  土地の見取り図になる。balance.market の配列順がそのままこの順に対応する。
 *
 *  上段の y は 0.13 より小さくしないこと。盤面は overflow: hidden なので、
 *  建物が区画の上へ伸びたときに屋根が切れる。城塞（比 1 : 1.05）で計算すると
 *  y = 0.10 では上端が盤面の外に出る。 */
export const PLOTS: readonly Plot[] = [
  { x: 0.18, y: 0.16 },
  { x: 0.5, y: 0.13 },
  { x: 0.82, y: 0.16 },
  { x: 0.12, y: 0.42 },
  { x: 0.38, y: 0.39 },
  { x: 0.62, y: 0.39 },
  { x: 0.88, y: 0.42 },
  { x: 0.18, y: 0.68 },
  { x: 0.5, y: 0.65 },
  { x: 0.82, y: 0.68 },
];
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test`
Expected: PASS（90 件）

- [ ] **Step 5: コミット**

```bash
git add src/ui/board-layout.ts __tests__/board-layout.test.ts
git commit -m "feat: 盤面の区画座標を追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: 区画ごとの VP を派生値として切り出す

**Files:**
- Modify: `src/game/selectors.ts`
- Test: `__tests__/setup.test.ts`

**Interfaces:**
- Consumes: `BuildingSlot` `GameState` `Balance`
- Produces: `vpOfSlot(state: GameState, slot: BuildingSlot, balance?: Balance): number`

盤面の区画に VP を出すのに必要。`scoreOf` が同じ計算を持っているので、
**`scoreOf` をこの関数で書き直して二重管理を避ける。** ルールは変えない。

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/setup.test.ts` の `describe('派生値')` の末尾に足す。
ファイル先頭の import に `vpOfSlot` を足すこと。

```ts
  it('区画ごとの VP を単体で取れる', () => {
    const g = createGame(5);
    const fortress = g.market.find((s) => s.buildingId === 'fortress')!;
    const cathedral = g.market.find((s) => s.buildingId === 'cathedral')!;
    const house = g.market.find((s) => s.buildingId === 'tradingHouse')!;
    fortress.owner = 'you';
    cathedral.owner = 'you';
    house.owner = 'you';

    expect(vpOfSlot(g, fortress)).toBe(DEFAULT_BALANCE.buildings.fortress.vp);
    // 大聖堂は「自分の他の物件 1 件につき +2」。他に 2 件あるので 4
    expect(vpOfSlot(g, cathedral)).toBe(2 * DEFAULT_BALANCE.cathedralVpPerBuilding);
  });

  it('未建設の区画は 0 VP', () => {
    const g = createGame(5);
    expect(vpOfSlot(g, g.market[0]!)).toBe(0);
  });

  it('scoreOf は区画ごとの VP の合計と一致する', () => {
    const g = createGame(5);
    g.market.forEach((s, i) => {
      s.owner = i % 2 === 0 ? 'you' : 'cpu';
    });
    const sum = g.market
      .filter((s) => s.owner === 'you')
      .reduce((n, s) => n + vpOfSlot(g, s), 0);
    expect(scoreOf(g, 'you')).toBe(sum);
  });
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- setup`
Expected: FAIL（`vpOfSlot` が export されていない）

- [ ] **Step 3: `selectors.ts` に `vpOfSlot` を足し、`scoreOf` を書き直す**

`scoreOf` の定義を丸ごと次に差し替える。

```ts
/** 区画 1 つが所有者にもたらす VP。未建設なら 0。
 *  大聖堂だけ「自分の他の物件 1 件につき +N」と条件付きで決まる。 */
export function vpOfSlot(
  state: GameState,
  slot: BuildingSlot,
  balance: Balance = DEFAULT_BALANCE,
): number {
  if (slot.owner === null) return 0;
  if (slot.buildingId === 'cathedral') {
    return (ownedSlots(state, slot.owner).length - 1) * balance.cathedralVpPerBuilding;
  }
  return balance.buildings[slot.buildingId].vp;
}

/** 終了時の VP。 */
export function scoreOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  return ownedSlots(state, player).reduce((n, slot) => n + vpOfSlot(state, slot, balance), 0);
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test`
Expected: PASS（93 件）。**既存の VP テストが 1 件も落ちないこと**
Run: `npm run typecheck`
Expected: エラー無し

- [ ] **Step 5: コミット**

```bash
git add src/game/selectors.ts __tests__/setup.test.ts
git commit -m "refactor: 区画ごとの VP を vpOfSlot に切り出す

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: 画面の骨格を作り替える

**Files:**
- Modify: `src/ui/Game.tsx`, `src/ui/styles.css`
- Test: 手動確認

**Interfaces:**
- Consumes: なし
- Produces: `.board-shell` が `.play` の中で領域を占め、縦を配り直す

このタスクでは**中身の見た目は変えない。** 骨格だけを差し替えて、
手札が画面下端に固定され、盤面が余った縦をもらう形にする。

- [ ] **Step 1: `styles.css` の先頭に骨格の CSS を足す**

既存の `:root` ブロックの**直後**に足す。既存のルールは消さない。

```css
/* shared-ui の .play は全要素をひと塊にして縦中央へ寄せる。
   パズルには正しいが、手札を下端に固定したいカードゲームには合わない。
   .play を直接編集できない（4 本共通の生成物）ので、中にこの器を 1 枚入れて
   領域を占めさせ、縦の配分はここで決める。 */
.board-shell {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* 盤面は余った縦を全部もらう。中で縦横比を保って収まる。 */
.board-area {
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 8px 0;
}
```

- [ ] **Step 2: `Game.tsx` の `<main className="play">` の中身を器で包む**

`<main className="play">` から `</main>` までを次に差し替える。
**中身のコンポーネントは今のまま。** 街道ボタンと終了ボタンの位置は Task 6 で動かす。

```tsx
      <main className="play">
        <div className="board-shell">
          <OpponentStrip state={state} />
          <div className="board-area">
            <Market
              state={state}
              balance={balance}
              onPick={(slotId) => setSheet({ kind: 'slot', slotId })}
            />
          </div>
          <CoinBar state={state} balance={balance} />
          <Hand
            state={state}
            balance={balance}
            canUse={(card) => canUseCard(state, card, balance)}
            onPick={(card) => setSheet({ kind: 'card', card })}
          />
          <button
            className="road-btn"
            onClick={() => setSheet({ kind: 'roadTarget' })}
            disabled={!roadAvailable}
          >
            街道で 1 枚流す
          </button>
          <button className="end-turn" onClick={endTurn} disabled={finished}>
            ターンを終える
          </button>
        </div>
      </main>
```

- [ ] **Step 3: ブラウザで確かめる**

Run: `npm run dev`

確認すること（終わったら dev サーバーを止める）:

1. **手札より下の空白が無くなり、下端に寄っている**
2. **盤面の上の空白が無くなっている**
3. 市場のマスがまだ小さいのは想定どおり（Task 5 で盤面に置き換える）

Run: `npm run build`
Expected: 型エラー無し
Run: `npm test`
Expected: 93 件

- [ ] **Step 4: コミット**

```bash
git add src/ui/Game.tsx src/ui/styles.css
git commit -m "fix: 画面の骨格を作り替え、手札を下端に固定する

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: 盤面

**Files:**
- Create: `src/ui/Board.tsx`
- Delete: `src/ui/Market.tsx`
- Modify: `src/ui/Game.tsx`, `src/ui/styles.css`
- Test: 手動確認

**Interfaces:**
- Consumes: `FIELD_URL` `BUILDING_ART`（Task 1）、`PLOTS` `PLOT_WIDTH`（Task 2）、`vpOfSlot`（Task 3）
- Produces: `<Board state balance onPick />`

- [ ] **Step 1: `src/ui/Board.tsx` を書く**

```tsx
import { BUILDING_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { buildCostFor } from '@/game/reducer';
import { vpOfSlot } from '@/game/selectors';
import type { GameState } from '@/game/types';

import { BUILDING_ART, FIELD_URL } from './art';
import { PLOTS, PLOT_WIDTH } from './board-layout';

export function Board({
  state,
  balance = DEFAULT_BALANCE,
  onPick,
}: {
  state: GameState;
  balance?: Balance;
  onPick: (slotId: number) => void;
}) {
  return (
    <div className="board">
      <img className="board-field" src={FIELD_URL} alt="" />
      {state.market.map((slot, i) => {
        const plot = PLOTS[i];
        if (!plot) return null;
        const owned = slot.owner !== null;
        // 封鎖中は建てられないので、押せない理由が見えるように沈める
        const blocked = !owned && state.players.you.blockedSlot === slot.slotId;
        const art = BUILDING_ART[slot.buildingId];
        return (
          <button
            key={slot.slotId}
            className={`plot${blocked ? ' is-blocked' : ''}`}
            style={{
              left: `${plot.x * 100}%`,
              top: `${plot.y * 100}%`,
              width: `${PLOT_WIDTH * 100}%`,
            }}
            onClick={() => onPick(slot.slotId)}
          >
            {owned ? <span className={`plot-base owner-${slot.owner}`} /> : null}
            {owned && art ? (
              <img
                className="plot-art"
                src={art.url}
                alt=""
                style={{ width: `${art.scale * 100}%` }}
              />
            ) : (
              <span className={owned ? 'plot-noart' : 'plot-empty'}>
                {BUILDING_NAMES[slot.buildingId]}
              </span>
            )}
            <span className={owned ? 'plot-vp' : 'plot-cost'}>
              {owned
                ? `${vpOfSlot(state, slot, balance)} VP`
                : buildCostFor(state, 'you', slot.slotId, balance)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: `styles.css` の `.market` `.slot` 系のルールを盤面のものに差し替える**

`.market` `.slot` `.slot.owned-you` `.slot.owned-cpu` `.slot.is-blocked` の
5 つのルールを削除し、次に差し替える。

```css
/* 盤面。縦横比を固定した器の中に、区画を割合で絶対配置する。
   建っても壊れてもレイアウトは 1px も動かない。 */
.board {
  position: relative;
  aspect-ratio: 3 / 4;
  max-width: 100%;
  max-height: 100%;
  border-radius: var(--card-radius);
  overflow: hidden;
}

.board-field {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  -webkit-user-drag: none;
}

/* 区画。中心を座標に合わせる。高さは幅と同じで、建物はここから上へ伸びる。 */
.plot {
  position: absolute;
  transform: translate(-50%, -50%);
  aspect-ratio: 1 / 1;
  min-width: 0;
  min-height: 0;
  padding: 0;
  border: none;
  background: none;
  display: grid;
  place-items: center;
}

.plot.is-blocked {
  opacity: 0.4;
}

/* 所有者の土台。建物そのものには色を被せない（素材が濁るため）。 */
.plot-base {
  position: absolute;
  left: 50%;
  bottom: 6%;
  transform: translateX(-50%);
  width: 78%;
  height: 26%;
  border-radius: 50%;
  border: 2px solid rgb(0 0 0 / 0.35);
}

.plot-base.owner-you {
  background: var(--owner-you);
}

.plot-base.owner-cpu {
  background: var(--owner-cpu);
}

/* 建物の素材。足元を基準に置き、上へ伸びる。 */
.plot-art {
  position: absolute;
  left: 50%;
  bottom: 12%;
  transform: translateX(-50%);
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}

/* 空き地。まだ建っていない区画 */
.plot-empty,
.plot-noart {
  position: absolute;
  left: 50%;
  top: 42%;
  transform: translate(-50%, -50%);
  padding: 3px 6px;
  border-radius: 6px;
  background: rgb(0 0 0 / 0.45);
  color: #f2ece0;
  font-size: 10px;
  white-space: nowrap;
}

/* 建設費。空き地に金色で出る */
.plot-cost {
  position: absolute;
  left: 50%;
  bottom: -4%;
  transform: translateX(-50%);
  min-width: 24px;
  padding: 2px 6px;
  border-radius: 10px;
  background: var(--coin);
  color: var(--coin-ink);
  font-size: 12px;
  font-weight: 600;
}

/* VP。建った区画で、建設費と同じ場所に出る */
.plot-vp {
  position: absolute;
  left: 50%;
  bottom: -4%;
  transform: translateX(-50%);
  min-width: 24px;
  padding: 2px 6px;
  border-radius: 10px;
  background: rgb(0 0 0 / 0.6);
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
```

既存の `:root` ブロック（`--owner-*` の 4 つだけを持つもの）を丸ごと次に差し替える。
**Task 6・7 の CSS がこれらの変数を参照するので、ここで全部そろえておく。**

```css
/* このゲーム専用の色域。盤面の色は共通化しない（CLAUDE.md）。
   ヘッダー・シート・ホームは shared-ui のまま。
   盤面が暖色（平均 #9e965c）なので、UI の地は寒色で暗くして離す。 */
:root {
  --chrome: #1e2a33;
  --chrome-2: #16202a;
  --chrome-ink: #e8eef3;
  --chrome-ink-dim: #93a6b4;

  --card-face: #2b3d4a;
  --card-edge: #5d7a8c;

  --coin: #ffc83d;
  --coin-ink: #4a3300;

  --owner-you: #2f7fd0;
  --owner-you-ink: #04203f;
  --owner-cpu: #d2622a;
  --owner-cpu-ink: #3a1608;
}
```

- [ ] **Step 3: `Game.tsx` を Board に差し替える**

import の `Market` を `Board` にし、`<Market ... />` を `<Board ... />` にする。

```tsx
import { Board } from './Board';
```

```tsx
          <div className="board-area">
            <Board
              state={state}
              balance={balance}
              onPick={(slotId) => setSheet({ kind: 'slot', slotId })}
            />
          </div>
```

- [ ] **Step 4: `Market.tsx` を削除する**

```bash
git rm src/ui/Market.tsx
```

- [ ] **Step 5: ブラウザで確かめる**

Run: `npm run dev`

確認すること（終わったら止める）:

1. 石畳の盤面が出て、10 区画に物件名とコストが出ている
2. 城塞と商館を建てると、**建物の絵が出て、足元に所有者色の土台が敷かれ、表示が VP に変わる**
3. まだ素材の無い物件（商館以外の商館枠を除く 5 種）は、建てても名前のまま出る
4. **建てても盤面のレイアウトが 1px も動かない**
5. 封鎖された区画が沈む

Run: `npm run build`
Expected: 型エラー無し
Run: `npm test`
Expected: 93 件

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "feat: 市場のグリッドを、素材を置く盤面に作り替える

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: コインバーに街道と終了をまとめる

**Files:**
- Modify: `src/ui/CoinBar.tsx`, `src/ui/Game.tsx`, `src/ui/styles.css`
- Test: 手動確認

**Interfaces:**
- Consumes: なし
- Produces: `<CoinBar state balance onRoad roadEnabled onEndTurn endTurnEnabled />`

コインバーは「今いくら持っていて、次いくら入るか」を見る場所で、
**ターンを終える判断と同じ情報**。視線が一致する。そして手札を最下段に置ける。

- [ ] **Step 1: `CoinBar.tsx` の `CoinBar` を差し替える**

`forecast` 関数はそのまま残す。`CoinBar` の定義だけを次にする。

```tsx
export function CoinBar({
  state,
  balance = DEFAULT_BALANCE,
  onRoad,
  roadEnabled,
  onEndTurn,
  endTurnEnabled,
}: {
  state: GameState;
  balance?: Balance;
  onRoad: () => void;
  roadEnabled: boolean;
  onEndTurn: () => void;
  endTurnEnabled: boolean;
}) {
  return (
    <div className="coinbar">
      <span className="coinbar-amount">{state.players.you.coins}</span>
      <span className="coinbar-forecast">次のターン +{forecast(state, balance)}</span>
      <button className="coinbar-btn" onClick={onRoad} disabled={!roadEnabled}>
        街道
      </button>
      <button className="coinbar-btn is-primary" onClick={onEndTurn} disabled={!endTurnEnabled}>
        終了
      </button>
    </div>
  );
}
```

- [ ] **Step 2: `Game.tsx` から街道ボタンと終了ボタンを消し、CoinBar に渡す**

`.board-shell` の中身を次にする。

```tsx
        <div className="board-shell">
          <OpponentStrip state={state} />
          <div className="board-area">
            <Board
              state={state}
              balance={balance}
              onPick={(slotId) => setSheet({ kind: 'slot', slotId })}
            />
          </div>
          <CoinBar
            state={state}
            balance={balance}
            onRoad={() => setSheet({ kind: 'roadTarget' })}
            roadEnabled={roadAvailable}
            onEndTurn={endTurn}
            endTurnEnabled={!finished}
          />
          <Hand
            state={state}
            balance={balance}
            canUse={(card) => canUseCard(state, card, balance)}
            onPick={(card) => setSheet({ kind: 'card', card })}
          />
        </div>
```

- [ ] **Step 3: `styles.css` の `.coinbar` 系を差し替え、`.road-btn` と `.end-turn` を削除する**

`.coinbar` `.coinbar-amount` `.coinbar-forecast` `.road-btn` `.road-btn:disabled` `.end-turn` の
6 つのルールを削除し、次に差し替える。

```css
/* コインバー。手札のすぐ上に全幅で置く。
   「今いくら」「次いくら」「終える」が同じ視線の中に並ぶ。 */
.coinbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  padding: 0 var(--pad);
  background: var(--chrome);
}

.coinbar-amount {
  font-size: 22px;
  font-weight: 700;
  color: var(--coin);
  min-width: 34px;
}

.coinbar-forecast {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--chrome-ink-dim);
  white-space: nowrap;
}

.coinbar-btn {
  min-height: 34px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--chrome-ink);
  font-size: 13px;
  font-weight: 600;
}

.coinbar-btn.is-primary {
  background: var(--owner-you);
  color: var(--owner-you-ink);
}

.coinbar-btn:disabled {
  opacity: 0.35;
}
```

- [ ] **Step 4: ブラウザで確かめる**

Run: `npm run dev`

1. コインバーに「19／次のターン +12／街道／終了」が 1 行で並ぶ
2. **375px 幅で横にはみ出さない**（ブラウザの開発者ツールで幅を 375 にして確認）
3. 街道を持っていないとき「街道」が沈んでいて、押しても何も起きない
4. 「終了」でターンが進む
5. **街道の有効・無効でレイアウトが動かない**

Run: `npm run build` / `npm test`

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "feat: コインバーに街道と終了をまとめ、手札を最下段にする

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: 手札を縦長カードに作り替える

**Files:**
- Modify: `src/ui/Hand.tsx`, `src/ui/styles.css`
- Test: 手動確認

**Interfaces:**
- Consumes: なし
- Produces: 見た目のみ変更。`<Hand>` の props は変えない

実測値をそのまま使う。カード 68×84（比 1 : 1.235）、間隔 5、コストバッジの直径 19。

- [ ] **Step 1: `Hand.tsx` の return を差し替える**

```tsx
  return (
    <div className="hand-row">
      <div className="next">
        <span className="next-label">次</span>
        <span className="next-card">{next ? CARD_NAMES[next] : ''}</span>
      </div>
      <div className="hand">
        {hand.map((card) => (
          <button
            key={card}
            className={canUse(card) ? 'card' : 'card is-dim'}
            onClick={() => onPick(card)}
          >
            <span className="card-name">{CARD_NAMES[card]}</span>
            <span className="card-cost">{cardCostFor(state, 'you', card, balance)}</span>
          </button>
        ))}
      </div>
    </div>
  );
```

（構造は今と同じ。見た目は CSS で変える。）

- [ ] **Step 2: `styles.css` の手札まわりを差し替える**

`.hand-row` `.next` `.next-label` `.next-card` `.hand` `.card` `.card.is-dim` の
7 つのルールを削除し、次に差し替える。

```css
/* 手札。画面の最下段に固定する。 */
.hand-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 112px;
  padding: 0 var(--pad) 14px;
  background: var(--chrome-2);
}

.next {
  width: 38px;
  display: grid;
  gap: 3px;
  justify-items: center;
}

.next-label {
  font-size: 10px;
  color: var(--chrome-ink-dim);
}

.next-card {
  width: 38px;
  height: 47px;
  border-radius: 6px;
  background: var(--chrome);
  display: grid;
  place-content: center;
  font-size: 9px;
  color: var(--chrome-ink-dim);
  text-align: center;
}

.hand {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 5px;
}

/* 実測した参考値のとおり縦長にする（68 x 84、比 1 : 1.235）。
   高さは aspect-ratio で決まるので、名前の長さで動かない。 */
.card {
  position: relative;
  min-width: 0;
  min-height: 0;
  aspect-ratio: 68 / 84;
  padding: 0;
  border: 2px solid var(--card-edge);
  border-radius: 8px;
  background: var(--card-face);
  color: var(--chrome-ink);
  font-size: 11px;
  display: grid;
  place-items: center;
}

.card.is-dim {
  opacity: 0.4;
}

.card-name {
  padding: 0 2px;
  text-align: center;
  line-height: 1.2;
}

/* コストはカード下端に重なる丸バッジ。実測どおり直径 19。 */
.card-cost {
  position: absolute;
  left: 50%;
  bottom: -9px;
  transform: translateX(-50%);
  width: 19px;
  height: 19px;
  border-radius: 50%;
  background: var(--coin);
  color: var(--coin-ink);
  font-size: 11px;
  font-weight: 700;
  display: grid;
  place-items: center;
}
```

- [ ] **Step 3: ブラウザで確かめる**

Run: `npm run dev`

1. **カードが縦長**になっている
2. コストがカード下端の**金の丸バッジ**で出る
3. 使えないカードが沈む
4. **375px 幅で横にはみ出さない**
5. カードを使ってもレイアウトが動かない

Run: `npm run build` / `npm test`

- [ ] **Step 4: コミット**

```bash
git add src/ui/Hand.tsx src/ui/styles.css
git commit -m "feat: 手札を実測値どおりの縦長カードにする

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: 相手エリアと質感

**Files:**
- Modify: `src/ui/OpponentStrip.tsx`, `src/ui/styles.css`
- Test: 手動確認

**Interfaces:**
- Consumes: `ownedSlots` `scoreOf`（`@/game/selectors`）
- Produces: 見た目のみ変更

盤面が暖色（平均 `#9e965c`）なので、UI の地は寒色で暗くして離す。

> 色トークン（`:root`）は Task 5 で入れ終えている。ここでは触らない。

- [ ] **Step 1: 相手エリアを作り替える**

`OpponentStrip.tsx` を丸ごと次にする。

```tsx
import { ownedSlots, scoreOf } from '@/game/selectors';
import type { GameState } from '@/game/types';

export function OpponentStrip({ state }: { state: GameState }) {
  return (
    <div className="opponent">
      <span className="opponent-badge">CPU</span>
      <span className="opponent-coins">{state.players.cpu.coins}</span>
      <span className="opponent-stats">
        物件 {ownedSlots(state, 'cpu').length} ・ {scoreOf(state, 'cpu')} VP
      </span>
    </div>
  );
}
```

- [ ] **Step 2: `styles.css` の相手エリアを差し替える**

`.opponent` `.opponent-badge` `.opponent-owned` `.owned-dot` の 4 つを削除し、次に差し替える。

```css
.opponent {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 var(--pad);
  background: var(--chrome);
}

.opponent-badge {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--owner-cpu);
  color: var(--owner-cpu-ink);
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 700;
}

.opponent-coins {
  font-size: 16px;
  font-weight: 700;
  color: var(--coin);
}

.opponent-stats {
  margin-left: auto;
  font-size: 12px;
  color: var(--chrome-ink-dim);
}
```

- [ ] **Step 3: 質感を足す**

`styles.css` の末尾に足す。**寸法を変える指定は入れない。**

```css
/* 立体感。影と縁取りだけで出す。要素の寸法は 1px も変えない。 */
.coinbar-btn {
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.22),
    0 2px 0 rgb(0 0 0 / 0.35);
}

.coinbar-btn:active:not(:disabled) {
  transform: translateY(1px);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.22);
}

.card {
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.18),
    0 2px 0 rgb(0 0 0 / 0.3);
}

.card:active:not(:disabled) {
  transform: translateY(1px);
}

/* 盤面の上に乗る数字は、縁取りで読ませる。 */
.plot-cost,
.plot-vp,
.card-cost {
  -webkit-text-stroke: 2px rgb(0 0 0 / 0.45);
  paint-order: stroke fill;
}

.coinbar-amount {
  -webkit-text-stroke: 3px rgb(0 0 0 / 0.3);
  paint-order: stroke fill;
}
```

- [ ] **Step 4: ブラウザで確かめる**

Run: `npm run dev`

1. 手札・コインバー・相手エリアが**暗い寒色**になり、盤面と分かれている
2. 相手エリアに CPU のコイン・物件数・VP が出る
3. ボタンとカードに厚みが見える。押すと 1px 沈む
4. 数字に縁取りが乗って読みやすい
5. **レイアウトが 1px も動かない**

Run: `npm run build` / `npm test`

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "feat: 相手エリアを整え、立体感を入れる

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: 検証と公開

**Files:**
- Create: `scripts/audit-contrast.mjs`
- Modify: 測定結果しだいで `src/ui/styles.css`
- Test: 実機確認

**Interfaces:**
- Consumes: なし
- Produces: `npm run audit-contrast` が所有色と盤面の輝度差を出す

CLAUDE.md は「盤面の色を寄せるときは相対輝度で 14% 以上離す」と定めている。
**CPU の橙は盤面の土（`#c1a26d`）と近いので、測って確かめる。**

- [ ] **Step 1: 輝度差を測るスクリプトを書く**

`scripts/audit-contrast.mjs`:

```js
// 所有色が盤面から十分離れているかを測る。常設。
//
//   npm run audit-contrast
//
// CLAUDE.md の基準: 盤面の色を寄せるときは相対輝度で 14% 以上離すこと。

import sharp from 'sharp';

const FIELD = 'src/assets/art/field.png';

/** 所有者の土台の色。styles.css の :root と一致させること。 */
const OWNERS = [
  ['自分', '#2f7fd0'],
  ['CPU', '#d2622a'],
];

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const luminance = ([r, g, b]) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

// 盤面を粗く刻んで、明るい側と暗い側の代表色を取る
const raw = await sharp(FIELD).resize(16, 16, { fit: 'cover' }).raw().toBuffer();
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
```

`package.json` の `scripts` に足す。

```json
    "audit-contrast": "node scripts/audit-contrast.mjs",
```

- [ ] **Step 2: 走らせて判定する**

Run: `npm run audit-contrast`

**不合格が出た場合の対処**（この順で試す）:

1. `.plot-base` の縁を濃くする（`border: 2px solid rgb(0 0 0 / 0.35)` を `3px solid rgb(0 0 0 / 0.55)` に）。
   縁は寸法を変えないので安全。直したら再測定する
2. それでも足りなければ `--owner-cpu` を暗くする（`#d2622a` → `#a8441a`）。
   `audit-contrast.mjs` の `OWNERS` も同じ値に直して再測定する

**基準を満たすまで繰り返す。** 満たした値を報告に残すこと。

- [ ] **Step 3: 三つの画面幅で確かめる**

Run: `npm run dev`

ブラウザの開発者ツールで次の 3 つを順に見る。

| 幅 × 高さ | 見ること |
|---|---|
| 393 × 852 | 盤面が縦を使い切り、上下に大きな空白が無い |
| 375 × 812 | コインバーと手札が横にはみ出さない |
| 375 × 667 | **盤面が縮んで収まり、縦スクロールも横スクロールも出ない** |

さらに 375 × 812 で、次を実際に操作して確かめる。

1. カードを使う → **盤面と手札の位置が 1px も動かない**
2. 物件を建てる → 建物の絵が出て、足元に所有者色の土台が敷かれ、表示が VP に変わる。**位置は動かない**
3. シートを開いて閉じる → **位置が動かない**
4. 1 試合を最後まで遊べる

確認が終わったら dev サーバーを止める。

- [ ] **Step 4: ビルドとテスト**

Run: `npm run build`
Expected: 型エラー無し
Run: `npm test`
Expected: 93 件すべて通る
Run: `npm run typecheck`
Expected: エラー無し

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "feat: 所有色の輝度差を測るツールを追加し、基準を満たす値にする

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: 公開する**

Run: `npm run deploy`
Expected: `gh-pages へ反映しました`
Run: `git push origin phase1-2`

- [ ] **Step 7: 公開版で確かめる**

`https://masato-masa.github.io/city-builders/` をスマートフォンで開き、
Step 3 の 4 項目を実機で確かめる。配信の切り替わりに数分かかる。

---

## 完了の定義

- [ ] 実機幅（375 と 393）で、盤面が縦を使い切り、上下に大きな空白が無い
- [ ] 手札が画面下端に固定され、カードが縦長（68×84）
- [ ] コストがカード下端の丸バッジで出る
- [ ] 盤面の 10 区画に、未建設はコスト、建設済みは建物と所有者色の土台と VP が出る
- [ ] カードを使っても建物が建ってもシートを開閉しても、レイアウトが 1px も動かない
- [ ] `npm run audit-contrast` がすべて合格する
- [ ] 背の低い画面（375×667）でも盤面が収まり、スクロールが出ない
- [ ] `npm test` が 93 件通り、`npm run build` が型エラー無しで通る
- [ ] GitHub Pages に反映され、実機で確認した

素材の量産（残り 12 種）、演出、盤面の傾き、ホームの作り込みは次のサイクル。
