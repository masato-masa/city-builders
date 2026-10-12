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

/** 採用した条件。並び順に意味は無い（どの日にどれが来るかは dailyFor が決める）。 */
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
    id: 'income',
    label: (b) => `基礎収入 +1（${b.baseIncome + 1}）・後手の初手収入 +1・後手の開幕資金 −1`,
    // 基礎収入だけ +1 だと先手 59.7%（開始資金 1 の後、lab 150）。後手の 1 ターン目の補正も +1 して 52.4%。
    // 建物の収益が付いた後（2026-10-11）は補正 +1 で 59.2%、+2 で 44.1%。開幕資金も −1（両者）して 47.6%（lab 150）。
    // 雪だるまの対策（各 18 手番）の後は、補正 +1 を足すと先手 43.0%、足さないで 49.0%（audit-daily 100）。補正は足さなかった。
    // 買収を市場価値の 2 倍・収益を上げた後（2026-10-12）は、足さないと先手 59.3%、補正 +1 と開幕資金 −1（両者）で 42.3%（audit-daily 100）。
    // 補正 +1・後手だけ開幕資金 −1 で 51.7%（lab --shape 800）
    patch: (b) => ({
      baseIncome: b.baseIncome + 1,
      secondPlayerFirstTurnBonus: b.secondPlayerFirstTurnBonus + 1,
      startingCoins: {
        first: b.startingCoins.first,
        second: Math.max(0, b.startingCoins.second - 1),
      },
    }),
  },
  {
    id: 'festival3',
    label: () => '祝祭の倍率 3 倍',
    patch: () => ({ festivalMultiplier: 3 }),
  },
  {
    id: 'titleVp',
    label: (b) => `地区の称号 ${b.districtTitleVp + 2} VP`,
    patch: (b) => ({ districtTitleVp: b.districtTitleVp + 2 }),
  },
  {
    id: 'shortGame',
    // −4 → −2: 既定が各 18 手番になったので −4（14）は先手 42.2%。−2（16）で 45.2%（audit-daily 100）
    label: (b) => `短期決戦（各 ${b.maxTurnsPerPlayer - 2} ターン）`,
    patch: (b) => ({ maxTurnsPerPlayer: b.maxTurnsPerPlayer - 2 }),
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
    // 城塞の通行料 2 倍（通行料は 2026-10-11 に廃止）の置き換え。収益のある建物だけ、全段で +1
    id: 'richIncome',
    label: () => '建物の収益 +1（収益のある建物）',
    patch: (b) => ({
      buildings: mapValues(b.buildings, (v) => ({ ...v, income: v.income > 0 ? v.income + 1 : v.income })),
      upgrades: mapValues(b.upgrades, (v) => ({ ...v, income: v.income > 0 ? v.income + 1 : v.income })),
      upgrades3: mapValues(b.upgrades3, (v) => ({ ...v, income: v.income > 0 ? v.income + 1 : v.income })),
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
