/** 盤面の縦横比（幅 / 高さ）。地の素材 field.webp（711×1067）と同じ 2:3 なので、
 *  cover で敷いても切れない。styles.css の .board の aspect-ratio と揃えること。 */
export const BOARD_ASPECT = 2 / 3;

/** 区画 1 つの幅。盤面の幅に対する割合。 */
export const PLOT_WIDTH = 0.31;

/** 区画の箱の高さ ÷ 幅。箱は「建物の頭 〜 台座 〜 バッジの下端」までを含む
 *  タップ範囲で、中の配置（台座の位置など）は styles.css が箱に対する % で持つ。 */
export const PLOT_RATIO = 1.05;

/** 区画の高さ。盤面の高さに対する割合（幅の割合から換算）。 */
export const PLOT_HEIGHT = PLOT_WIDTH * PLOT_RATIO * BOARD_ASPECT;

/** 箱の上端から見た台座の上面・前面の下端の位置（箱の高さに対する割合）。
 *  styles.css の .plot-base（top: 40% / bottom: 19%）と揃える。道の端点に使う。 */
export const BASE_TOP = 0.4;
export const BASE_BOTTOM = 0.81;

export interface Plot {
  /** 盤面の幅に対する割合。区画の中心 */
  x: number;
  /** 盤面の高さに対する割合。区画の箱の中心 */
  y: number;
}

const ROW_Y = [0.125, 0.375, 0.625, 0.875] as const;
const TWO = [0.3, 0.7] as const;
const THREE = [0.17, 0.5, 0.83] as const;

/** 10 区画を横 2 / 3 / 2 / 3 の 4 段に互い違いで置く（クラロワの塔の並びと同じく、
 *  台座を道でつないだ「場所」に見せるため）。balance.market の配列順が
 *  そのままこの順に対応する（上の段の左から）。
 *
 *  右上は残りターンのバッジが乗るので、最上段は 2 件にして角を空けている。
 *  段の間隔（0.25）は箱の高さ（PLOT_HEIGHT ≒ 0.217）より大きいので、
 *  斜め隣の区画とタップ範囲が重ならない。 */
export const PLOTS: readonly Plot[] = [
  ...TWO.map((x) => ({ x, y: ROW_Y[0] })),
  ...THREE.map((x) => ({ x, y: ROW_Y[1] })),
  ...TWO.map((x) => ({ x, y: ROW_Y[2] })),
  ...THREE.map((x) => ({ x, y: ROW_Y[3] })),
];

/** 段の番号（0 が最上段）。重なりの前後（z-index）と道の計算に使う。 */
export const rowOf = (i: number): number => ROW_Y.indexOf(PLOTS[i]!.y as (typeof ROW_Y)[number]);

/** 横の通り。段と段のちょうど中間を、つながる区画の左端から右端まで通す。 */
export const STREET_Y: readonly number[] = ROW_Y.slice(1).map((y, i) => (y + ROW_Y[i]!) / 2);

export interface Stub {
  slotId: number;
  x: number;
  y1: number;
  y2: number;
}

/** 台座から上下の通りへ伸びる縦の道。最上段の上・最下段の下には通りが無いので
 *  伸ばさない（盤面の縁で道が途切れて見えないように）。上向きの道は建物の絵の
 *  裏を通るので、見えるのは箱の上端より上だけになる。 */
export const STUBS: readonly Stub[] = PLOTS.flatMap((p, slotId) => {
  const row = rowOf(slotId);
  const top = p.y + (BASE_TOP - 0.5) * PLOT_HEIGHT;
  const bottom = p.y + (BASE_BOTTOM - 0.5) * PLOT_HEIGHT;
  const out: Stub[] = [];
  if (row > 0) out.push({ slotId, x: p.x, y1: STREET_Y[row - 1]!, y2: top });
  if (row < ROW_Y.length - 1) out.push({ slotId, x: p.x, y1: bottom, y2: STREET_Y[row]! });
  return out;
});

/** 区画の受け持ち範囲（地区の境界を引くため）。段の帯（縦 0.25 ずつ）を、同じ段の区画どうしの
 *  中間で左右に切った矩形。どの区画もちょうど 1 つの矩形を持ち、盤面を隙間なく覆う。 */
export interface Cell {
  slotId: number;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

export const CELLS: readonly Cell[] = PLOTS.map((p, slotId) => {
  const row = rowOf(slotId);
  const xs = PLOTS.filter((_, i) => rowOf(i) === row)
    .map((q) => q.x)
    .sort((a, b) => a - b);
  const k = xs.indexOf(p.x);
  return {
    slotId,
    x1: k === 0 ? 0 : (xs[k - 1]! + p.x) / 2,
    x2: k === xs.length - 1 ? 1 : (p.x + xs[k + 1]!) / 2,
    y1: row / ROW_Y.length,
    y2: (row + 1) / ROW_Y.length,
  };
});

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** 地区の境界線。隣り合う受け持ち範囲の地区が違うところだけを線にする（盤面の外周は引かない）。
 *  districtOf は区画番号 → 地区の番号（地区に入っていなければ -1）。 */
export function districtBorders(districtOf: (slotId: number) => number): Segment[] {
  const out: Segment[] = [];
  const rows = ROW_Y.length;
  const inRow = (r: number) => CELLS.filter((c) => rowOf(c.slotId) === r).sort((a, b) => a.x1 - b.x1);
  for (let r = 0; r < rows; r++) {
    const cells = inRow(r);
    // 同じ段の左右の境目
    for (let k = 0; k + 1 < cells.length; k++) {
      if (districtOf(cells[k]!.slotId) !== districtOf(cells[k + 1]!.slotId)) {
        out.push({ x1: cells[k]!.x2, y1: cells[k]!.y1, x2: cells[k]!.x2, y2: cells[k]!.y2 });
      }
    }
    // 下の段との境目。両段の切れ目で区間に分け、上下で地区が違う区間をつなげて 1 本にする
    if (r + 1 >= rows) continue;
    const below = inRow(r + 1);
    const y = cells[0]!.y2;
    const cuts = [...new Set([...cells, ...below].flatMap((c) => [c.x1, c.x2]))].sort((a, b) => a - b);
    let start: number | null = null;
    for (let k = 0; k + 1 < cuts.length; k++) {
      const mid = (cuts[k]! + cuts[k + 1]!) / 2;
      const up = cells.find((c) => c.x1 <= mid && mid < c.x2)!;
      const down = below.find((c) => c.x1 <= mid && mid < c.x2)!;
      const differs = districtOf(up.slotId) !== districtOf(down.slotId);
      if (differs && start === null) start = cuts[k]!;
      if (!differs && start !== null) {
        out.push({ x1: start, y1: y, x2: cuts[k]!, y2: y });
        start = null;
      }
    }
    if (start !== null) out.push({ x1: start, y1: y, x2: 1, y2: y });
  }
  return out;
}

/** 地区の名札の置き場所（盤面の幅・高さに対する割合）。建物の無い盤面の端に縦書きで置く。
 *  balance.districts の並びに対応する。地区を増やしたらここも足す（足りなければ最後の位置を使う）。 */
export interface DistrictTagPos {
  /** 左右どちらの端に寄せるか */
  side: 'left' | 'right';
  /** 名札の上端 */
  top: number;
}

export const DISTRICT_TAGS: readonly DistrictTagPos[] = [
  { side: 'left', top: 0.012 },
  { side: 'right', top: 0.515 },
  { side: 'left', top: 0.515 },
];

export interface Junction {
  slotId: number;
  x: number;
}

/** 通りごとに、そこへつながる区画（上の段と下の段）を x の順に並べたもの。
 *  隣り合う 2 つが同じ持ち主なら、その間の通りを持ち主の色に塗る。 */
export const STREET_JUNCTIONS: readonly (readonly Junction[])[] = STREET_Y.map((_, s) =>
  PLOTS.map((p, slotId) => ({ slotId, x: p.x, row: rowOf(slotId) }))
    .filter((j) => j.row === s || j.row === s + 1)
    .sort((a, b) => a.x - b.x)
    .map(({ slotId, x }) => ({ slotId, x })),
);
