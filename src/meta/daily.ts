/** 日替わりの一戦。端末のローカル日付だけから、盤面（シード）・先手・CPU の強さ・その日の条件を決める。
 *  同じ日なら誰がやっても同じ試合になる（Slay the Spire のデイリークライムの考え方）。
 *
 *  条件は DEFAULT_BALANCE に重ねる小さな差分として持つ（balance.ts の既定値は書き換えない）。
 *  差分は「いまの既定値から −2」のように既定値を受け取る関数で書くので、既定値が調整されても追従する。
 *  採用した条件は `npm run lab` で先手勝率 45〜55% に収まったものだけ（docs/autopilot/journal.md）。 */
import type { Difficulty } from '@/ai/choose';
import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import type { PlayerId } from '@/game/types';

export interface DailyRule {
  id: string;
  /** ホームと結果画面に出す 1 行（既定値から組み立てる）。 */
  label: (base: Balance) => string;
  /** 既定値に重ねる差分。入れ子の項目（buildings など）は丸ごと返す。 */
  patch: (base: Balance) => Partial<Balance>;
}

/** 採用した条件。並び順に意味は無い（どの日にどれが来るかは dailyFor が決める）。
 *  「基礎収入 +1」は先手勝率を 45〜55% に合わせられず（開幕資金 1 コインで 17 点動く。42〜59%）、2026-10-13 に外した。 */
export const DAILY_RULES: readonly DailyRule[] = [
  {
    id: 'cheapBuild',
    label: () => '建設費 −2',
    patch: (b) => ({
      buildings: mapValues(b.buildings, (v) => ({ ...v, cost: Math.max(0, v.cost - 2) })),
    }),
  },
  {
    id: 'markup',
    label: (b) => `買収費用 市場価値 × ${b.acquireMultiplier + 1}`,
    patch: (b) => ({ acquireMultiplier: b.acquireMultiplier + 1 }),
  },
  {
    id: 'festival3',
    label: () => '祝祭の倍率 3 倍',
    patch: () => ({ festivalMultiplier: 3 }),
  },
  {
    id: 'titleVp',
    label: (b) => `地区の称号 ${b.districtTitleVp + 1} VP`,
    patch: (b) => ({ districtTitleVp: b.districtTitleVp + 1 }),
  },
  {
    id: 'shortGame',
    // 2026-10-13 終わり方が「目標の VP に届く」になったので、ターン数ではなく目標を下げる（audit-daily 100 で先手を測る）
    label: (b) => `短期決戦（目標 ${b.winVp - 10} VP）`,
    patch: (b) => ({ winVp: b.winVp - 10 }),
  },
  {
    id: 'cheapUpgrade',
    label: () => 'アップグレード費 −3',
    patch: (b) => ({
      upgrades: mapValues(b.upgrades, (v) => ({ ...v, cost: Math.max(0, v.cost - 3) })),
      upgrades3: mapValues(b.upgrades3, (v) => ({ ...v, cost: Math.max(0, v.cost - 3) })),
    }),
  },
  {
    // 建物の収入は VP がそのまま入る形になった。商館の追加収入を全段で +2 にする
    id: 'richIncome',
    label: () => '商館の追加収入 +2',
    patch: (b) => ({
      tradingHouseIncome: b.tradingHouseIncome + 2,
      level2: { ...b.level2, tradingHouseIncome: b.level2.tradingHouseIncome + 2 },
      level3: { ...b.level3, tradingHouseIncome: b.level3.tradingHouseIncome + 2 },
    }),
  },
];

function mapValues<K extends string, V>(obj: Record<K, V>, f: (v: V) => V): Record<K, V> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, f(v as V)])) as Record<K, V>;
}

/** 既定値に条件を重ねる（純粋関数）。 */
export function applyRule(base: Balance, rule: DailyRule): Balance {
  return { ...base, ...rule.patch(base) };
}

/** 端末のローカル日付を 'YYYY-MM-DD' にする（UTC ではない。日本なら 0 時で替わる）。 */
export function localDateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateKey(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const mo = Number(m[2]);
  const da = Number(m[3]);
  return mo >= 1 && mo <= 12 && da >= 1 && da <= 31;
}

/** 1970-01-01 からの日数（暦の上の日付で数える。時差・夏時間に左右されない）。 */
function dayNumber(dateKey: string): number {
  const m = DATE_RE.exec(dateKey)!;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

/** 文字列 → 32 ビットの種（FNV-1a に混ぜを足したもの）。 */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

export interface Daily {
  dateKey: string;
  /** 盤面（山札の並び）を決める種。 */
  seed: number;
  first: PlayerId;
  difficulty: Difficulty;
  rule: DailyRule;
  /** 条件の 1 行。 */
  label: string;
  /** 条件を重ねた balance。 */
  balance: Balance;
}

/** 条件の並びを周期ごとに入れ替える。1 周（DAILY_RULES.length 日）の中では同じ条件が 2 度来ない。 */
function ruleIndexFor(day: number, n: number): number {
  const cycle = Math.floor(day / n);
  const pos = ((day % n) + n) % n;
  // 周期の番号から決まる並べ替え（Fisher-Yates を種付きで）
  const order = Array.from({ length: n }, (_, i) => i);
  let h = hashSeed(`rules:${cycle}`);
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order[pos]!;
}

/** 日付からその日の一戦を決める（純粋関数）。 */
export function dailyFor(dateKey: string, base: Balance = DEFAULT_BALANCE): Daily {
  const day = dayNumber(dateKey);
  const h = hashSeed(`daily:${dateKey}`);
  const rule = DAILY_RULES[ruleIndexFor(day, DAILY_RULES.length)]!;
  return {
    dateKey,
    // Game は seed * 7919 などで別の乱数を派生させるので、安全な整数の範囲に収まる大きさにしておく
    seed: h % 1_000_000_007,
    first: (hashSeed(`first:${dateKey}`) & 1) === 0 ? 'you' : 'cpu',
    difficulty: 'normal',
    rule,
    label: rule.label(base),
    balance: applyRule(base, rule),
  };
}

/** 日替わりのスコア: 自分の VP − 相手の VP。 */
export function dailyScore(youVp: number, cpuVp: number): number {
  return youVp - cpuVp;
}

/** スコアの見せ方（+5 / ±0 / −3）。 */
export function formatScore(score: number): string {
  if (score > 0) return `+${score}`;
  if (score < 0) return `−${-score}`;
  return '±0';
}
