# シティビルダーズ Phase 1 / Phase 2 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 人物カードの固定循環と共有物件市場で CPU と対戦できるカードゲームを、実機で遊べて GitHub Pages で公開された状態まで作る。

**Architecture:** ゲームロジックを `src/game/` の純粋関数（`(state, action) => state`）に閉じ込め、UI と対戦シミュレーターが同じコードを使う。全数値は `src/game/balance.ts` の 1 オブジェクトに集約し、開発者メニューと localStorage から上書きできるようにする。乱数はシード付き PRNG のみを使い、同じシードからは必ず同じ試合になる。

**Tech Stack:** Vite 6 / React 19 / TypeScript 5.7 / Vitest 3 / Motion 12 / tsx（スクリプト実行用）

**Spec:** `docs/superpowers/specs/2026-09-14-city-builders-design.md`

## Global Constraints

- 日本語で書く。UI の文言・コメント・コミットメッセージすべて日本語
- `src/game/` は UI を一切 import しない。React も DOM も触らない
- ゲームロジックに数値リテラルを書かない。すべて `balance.ts` から読む
- 乱数は `src/game/rng.ts` の PRNG のみ。`Math.random()` を使わない
- `src/ui/shared/` は `shared-ui/sync.mjs` の生成物。直接編集しない
- プレイ画面の 1 行目に置くのは戻る・タイトル・?・設定の 4 つだけ。2 行目（`.status-bar`）は空でも高さを取る
- ホームに「あそびかた」と「きろくをけす」を置かない。記録の削除は開発者メニューの中
- `vite.config.ts` の `base` は `/city-builders/`。リポジトリ名と一致させる
- 日本語を含むファイルの作成・編集は Write ツールか Python 経由で行う。bash heredoc を使わない
- PowerShell では `&&` `||` が使えない
- コミットメッセージの末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` を付ける

### 用語と ID

| 日本語 | ID |
|---|---|
| 採掘師 | `miner` |
| 商人 | `merchant` |
| 銀行家 | `banker` |
| 建築家 | `architect` |
| 密偵 | `spy` |
| 伝令 | `herald` |
| 徴税官 | `taxman` |
| 封鎖者 | `blockader` |
| 商館 | `tradingHouse` |
| 城壁 | `wall` |
| 工場 | `factory` |
| 街道 | `road` |
| 大聖堂 | `cathedral` |
| 城塞 | `fortress` |
| 取引所 | `exchange` |

---

## ファイル構成

```
city-builders/
  package.json              npm スクリプトと依存
  tsconfig.json
  vite.config.ts            base: '/city-builders/'、vitest 設定
  index.html
  src/
    main.tsx                エントリ
    App.tsx                 ホームとプレイ画面の切り替え
    game/
      types.ts              状態・行動の型。ここだけ見れば状態が分かる
      balance.ts            全数値。ロジックはここからしか数字を読まない
      rng.ts                シード付き PRNG とシャッフル
      setup.ts              シードから初期状態を作る
      reducer.ts            (state, action) => state
      selectors.ts          派生値（手札・合法手・VP・所有物件数）
    ai/
      evaluate.ts           局面の評価関数
      choose.ts             1 ターンぶんの行動列を決める
    ui/
      shared/               shared-ui の生成物。直接編集しない
      styles.css            このゲーム固有の CSS
      Home.tsx              ホーム画面
      Game.tsx              プレイ画面の組み立てと状態の保持
      Market.tsx            物件市場 5×2 グリッド
      Hand.tsx              手札 4 枚 + next 1 枚
      CoinBar.tsx           コインと次ターン収入
      OpponentStrip.tsx     相手エリア
      Sheets.tsx            物件詳細・カード詳細・?・設定・開発者メニュー
      balance-store.ts      balance の localStorage 上書き
  __tests__/
    rng.test.ts
    data.test.ts
    setup.test.ts
    cycle.test.ts
    income.test.ts
    build.test.ts
    cards.test.ts
    turn.test.ts
    selectors.test.ts
    ai.test.ts
  scripts/
    simulate.ts             常設の対戦シミュレーター
    deploy.mjs              dist/ を gh-pages へ orphan commit
```

**なぜこの分け方か。** `reducer.ts` はカード効果・建設・開始終了フェーズ・合法手の列挙を
すべて持つが、テストファイルを機能ごとに分けることで、変更したときにどこが壊れたかが分かる。
`selectors.ts` は状態を読むだけ（手札・所有物件・VP）で状態を変えない。
依存は `reducer → selectors` の片方向のみ。逆向きを作ると循環 import になる。

> **仕様書からの逸脱が 1 点。** 仕様書では `scripts/simulate.mjs` としていたが、
> `balance.ts` と `reducer.ts` を直接 import する必要があるので `scripts/simulate.ts` にし、
> `tsx` で実行する。

---

## Task 1: プロジェクトの土台

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `.gitignore`
- Test: `__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `npm test` / `npm run build` / `npm run dev` が動く。パスエイリアス `@` が `src/` を指す

- [ ] **Step 1: `package.json` を作る**

```json
{
  "name": "city-builders",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 5185 --strictPort",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --port 5185 --strictPort",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "simulate": "tsx scripts/simulate.ts",
    "deploy": "npm run build && node scripts/deploy.mjs"
  },
  "dependencies": {
    "motion": "^12.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.20.2",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.2.7"
  }
}
```

- [ ] **Step 2: `tsconfig.json` を作る**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vitest/globals", "node"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "__tests__", "scripts", "vite.config.ts"]
}
```

- [ ] **Step 3: `vite.config.ts` を作る**

```ts
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
// vite の defineConfig は test フィールドを知らないので、vitest 側から取る。
import { defineConfig } from 'vitest/config';

// GitHub Pages はリポジトリ名のサブパスで配信される。ここを変えるとビルド後の
// アセット参照が全部壊れるので、リポジトリ名と必ず一致させること。
export default defineConfig({
  base: '/city-builders/',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['__tests__/**/*.test.ts'],
    // CPU の強さを測るテストは数十試合を回すので、既定の 5 秒では足りない。
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
```

- [ ] **Step 4: `index.html` と最小の React を作る**

`index.html`:

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>シティビルダーズ</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx`:

```tsx
export function App() {
  return <div>シティビルダーズ</div>;
}
```

`.gitignore`:

```
node_modules
dist
*.tmp.mjs
*.tmp.ts
```

- [ ] **Step 5: 土台が動くことを確かめるテストを書く**

`__tests__/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('土台', () => {
  it('テストランナーが動く', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: インストールしてテストとビルドを走らせる**

Run: `npm install`
Run: `npm test`
Expected: PASS（1 件）
Run: `npm run build`
Expected: `dist/` が出来る。型エラー無し

- [ ] **Step 7: コミット**

```bash
git add -A
git commit -m "chore: Vite + React + TypeScript + Vitest の土台を作る

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: シード付き乱数

**Files:**
- Create: `src/game/rng.ts`
- Test: `__tests__/rng.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `createRng(seed: number): Rng`
  - `interface Rng { next(): number; int(maxExclusive: number): number }`
  - `shuffle<T>(items: readonly T[], rng: Rng): T[]`

同じシードからは必ず同じ結果が出ること。これが無いと試合の再現も保存も成立しない。

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { createRng, shuffle } from '@/game/rng';

describe('rng', () => {
  it('同じシードからは同じ列が出る', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it('違うシードからは違う列が出る', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('next は 0 以上 1 未満', () => {
    const rng = createRng(999);
    for (let i = 0; i < 500; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int は 0 以上 max 未満の整数', () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const v = rng.int(8);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(8);
    }
  });

  it('shuffle は元配列を壊さず、同じシードで同じ並びになる', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(src, createRng(42));
    const b = shuffle(src, createRng(42));
    expect(a).toEqual(b);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...a].sort((x, y) => x - y)).toEqual(src);
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- rng`
Expected: FAIL（`@/game/rng` が解決できない）

- [ ] **Step 3: 実装する**

`src/game/rng.ts`:

```ts
/** シード付き乱数。mulberry32。
 *  同じシードからは必ず同じ列が出る。これが試合の再現性の土台になる。 */
export interface Rng {
  /** 0 以上 1 未満 */
  next(): number;
  /** 0 以上 maxExclusive 未満の整数 */
  int(maxExclusive: number): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (maxExclusive) => Math.floor(next() * maxExclusive) };
}

/** Fisher-Yates。元配列は書き換えない。 */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test -- rng`
Expected: PASS（5 件）

- [ ] **Step 5: コミット**

```bash
git add src/game/rng.ts __tests__/rng.test.ts
git commit -m "feat: シード付き乱数とシャッフルを追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: 型とデータ定義

**Files:**
- Create: `src/game/types.ts`, `src/game/balance.ts`
- Test: `__tests__/data.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - 型: `CardId` `BuildingId` `PlayerId` `PlayerState` `BuildingSlot` `GameState` `Action`
  - `DEFAULT_BALANCE: Balance`
  - `CARD_NAMES: Record<CardId, string>` / `BUILDING_NAMES: Record<BuildingId, string>`
  - `ALL_CARDS: readonly CardId[]`（8 件）

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/data.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { ALL_CARDS, BUILDING_NAMES, CARD_NAMES, DEFAULT_BALANCE } from '@/game/balance';

describe('データ定義', () => {
  it('人物カードは 8 種', () => {
    expect(ALL_CARDS).toHaveLength(8);
    expect(new Set(ALL_CARDS).size).toBe(8);
  });

  it('すべての人物カードにコストと日本語名がある', () => {
    for (const id of ALL_CARDS) {
      expect(DEFAULT_BALANCE.cards[id].cost).toBeGreaterThanOrEqual(0);
      expect(CARD_NAMES[id]).toBeTruthy();
    }
  });

  it('市場は 10 スロット', () => {
    expect(DEFAULT_BALANCE.market).toHaveLength(10);
  });

  it('市場の構成は城塞2・工場1・商館3・その他4', () => {
    const count = (id: string) => DEFAULT_BALANCE.market.filter((m) => m === id).length;
    expect(count('fortress')).toBe(2);
    expect(count('factory')).toBe(1);
    expect(count('tradingHouse')).toBe(3);
    expect(DEFAULT_BALANCE.market.length - count('fortress') - count('factory') - count('tradingHouse')).toBe(4);
  });

  it('市場に出る物件はすべて定義と日本語名を持つ', () => {
    for (const id of DEFAULT_BALANCE.market) {
      expect(DEFAULT_BALANCE.buildings[id].cost).toBeGreaterThan(0);
      expect(BUILDING_NAMES[id]).toBeTruthy();
    }
  });

  it('手札は 4 枚', () => {
    expect(DEFAULT_BALANCE.handSize).toBe(4);
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- data`
Expected: FAIL（`@/game/balance` が解決できない）

- [ ] **Step 3: `src/game/types.ts` を書く**

```ts
export type CardId =
  | 'miner'
  | 'merchant'
  | 'banker'
  | 'architect'
  | 'spy'
  | 'herald'
  | 'taxman'
  | 'blockader';

export type BuildingId =
  | 'tradingHouse'
  | 'wall'
  | 'factory'
  | 'road'
  | 'cathedral'
  | 'fortress'
  | 'exchange';

export type PlayerId = 'you' | 'cpu';

/** 市場のスロット。位置は固定で、建設されても動かない。 */
export interface BuildingSlot {
  slotId: number;
  buildingId: BuildingId;
  /** null なら未建設 */
  owner: PlayerId | null;
}

export interface PlayerState {
  coins: number;
  /** 先頭 handSize 枚が手札。使ったカードは末尾へ回る */
  deck: CardId[];
  /** このターン使用済みのカード */
  usedThisTurn: CardId[];
  /** 次のターン開始時に解決する投資カード */
  pendingIncome: CardId[];
  /** このターン限りの建設費割引（建築家） */
  buildDiscount: number;
  /** このターン 1 枚でもカードを使ったか（工場の割引判定） */
  usedAnyCardThisTurn: boolean;
  /** 封鎖者に指定されたスロット。自分のターンに建設できない */
  blockedSlot: number | null;
  /** このターン、街道の循環を使ったか */
  roadUsedThisTurn: boolean;
}

export interface GameState {
  seed: number;
  /** 1 始まり。1 人の手番を 1 と数える */
  turn: number;
  current: PlayerId;
  players: Record<PlayerId, PlayerState>;
  /** 長さ 10。順番は固定 */
  market: BuildingSlot[];
  phase: 'playing' | 'finished';
  /** 密偵で見えた相手の手札。ターン終了で消える */
  revealedOpponentHand: CardId[] | null;
}

export type Action =
  | { type: 'startTurn' }
  | { type: 'useCard'; card: CardId; heraldTarget?: CardId; blockadeSlot?: number }
  | { type: 'build'; slotId: number }
  | { type: 'useRoad'; target: CardId }
  | { type: 'endTurn' };
```

- [ ] **Step 4: `src/game/balance.ts` を書く**

```ts
import type { BuildingId, CardId } from './types';

export const ALL_CARDS: readonly CardId[] = [
  'miner',
  'merchant',
  'banker',
  'architect',
  'spy',
  'herald',
  'taxman',
  'blockader',
];

export const CARD_NAMES: Record<CardId, string> = {
  miner: '採掘師',
  merchant: '商人',
  banker: '銀行家',
  architect: '建築家',
  spy: '密偵',
  herald: '伝令',
  taxman: '徴税官',
  blockader: '封鎖者',
};

export const CARD_TEXTS: Record<CardId, string> = {
  miner: '次のターン コイン +3',
  merchant: '次のターン コイン +5',
  banker: '次のターン コイン +7。さらに解決時の自分の物件 1 件につき +1',
  architect: 'このターン建てる物件すべて、建設費 −3',
  spy: '相手の手札 4 枚を見る',
  herald: '手札 1 枚を使わずに山の底へ送り、補充する',
  taxman: '相手のコイン −5',
  blockader: '市場の物件 1 つを、次の相手のターン建設できなくする',
};

export const BUILDING_NAMES: Record<BuildingId, string> = {
  tradingHouse: '商館',
  wall: '城壁',
  factory: '工場',
  road: '街道',
  cathedral: '大聖堂',
  fortress: '城塞',
  exchange: '取引所',
};

export const BUILDING_TEXTS: Record<BuildingId, string> = {
  tradingHouse: '毎ターン開始時 コイン +1',
  wall: '徴税官・封鎖者の効果を受けない',
  factory: '毎ターン、最初に使用する人物カードのコスト −2',
  road: '毎ターン開始時、手札 1 枚を山の底へ送って補充してよい',
  cathedral: '自分の他の物件 1 件につき +2 VP',
  fortress: 'なし',
  exchange: '人物カードの「次のターン コイン +X」がすべて +2',
};

export interface Balance {
  handSize: number;
  baseIncome: number;
  startingCoins: { first: number; second: number };
  maxTurnsPerPlayer: number;
  cards: Record<CardId, { cost: number }>;
  minerIncome: number;
  merchantIncome: number;
  bankerIncome: number;
  bankerPerBuilding: number;
  architectDiscount: number;
  taxmanAmount: number;
  buildings: Record<BuildingId, { cost: number; vp: number }>;
  tradingHouseIncome: number;
  factoryDiscount: number;
  cathedralVpPerBuilding: number;
  exchangeBonus: number;
  /** 市場のスロット順。長さ 10 */
  market: BuildingId[];
}

/** 全数値はここに集約する。ロジックに数値リテラルを書かないこと。
 *  すべて仮置きで、scripts/simulate.ts の実測と実プレイで調整する。 */
export const DEFAULT_BALANCE: Balance = {
  handSize: 4,
  baseIncome: 1,
  startingCoins: { first: 4, second: 6 },
  maxTurnsPerPlayer: 20,
  cards: {
    miner: { cost: 1 },
    merchant: { cost: 2 },
    banker: { cost: 4 },
    architect: { cost: 2 },
    spy: { cost: 1 },
    herald: { cost: 1 },
    taxman: { cost: 3 },
    blockader: { cost: 3 },
  },
  minerIncome: 3,
  merchantIncome: 5,
  bankerIncome: 7,
  bankerPerBuilding: 1,
  architectDiscount: 3,
  taxmanAmount: 5,
  buildings: {
    tradingHouse: { cost: 7, vp: 2 },
    wall: { cost: 10, vp: 2 },
    factory: { cost: 12, vp: 3 },
    road: { cost: 14, vp: 2 },
    cathedral: { cost: 16, vp: 0 },
    fortress: { cost: 18, vp: 6 },
    exchange: { cost: 20, vp: 3 },
  },
  tradingHouseIncome: 1,
  factoryDiscount: 2,
  cathedralVpPerBuilding: 2,
  exchangeBonus: 2,
  market: [
    'tradingHouse',
    'tradingHouse',
    'tradingHouse',
    'wall',
    'factory',
    'road',
    'cathedral',
    'fortress',
    'fortress',
    'exchange',
  ],
};
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npm test -- data`
Expected: PASS（6 件）

- [ ] **Step 6: コミット**

```bash
git add src/game/types.ts src/game/balance.ts __tests__/data.test.ts
git commit -m "feat: 型定義と balance（全数値）を追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: 初期状態の生成と派生値

**Files:**
- Create: `src/game/setup.ts`, `src/game/selectors.ts`
- Test: `__tests__/setup.test.ts`

**Interfaces:**
- Consumes: `createRng` `shuffle`（Task 2）、`DEFAULT_BALANCE` `ALL_CARDS`（Task 3）
- Produces:
  - `createGame(seed: number, balance?: Balance): GameState`
  - `handOf(state: GameState, player: PlayerId, balance?: Balance): CardId[]`
  - `nextCardOf(state: GameState, player: PlayerId, balance?: Balance): CardId | null`
  - `ownedSlots(state: GameState, player: PlayerId): BuildingSlot[]`
  - `hasBuilding(state: GameState, player: PlayerId, id: BuildingId): boolean`
  - `countBuilding(state: GameState, player: PlayerId, id: BuildingId): number`
  - `scoreOf(state: GameState, player: PlayerId, balance?: Balance): number`
  - `opponentOf(player: PlayerId): PlayerId`

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/setup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import {
  handOf,
  hasBuilding,
  nextCardOf,
  opponentOf,
  ownedSlots,
  scoreOf,
} from '@/game/selectors';
import { createGame } from '@/game/setup';

describe('初期状態', () => {
  it('同じシードからは同じ試合になる', () => {
    expect(createGame(2024)).toEqual(createGame(2024));
  });

  it('違うシードでは循環順が変わる', () => {
    const a = createGame(1).players.you.deck;
    const b = createGame(99999).players.you.deck;
    expect(a).not.toEqual(b);
  });

  it('両者とも 8 枚すべてを 1 枚ずつ持つ', () => {
    const g = createGame(5);
    for (const p of ['you', 'cpu'] as const) {
      expect(g.players[p].deck).toHaveLength(8);
      expect(new Set(g.players[p].deck).size).toBe(8);
    }
  });

  it('先手と後手で初期コインが違う', () => {
    const g = createGame(5);
    const first = g.players[g.current].coins;
    const second = g.players[opponentOf(g.current)].coins;
    expect(first).toBe(DEFAULT_BALANCE.startingCoins.first);
    expect(second).toBe(DEFAULT_BALANCE.startingCoins.second);
  });

  it('市場は 10 スロットで全て未建設', () => {
    const g = createGame(5);
    expect(g.market).toHaveLength(10);
    expect(g.market.every((s) => s.owner === null)).toBe(true);
    expect(g.market.map((s) => s.slotId)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('手札はデッキの先頭 4 枚、next はその次の 1 枚', () => {
    const g = createGame(5);
    expect(handOf(g, 'you')).toEqual(g.players.you.deck.slice(0, 4));
    expect(nextCardOf(g, 'you')).toBe(g.players.you.deck[4]);
  });
});

describe('派生値', () => {
  it('未建設なら所有物件は 0、VP も 0', () => {
    const g = createGame(5);
    expect(ownedSlots(g, 'you')).toHaveLength(0);
    expect(scoreOf(g, 'you')).toBe(0);
    expect(hasBuilding(g, 'you', 'wall')).toBe(false);
  });

  it('大聖堂は他の物件 1 件につき +2 VP', () => {
    const g = createGame(5);
    // 大聖堂 + 城塞 + 商館 を所有させる
    const cathedral = g.market.find((s) => s.buildingId === 'cathedral')!;
    const fortress = g.market.find((s) => s.buildingId === 'fortress')!;
    const house = g.market.find((s) => s.buildingId === 'tradingHouse')!;
    cathedral.owner = 'you';
    fortress.owner = 'you';
    house.owner = 'you';
    // 城塞 6 + 商館 2 + 大聖堂（他 2 件 × 2）4 = 12
    expect(scoreOf(g, 'you')).toBe(12);
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- setup`
Expected: FAIL（`@/game/setup` が解決できない）

- [ ] **Step 3: `src/game/selectors.ts` を書く**

```ts
import { DEFAULT_BALANCE, type Balance } from './balance';
import type { BuildingId, BuildingSlot, CardId, GameState, PlayerId } from './types';

export function opponentOf(player: PlayerId): PlayerId {
  return player === 'you' ? 'cpu' : 'you';
}

export function handOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): CardId[] {
  return state.players[player].deck.slice(0, balance.handSize);
}

/** 手札の次に来る 1 枚。クラロワの next と同じ。 */
export function nextCardOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): CardId | null {
  return state.players[player].deck[balance.handSize] ?? null;
}

export function ownedSlots(state: GameState, player: PlayerId): BuildingSlot[] {
  return state.market.filter((s) => s.owner === player);
}

export function countBuilding(state: GameState, player: PlayerId, id: BuildingId): number {
  return state.market.filter((s) => s.owner === player && s.buildingId === id).length;
}

export function hasBuilding(state: GameState, player: PlayerId, id: BuildingId): boolean {
  return countBuilding(state, player, id) > 0;
}

/** 終了時の VP。大聖堂だけ「自分の他の物件 1 件につき +2」で計算する。 */
export function scoreOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  const owned = ownedSlots(state, player);
  let total = 0;
  for (const slot of owned) {
    if (slot.buildingId === 'cathedral') {
      total += (owned.length - 1) * balance.cathedralVpPerBuilding;
    } else {
      total += balance.buildings[slot.buildingId].vp;
    }
  }
  return total;
}
```

- [ ] **Step 4: `src/game/setup.ts` を書く**

```ts
import { ALL_CARDS, DEFAULT_BALANCE, type Balance } from './balance';
import { createRng, shuffle } from './rng';
import type { BuildingSlot, GameState, PlayerId, PlayerState } from './types';

function emptyPlayer(coins: number, deck: PlayerState['deck']): PlayerState {
  return {
    coins,
    deck,
    usedThisTurn: [],
    pendingIncome: [],
    buildDiscount: 0,
    usedAnyCardThisTurn: false,
    blockedSlot: null,
    roadUsedThisTurn: false,
  };
}

/** シードからゲーム全体を決める。同じシードからは必ず同じ試合になる。 */
export function createGame(seed: number, balance: Balance = DEFAULT_BALANCE): GameState {
  const rng = createRng(seed);
  const youDeck = shuffle(ALL_CARDS, rng);
  const cpuDeck = shuffle(ALL_CARDS, rng);
  const first: PlayerId = rng.int(2) === 0 ? 'you' : 'cpu';
  const second: PlayerId = first === 'you' ? 'cpu' : 'you';

  const market: BuildingSlot[] = balance.market.map((buildingId, slotId) => ({
    slotId,
    buildingId,
    owner: null,
  }));

  const players = {
    you: emptyPlayer(0, youDeck),
    cpu: emptyPlayer(0, cpuDeck),
  } as Record<PlayerId, PlayerState>;
  players[first].coins = balance.startingCoins.first;
  players[second].coins = balance.startingCoins.second;

  return {
    seed,
    turn: 1,
    current: first,
    players,
    market,
    phase: 'playing',
    revealedOpponentHand: null,
  };
}
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npm test -- setup`
Expected: PASS（8 件）

- [ ] **Step 6: コミット**

```bash
git add src/game/setup.ts src/game/selectors.ts __tests__/setup.test.ts
git commit -m "feat: 初期状態の生成と派生値（手札・next・VP）を追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: 循環メカニクスとカード使用の共通処理

**Files:**
- Create: `src/game/reducer.ts`
- Test: `__tests__/cycle.test.ts`

**Interfaces:**
- Consumes: Task 3・Task 4 のすべて
- Produces:
  - `reduce(state: GameState, action: Action, balance?: Balance): GameState`
  - `canUseCard(state: GameState, card: CardId, balance?: Balance): boolean`
  - `cardCostFor(state: GameState, player: PlayerId, card: CardId, balance?: Balance): number`

このタスクでは **カード固有の効果はまだ実装しない。** 循環・コスト・使用済み判定だけを通す。
効果は Task 6〜8 で足す。

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/cycle.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { canUseCard, cardCostFor, reduce } from '@/game/reducer';
import { handOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

/** テスト用に、手番プレイヤーのデッキ順とコインを固定する。 */
function fixture(deck: CardId[], coins: number): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.players.you.deck = [...deck];
  g.players.you.coins = coins;
  return g;
}

const ORDER: CardId[] = [
  'miner',
  'merchant',
  'banker',
  'architect',
  'spy',
  'herald',
  'taxman',
  'blockader',
];

describe('循環', () => {
  it('使ったカードは最後尾へ回り、手札は 4 枚のまま', () => {
    const g = fixture(ORDER, 20);
    const after = reduce(g, { type: 'useCard', card: 'miner' }, DEFAULT_BALANCE);
    expect(after.players.you.deck).toEqual([
      'merchant',
      'banker',
      'architect',
      'spy',
      'herald',
      'taxman',
      'blockader',
      'miner',
    ]);
    expect(handOf(after, 'you')).toHaveLength(4);
  });

  it('手札の 3 枚目を使っても、他の 3 枚は手札に残る', () => {
    const g = fixture(ORDER, 20);
    const after = reduce(g, { type: 'useCard', card: 'banker' }, DEFAULT_BALANCE);
    expect(handOf(after, 'you')).toEqual(['miner', 'merchant', 'architect', 'spy']);
  });

  it('8 枚すべて使うと、伝令のぶん 1 つずれて一周する', () => {
    let g = fixture(ORDER, 200);
    for (const card of ORDER) {
      // 伝令の番（手札は herald / taxman / blockader / miner）では miner が妥当な対象になる
      g = reduce(g, { type: 'useCard', card, heraldTarget: 'miner', blockadeSlot: 0 }, DEFAULT_BALANCE);
    }
    // 8 枚ぶんの移動に加えて、伝令が対象をもう 1 枚底へ送るので合計 9 歩進む。
    // デッキは 8 枚なので、ちょうど 1 つぶんずれた位置になる。
    expect(handOf(g, 'you')).toEqual(ORDER.slice(1, 5));
  });

  it('同じカードは 1 ターンに 1 回しか使えない', () => {
    let g = fixture(ORDER, 200);
    for (const card of ORDER) {
      g = reduce(g, { type: 'useCard', card, heraldTarget: 'miner', blockadeSlot: 0 }, DEFAULT_BALANCE);
    }
    // 一巡して商人が手札に戻っているが、このターンはもう使えない
    expect(handOf(g, 'you')).toContain('merchant');
    expect(canUseCard(g, 'merchant', DEFAULT_BALANCE)).toBe(false);
  });

  it('手札に無いカードは使えない', () => {
    const g = fixture(ORDER, 20);
    expect(canUseCard(g, 'taxman', DEFAULT_BALANCE)).toBe(false);
  });

  it('コインが足りなければ使えない', () => {
    const g = fixture(ORDER, 0);
    expect(canUseCard(g, 'miner', DEFAULT_BALANCE)).toBe(false);
  });

  it('コストを払うとコインが減る', () => {
    const g = fixture(ORDER, 10);
    const after = reduce(g, { type: 'useCard', card: 'merchant' }, DEFAULT_BALANCE);
    expect(after.players.you.coins).toBe(10 - DEFAULT_BALANCE.cards.merchant.cost);
  });

  it('工場を持つと、そのターン最初の 1 枚だけコストが下がる', () => {
    const g = fixture(ORDER, 20);
    g.market.find((s) => s.buildingId === 'factory')!.owner = 'you';
    expect(cardCostFor(g, 'you', 'merchant', DEFAULT_BALANCE)).toBe(
      DEFAULT_BALANCE.cards.merchant.cost - DEFAULT_BALANCE.factoryDiscount,
    );
    const after = reduce(g, { type: 'useCard', card: 'merchant' }, DEFAULT_BALANCE);
    expect(cardCostFor(after, 'you', 'miner', DEFAULT_BALANCE)).toBe(
      DEFAULT_BALANCE.cards.miner.cost,
    );
  });

  it('工場の割引でコストは 0 未満にならない', () => {
    const g = fixture(ORDER, 20);
    g.market.find((s) => s.buildingId === 'factory')!.owner = 'you';
    expect(cardCostFor(g, 'you', 'miner', DEFAULT_BALANCE)).toBe(0);
  });

  it('元の状態を書き換えない', () => {
    const g = fixture(ORDER, 20);
    const before = structuredClone(g);
    reduce(g, { type: 'useCard', card: 'miner' }, DEFAULT_BALANCE);
    expect(g).toEqual(before);
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- cycle`
Expected: FAIL（`@/game/reducer` が解決できない）

- [ ] **Step 3: `src/game/reducer.ts` を書く**

```ts
import { DEFAULT_BALANCE, type Balance } from './balance';
import { handOf, hasBuilding } from './selectors';
import type { Action, CardId, GameState, PlayerId } from './types';

/** 工場の割引を織り込んだ、いま実際に払う額。 */
export function cardCostFor(
  state: GameState,
  player: PlayerId,
  card: CardId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  const base = balance.cards[card].cost;
  const p = state.players[player];
  if (!p.usedAnyCardThisTurn && hasBuilding(state, player, 'factory')) {
    return Math.max(0, base - balance.factoryDiscount);
  }
  return base;
}

export function canUseCard(
  state: GameState,
  card: CardId,
  balance: Balance = DEFAULT_BALANCE,
): boolean {
  if (state.phase !== 'playing') return false;
  const player = state.current;
  const p = state.players[player];
  if (!handOf(state, player, balance).includes(card)) return false;
  if (p.usedThisTurn.includes(card)) return false;
  return p.coins >= cardCostFor(state, player, card, balance);
}

/** カードをデッキの最後尾へ回す。手札は deck の先頭なので、これだけで補充される。 */
function moveToBottom(deck: CardId[], card: CardId): CardId[] {
  const idx = deck.indexOf(card);
  if (idx < 0) return deck;
  return [...deck.slice(0, idx), ...deck.slice(idx + 1), card];
}

export function reduce(
  state: GameState,
  action: Action,
  balance: Balance = DEFAULT_BALANCE,
): GameState {
  switch (action.type) {
    case 'useCard':
      return useCard(state, action, balance);
    default:
      return state;
  }
}

function useCard(
  state: GameState,
  action: Extract<Action, { type: 'useCard' }>,
  balance: Balance,
): GameState {
  if (!canUseCard(state, action.card, balance)) return state;

  const next = structuredClone(state);
  const player = next.current;
  const p = next.players[player];

  p.coins -= cardCostFor(state, player, action.card, balance);
  p.usedAnyCardThisTurn = true;
  p.usedThisTurn = [...p.usedThisTurn, action.card];
  p.deck = moveToBottom(p.deck, action.card);

  return next;
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test -- cycle`
Expected: PASS（10 件）

- [ ] **Step 5: コミット**

```bash
git add src/game/reducer.ts __tests__/cycle.test.ts
git commit -m "feat: 人物カードの循環とコスト処理を追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: 投資カードと遅延収入、ターン開始フェーズ

**Files:**
- Modify: `src/game/reducer.ts`
- Test: `__tests__/income.test.ts`

**Interfaces:**
- Consumes: Task 5 の `reduce` `canUseCard`
- Produces: `reduce` が `{ type: 'startTurn' }` を扱えるようになる。
  採掘師・商人・銀行家が `pendingIncome` に積まれ、次のターン開始時に解決される

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/income.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { reduce } from '@/game/reducer';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

const ORDER: CardId[] = [
  'miner',
  'merchant',
  'banker',
  'architect',
  'spy',
  'herald',
  'taxman',
  'blockader',
];

function fixture(coins: number): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.players.you.deck = [...ORDER];
  g.players.you.coins = coins;
  return g;
}

describe('遅延収入', () => {
  it('投資カードはそのターンにはコインを生まない', () => {
    const g = fixture(10);
    const after = reduce(g, { type: 'useCard', card: 'merchant' }, DEFAULT_BALANCE);
    expect(after.players.you.coins).toBe(8);
    expect(after.players.you.pendingIncome).toEqual(['merchant']);
  });

  it('次のターン開始時に解決される', () => {
    let g = fixture(10);
    g = reduce(g, { type: 'useCard', card: 'merchant' }, DEFAULT_BALANCE);
    g = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    // 8 + 基本収入 1 + 商人 5 = 14
    expect(g.players.you.coins).toBe(14);
    expect(g.players.you.pendingIncome).toEqual([]);
  });

  it('商館 1 件につき開始時 +1', () => {
    const g = fixture(0);
    g.market.filter((s) => s.buildingId === 'tradingHouse').forEach((s) => (s.owner = 'you'));
    const after = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    expect(after.players.you.coins).toBe(DEFAULT_BALANCE.baseIncome + 3);
  });

  it('銀行家は解決時の物件数で増える', () => {
    let g = fixture(10);
    g = reduce(g, { type: 'useCard', card: 'banker' }, DEFAULT_BALANCE);
    // 使ったあとに物件を 2 件持たせる（商館なので開始時収入 +2 も付く）
    g.market.filter((s) => s.buildingId === 'tradingHouse').slice(0, 2).forEach((s) => (s.owner = 'you'));
    g = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    // 6 + 基本 1 + 商館 2 + 銀行家(7 + 2) = 18
    expect(g.players.you.coins).toBe(18);
  });

  it('取引所があると投資カード 1 枚につき +2', () => {
    let g = fixture(10);
    g = reduce(g, { type: 'useCard', card: 'miner' }, DEFAULT_BALANCE);
    g = reduce(g, { type: 'useCard', card: 'merchant' }, DEFAULT_BALANCE);
    g.market.find((s) => s.buildingId === 'exchange')!.owner = 'you';
    g = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    // 7 + 基本 1 + 採掘師(3+2) + 商人(5+2) = 20
    expect(g.players.you.coins).toBe(20);
  });

  it('開始時にターン内の一時状態がリセットされる', () => {
    let g = fixture(10);
    g = reduce(g, { type: 'useCard', card: 'miner' }, DEFAULT_BALANCE);
    expect(g.players.you.usedThisTurn).toEqual(['miner']);
    g = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    expect(g.players.you.usedThisTurn).toEqual([]);
    expect(g.players.you.usedAnyCardThisTurn).toBe(false);
    expect(g.players.you.buildDiscount).toBe(0);
    expect(g.players.you.roadUsedThisTurn).toBe(false);
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- income`
Expected: FAIL（`pendingIncome` が積まれず、`startTurn` が何もしない）

- [ ] **Step 3: `reducer.ts` に投資カードの効果と `startTurn` を足す**

`useCard` の `p.deck = moveToBottom(...)` の直前に効果解決を差し込む。

```ts
const INCOME_CARDS: readonly CardId[] = ['miner', 'merchant', 'banker'];

function useCard(
  state: GameState,
  action: Extract<Action, { type: 'useCard' }>,
  balance: Balance,
): GameState {
  if (!canUseCard(state, action.card, balance)) return state;

  const next = structuredClone(state);
  const player = next.current;
  const p = next.players[player];

  p.coins -= cardCostFor(state, player, action.card, balance);
  p.usedAnyCardThisTurn = true;
  p.usedThisTurn = [...p.usedThisTurn, action.card];

  if (INCOME_CARDS.includes(action.card)) {
    p.pendingIncome = [...p.pendingIncome, action.card];
  }

  p.deck = moveToBottom(p.deck, action.card);
  return next;
}
```

`reduce` の `switch` に `startTurn` を足す。

```ts
export function reduce(
  state: GameState,
  action: Action,
  balance: Balance = DEFAULT_BALANCE,
): GameState {
  switch (action.type) {
    case 'startTurn':
      return startTurn(state, balance);
    case 'useCard':
      return useCard(state, action, balance);
    default:
      return state;
  }
}

/** 1 枚の投資カードが解決時に生むコイン。銀行家だけ解決時の物件数で変わる。 */
function incomeOf(
  state: GameState,
  player: PlayerId,
  card: CardId,
  balance: Balance,
): number {
  const bonus = hasBuilding(state, player, 'exchange') ? balance.exchangeBonus : 0;
  switch (card) {
    case 'miner':
      return balance.minerIncome + bonus;
    case 'merchant':
      return balance.merchantIncome + bonus;
    case 'banker':
      return (
        balance.bankerIncome +
        ownedSlots(state, player).length * balance.bankerPerBuilding +
        bonus
      );
    default:
      return 0;
  }
}

function startTurn(state: GameState, balance: Balance): GameState {
  if (state.phase !== 'playing') return state;
  const next = structuredClone(state);
  const player = next.current;
  const p = next.players[player];

  p.coins += balance.baseIncome;
  p.coins += countBuilding(next, player, 'tradingHouse') * balance.tradingHouseIncome;
  for (const card of p.pendingIncome) {
    p.coins += incomeOf(next, player, card, balance);
  }

  p.pendingIncome = [];
  p.usedThisTurn = [];
  p.usedAnyCardThisTurn = false;
  p.buildDiscount = 0;
  p.roadUsedThisTurn = false;
  return next;
}
```

import 文に `countBuilding` と `ownedSlots` を足す。

```ts
import { countBuilding, handOf, hasBuilding, ownedSlots } from './selectors';
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test -- income cycle`
Expected: PASS（Task 5 の 10 件も通ったまま、合計 16 件）

- [ ] **Step 5: コミット**

```bash
git add src/game/reducer.ts __tests__/income.test.ts
git commit -m "feat: 遅延収入とターン開始フェーズを追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: 建設・建築家・封鎖の判定

**Files:**
- Modify: `src/game/reducer.ts`
- Test: `__tests__/build.test.ts`

**Interfaces:**
- Consumes: Task 6 までの `reduce`
- Produces:
  - `reduce` が `{ type: 'build'; slotId }` を扱える
  - `canBuild(state: GameState, slotId: number, balance?: Balance): boolean`
  - `buildCostFor(state: GameState, player: PlayerId, slotId: number, balance?: Balance): number`
  - 建築家が `buildDiscount` を立てる

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/build.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { buildCostFor, canBuild, reduce } from '@/game/reducer';
import { scoreOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

const ORDER: CardId[] = [
  'architect',
  'miner',
  'merchant',
  'banker',
  'spy',
  'herald',
  'taxman',
  'blockader',
];

function fixture(coins: number): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.players.you.deck = [...ORDER];
  g.players.you.coins = coins;
  return g;
}

const houseSlot = (g: GameState) => g.market.find((s) => s.buildingId === 'tradingHouse')!.slotId;

describe('建設', () => {
  it('コインを払って自分のものになる', () => {
    const g = fixture(10);
    const slot = houseSlot(g);
    const after = reduce(g, { type: 'build', slotId: slot }, DEFAULT_BALANCE);
    expect(after.players.you.coins).toBe(10 - DEFAULT_BALANCE.buildings.tradingHouse.cost);
    expect(after.market[slot]!.owner).toBe('you');
    expect(scoreOf(after, 'you')).toBe(DEFAULT_BALANCE.buildings.tradingHouse.vp);
  });

  it('コインが足りなければ建てられない', () => {
    const g = fixture(3);
    expect(canBuild(g, houseSlot(g), DEFAULT_BALANCE)).toBe(false);
  });

  it('建設済みのスロットは建てられない', () => {
    const g = fixture(50);
    const slot = houseSlot(g);
    g.market[slot]!.owner = 'cpu';
    expect(canBuild(g, slot, DEFAULT_BALANCE)).toBe(false);
  });

  it('存在しないスロットは建てられない', () => {
    const g = fixture(50);
    expect(canBuild(g, 99, DEFAULT_BALANCE)).toBe(false);
  });

  it('1 ターンに何件でも建てられる', () => {
    let g = fixture(50);
    const slots = g.market.filter((s) => s.buildingId === 'tradingHouse').map((s) => s.slotId);
    for (const slotId of slots) {
      g = reduce(g, { type: 'build', slotId }, DEFAULT_BALANCE);
    }
    expect(g.market.filter((s) => s.owner === 'you')).toHaveLength(3);
  });

  it('建築家はこのターン建てる物件すべてを割り引く', () => {
    let g = fixture(50);
    g = reduce(g, { type: 'useCard', card: 'architect' }, DEFAULT_BALANCE);
    const slots = g.market.filter((s) => s.buildingId === 'tradingHouse').map((s) => s.slotId);
    const before = g.players.you.coins;
    g = reduce(g, { type: 'build', slotId: slots[0]! }, DEFAULT_BALANCE);
    g = reduce(g, { type: 'build', slotId: slots[1]! }, DEFAULT_BALANCE);
    const discounted = DEFAULT_BALANCE.buildings.tradingHouse.cost - DEFAULT_BALANCE.architectDiscount;
    expect(g.players.you.coins).toBe(before - discounted * 2);
  });

  it('建築家の割引で建設費は 0 未満にならない', () => {
    // 割引は「建築家を使ったときの balance」で buildDiscount に積まれる。
    // buildCostFor は積まれた buildDiscount だけを見るので、使用時に強い balance を渡す。
    const strong = { ...DEFAULT_BALANCE, architectDiscount: 100 };
    let g = fixture(50);
    g = reduce(g, { type: 'useCard', card: 'architect' }, strong);
    const slot = houseSlot(g);
    expect(buildCostFor(g, 'you', slot, strong)).toBe(0);

    // 0 まで下がった建設費が、実際の建設でもそのまま使われる
    const coinsBefore = g.players.you.coins;
    const after = reduce(g, { type: 'build', slotId: slot }, strong);
    expect(after.players.you.coins).toBe(coinsBefore);
    expect(after.market[slot]!.owner).toBe('you');
  });

  it('封鎖されたスロットは建てられない', () => {
    const g = fixture(50);
    const slot = houseSlot(g);
    g.players.you.blockedSlot = slot;
    expect(canBuild(g, slot, DEFAULT_BALANCE)).toBe(false);
    expect(canBuild(g, g.market.find((s) => s.buildingId === 'fortress')!.slotId, DEFAULT_BALANCE)).toBe(true);
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- build`
Expected: FAIL（`canBuild` が存在しない）

- [ ] **Step 3: `reducer.ts` に建設と建築家を足す**

```ts
export function buildCostFor(
  state: GameState,
  player: PlayerId,
  slotId: number,
  balance: Balance = DEFAULT_BALANCE,
): number {
  const slot = state.market[slotId];
  if (!slot) return Number.POSITIVE_INFINITY;
  const base = balance.buildings[slot.buildingId].cost;
  return Math.max(0, base - state.players[player].buildDiscount);
}

export function canBuild(
  state: GameState,
  slotId: number,
  balance: Balance = DEFAULT_BALANCE,
): boolean {
  if (state.phase !== 'playing') return false;
  const player = state.current;
  const slot = state.market[slotId];
  if (!slot || slot.owner !== null) return false;
  if (state.players[player].blockedSlot === slotId) return false;
  return state.players[player].coins >= buildCostFor(state, player, slotId, balance);
}

function build(
  state: GameState,
  action: Extract<Action, { type: 'build' }>,
  balance: Balance,
): GameState {
  if (!canBuild(state, action.slotId, balance)) return state;
  const next = structuredClone(state);
  const player = next.current;
  next.players[player].coins -= buildCostFor(state, player, action.slotId, balance);
  next.market[action.slotId]!.owner = player;
  return next;
}
```

`reduce` の `switch` に `case 'build': return build(state, action, balance);` を足す。

`useCard` の効果解決に建築家を足す（`INCOME_CARDS` の分岐の下）。

```ts
  if (action.card === 'architect') {
    p.buildDiscount += balance.architectDiscount;
  }
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test`
Expected: PASS（全件）

- [ ] **Step 5: コミット**

```bash
git add src/game/reducer.ts __tests__/build.test.ts
git commit -m "feat: 建設・建築家の割引・封鎖の判定を追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: 伝令・密偵・徴税官・封鎖者

**Files:**
- Modify: `src/game/reducer.ts`
- Test: `__tests__/cards.test.ts`

**Interfaces:**
- Consumes: Task 7 までの `reduce`
- Produces: 残り 4 種のカード効果。城壁による無効化を含む

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/cards.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { reduce } from '@/game/reducer';
import { handOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

function fixture(deck: CardId[], coins: number): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.players.you.deck = [...deck];
  g.players.you.coins = coins;
  g.players.cpu.coins = 20;
  return g;
}

const WITH_HERALD: CardId[] = [
  'herald',
  'banker',
  'miner',
  'merchant',
  'architect',
  'spy',
  'taxman',
  'blockader',
];

describe('伝令', () => {
  it('選んだカードを使わずに底へ送り、伝令もその下へ回る', () => {
    const g = fixture(WITH_HERALD, 10);
    const after = reduce(
      g,
      { type: 'useCard', card: 'herald', heraldTarget: 'banker' },
      DEFAULT_BALANCE,
    );
    expect(after.players.you.deck).toEqual([
      'miner',
      'merchant',
      'architect',
      'spy',
      'taxman',
      'blockader',
      'banker',
      'herald',
    ]);
  });

  it('送ったカードのコストは払わない', () => {
    const g = fixture(WITH_HERALD, 10);
    const after = reduce(
      g,
      { type: 'useCard', card: 'herald', heraldTarget: 'banker' },
      DEFAULT_BALANCE,
    );
    expect(after.players.you.coins).toBe(10 - DEFAULT_BALANCE.cards.herald.cost);
  });

  it('送ったカードは使用済みにならない', () => {
    const g = fixture(WITH_HERALD, 10);
    const after = reduce(
      g,
      { type: 'useCard', card: 'herald', heraldTarget: 'banker' },
      DEFAULT_BALANCE,
    );
    expect(after.players.you.usedThisTurn).toEqual(['herald']);
  });

  it('手札に無いカードは送れない（状態が変わらない）', () => {
    const g = fixture(WITH_HERALD, 10);
    const after = reduce(
      g,
      { type: 'useCard', card: 'herald', heraldTarget: 'taxman' },
      DEFAULT_BALANCE,
    );
    expect(after).toEqual(g);
  });

  it('対象が伝令自身なら何も起きない', () => {
    const g = fixture(WITH_HERALD, 10);
    const after = reduce(
      g,
      { type: 'useCard', card: 'herald', heraldTarget: 'herald' },
      DEFAULT_BALANCE,
    );
    expect(after).toEqual(g);
  });

  it('対象が未指定なら何も起きない', () => {
    const g = fixture(WITH_HERALD, 10);
    const after = reduce(g, { type: 'useCard', card: 'herald' }, DEFAULT_BALANCE);
    expect(after).toEqual(g);
  });
});

describe('密偵', () => {
  it('相手の手札 4 枚が見える', () => {
    const g = fixture(['spy', 'miner', 'merchant', 'banker', 'architect', 'herald', 'taxman', 'blockader'], 10);
    const after = reduce(g, { type: 'useCard', card: 'spy' }, DEFAULT_BALANCE);
    expect(after.revealedOpponentHand).toEqual(handOf(g, 'cpu'));
  });
});

describe('徴税官', () => {
  it('相手のコインを 5 減らす', () => {
    const g = fixture(['taxman', 'miner', 'merchant', 'banker', 'architect', 'spy', 'herald', 'blockader'], 10);
    const after = reduce(g, { type: 'useCard', card: 'taxman' }, DEFAULT_BALANCE);
    expect(after.players.cpu.coins).toBe(20 - DEFAULT_BALANCE.taxmanAmount);
  });

  it('相手のコインが足りなければ 0 で止まる', () => {
    const g = fixture(['taxman', 'miner', 'merchant', 'banker', 'architect', 'spy', 'herald', 'blockader'], 10);
    g.players.cpu.coins = 2;
    const after = reduce(g, { type: 'useCard', card: 'taxman' }, DEFAULT_BALANCE);
    expect(after.players.cpu.coins).toBe(0);
  });

  it('相手が城壁を持っていると無効。コストは払う', () => {
    const g = fixture(['taxman', 'miner', 'merchant', 'banker', 'architect', 'spy', 'herald', 'blockader'], 10);
    g.market.find((s) => s.buildingId === 'wall')!.owner = 'cpu';
    const after = reduce(g, { type: 'useCard', card: 'taxman' }, DEFAULT_BALANCE);
    expect(after.players.cpu.coins).toBe(20);
    expect(after.players.you.coins).toBe(10 - DEFAULT_BALANCE.cards.taxman.cost);
  });
});

describe('封鎖者', () => {
  it('相手の建設不可スロットを立てる', () => {
    const g = fixture(['blockader', 'miner', 'merchant', 'banker', 'architect', 'spy', 'herald', 'taxman'], 10);
    const target = g.market.find((s) => s.buildingId === 'fortress')!.slotId;
    const after = reduce(
      g,
      { type: 'useCard', card: 'blockader', blockadeSlot: target },
      DEFAULT_BALANCE,
    );
    expect(after.players.cpu.blockedSlot).toBe(target);
  });

  it('相手が城壁を持っていると無効。コストは払う', () => {
    const g = fixture(['blockader', 'miner', 'merchant', 'banker', 'architect', 'spy', 'herald', 'taxman'], 10);
    g.market.find((s) => s.buildingId === 'wall')!.owner = 'cpu';
    const after = reduce(
      g,
      { type: 'useCard', card: 'blockader', blockadeSlot: 7 },
      DEFAULT_BALANCE,
    );
    expect(after.players.cpu.blockedSlot).toBeNull();
    expect(after.players.you.coins).toBe(10 - DEFAULT_BALANCE.cards.blockader.cost);
  });

  it('存在しないスロットは封鎖できない（状態が変わらない）', () => {
    const g = fixture(['blockader', 'miner', 'merchant', 'banker', 'architect', 'spy', 'herald', 'taxman'], 10);
    const after = reduce(
      g,
      { type: 'useCard', card: 'blockader', blockadeSlot: 99 },
      DEFAULT_BALANCE,
    );
    expect(after).toEqual(g);
  });

  it('建設済みのスロットは封鎖できない（状態が変わらない）', () => {
    const g = fixture(['blockader', 'miner', 'merchant', 'banker', 'architect', 'spy', 'herald', 'taxman'], 10);
    g.market[7]!.owner = 'you';
    const after = reduce(
      g,
      { type: 'useCard', card: 'blockader', blockadeSlot: 7 },
      DEFAULT_BALANCE,
    );
    expect(after).toEqual(g);
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- cards`
Expected: FAIL（効果が未実装）

- [ ] **Step 3: `useCard` に 4 種の効果を足す**

`useCard` の先頭に、対象を要求するカードの妥当性検査を足す。

```ts
function useCard(
  state: GameState,
  action: Extract<Action, { type: 'useCard' }>,
  balance: Balance,
): GameState {
  if (!canUseCard(state, action.card, balance)) return state;

  const player = state.current;
  const foe = opponentOf(player);

  // 対象を取るカードは、対象が妥当でなければ何も起きない
  if (action.card === 'herald') {
    const target = action.heraldTarget;
    if (!target || target === 'herald') return state;
    if (!handOf(state, player, balance).includes(target)) return state;
  }
  if (action.card === 'blockader') {
    const slot = action.blockadeSlot;
    if (slot === undefined) return state;
    if (!state.market[slot] || state.market[slot]!.owner !== null) return state;
  }

  const next = structuredClone(state);
  const p = next.players[player];

  p.coins -= cardCostFor(state, player, action.card, balance);
  p.usedAnyCardThisTurn = true;
  p.usedThisTurn = [...p.usedThisTurn, action.card];

  if (INCOME_CARDS.includes(action.card)) {
    p.pendingIncome = [...p.pendingIncome, action.card];
  }
  if (action.card === 'architect') {
    p.buildDiscount += balance.architectDiscount;
  }
  if (action.card === 'spy') {
    next.revealedOpponentHand = handOf(next, foe, balance);
  }
  if (action.card === 'taxman' && !hasBuilding(next, foe, 'wall')) {
    next.players[foe].coins = Math.max(0, next.players[foe].coins - balance.taxmanAmount);
  }
  if (action.card === 'blockader' && !hasBuilding(next, foe, 'wall')) {
    next.players[foe].blockedSlot = action.blockadeSlot!;
  }
  if (action.card === 'herald') {
    // 伝令を一旦抜き、対象を底へ送り、その下に伝令を置く
    const withoutHerald = p.deck.filter((c) => c !== 'herald');
    p.deck = [...moveToBottom(withoutHerald, action.heraldTarget!), 'herald'];
    return next;
  }

  p.deck = moveToBottom(p.deck, action.card);
  return next;
}
```

import 文に `opponentOf` を足す。

```ts
import { countBuilding, handOf, hasBuilding, opponentOf, ownedSlots } from './selectors';
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test`
Expected: PASS（全件）

- [ ] **Step 5: コミット**

```bash
git add src/game/reducer.ts __tests__/cards.test.ts
git commit -m "feat: 伝令・密偵・徴税官・封鎖者の効果を追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: ターン終了・街道・終了条件・勝敗

**Files:**
- Modify: `src/game/reducer.ts`, `src/game/selectors.ts`
- Test: `__tests__/turn.test.ts`

**Interfaces:**
- Consumes: Task 8 までの `reduce`
- Produces:
  - `reduce` が `{ type: 'endTurn' }` と `{ type: 'useRoad'; target }` を扱える
  - `winnerOf(state: GameState, balance?: Balance): PlayerId | 'draw' | null`（未終了なら null）
  - `canUseRoad(state: GameState, target: CardId, balance?: Balance): boolean`

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/turn.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { reduce } from '@/game/reducer';
import { scoreOf, winnerOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

const ORDER: CardId[] = [
  'miner',
  'merchant',
  'banker',
  'architect',
  'spy',
  'herald',
  'taxman',
  'blockader',
];

function fixture(): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.players.you.deck = [...ORDER];
  g.players.you.coins = 50;
  return g;
}

describe('ターン終了', () => {
  it('手番が相手に移り、ターン数が進む', () => {
    const g = fixture();
    const after = reduce(g, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(after.current).toBe('cpu');
    expect(after.turn).toBe(g.turn + 1);
  });

  it('自分への封鎖と密偵の結果が消える', () => {
    const g = fixture();
    g.players.you.blockedSlot = 3;
    g.revealedOpponentHand = ['miner'];
    const after = reduce(g, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(after.players.you.blockedSlot).toBeNull();
    expect(after.revealedOpponentHand).toBeNull();
  });

  it('何もせずに終えられる', () => {
    const g = fixture();
    const after = reduce(g, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(after.phase).toBe('playing');
  });
});

describe('街道', () => {
  it('街道があれば手札 1 枚を無料で底へ送れる', () => {
    const g = fixture();
    g.market.find((s) => s.buildingId === 'road')!.owner = 'you';
    const before = g.players.you.coins;
    const after = reduce(g, { type: 'useRoad', target: 'banker' }, DEFAULT_BALANCE);
    expect(after.players.you.deck).toEqual([
      'miner',
      'merchant',
      'architect',
      'spy',
      'herald',
      'taxman',
      'blockader',
      'banker',
    ]);
    expect(after.players.you.coins).toBe(before);
    expect(after.players.you.roadUsedThisTurn).toBe(true);
  });

  it('1 ターンに 1 回だけ', () => {
    let g = fixture();
    g.market.find((s) => s.buildingId === 'road')!.owner = 'you';
    g = reduce(g, { type: 'useRoad', target: 'banker' }, DEFAULT_BALANCE);
    const twice = reduce(g, { type: 'useRoad', target: 'miner' }, DEFAULT_BALANCE);
    expect(twice).toEqual(g);
  });

  it('街道を持っていなければ使えない', () => {
    const g = fixture();
    const after = reduce(g, { type: 'useRoad', target: 'banker' }, DEFAULT_BALANCE);
    expect(after).toEqual(g);
  });
});

describe('終了条件', () => {
  it('物件が全て建つと終了する', () => {
    const g = fixture();
    g.market.forEach((s, i) => (s.owner = i < 5 ? 'you' : 'cpu'));
    const after = reduce(g, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(after.phase).toBe('finished');
  });

  it('上限ターンで終了する', () => {
    const g = fixture();
    g.turn = DEFAULT_BALANCE.maxTurnsPerPlayer * 2;
    const after = reduce(g, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(after.phase).toBe('finished');
  });

  it('未終了なら勝者は null', () => {
    expect(winnerOf(fixture(), DEFAULT_BALANCE)).toBeNull();
  });

  it('VP が多い方が勝つ', () => {
    const g = fixture();
    g.market.forEach((s) => (s.owner = 'cpu'));
    g.market.find((s) => s.buildingId === 'fortress')!.owner = 'you';
    const after = reduce(g, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(winnerOf(after, DEFAULT_BALANCE)).toBe('cpu');
  });

  it('VP 同点なら残コインが多い方が勝つ', () => {
    const g = fixture();
    // 城塞を 1 つずつ持たせ、他は誰のものでもない状態にすると VP は 6 対 6
    const fortresses = g.market.filter((s) => s.buildingId === 'fortress');
    fortresses[0]!.owner = 'you';
    fortresses[1]!.owner = 'cpu';
    g.turn = DEFAULT_BALANCE.maxTurnsPerPlayer * 2;
    g.players.you.coins = 10;
    g.players.cpu.coins = 3;
    const after = reduce(g, { type: 'endTurn' }, DEFAULT_BALANCE);
    expect(after.phase).toBe('finished');
    expect(scoreOf(after, 'you', DEFAULT_BALANCE)).toBe(scoreOf(after, 'cpu', DEFAULT_BALANCE));
    expect(winnerOf(after, DEFAULT_BALANCE)).toBe('you');
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- turn`
Expected: FAIL（`winnerOf` が存在しない）

- [ ] **Step 3: `selectors.ts` に `winnerOf` を足す**

```ts
/** 勝者。まだ終わっていなければ null。 */
export function winnerOf(
  state: GameState,
  balance: Balance = DEFAULT_BALANCE,
): PlayerId | 'draw' | null {
  if (state.phase !== 'finished') return null;
  const you = scoreOf(state, 'you', balance);
  const cpu = scoreOf(state, 'cpu', balance);
  if (you !== cpu) return you > cpu ? 'you' : 'cpu';
  const youCoins = state.players.you.coins;
  const cpuCoins = state.players.cpu.coins;
  if (youCoins !== cpuCoins) return youCoins > cpuCoins ? 'you' : 'cpu';
  return 'draw';
}
```

- [ ] **Step 4: `reducer.ts` に `endTurn` と `useRoad` を足す**

```ts
export function canUseRoad(
  state: GameState,
  target: CardId,
  balance: Balance = DEFAULT_BALANCE,
): boolean {
  if (state.phase !== 'playing') return false;
  const player = state.current;
  if (!hasBuilding(state, player, 'road')) return false;
  if (state.players[player].roadUsedThisTurn) return false;
  return handOf(state, player, balance).includes(target);
}

function useRoad(
  state: GameState,
  action: Extract<Action, { type: 'useRoad' }>,
  balance: Balance,
): GameState {
  if (!canUseRoad(state, action.target, balance)) return state;
  const next = structuredClone(state);
  const p = next.players[next.current];
  p.deck = moveToBottom(p.deck, action.target);
  p.roadUsedThisTurn = true;
  return next;
}

function endTurn(state: GameState, balance: Balance): GameState {
  if (state.phase !== 'playing') return state;
  const next = structuredClone(state);
  const player = next.current;

  // 自分に掛かっていた封鎖はこのターンの終わりで解ける
  next.players[player].blockedSlot = null;
  next.revealedOpponentHand = null;

  const allBuilt = next.market.every((s) => s.owner !== null);
  const overTurnLimit = next.turn >= balance.maxTurnsPerPlayer * 2;
  if (allBuilt || overTurnLimit) {
    next.phase = 'finished';
    return next;
  }

  next.turn += 1;
  next.current = opponentOf(player);
  return next;
}
```

`reduce` の `switch` に 2 件足す。

```ts
    case 'useRoad':
      return useRoad(state, action, balance);
    case 'endTurn':
      return endTurn(state, balance);
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npm test`
Expected: PASS（全件）

- [ ] **Step 6: コミット**

```bash
git add src/game/reducer.ts src/game/selectors.ts __tests__/turn.test.ts
git commit -m "feat: ターン終了・街道・終了条件・勝敗判定を追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: 合法手の列挙

**Files:**
- Modify: `src/game/reducer.ts`
- Test: `__tests__/selectors.test.ts`

**Interfaces:**
- Consumes: Task 9 までの `canUseCard` `canBuild` `canUseRoad`
- Produces: `legalActions(state: GameState, balance?: Balance): Action[]`
  （`endTurn` を必ず含む。`useCard` の対象違いは別の行動として展開する）

`selectors.ts` ではなく `reducer.ts` に置く。`legalActions` は `canUseCard` などを使うので、
`selectors.ts` に置くと `selectors ↔ reducer` の循環 import になる。
`reducer` が `selectors` に片方向で依存する形を保つ。

AI と UI の両方がこれを使う。片方だけが知っている合法手があると必ずズレるので、1 か所にまとめる。

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/selectors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { DEFAULT_BALANCE } from '@/game/balance';
import { legalActions } from '@/game/reducer';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

const ORDER: CardId[] = [
  'herald',
  'blockader',
  'miner',
  'merchant',
  'banker',
  'architect',
  'spy',
  'taxman',
];

function fixture(coins: number): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.players.you.deck = [...ORDER];
  g.players.you.coins = coins;
  return g;
}

describe('合法手', () => {
  it('常に endTurn を含む', () => {
    const g = fixture(0);
    expect(legalActions(g, DEFAULT_BALANCE).some((a) => a.type === 'endTurn')).toBe(true);
  });

  it('コインが 0 なら endTurn しか無い', () => {
    const g = fixture(0);
    expect(legalActions(g, DEFAULT_BALANCE)).toEqual([{ type: 'endTurn' }]);
  });

  it('伝令は送る対象ごとに別の行動になる', () => {
    const g = fixture(5);
    const heralds = legalActions(g, DEFAULT_BALANCE).filter(
      (a) => a.type === 'useCard' && a.card === 'herald',
    );
    // 手札は herald / blockader / miner / merchant なので、送れるのは 3 枚
    expect(heralds).toHaveLength(3);
  });

  it('封鎖者は未建設スロットごとに別の行動になる', () => {
    const g = fixture(5);
    const blocks = legalActions(g, DEFAULT_BALANCE).filter(
      (a) => a.type === 'useCard' && a.card === 'blockader',
    );
    expect(blocks).toHaveLength(10);
  });

  it('建てられる物件が行動に出る', () => {
    const g = fixture(100);
    const builds = legalActions(g, DEFAULT_BALANCE).filter((a) => a.type === 'build');
    expect(builds).toHaveLength(10);
  });

  it('終了後は合法手が無い', () => {
    const g = fixture(100);
    g.phase = 'finished';
    expect(legalActions(g, DEFAULT_BALANCE)).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- selectors`
Expected: FAIL（`legalActions` が存在しない）

- [ ] **Step 3: `reducer.ts` の末尾に `legalActions` を足す**

`canUseCard` `canBuild` `canUseRoad` と同じファイルに置くことで、循環 import を避ける。

```ts
/** いま打てる行動をすべて並べる。AI と UI がこれを共有する。
 *  対象を取るカード（伝令・封鎖者）は、対象ごとに別の行動として展開する。 */
export function legalActions(
  state: GameState,
  balance: Balance = DEFAULT_BALANCE,
): Action[] {
  if (state.phase !== 'playing') return [];
  const player = state.current;
  const hand = handOf(state, player, balance);
  const out: Action[] = [];

  for (const card of hand) {
    if (!canUseCard(state, card, balance)) continue;
    if (card === 'herald') {
      for (const target of hand) {
        if (target !== 'herald') out.push({ type: 'useCard', card, heraldTarget: target });
      }
    } else if (card === 'blockader') {
      for (const slot of state.market) {
        if (slot.owner === null) {
          out.push({ type: 'useCard', card, blockadeSlot: slot.slotId });
        }
      }
    } else {
      out.push({ type: 'useCard', card });
    }
  }

  for (const slot of state.market) {
    if (canBuild(state, slot.slotId, balance)) out.push({ type: 'build', slotId: slot.slotId });
  }

  for (const card of hand) {
    if (canUseRoad(state, card, balance)) out.push({ type: 'useRoad', target: card });
  }

  out.push({ type: 'endTurn' });
  return out;
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test`
Expected: PASS（全件）

- [ ] **Step 5: コミット**

```bash
git add src/game/reducer.ts __tests__/selectors.test.ts
git commit -m "feat: 合法手の列挙を追加（AI と UI で共有する）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: CPU の思考

**Files:**
- Create: `src/ai/evaluate.ts`, `src/ai/choose.ts`
- Test: `__tests__/ai.test.ts`

**Interfaces:**
- Consumes: `legalActions` `reduce` `scoreOf` `ownedSlots`
- Produces:
  - `type Difficulty = 'easy' | 'normal' | 'hard'`
  - `evaluateState(state: GameState, player: PlayerId, balance?: Balance): number`
  - `chooseAction(state: GameState, difficulty: Difficulty, rng: Rng, balance?: Balance): Action`
  - `playTurn(state: GameState, difficulty: Difficulty, rng: Rng, balance?: Balance): GameState`
    （`startTurn` から `endTurn` までを一気に進める）

**CPU は相手の手札とデッキ順を参照しない。** 密偵を使ったときだけ `revealedOpponentHand` を読む。

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/ai.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { chooseAction, playTurn } from '@/ai/choose';
import { evaluateState } from '@/ai/evaluate';
import { DEFAULT_BALANCE } from '@/game/balance';
import { createRng } from '@/game/rng';
import { scoreOf } from '@/game/selectors';
import { createGame } from '@/game/setup';

describe('評価関数', () => {
  it('VP が高いほど評価が高い', () => {
    const poor = createGame(3);
    const rich = createGame(3);
    rich.market.find((s) => s.buildingId === 'fortress')!.owner = 'you';
    expect(evaluateState(rich, 'you', DEFAULT_BALANCE)).toBeGreaterThan(
      evaluateState(poor, 'you', DEFAULT_BALANCE),
    );
  });

  it('コインが多いほど評価が高い', () => {
    const a = createGame(3);
    const b = createGame(3);
    b.players.you.coins += 20;
    expect(evaluateState(b, 'you', DEFAULT_BALANCE)).toBeGreaterThan(
      evaluateState(a, 'you', DEFAULT_BALANCE),
    );
  });
});

describe('行動選択', () => {
  it('必ず合法手を返す', () => {
    const g = createGame(11);
    const action = chooseAction(g, 'normal', createRng(1), DEFAULT_BALANCE);
    expect(action).toBeDefined();
  });

  it('同じ状態と同じシードからは同じ手を返す', () => {
    const g = createGame(11);
    const a = chooseAction(g, 'normal', createRng(7), DEFAULT_BALANCE);
    const b = chooseAction(g, 'normal', createRng(7), DEFAULT_BALANCE);
    expect(a).toEqual(b);
  });
});

describe('1 ターンを通す', () => {
  it('手番が相手に移る', () => {
    const g = createGame(11);
    const after = playTurn(g, 'normal', createRng(1), DEFAULT_BALANCE);
    expect(after.current).not.toBe(g.current);
  });

  it('試合が必ず終わる', () => {
    let g = createGame(11);
    const rng = createRng(1);
    let guard = 0;
    while (g.phase === 'playing' && guard < 200) {
      g = playTurn(g, 'normal', rng, DEFAULT_BALANCE);
      guard++;
    }
    expect(g.phase).toBe('finished');
    expect(guard).toBeLessThan(200);
  });

  it('ふつうは、やさしいより強い', () => {
    let normalWins = 0;
    for (let seed = 0; seed < 40; seed++) {
      let g = createGame(seed);
      const rng = createRng(seed + 1000);
      // 'you' を normal、'cpu' を easy として回す
      let guard = 0;
      while (g.phase === 'playing' && guard < 200) {
        g = playTurn(g, g.current === 'you' ? 'normal' : 'easy', rng, DEFAULT_BALANCE);
        guard++;
      }
      if (scoreOf(g, 'you') > scoreOf(g, 'cpu')) normalWins++;
    }
    expect(normalWins).toBeGreaterThan(20);
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- ai`
Expected: FAIL（`@/ai/evaluate` が解決できない）

- [ ] **Step 3: `src/ai/evaluate.ts` を書く**

```ts
import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { countBuilding, handOf, opponentOf, ownedSlots, scoreOf } from '@/game/selectors';
import type { GameState, PlayerId } from '@/game/types';

/** 重み。ハードな条件分岐ではなく、ここの重みで振る舞いを決める。 */
const W = {
  vp: 10,
  coin: 1,
  /** 相手の手持ちコイン。奪えば相手の購買力が落ちるので、マイナスに効く */
  opponentCoin: -0.8,
  pendingIncome: 1.2,
  incomePerTurn: 3,
  opponentVp: -8,
  /** 相手が次のターンに買えてしまう物件の価値 */
  threat: -0.6,
  /** 手札のうち、いま払えないカードの枚数 */
  stuck: -1.5,
};

/** 残りターンの多さ。序盤は収入を、終盤は VP を重く見るための係数。 */
function lateness(state: GameState, balance: Balance): number {
  return Math.min(1, state.turn / (balance.maxTurnsPerPlayer * 2));
}

export function evaluateState(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  const foe = opponentOf(player);
  const p = state.players[player];
  const late = lateness(state, balance);

  const incomePerTurn =
    balance.baseIncome + countBuilding(state, player, 'tradingHouse') * balance.tradingHouseIncome;

  let threat = 0;
  for (const slot of state.market) {
    if (slot.owner !== null) continue;
    const cost = balance.buildings[slot.buildingId].cost;
    if (state.players[foe].coins >= cost) {
      threat += balance.buildings[slot.buildingId].vp;
    }
  }

  // 手札のうち、いま払えないカードの枚数。詰まっているほど打てる手が無い
  const stuck = handOf(state, player, balance).filter(
    (c) => p.coins < balance.cards[c].cost,
  ).length;

  return (
    scoreOf(state, player, balance) * W.vp * (0.5 + late) +
    scoreOf(state, foe, balance) * W.opponentVp * (0.5 + late) +
    p.coins * W.coin +
    state.players[foe].coins * W.opponentCoin +
    stuck * W.stuck +
    p.pendingIncome.length * W.pendingIncome * 4 +
    incomePerTurn * W.incomePerTurn * (1 - late) +
    ownedSlots(state, player).length * 2 +
    threat * W.threat * (1 - late)
  );
}
```

- [ ] **Step 4: `src/ai/choose.ts` を書く**

```ts
import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { legalActions, reduce } from '@/game/reducer';
import type { Rng } from '@/game/rng';
import type { Action, GameState } from '@/game/types';

import { evaluateState } from './evaluate';

export type Difficulty = 'easy' | 'normal' | 'hard';

/** 難易度ごとの揺らぎ。easy ほど評価をぶらして弱くする。 */
const NOISE: Record<Difficulty, number> = { easy: 45, normal: 3, hard: 0 };

/** 妨害カードを検討する確率。easy は妨害をあまり撃たない。 */
const HARASS_RATE: Record<Difficulty, number> = { easy: 0.25, normal: 0.8, hard: 1 };

function isHarass(action: Action): boolean {
  return (
    action.type === 'useCard' && (action.card === 'taxman' || action.card === 'blockader')
  );
}

export function chooseAction(
  state: GameState,
  difficulty: Difficulty,
  rng: Rng,
  balance: Balance = DEFAULT_BALANCE,
): Action {
  const player = state.current;
  const actions = legalActions(state, balance).filter(
    (a) => !isHarass(a) || rng.next() < HARASS_RATE[difficulty],
  );
  if (actions.length === 0) return { type: 'endTurn' };

  let best: Action = { type: 'endTurn' };
  let bestScore = -Infinity;

  for (const action of actions) {
    const after = reduce(state, action, balance);
    // endTurn の評価は「このターンをここで終える価値」なので、
    // 手番が移った後の局面をそのまま自分視点で測る
    let score = evaluateState(after, player, balance);
    if (difficulty === 'hard' && action.type !== 'endTurn') {
      // 1 手だけ先を読む。自分の最善応手ぶんを少し上乗せする
      const follow = legalActions(after, balance)
        .map((a) => evaluateState(reduce(after, a, balance), player, balance))
        .reduce((m, v) => Math.max(m, v), -Infinity);
      if (follow > -Infinity) score = score * 0.6 + follow * 0.4;
    }
    score += (rng.next() - 0.5) * NOISE[difficulty];
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }
  return best;
}

/** 開始フェーズから終了フェーズまでを一気に進める。 */
export function playTurn(
  state: GameState,
  difficulty: Difficulty,
  rng: Rng,
  balance: Balance = DEFAULT_BALANCE,
): GameState {
  let next = reduce(state, { type: 'startTurn' }, balance);
  // 行動は有限（カード 8 種・建設 10 件・街道 1 回）なので、上限は安全網
  for (let i = 0; i < 40; i++) {
    const action = chooseAction(next, difficulty, rng, balance);
    if (action.type === 'endTurn') break;
    const applied = reduce(next, action, balance);
    if (applied === next) break;
    next = applied;
  }
  return reduce(next, { type: 'endTurn' }, balance);
}
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npm test -- ai`
Expected: PASS（6 件）

もし「ふつうは、やさしいより強い」が落ちたら、`NOISE.easy` を上げる。
評価関数の重みを先に触らないこと。難易度差はノイズで作る。

- [ ] **Step 6: コミット**

```bash
git add src/ai __tests__/ai.test.ts
git commit -m "feat: CPU の評価関数と行動選択を追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 12: 対戦シミュレーターで実測する

**Files:**
- Create: `scripts/simulate.ts`
- Modify: `docs/superpowers/specs/2026-09-14-city-builders-design.md`（実測結果を追記）

**Interfaces:**
- Consumes: `createGame` `playTurn` `scoreOf` `DEFAULT_BALANCE`
- Produces: `npm run simulate` が下の表を出力する

これは常設の監査ツール。**パラメータを触ったら毎回走らせる。**

- [ ] **Step 1: `scripts/simulate.ts` を書く**

```ts
/** 対戦シミュレーター。常設の監査ツール。
 *
 *   npm run simulate
 *   npm run simulate -- 5000
 *
 * 数値を触ったら毎回走らせること。過去の測定結果は実装を変えたら古くなる。 */
import { playTurn, type Difficulty } from '../src/ai/choose';
import { DEFAULT_BALANCE } from '../src/game/balance';
import { reduce } from '../src/game/reducer';
import { createRng } from '../src/game/rng';
import { winnerOf } from '../src/game/selectors';
import { createGame } from '../src/game/setup';
import type { GameState, PlayerId } from '../src/game/types';

const GAMES = Number(process.argv[2] ?? 2000);

interface Result {
  winner: PlayerId | 'draw';
  turns: number;
  first: PlayerId;
  stuckTurns: number;
  totalTurns: number;
  harassUsed: number;
}

function runOne(seed: number, difficulty: Difficulty): Result {
  let g: GameState = createGame(seed, DEFAULT_BALANCE);
  const first = g.current;
  const rng = createRng(seed * 31 + 7);
  let stuckTurns = 0;
  let totalTurns = 0;
  let harassUsed = 0;

  while (g.phase === 'playing' && totalTurns < 200) {
    const before = g;
    // 詰まりは「行動フェーズに入った時点」で測る。開始フェーズの収入が入る前に測ると、
    // 貪欲な AI が前のターンに使い切った直後の残高を見ることになり、実態よりはるかに高く出る。
    const atAction = reduce(before, { type: 'startTurn' }, DEFAULT_BALANCE);
    g = playTurn(g, difficulty, rng, DEFAULT_BALANCE);
    totalTurns++;
    const p = atAction.players[atAction.current];
    const hand = p.deck.slice(0, DEFAULT_BALANCE.handSize);
    const unaffordable = hand.filter((c) => p.coins < DEFAULT_BALANCE.cards[c].cost).length;
    if (unaffordable >= 3) stuckTurns++;
    const used = g.players[before.current].usedThisTurn;
    if (used.includes('taxman') || used.includes('blockader')) harassUsed++;
  }

  return {
    winner: winnerOf(g, DEFAULT_BALANCE) ?? 'draw',
    turns: Math.ceil(totalTurns / 2),
    first,
    stuckTurns,
    totalTurns,
    harassUsed,
  };
}

const results: Result[] = [];
for (let seed = 0; seed < GAMES; seed++) {
  results.push(runOne(seed, 'normal'));
}

const firstWins = results.filter((r) => r.winner === r.first).length;
const draws = results.filter((r) => r.winner === 'draw').length;
const avgTurns = results.reduce((s, r) => s + r.turns, 0) / results.length;
const stuckRate =
  results.reduce((s, r) => s + r.stuckTurns, 0) / results.reduce((s, r) => s + r.totalTurns, 0);
const harassRate =
  results.reduce((s, r) => s + r.harassUsed, 0) / results.reduce((s, r) => s + r.totalTurns, 0);

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

console.log(`試合数: ${GAMES}`);
console.log('');
console.log('| 項目 | 実測 | 目標 |');
console.log('|---|---|---|');
console.log(`| 先手勝率 | ${pct(firstWins / GAMES)} | 48〜52% |`);
console.log(`| 引き分け率 | ${pct(draws / GAMES)} | 参考 |`);
console.log(`| 平均ターン数（1 人あたり） | ${avgTurns.toFixed(1)} | 12〜18 |`);
console.log(`| 手札詰まり率 | ${pct(stuckRate)} | 15% 未満 |`);
console.log(`| 妨害カード使用率 | ${pct(harassRate)} | 10〜25% |`);
```

- [ ] **Step 2: 走らせて実測する**

Run: `npm run simulate`
Expected: 表が出力される

- [ ] **Step 3: 明らかな破綻だけ直す**

**目標値に合わせ込まない。** 直すのは次のどれかに当たったときだけ。

| 破綻 | 直す場所 |
|---|---|
| 先手勝率が 60% を超える／40% を下回る | `startingCoins.second` |
| 平均ターン数が 25 を超える／8 を下回る | `buildings` のコストと `minerIncome` 等の収入 |
| 手札詰まり率が 30% を超える | 高コストカードのコスト |
| 引き分け率が 20% を超える | 物件の VP をばらけさせる |

直したら再測定する。細かい調整は Phase 3 で遊びながら行う。

- [ ] **Step 4: 実測結果を仕様書に追記する**

`docs/superpowers/specs/2026-09-14-city-builders-design.md` の第 13 節の末尾に、
測定日と結果の表、および変更したパラメータを追記する。

- [ ] **Step 5: コミット**

```bash
git add scripts/simulate.ts src/game/balance.ts docs/superpowers/specs/
git commit -m "feat: 対戦シミュレーターを追加し、初回の実測結果を記録

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 13: shared-ui の配布とアプリのシェル

**Files:**
- Modify: `C:\claude\shared-ui\sync.mjs`（配り先に city-builders を足す）
- Create: `src/ui/styles.css`, `src/ui/Home.tsx`, `src/storage/storage.ts`
- Modify: `src/App.tsx`
- Test: 手動確認（`npm run dev`）

**Interfaces:**
- Consumes: なし
- Produces:
  - `src/ui/shared/tokens.css` `chrome.css` `tool-icons.tsx`（生成物）
  - `<Home onStart={(difficulty) => void}/>`
  - `loadProgress(): Progress` / `saveProgress(p: Progress): void`
  - `interface Progress { wins: number; losses: number; lastDifficulty: Difficulty }`

- [ ] **Step 1: `shared-ui/sync.mjs` の配り先に city-builders を足す**

`TARGETS` 配列に 1 行足す。

```js
  join(root, 'city-builders', 'src', 'ui', 'shared'),
```

`ICON_TARGETS` 配列に 1 行足す。

```js
  [join(root, 'city-builders', 'src', 'ui', 'shared', 'tool-icons.tsx'), emitTsx],
```

- [ ] **Step 2: 配って、ずれが無いことを確かめる**

Run: `node C:/claude/shared-ui/sync.mjs`
Expected: `src/ui/shared/` に 3 ファイルが出来る
Run: `node C:/claude/shared-ui/sync.mjs --check`
Expected: ずれ 0

- [ ] **Step 3: `src/storage/storage.ts` を書く**

```ts
import type { Difficulty } from '@/ai/choose';

export interface Progress {
  wins: number;
  losses: number;
  lastDifficulty: Difficulty;
}

const KEY = 'city-builders:progress';
const EMPTY: Progress = { wins: 0, losses: 0, lastDifficulty: 'normal' };

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<Progress>) };
  } catch {
    return EMPTY;
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // 保存できなくても遊べる
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
}
```

- [ ] **Step 4: `src/ui/Home.tsx` を書く**

`shared-ui` の `.app-home` `.home` `.home-title` `.home-buttons` `.home-btn` を使う。
**「あそびかた」と「きろくをけす」は置かない。**

```tsx
import type { Difficulty } from '@/ai/choose';
import { loadProgress } from '@/storage/storage';

const LABELS: Record<Difficulty, string> = {
  easy: 'やさしい',
  normal: 'ふつう',
  hard: 'つよい',
};

export function Home({ onStart }: { onStart: (d: Difficulty) => void }) {
  const progress = loadProgress();
  return (
    <div className="app-home">
      <div className="home">
        <h1 className="home-title">シティビルダーズ</h1>
        <p className="home-sub">人物を回して、都市を建てる</p>
        <div className="home-buttons">
          {(['easy', 'normal', 'hard'] as const).map((d) => (
            <button
              key={d}
              className={`home-btn${d === progress.lastDifficulty ? ' primary' : ''}`}
              onClick={() => onStart(d)}
            >
              {LABELS[d]}
            </button>
          ))}
        </div>
        <p className="home-progress">
          {progress.wins} 勝 {progress.losses} 敗
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `src/App.tsx` をホームとプレイ画面の切り替えにする**

```tsx
import { useState } from 'react';

import type { Difficulty } from '@/ai/choose';

import { Home } from './ui/Home';
import './ui/shared/tokens.css';
import './ui/shared/chrome.css';
import './ui/styles.css';

export function App() {
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);

  if (difficulty === null) return <Home onStart={setDifficulty} />;
  return (
    <div className="app">
      <p>準備中: {difficulty}</p>
      <button onClick={() => setDifficulty(null)}>戻る</button>
    </div>
  );
}
```

- [ ] **Step 6: `src/ui/styles.css` を空の土台として作る**

```css
/* シティビルダーズ固有の見た目。共通部分は shared/ にある。 */

/* 盤面は操作で 1px も動かないこと。行と列を両方明示する。 */
.market {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: var(--gap);
  padding: 0 var(--pad);
}
```

- [ ] **Step 7: 画面が出ることを確かめる**

Run: `npm run dev`
Expected: ホームが `shared-ui` の見た目で出る。難易度ボタンを押すと切り替わる
Run: `npm run build`
Expected: 型エラー無し

- [ ] **Step 8: コミット**

```bash
git add -A
git commit -m "feat: shared-ui を配り、ホーム画面と保存を追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

`shared-ui/sync.mjs` は git 管理外なので、このコミットには入らない。変更したことを口頭で伝える。

---

## Task 14: プレイ画面

**Files:**
- Create: `src/ui/Game.tsx`, `src/ui/Market.tsx`, `src/ui/Hand.tsx`, `src/ui/CoinBar.tsx`, `src/ui/OpponentStrip.tsx`, `src/ui/Sheets.tsx`
- Modify: `src/App.tsx`, `src/ui/styles.css`
- Test: 手動確認

**Interfaces:**
- Consumes: Task 11 までのすべて
- Produces: 難易度を選ぶと対戦が最後まで遊べる

### 画面の決まり

- 1 行目は戻る・タイトル・?・設定の 4 つだけ
- 2 行目（`.status-bar`）はターン数・自分 VP・相手 VP・残り物件数
- 建設済みの物件は**市場の位置に残し、所有者色に塗る**。位置は動かさない
- 自分＝青系、CPU＝橙系
- 手札は下部固定。左に next を 1 枚だけ小さく出す
- コインは手札のすぐ上に全幅バー。右端に「次のターン +N」
- 物件と手札はタップで詳細シートを開く。効果テキストはセルに書かない
- ツール行は置かない

- [ ] **Step 1: `src/ui/CoinBar.tsx` を書く**

```tsx
import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { countBuilding, hasBuilding, ownedSlots } from '@/game/selectors';
import type { GameState } from '@/game/types';

/** 次のターン開始時に入る見込み額。遅延収入のゲームなので、これが無いと判断できない。 */
function forecast(state: GameState, balance: Balance): number {
  const p = state.players.you;
  const bonus = hasBuilding(state, 'you', 'exchange') ? balance.exchangeBonus : 0;
  let total =
    balance.baseIncome + countBuilding(state, 'you', 'tradingHouse') * balance.tradingHouseIncome;
  for (const card of p.pendingIncome) {
    if (card === 'miner') total += balance.minerIncome + bonus;
    if (card === 'merchant') total += balance.merchantIncome + bonus;
    if (card === 'banker') {
      total += balance.bankerIncome + ownedSlots(state, 'you').length * balance.bankerPerBuilding + bonus;
    }
  }
  return total;
}

export function CoinBar({
  state,
  balance = DEFAULT_BALANCE,
}: {
  state: GameState;
  balance?: Balance;
}) {
  return (
    <div className="coinbar">
      <span className="coinbar-amount">{state.players.you.coins}</span>
      <span className="coinbar-forecast">次のターン +{forecast(state, balance)}</span>
    </div>
  );
}
```

- [ ] **Step 2: `src/ui/Market.tsx` を書く**

```tsx
import { BUILDING_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import type { GameState } from '@/game/types';

export function Market({
  state,
  balance = DEFAULT_BALANCE,
  onPick,
}: {
  state: GameState;
  balance?: Balance;
  onPick: (slotId: number) => void;
}) {
  return (
    <div className="market">
      {state.market.map((slot) => {
        const owned = slot.owner !== null;
        const cls = owned ? `slot owned-${slot.owner}` : 'slot';
        return (
          <button key={slot.slotId} className={cls} onClick={() => onPick(slot.slotId)}>
            <span className="slot-name">{BUILDING_NAMES[slot.buildingId]}</span>
            <span className="slot-cost">
              {owned ? '建設済' : balance.buildings[slot.buildingId].cost}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: `src/ui/Hand.tsx` を書く**

```tsx
import { CARD_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { cardCostFor } from '@/game/reducer';
import { handOf, nextCardOf } from '@/game/selectors';
import type { CardId, GameState } from '@/game/types';

export function Hand({
  state,
  balance = DEFAULT_BALANCE,
  canUse,
  onPick,
}: {
  state: GameState;
  balance?: Balance;
  canUse: (card: CardId) => boolean;
  onPick: (card: CardId) => void;
}) {
  const hand = handOf(state, 'you', balance);
  const next = nextCardOf(state, 'you', balance);
  return (
    <div className="hand-row">
      <div className="next">
        <span className="next-label">next</span>
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
}
```

- [ ] **Step 4: `src/ui/OpponentStrip.tsx` を書く**

```tsx
import { ownedSlots } from '@/game/selectors';
import type { GameState } from '@/game/types';

export function OpponentStrip({ state }: { state: GameState }) {
  return (
    <div className="opponent">
      <span className="opponent-badge">CPU</span>
      <span className="opponent-coins">コイン {state.players.cpu.coins}</span>
      <span className="opponent-owned">
        {ownedSlots(state, 'cpu').map((s) => (
          <i key={s.slotId} className="owned-dot" />
        ))}
      </span>
    </div>
  );
}
```

- [ ] **Step 5: `src/ui/Sheets.tsx` を書く**

物件の詳細（コスト・VP・効果・建設ボタン）、カードの詳細（コスト・効果・使うボタン）、
伝令の対象選び、封鎖者の対象選び、? の説明を 1 ファイルにまとめる。
`shared-ui` の `.overlay` `.sheet` `.sheet-title` `.sheet-row` を使う。

```tsx
import type { ReactNode } from 'react';

export function Sheet({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2 className="sheet-title">{title}</h2>
        {subtitle ? <p className="sheet-subtitle">{subtitle}</p> : null}
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: `src/ui/Game.tsx` を書く**

状態は `useState<GameState>` で持つ。プレイヤーの行動は `reduce` を呼ぶだけ。
ターン終了時は CPU の手番を `playTurn` で回し、続けて自分の `startTurn` を適用する。

```tsx
import { useState } from 'react';

import { type Difficulty, playTurn } from '@/ai/choose';
import { BUILDING_NAMES, BUILDING_TEXTS, CARD_NAMES, CARD_TEXTS, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { canBuild, canUseCard, canUseRoad, reduce } from '@/game/reducer';
import { createRng, type Rng } from '@/game/rng';
import { handOf, hasBuilding, scoreOf, winnerOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';
import { loadProgress, saveProgress } from '@/storage/storage';

import { CoinBar } from './CoinBar';
import { Hand } from './Hand';
import { Market } from './Market';
import { OpponentStrip } from './OpponentStrip';
import { Sheet } from './Sheets';

type Pending =
  | { kind: 'slot'; slotId: number }
  | { kind: 'card'; card: CardId }
  | { kind: 'heraldTarget' }
  | { kind: 'blockadeTarget' }
  | { kind: 'roadTarget' }
  | { kind: 'spyResult'; hand: CardId[] }
  | null;

export function Game({
  seed,
  difficulty,
  balance = DEFAULT_BALANCE,
  onExit,
}: {
  seed: number;
  difficulty: Difficulty;
  balance?: Balance;
  onExit: () => void;
}) {
  const [rng] = useState<Rng>(() => createRng(seed * 7919 + 13));
  const [state, setState] = useState<GameState>(() => {
    const g = createGame(seed, balance);
    // プレイヤーが後手なら、先に CPU の 1 手番を消化する
    const started = g.current === 'cpu' ? playTurn(g, difficulty, createRng(seed), balance) : g;
    return reduce(started, { type: 'startTurn' }, balance);
  });
  const [sheet, setSheet] = useState<Pending>(null);

  const finished = state.phase === 'finished';

  const endTurn = () => {
    let next = reduce(state, { type: 'endTurn' }, balance);
    if (next.phase === 'playing') {
      next = playTurn(next, difficulty, rng, balance);
    }
    if (next.phase === 'playing') {
      next = reduce(next, { type: 'startTurn' }, balance);
    }
    // 終了判定は endTurn の中でしか起きないので、記録もここで 1 回だけ行う
    if (next.phase === 'finished') {
      const progress = loadProgress();
      const winner = winnerOf(next, balance);
      saveProgress({
        wins: progress.wins + (winner === 'you' ? 1 : 0),
        losses: progress.losses + (winner === 'cpu' ? 1 : 0),
        lastDifficulty: difficulty,
      });
    }
    setState(next);
  };

  const useCard = (card: CardId) => {
    if (card === 'herald') return setSheet({ kind: 'heraldTarget' });
    if (card === 'blockader') return setSheet({ kind: 'blockadeTarget' });
    const next = reduce(state, { type: 'useCard', card }, balance);
    setState(next);
    // 密偵は結果を見せないと使った意味が無い
    if (card === 'spy' && next.revealedOpponentHand) {
      setSheet({ kind: 'spyResult', hand: next.revealedOpponentHand });
    }
  };

  // 街道を持っているあいだ、毎ターン 1 回だけ手札を 1 枚無料で流せる
  const roadAvailable =
    hasBuilding(state, 'you', 'road') &&
    handOf(state, 'you', balance).some((c) => canUseRoad(state, c, balance));

  return (
    <div className="app">
      <header className="header">
        <div className="header-row">
          <div className="header-left">
            <button className="icon-btn" onClick={onExit} aria-label="戻る">
              ←
            </button>
          </div>
          <h1 className="title">シティビルダーズ</h1>
          <div className="header-actions">
            <button className="icon-btn" aria-label="あそびかた">
              ?
            </button>
            <button className="icon-btn" aria-label="設定">
              ⚙
            </button>
          </div>
        </div>
        <div className="status-bar">
          <span className="stat">ターン {Math.ceil(state.turn / 2)}</span>
          <span className="stat">あなた {scoreOf(state, 'you', balance)} VP</span>
          <span className="stat">CPU {scoreOf(state, 'cpu', balance)} VP</span>
          <span className="stat">残り {state.market.filter((s) => s.owner === null).length}</span>
        </div>
      </header>

      <main className="play">
        <OpponentStrip state={state} />
        <Market
          state={state}
          balance={balance}
          onPick={(slotId) => setSheet({ kind: 'slot', slotId })}
        />
        <CoinBar state={state} balance={balance} />
        <Hand
          state={state}
          balance={balance}
          canUse={(card) => canUseCard(state, card, balance)}
          onPick={(card) => setSheet({ kind: 'card', card })}
        />
        {roadAvailable ? (
          <button className="road-btn" onClick={() => setSheet({ kind: 'roadTarget' })}>
            街道で 1 枚流す
          </button>
        ) : null}
        <button className="end-turn" onClick={endTurn} disabled={finished}>
          ターンを終える
        </button>
      </main>

      {sheet?.kind === 'slot'
        ? (() => {
            const slot = state.market[sheet.slotId]!;
            return (
              <Sheet
                title={BUILDING_NAMES[slot.buildingId]}
                subtitle={`コスト ${balance.buildings[slot.buildingId].cost} ・ ${balance.buildings[slot.buildingId].vp} VP`}
                onClose={() => setSheet(null)}
              >
                <p className="sheet-text">{BUILDING_TEXTS[slot.buildingId]}</p>
                <button
                  className="home-btn primary"
                  disabled={!canBuild(state, sheet.slotId, balance)}
                  onClick={() => {
                    setState(reduce(state, { type: 'build', slotId: sheet.slotId }, balance));
                    setSheet(null);
                  }}
                >
                  建てる
                </button>
              </Sheet>
            );
          })()
        : null}

      {sheet?.kind === 'card' ? (
        <Sheet
          title={CARD_NAMES[sheet.card]}
          subtitle={`コスト ${balance.cards[sheet.card].cost}`}
          onClose={() => setSheet(null)}
        >
          <p className="sheet-text">{CARD_TEXTS[sheet.card]}</p>
          <button
            className="home-btn primary"
            disabled={!canUseCard(state, sheet.card, balance)}
            onClick={() => {
              const card = sheet.card;
              setSheet(null);
              useCard(card);
            }}
          >
            使う
          </button>
        </Sheet>
      ) : null}

      {sheet?.kind === 'heraldTarget' ? (
        <Sheet title="どのカードを底へ送る？" onClose={() => setSheet(null)}>
          {handOf(state, 'you', balance)
            .filter((c) => c !== 'herald')
            .map((c) => (
              <button
                key={c}
                className="sheet-row"
                onClick={() => {
                  setState(
                    reduce(state, { type: 'useCard', card: 'herald', heraldTarget: c }, balance),
                  );
                  setSheet(null);
                }}
              >
                {CARD_NAMES[c]}
              </button>
            ))}
        </Sheet>
      ) : null}

      {sheet?.kind === 'blockadeTarget' ? (
        <Sheet title="どの物件を封鎖する？" onClose={() => setSheet(null)}>
          {state.market
            .filter((s) => s.owner === null)
            .map((s) => (
              <button
                key={s.slotId}
                className="sheet-row"
                onClick={() => {
                  setState(
                    reduce(
                      state,
                      { type: 'useCard', card: 'blockader', blockadeSlot: s.slotId },
                      balance,
                    ),
                  );
                  setSheet(null);
                }}
              >
                {BUILDING_NAMES[s.buildingId]}
              </button>
            ))}
        </Sheet>
      ) : null}

      {sheet?.kind === 'roadTarget' ? (
        <Sheet
          title="どのカードを底へ送る？"
          subtitle="街道の効果。コストはかからない"
          onClose={() => setSheet(null)}
        >
          {handOf(state, 'you', balance)
            .filter((c) => canUseRoad(state, c, balance))
            .map((c) => (
              <button
                key={c}
                className="sheet-row"
                onClick={() => {
                  setState(reduce(state, { type: 'useRoad', target: c }, balance));
                  setSheet(null);
                }}
              >
                {CARD_NAMES[c]}
              </button>
            ))}
        </Sheet>
      ) : null}

      {sheet?.kind === 'spyResult' ? (
        <Sheet
          title="相手の手札"
          subtitle="覚えておくのはあなたの仕事"
          onClose={() => setSheet(null)}
        >
          {sheet.hand.map((c, i) => (
            <p key={`${c}-${i}`} className="sheet-row">
              {CARD_NAMES[c]}
            </p>
          ))}
        </Sheet>
      ) : null}

      {finished ? (
        <Sheet
          title={
            winnerOf(state, balance) === 'you'
              ? 'あなたの勝ち'
              : winnerOf(state, balance) === 'cpu'
                ? 'CPU の勝ち'
                : '引き分け'
          }
          subtitle={`${scoreOf(state, 'you', balance)} VP 対 ${scoreOf(state, 'cpu', balance)} VP`}
          onClose={onExit}
        >
          <button className="home-btn primary" onClick={onExit}>
            ホームへ
          </button>
        </Sheet>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 7: `src/ui/styles.css` に画面の CSS を書く**

```css
/* シティビルダーズ固有の見た目。共通部分は shared/ にある。 */

/* 所有者の色。盤面の色は共通化しない。相対輝度を十分に離す。 */
:root {
  --owner-you: #85b7eb;
  --owner-you-ink: #042c53;
  --owner-cpu: #f0997b;
  --owner-cpu-ink: #4a1b0c;
}

.opponent {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px var(--pad);
  min-height: 42px;
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
}

.opponent-owned {
  margin-left: auto;
  display: flex;
  gap: 3px;
}

.owned-dot {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  background: var(--owner-cpu);
}

/* 盤面は操作で 1px も動かないこと。行と列を両方明示する。 */
.market {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: var(--gap);
  padding: 0 var(--pad);
}

.slot {
  min-width: 0;
  min-height: 0;
  aspect-ratio: 3 / 4;
  border: 1px solid var(--line);
  border-radius: var(--cell-radius);
  background: var(--surface);
  display: grid;
  place-content: center;
  gap: 2px;
  font-size: 11px;
  color: var(--title);
}

.slot.owned-you {
  background: var(--owner-you);
  color: var(--owner-you-ink);
  border-color: transparent;
}

.slot.owned-cpu {
  background: var(--owner-cpu);
  color: var(--owner-cpu-ink);
  border-color: transparent;
}

.coinbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px var(--pad) 8px;
  padding: 8px 12px;
  border-radius: var(--cell-radius);
  background: var(--surface-2);
}

.coinbar-amount {
  font-size: 22px;
  font-weight: 600;
  color: var(--title);
}

.coinbar-forecast {
  margin-left: auto;
  font-size: 12px;
  color: var(--muted);
}

.hand-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 0 var(--pad);
}

.next {
  width: 34px;
  display: grid;
  gap: 3px;
  justify-items: center;
}

.next-label {
  font-size: 9px;
  color: var(--muted);
}

.next-card {
  width: 34px;
  height: 46px;
  border-radius: 6px;
  background: var(--surface-2);
  display: grid;
  place-content: center;
  font-size: 9px;
  color: var(--muted);
}

.hand {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.card {
  min-width: 0;
  height: 62px;
  border: 1px solid var(--line);
  border-radius: var(--cell-radius);
  background: var(--surface);
  display: grid;
  place-content: center;
  gap: 2px;
  font-size: 11px;
  color: var(--title);
}

.card.is-dim {
  opacity: 0.45;
}

.road-btn {
  margin: 10px var(--pad) 0;
  min-height: var(--hit);
  border: 1px solid var(--line);
  border-radius: var(--cell-radius);
  background: var(--surface);
  color: var(--title);
  font-size: 14px;
}

.end-turn {
  margin: 12px var(--pad) var(--pad);
  min-height: var(--hit);
  border: none;
  border-radius: var(--cell-radius);
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 15px;
}

.sheet-text {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
}
```

- [ ] **Step 8: `src/App.tsx` から `Game` を呼ぶ**

```tsx
import { useState } from 'react';

import type { Difficulty } from '@/ai/choose';

import { Game } from './ui/Game';
import { Home } from './ui/Home';
import './ui/shared/tokens.css';
import './ui/shared/chrome.css';
import './ui/styles.css';

export function App() {
  const [session, setSession] = useState<{ seed: number; difficulty: Difficulty } | null>(null);

  if (session === null) {
    return <Home onStart={(difficulty) => setSession({ seed: Date.now() % 100000, difficulty })} />;
  }
  return (
    <Game
      seed={session.seed}
      difficulty={session.difficulty}
      onExit={() => setSession(null)}
    />
  );
}
```

- [ ] **Step 9: 実際に 1 試合遊んで確かめる**

Run: `npm run dev`

確認すること:

1. カードを使っても、物件を建てても、**市場と手札の位置が 1px も動かない**
2. コインバーの「次のターン +N」が、ターンを終えた後の実際の増分と一致する
3. 伝令と封鎖者が対象選択シートを開き、選ぶと効果が出る
4. 密偵を使うと相手の手札 4 枚がシートで出る
5. 街道を建てると「街道で 1 枚流す」が出て、1 ターンに 1 回だけ押せる
6. 建設済みの物件が所有者色に塗られ、位置は動かない
7. 最後まで遊ぶと結果シートが出る
8. ホームに戻ると戦績（○勝○敗）が 1 増えている

Run: `npm run build`
Expected: 型エラー無し

- [ ] **Step 10: コミット**

```bash
git add -A
git commit -m "feat: プレイ画面を追加（市場・手札・コインバー・シート）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 15: 開発者メニューと GitHub Pages 公開

**Files:**
- Create: `src/ui/balance-store.ts`, `scripts/deploy.mjs`
- Modify: `src/ui/Home.tsx`, `src/App.tsx`, `src/ui/Sheets.tsx`, `src/ui/styles.css`
- Test: 手動確認

**Interfaces:**
- Consumes: `DEFAULT_BALANCE`
- Produces:
  - `loadBalance(): Balance` / `saveBalance(b: Balance): void` / `resetBalance(): void`
  - ホーム右下の「テスト用」ピルから数値を編集できる
  - `npm run deploy` で GitHub Pages に反映される

- [ ] **Step 1: `src/ui/balance-store.ts` を書く**

```ts
import { DEFAULT_BALANCE, type Balance } from '@/game/balance';

const KEY = 'city-builders:balance';

/** 数値の上書き。遊びながら調整するための仕組み。
 *  壊れた値が入っていても既定値に戻せるよう、浅くマージするだけにする。 */
export function loadBalance(): Balance {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_BALANCE;
    const saved = JSON.parse(raw) as Partial<Balance>;
    return { ...DEFAULT_BALANCE, ...saved };
  } catch {
    return DEFAULT_BALANCE;
  }
}

export function saveBalance(balance: Balance): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(balance));
  } catch {
    // 保存できなくても遊べる
  }
}

export function resetBalance(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
}
```

- [ ] **Step 2: ホームに開発者メニューを足す**

`Home.tsx` に `.dev-pill` を置き、押すとシートを開く。
シートの中身は次の 3 つ。

1. 数値の編集（`baseIncome` `startingCoins` と、8 種のカードコスト、7 種の物件コスト・VP）
2. 「きろくをけす」（`clearProgress()`）
3. 「数値を既定に戻す」（`resetBalance()`）

**ホームの表側には「あそびかた」も「きろくをけす」も置かない。** 両方ともこのシートの中。

```tsx
import { useState } from 'react';

import type { Difficulty } from '@/ai/choose';
import { ALL_CARDS, BUILDING_NAMES, CARD_NAMES, type Balance } from '@/game/balance';
import { clearProgress, loadProgress } from '@/storage/storage';

import { loadBalance, resetBalance, saveBalance } from './balance-store';
import { Sheet } from './Sheets';

const LABELS: Record<Difficulty, string> = {
  easy: 'やさしい',
  normal: 'ふつう',
  hard: 'つよい',
};

export function Home({ onStart }: { onStart: (d: Difficulty) => void }) {
  const progress = loadProgress();
  const [dev, setDev] = useState(false);
  const [balance, setBalance] = useState<Balance>(() => loadBalance());

  const put = (next: Balance) => {
    setBalance(next);
    saveBalance(next);
  };

  return (
    <div className="app-home">
      <div className="home">
        <h1 className="home-title">シティビルダーズ</h1>
        <p className="home-sub">人物を回して、都市を建てる</p>
        <div className="home-buttons">
          {(['easy', 'normal', 'hard'] as const).map((d) => (
            <button
              key={d}
              className={`home-btn${d === progress.lastDifficulty ? ' primary' : ''}`}
              onClick={() => onStart(d)}
            >
              {LABELS[d]}
            </button>
          ))}
        </div>
        <p className="home-progress">
          {progress.wins} 勝 {progress.losses} 敗
        </p>
      </div>

      <button className="dev-pill" onClick={() => setDev(true)}>
        テスト用
      </button>

      {dev ? (
        <Sheet title="テスト用" subtitle="数値はすぐ反映される" onClose={() => setDev(false)}>
          <div className="dev-grid">
            <label>
              基本収入
              <input
                type="number"
                value={balance.baseIncome}
                onChange={(e) => put({ ...balance, baseIncome: Number(e.target.value) })}
              />
            </label>
            {ALL_CARDS.map((id) => (
              <label key={id}>
                {CARD_NAMES[id]} コスト
                <input
                  type="number"
                  value={balance.cards[id].cost}
                  onChange={(e) =>
                    put({
                      ...balance,
                      cards: { ...balance.cards, [id]: { cost: Number(e.target.value) } },
                    })
                  }
                />
              </label>
            ))}
            {(Object.keys(balance.buildings) as (keyof typeof balance.buildings)[]).map((id) => (
              <label key={id}>
                {BUILDING_NAMES[id]} コスト
                <input
                  type="number"
                  value={balance.buildings[id].cost}
                  onChange={(e) =>
                    put({
                      ...balance,
                      buildings: {
                        ...balance.buildings,
                        [id]: { ...balance.buildings[id], cost: Number(e.target.value) },
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
          <button
            className="sheet-row"
            onClick={() => {
              resetBalance();
              setBalance(loadBalance());
            }}
          >
            数値を既定に戻す
          </button>
          <button className="sheet-row" onClick={() => clearProgress()}>
            きろくをけす
          </button>
        </Sheet>
      ) : null}
    </div>
  );
}
```

`styles.css` に `.dev-grid` を足す。

```css
.dev-grid {
  display: grid;
  gap: 8px;
  max-height: 50vh;
  overflow-y: auto;
  margin-bottom: 12px;
}

.dev-grid label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  color: var(--title);
}

.dev-grid input {
  width: 72px;
  min-height: var(--hit);
  border: 1px solid var(--line);
  border-radius: var(--cell-radius);
  text-align: center;
  font-size: 15px;
}
```

- [ ] **Step 3: `App.tsx` が `balance` を `Game` に渡すようにする**

```tsx
  return (
    <Game
      seed={session.seed}
      difficulty={session.difficulty}
      balance={loadBalance()}
      onExit={() => setSession(null)}
    />
  );
```

import に `import { loadBalance } from './ui/balance-store';` を足す。

- [ ] **Step 4: `scripts/deploy.mjs` を書く**

`animal-puzzle/scripts/deploy.mjs` と同じ方式。`.nojekyll` は必須。

```js
// ビルド済みの dist/ を gh-pages ブランチへ push する。
//
// GitHub Actions を使っていないのは、gh の認証トークンに workflow スコープが
// 無く、.github/workflows/ を push できないため。こちらは追加の権限が要らない。

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';

const run = (args, cwd) => execFileSync('git', args, { cwd, stdio: 'inherit' });
const capture = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

if (!existsSync(DIST)) {
  console.error('dist/ がありません。先に npm run build を実行してください。');
  process.exit(1);
}

const remote = capture(['remote', 'get-url', 'origin']);
const name = capture(['config', 'user.name']);
const email = capture(['config', 'user.email']);

// **必須。** GitHub Pages は Jekyll を既定で走らせ、`_` で始まるファイル・
// ディレクトリを黙って除外する。これが無いと JS バンドルが 404 になり、
// CDN のキャッシュ不具合とそっくりの症状に見える。
writeFileSync(join(DIST, '.nojekyll'), '');

rmSync(join(DIST, '.git'), { recursive: true, force: true });
run(['init', '-q'], DIST);
run(['config', 'user.name', name], DIST);
run(['config', 'user.email', email], DIST);
run(['checkout', '-q', '-B', 'gh-pages'], DIST);
run(['add', '-A'], DIST);
run(['commit', '-q', '-m', `deploy ${new Date().toISOString()}`], DIST);
run(['push', '-q', '-f', remote, 'gh-pages:gh-pages'], DIST);
rmSync(join(DIST, '.git'), { recursive: true, force: true });

console.log('gh-pages へ反映しました');
```

- [ ] **Step 5: GitHub のリポジトリを用意して公開する**

このリポジトリにはまだ origin が無い。ユーザーに確認してから次を実行する。

```bash
gh repo create city-builders --public --source=. --remote=origin --push
```

Run: `npm run deploy`
Expected: `gh-pages へ反映しました`

GitHub の Settings > Pages で、ブランチ `gh-pages` / ディレクトリ `/ (root)` を選ぶ。
数分後に `https://<ユーザー名>.github.io/city-builders/` が開くことを確認する。

- [ ] **Step 6: 公開版で 1 試合遊んで確かめる**

スマートフォンの実機で開き、次を確認する。

1. 盤面が操作で動かない
2. 手札とコインバーが画面下部に収まり、横スクロールが出ない
3. 1 試合を最後まで遊べる
4. 「テスト用」から数値を変えると、次の試合に反映される

- [ ] **Step 7: コミット**

```bash
git add -A
git commit -m "feat: 開発者メニューと GitHub Pages への公開を追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push
```

---

## 完了の定義

Phase 1 / Phase 2 が終わったと言えるのは、次がすべて満たされたとき。

- [ ] `npm test` が全件通る
- [ ] `npm run build` が型エラー無しで通る
- [ ] `npm run simulate` が走り、明らかな破綻（先手勝率 60% 超、平均 25 ターン超、詰まり率 30% 超）が無い
- [ ] 実測結果が仕様書の第 13 節に記録されている
- [ ] `node C:/claude/shared-ui/sync.mjs --check` でずれ 0
- [ ] GitHub Pages の公開 URL で 1 試合を最後まで遊べる
- [ ] 実機で盤面が操作によって動かない

Phase 3（遊びながらの数値調整と CPU の詰め）と Phase 4（質感・アニメ・効果音・カード絵）は
別の計画として、この計画が終わってから書く。
