import { BUILDING_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { endReasonOf, opponentOf, scoreOf, winnerOf, type EndReason } from '@/game/selectors';
import type { BuildingId, CardId, GameState, PlayerId } from '@/game/types';

/** 試合の記録。src/game には手を入れず、UI が受け取った状態の「差分」だけから作る。
 *  （カード効果が作り替わっても、物件の持ち主・レベル・usedThisTurn が変わらない限り壊れない） */
export type MatchEvent =
  | {
      kind: 'build' | 'upgrade' | 'acquire';
      /** GameState.turn（1 人の手番を 1 と数える）。 */
      turn: number;
      actor: PlayerId;
      slotId: number;
      buildingId: BuildingId;
      /** その手番に祝祭が効いていたか。 */
      festival: boolean;
      /** 行為者から見た VP 差の動き（自分の VP − 相手の VP の、前後の差）。 */
      swing: number;
      /** 直後の VP 差（行為者から見た値）。 */
      marginAfter: number;
      /** 直前の VP 差（行為者から見た値）。 */
      marginBefore: number;
      /** この出来事で行為者が取った地区の称号の名前（取っていなければ無し）。 */
      title?: string;
      /** 相手から奪った称号か（誰も持っていなかった称号を取ったなら false）。 */
      titleStolen?: boolean;
    }
  | { kind: 'card'; turn: number; actor: PlayerId; card: CardId }
  /** 物件の Lv が下がった（検査官）。actor は下げた側（物件の持ち主の相手）。 */
  | {
      kind: 'downgrade';
      turn: number;
      actor: PlayerId;
      slotId: number;
      buildingId: BuildingId;
      from: number;
      to: number;
      /** 下げた側から見た VP 差の動き */
      swing: number;
    }
  /** 地区の称号の持ち主が替わった（from が null なら初めて取った）。 */
  | { kind: 'title'; turn: number; actor: PlayerId; district: number; name: string; from: PlayerId | null };

/** 建設・アップグレード・買収の出来事（勝敗を分けた出来事・実績の判定に使う）。 */
export type SlotEvent = Extract<MatchEvent, { kind: 'build' | 'upgrade' | 'acquire' }>;

export function isSlotEvent(e: MatchEvent): e is SlotEvent {
  return e.kind === 'build' || e.kind === 'upgrade' || e.kind === 'acquire';
}

export interface VpPoint {
  turn: number;
  you: number;
  cpu: number;
}

export interface MatchLog {
  events: MatchEvent[];
  /** 手番ごとの VP。同じ手番の中の変化は最後の値で上書きする。 */
  vp: VpPoint[];
}

export function createMatchLog(state: GameState, balance: Balance = DEFAULT_BALANCE): MatchLog {
  return {
    events: [],
    vp: [{ turn: state.turn, you: scoreOf(state, 'you', balance), cpu: scoreOf(state, 'cpu', balance) }],
  };
}

/** 状態が prev → next と変わったぶんを記録に足す（純粋関数。log は書き換えない）。
 *  1 回の差分に複数の出来事が入っていても拾う（React がまとめて反映した場合）。 */
export function recordTransition(
  log: MatchLog,
  prev: GameState,
  next: GameState,
  balance: Balance = DEFAULT_BALANCE,
): MatchLog {
  if (prev === next) return log;
  const events: MatchEvent[] = [];

  // カード: 同じ手番の中で usedThisTurn が伸びたぶん。
  if (prev.turn === next.turn) {
    for (const p of ['you', 'cpu'] as const) {
      const before = prev.players[p].usedThisTurn;
      const after = next.players[p].usedThisTurn;
      if (after.length > before.length) {
        for (const card of after.slice(before.length)) {
          events.push({ kind: 'card', turn: next.turn, actor: p, card });
        }
      }
    }
  }

  // 物件: 持ち主・レベルの変化。
  const youBefore = scoreOf(prev, 'you', balance);
  const cpuBefore = scoreOf(prev, 'cpu', balance);
  const youAfter = scoreOf(next, 'you', balance);
  const cpuAfter = scoreOf(next, 'cpu', balance);
  const marginOf = (actor: PlayerId, you: number, cpu: number) => (actor === 'you' ? you - cpu : cpu - you);
  const slotEvents: SlotEvent[] = [];
  const downEvents: MatchEvent[] = [];
  for (const after of next.market) {
    const before = prev.market[after.slotId];
    if (!before || after.owner === null) continue;
    if (before.owner === after.owner && after.level < before.level) {
      // 検査官で Lv が下がった。下げたのは持ち主の相手
      const actor = opponentOf(after.owner);
      downEvents.push({
        kind: 'downgrade',
        turn: next.turn,
        actor,
        slotId: after.slotId,
        buildingId: after.buildingId,
        from: before.level,
        to: after.level,
        swing: marginOf(actor, youAfter, cpuAfter) - marginOf(actor, youBefore, cpuBefore),
      });
      continue;
    }
    let kind: 'build' | 'upgrade' | 'acquire' | null = null;
    if (before.owner === null) kind = 'build';
    else if (before.owner !== after.owner) kind = 'acquire';
    else if (after.level > before.level) kind = 'upgrade';
    if (!kind) continue;
    const actor = after.owner;
    const marginBefore = marginOf(actor, youBefore, cpuBefore);
    const marginAfter = marginOf(actor, youAfter, cpuAfter);
    slotEvents.push({
      kind,
      turn: next.turn,
      actor,
      slotId: after.slotId,
      buildingId: after.buildingId,
      festival: next.players[actor].festivalActive,
      swing: marginAfter - marginBefore,
      marginBefore,
      marginAfter,
    });
  }
  // 地区の称号: 持ち主が替わった地区。動かした物件の出来事にも、取った称号の名前を付ける
  const titleEvents: MatchEvent[] = [];
  next.titles?.forEach((holder, i) => {
    const was = prev.titles?.[i] ?? null;
    if (holder === null || holder === was) return;
    const name = balance.districts[i]?.name ?? '';
    titleEvents.push({ kind: 'title', turn: next.turn, actor: holder, district: i, name, from: was });
    const cause = slotEvents.find((e) => e.actor === holder && balance.districts[i]?.slots.includes(e.slotId));
    if (cause) {
      cause.title = name;
      cause.titleStolen = was !== null;
    }
  });

  // 同じ差分に 2 件以上あると swing を分けられないので、件数で割る（まとめて反映されたときだけ）。
  if (slotEvents.length > 1) {
    for (const e of slotEvents) e.swing = Math.round(e.swing / slotEvents.length);
  }
  events.push(...slotEvents, ...downEvents, ...titleEvents);

  const point: VpPoint = { turn: next.turn, you: youAfter, cpu: cpuAfter };
  const last = log.vp[log.vp.length - 1];
  const vp =
    last && last.turn === next.turn
      ? last.you === youAfter && last.cpu === cpuAfter
        ? log.vp
        : [...log.vp.slice(0, -1), point]
      : [...log.vp, point];

  if (events.length === 0 && vp === log.vp) return log;
  return { events: events.length ? [...log.events, ...events] : log.events, vp };
}

// ---------------------------------------------------------------------------
// 結果画面の文言
// ---------------------------------------------------------------------------

export type Names = Record<PlayerId, string>;

/** 名前に助詞を付ける。英字で終わる名前（CPU）は「CPU が」のように半角空白を挟む（アプリ内の表記に合わせる）。 */
export function particle(name: string, p: string): string {
  return /[A-Za-z0-9]$/.test(name) ? ` ${p}` : p;
}

/** 各プレイヤーにとっての「ターン目」。手番は交互なので、先手・後手どちらでも ceil(turn / 2)。 */
export function ownTurnOf(turn: number): number {
  return Math.ceil(turn / 2);
}

/** 勝敗の差の 1 行。winner は winnerOf の値。 */
export function marginLine(
  winner: PlayerId | 'draw',
  vp: Record<PlayerId, number>,
  coins: Record<PlayerId, number>,
  names: Names,
  viewer: PlayerId | null,
  /** 終わり方（省略すると差だけの 1 行）。 */
  ending?: { reason: EndReason; winVp: number } | null,
): string {
  if (winner === 'draw') {
    return viewer ? 'VP もコインも同じ。あと 1 VP で勝てた' : 'VP もコインも同じ';
  }
  const loser = opponentOf(winner);
  const diff = vp[winner] - vp[loser];
  if (viewer === loser) {
    return diff === 0
      ? `VP は同点、コイン ${coins[loser]} 対 ${coins[winner]} で負け。あと 1 VP で勝てた`
      : `あと ${diff + 1} VP で勝てた`;
  }
  const subject = viewer === winner ? '' : `${names[winner]}${particle(names[winner], 'が')} `;
  if (ending?.reason === 'monopoly') return `${subject}全物件を押さえて勝利`;
  if (ending?.reason === 'vp') return `${subject}先に ${ending.winVp} VP に届いて勝利（${diff} VP 差）`;
  const limit = ending?.reason === 'limit' ? 'ターン切れ。' : '';
  return limit + (diff === 0
    ? `${subject}VP 同点、コイン ${coins[winner]} 対 ${coins[loser]} で勝利`
    : `${subject}${diff} VP 差で勝利`);
}

/** 勝敗を分けた出来事。文言とグラフに印を付ける手番。 */
export interface DecisiveMoment {
  text: string;
  turn: number;
  actor: PlayerId;
}

const VERB: Record<'build' | 'upgrade' | 'acquire', string> = {
  build: '建設',
  upgrade: 'アップグレード',
  acquire: '買収',
};

/** 出来事が称号を動かしていたら、その一言（「（城下の称号ごと）」）。 */
function titleSuffix(e: SlotEvent): string {
  if (!e.title) return '';
  return e.titleStolen ? `（${e.title}の称号ごと奪取）` : `（${e.title}の称号も獲得）`;
}

/** 記録から、勝敗を一番動かした出来事を選んで 1 行にする。
 *  1. 勝者が最後に前に出て、そのまま逃げ切った出来事（逆転）
 *  2. 1 手番でまとめて VP を動かした手番（2 件以上で、単発の最大より大きいとき）
 *  3. 一番大きく VP 差を動かした単発の出来事
 *  記録が無ければ null。 */
export function decisiveMoment(
  log: MatchLog,
  winner: PlayerId | 'draw',
  names: Names,
): DecisiveMoment | null {
  const slots = log.events.filter(isSlotEvent);
  if (slots.length === 0) return null;
  const who = (p: PlayerId) => names[p];
  const at = (e: { turn: number; actor: PlayerId }) =>
    `${who(e.actor)}${particle(who(e.actor), 'の')} ${ownTurnOf(e.turn)} ターン目`;

  // 1. 逆転: 勝者から見て差が 0 以下 → 正 になり、その後一度も 0 以下に戻らなかった出来事。
  if (winner !== 'draw') {
    const marginFor = (e: SlotEvent) => (e.actor === winner ? e.marginAfter : -e.marginAfter);
    const marginBeforeFor = (e: SlotEvent) => (e.actor === winner ? e.marginBefore : -e.marginBefore);
    let lastTakeover: SlotEvent | null = null;
    for (const e of slots) {
      if (marginBeforeFor(e) <= 0 && marginFor(e) > 0) lastTakeover = e;
      else if (marginFor(e) <= 0) lastTakeover = null;
    }
    // 直前に負けていた（同点ではなく）ときだけ「逆転」と言う。0 対 0 から先に建てたのは逆転ではない。
    if (lastTakeover && lastTakeover.actor === winner && marginBeforeFor(lastTakeover) < 0) {
      const e = lastTakeover;
      return {
        text: `${at(e)}、${BUILDING_NAMES[e.buildingId]}の${VERB[e.kind]}で逆転${titleSuffix(e)}`,
        turn: e.turn,
        actor: e.actor,
      };
    }
  }

  // 2 と 3 は勝者の出来事から選ぶ（引き分けなら両者）。
  const pool = winner === 'draw' ? slots : slots.filter((e) => e.actor === winner);
  const candidates = pool.length ? pool : slots;
  const best = candidates.reduce((a, b) => (b.swing > a.swing ? b : a));

  const byTurn = new Map<string, SlotEvent[]>();
  for (const e of candidates) {
    const key = `${e.actor}:${e.turn}`;
    byTurn.set(key, [...(byTurn.get(key) ?? []), e]);
  }
  let bestTurn: SlotEvent[] | null = null;
  let bestTurnSwing = -Infinity;
  for (const group of byTurn.values()) {
    if (group.length < 2) continue;
    const s = group.reduce((n, e) => n + e.swing, 0);
    if (s > bestTurnSwing) {
      bestTurnSwing = s;
      bestTurn = group;
    }
  }
  if (bestTurn && bestTurnSwing > best.swing) {
    const e = bestTurn[0]!;
    const builds = bestTurn.filter((x) => x.kind === 'build').length;
    // 建設だけなら「3 件建てた」。混ざっていたら中身を並べる（「建設 2・買収 1」）。
    const what =
      builds === bestTurn.length
        ? `${builds} 件建てた`
        : (['build', 'acquire', 'upgrade'] as const)
            .map((k) => [k, bestTurn!.filter((x) => x.kind === k).length] as const)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${VERB[k]} ${n}`)
            .join('・');
    // 数字の前だけ半角空白（「に 3 件建てた」「に建設 1・買収 1」）。
    const gap = /^\d/.test(what) ? ' ' : '';
    const festival = bestTurn.some((x) => x.festival);
    return {
      text: festival
        ? `${who(e.actor)}${particle(who(e.actor), 'が')}祝祭のターンに${gap}${what}（差 +${bestTurnSwing} VP）`
        : `${at(e)}に${gap}${what}（差 +${bestTurnSwing} VP）`,
      turn: e.turn,
      actor: e.actor,
    };
  }

  const verb = best.kind === 'build' ? '建てた' : best.kind === 'upgrade' ? 'アップグレードした' : '買収した';
  return {
    text: `${at(best)}に${BUILDING_NAMES[best.buildingId]}を${verb}${
      best.title
        ? `。${best.title}の称号${best.titleStolen ? 'ごと' : 'も取り'}差 +${best.swing} VP`
        : best.swing > 0
          ? `（差 +${best.swing} VP）`
          : ''
    }`,
    turn: best.turn,
    actor: best.actor,
  };
}

/** 結果画面に渡す振り返り。 */
export interface ResultReview {
  margin: string;
  moment: DecisiveMoment | null;
  vp: VpPoint[];
  streak: string | null;
}

/** 終局の状態と記録から、結果画面の振り返りを組み立てる。viewer は「あなた」がいる側（2 人対戦は null）。 */
export function buildReview(
  log: MatchLog,
  final: GameState,
  balance: Balance,
  names: Names,
  viewer: PlayerId | null,
  streak: string | null,
): ResultReview {
  const vp = { you: scoreOf(final, 'you', balance), cpu: scoreOf(final, 'cpu', balance) };
  const coins = { you: final.players.you.coins, cpu: final.players.cpu.coins };
  const winner = winnerOf(final, balance) ?? 'draw';
  const endReason = endReasonOf(final, balance);
  // 最後の点は終局の値で必ず置き直す（反映の取りこぼしがあってもグラフと数字が食い違わない）。
  const last = log.vp[log.vp.length - 1];
  const end = { turn: final.turn, ...vp };
  const points = last && last.turn === final.turn ? [...log.vp.slice(0, -1), end] : [...log.vp, end];
  return {
    margin: marginLine(winner, vp, coins, names, viewer, endReason ? { reason: endReason, winVp: balance.winVp } : null),
    moment: decisiveMoment(log, winner, names),
    vp: points,
    streak,
  };
}

/** VP の推移を SVG の折れ線にする（純粋関数）。左下が原点、x は手番、y は VP。
 *  斜めに結ぶと途中の手番に無い値が出るので、階段状に結ぶ。 */
export function vpChartPaths(
  points: VpPoint[],
  width: number,
  height: number,
): { you: string; cpu: string; maxVp: number; xOf: (turn: number) => number; yOf: (vp: number) => number } {
  const first = points[0]?.turn ?? 0;
  const lastTurn = points[points.length - 1]?.turn ?? first;
  const span = Math.max(1, lastTurn - first);
  const maxVp = Math.max(1, ...points.map((p) => Math.max(p.you, p.cpu)));
  const xOf = (turn: number) => ((turn - first) / span) * width;
  const yOf = (v: number) => height - (v / maxVp) * height;
  const r = (n: number) => Math.round(n * 10) / 10;
  const path = (key: 'you' | 'cpu') =>
    points
      .map((p, i) => {
        const x = r(xOf(p.turn));
        const y = r(yOf(p[key]));
        if (i === 0) return `M${x} ${y}`;
        const py = r(yOf(points[i - 1]![key]));
        return py === y ? `H${x}` : `H${x}V${y}`;
      })
      .join('');
  return { you: path('you'), cpu: path('cpu'), maxVp, xOf, yOf };
}

/** 連勝の 1 行（CPU 戦のみ）。出さないときは null。 */
export function streakLine(result: 'win' | 'lose' | 'draw', streak: number, previousStreak: number): string | null {
  if (result === 'win') return streak >= 2 ? `${streak} 連勝中` : null;
  if (result === 'lose') return previousStreak >= 2 ? `${previousStreak} 連勝でストップ` : null;
  return streak >= 2 ? `${streak} 連勝のまま` : null;
}
