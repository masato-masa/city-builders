// プレイ画面の間（ま）の出どころ。「同時に処理されて見えない」という指摘を受け、
// 出来事を 1 つずつ（手番の帯 → 収入 → 行動 → その効果）の順に出すための待ち時間をここに集める。
// テンポを変えたいときは、個別の演出ではなくここを触る。

/** 手番の帯を出している時間。TurnBanner がこの時間で自分を消す。 */
export const BANNER_MS = 800;

/** 手番が替わってから、収入の最初の段を出すまでの間。帯（中央）と収入の帯（上端）は重ねて出す。 */
export const TURN_INTRO_MS = 150;

/** カードを使う動き（手札から盤面へ飛ぶ）を見せてから、効果（コイン・状態）を反映するまでの間。 */
export const CARD_EFFECT_DELAY_MS = 500;

/** 物件を建てる指示を出してから、着地・コインの減少を反映するまでの間。 */
export const BUILD_EFFECT_DELAY_MS = 300;

/** CPU の 1 手が出る（絵と帯が出る）前の間。直前の効果が読み取れる長さ。 */
export const CPU_STEP_GAP_MS = 150;

/** CPU の 1 手を見せてから効果を反映するまでの間。 */
export const CPU_EFFECT_DELAY_MS = 350;

/** 手番交代のあと、最初の 1 手を出すまでの間。帯は盤面の中央、収入・行動は上端に出るので重ねて出す（待たせない）。 */
export const CPU_FIRST_GAP_MS = 200;

/** CPU の「ターンを終えた」を出してから手番を渡すまでの間。 */
export const CPU_END_DELAY_MS = 250;

/** 勝敗が付いてから結果画面を出すまでの間。最後の 1 手を見せる。 */
export const RESULT_DELAY_MS = 1400;

/** カードが盤面へ飛ぶ演出の長さ（秒）。 */
export const CARD_FLIGHT_S = 0.5;

/** 数字の増減ポップが出ている時間（ミリ秒）。 */
export const DELTA_POP_MS = 1300;

/** 収入の 1 段を見せる帯が出てから、コインへ反映するまでの間。 */
export const INCOME_APPLY_MS = 120;

/** 収入の 1 段ぶんの長さ（帯 → 反映 → 読む間）。次の段はこのあとに出る。 */
export const INCOME_BEAT_MS = 260;

/** 最後の段を反映してから、帯を消して操作を戻すまでの間。 */
export const INCOME_TAIL_MS = 150;

/** 伝令で、使う札が飛んでから「捨てる札」が飛び始めるまでの間。 */
export const DISCARD_AT_MS = 450;
