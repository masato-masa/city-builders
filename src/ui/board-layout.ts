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
