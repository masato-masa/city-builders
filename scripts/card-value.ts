/** カード 1 枚の本当の価値を測る常設ツール。
 *
 *   npm run card-value                 # 全カード、各 200 試合
 *   npm run card-value -- 400 taxman spy   # 試合数とカードを指定
 *   BALANCE='{"spyBindCount":3}' npm run card-value -- 300 spy   # 数値を上書きして試す
 *   npm run card-value -- 400 --deck=new                # 新カード入りのデッキ（NEW_CARDS_DECK）で全カード
 *   npm run card-value -- 400 --deck=miner,banker,...   # デッキを並べて指定（両者同じデッキ）
 *   npm run card-value -- 400 --deck=draw               # 抽選デッキ。カードごとに「そのカードが入った抽選デッキ」だけで測る（全 16 枚）
 *
 * 同じ性格（均衡）の CPU 同士を戦わせ、片方（A）だけがそのカードに加点・減点をつける。
 *   - 禁止: A はそのカードを使わない。A の勝率が 50% より低いほど、そのカードは価値がある。
 *   - 優先: A はそのカードを必ず先に使う。A の勝率が 50% より高ければ、CPU がそのカードを
 *     使い足りない（評価の盲点）か、カード自体が強い。
 * 「使用率が低い」ことと「弱い」ことは違う。使われないのが CPU の盲点なのか、カードが弱いのかを分ける。
 * 先手・後手は同数ずつ。seed は引数だけから決まるので、同じコマンドは同じ結果になる。 */
import { chooseAction, type AiOptions } from '../src/ai/choose';
import { DEFAULT_PROFILE } from '../src/ai/evaluate';
import { CARD_NAMES, CARD_POOL, type Balance } from '../src/game/balance';
import { reduce } from '../src/game/reducer';
import { createRng } from '../src/game/rng';
import { opponentOf, winnerOf } from '../src/game/selectors';
import { createGame, drawDeck } from '../src/game/setup';
import type { CardId, GameState, PlayerId } from '../src/game/types';

import { balanceFromEnv } from './balance-override';
import { deckSpecFromArgs } from './deck-arg';

/** BALANCE='{"bankerIncome":9,"cards":{"guard":{"cost":1}}}' のように環境変数で数値を上書きして試せる。
 *  中身は scripts/balance-override.ts（lab と共通）。 */
const DEFAULT_BALANCE: Balance = balanceFromEnv();

const args = process.argv.slice(2);
const games = Number(args.find((a) => /^\d+$/.test(a)) ?? 200);
/** 両者が使うデッキ（scripts/deck-arg.ts）。省略時は既定の 10 枚。 */
const SPEC = deckSpecFromArgs(args, DEFAULT_BALANCE);

/** 抽選のとき、カード card が入った抽選デッキを seed から 1 つ決める（入るまで seed をずらす）。
 *  固定のデッキならそのまま。 */
function deckFor(card: CardId, seed: number): readonly CardId[] {
  if (SPEC.kind !== 'draw') return SPEC.deckFor(seed) ?? SPEC.cards;
  for (let j = 0; ; j++) {
    const d = drawDeck(seed * 31 + j, DEFAULT_BALANCE);
    if (d.includes(card)) return d;
  }
}

const named = args.filter((a) => (CARD_POOL as readonly string[]).includes(a)) as CardId[];
const cards = named.length > 0 ? named : [...SPEC.cards];

const BASE: AiOptions = { noise: 0, harassRate: 1, lookahead: false, profile: DEFAULT_PROFILE };

/** 全試合を通した、建設・アップグレード・買収の回数（新ルールが使われているかの目安） */
const totals = { games: 0, build: 0, upgrade: 0, acquire: 0 };

function play(seed: number, a: AiOptions, aFirst: boolean, deck: readonly CardId[]): 'A' | 'B' | 'draw' {
  totals.games++;
  let g: GameState = createGame(seed, DEFAULT_BALANCE, undefined, { you: deck, cpu: deck });
  if (g.current !== (aFirst ? 'you' : 'cpu')) {
    const first: PlayerId = aFirst ? 'you' : 'cpu';
    const second = opponentOf(first);
    g = structuredClone(g);
    g.current = first;
    g.players[first].coins = DEFAULT_BALANCE.startingCoins.first;
    g.players[second].coins = DEFAULT_BALANCE.startingCoins.second;
  }
  const opts: Record<PlayerId, AiOptions> = { you: a, cpu: BASE };
  const rng = createRng(seed * 65537 + 11);
  for (let guard = 0; g.phase === 'playing' && guard < 100; guard++) {
    let next = reduce(g, { type: 'startTurn' }, DEFAULT_BALANCE);
    const o = opts[next.current];
    for (let i = 0; i < 40; i++) {
      const action = chooseAction(next, o, rng, DEFAULT_BALANCE);
      if (action.type === 'endTurn') break;
      const applied = reduce(next, action, DEFAULT_BALANCE);
      if (applied === next) break;
      if (action.type === 'acquire') totals.acquire++;
      if (action.type === 'upgrade') totals.upgrade++;
      if (action.type === 'build') totals.build++;
      next = applied;
    }
    g = reduce(next, { type: 'endTurn' }, DEFAULT_BALANCE);
  }
  const w = winnerOf(g, DEFAULT_BALANCE);
  return w === 'you' ? 'A' : w === 'cpu' ? 'B' : 'draw';
}

function rate(card: CardId, bonus: number): number {
  let score = 0;
  for (let k = 0; k < games; k++) {
    const aFirst = k % 2 === 0;
    // CARD_POOL は既定の 10 枚が先頭に同じ順で並ぶので、既定のカードの seed は前と同じ
    const seed = (CARD_POOL.indexOf(card) + 1) * 1_000_000 + (bonus > 0 ? 500_000 : 0) + k;
    // 禁止と優先で同じデッキ（抽選なら同じ 10 枚）を使う
    const deck = deckFor(card, (CARD_POOL.indexOf(card) + 1) * 1_000_000 + k);
    const r = play(seed, { ...BASE, cardBonus: { [card]: bonus } }, aFirst, deck);
    score += r === 'A' ? 1 : r === 'draw' ? 0.5 : 0;
  }
  return (score / games) * 100;
}

// 標準誤差の目安: 試合数 n のとき 50% 付近で 50/√n
const se = (50 / Math.sqrt(games)).toFixed(1);
console.log(`試合数 ${games}/件（誤差の目安 ±${se}%、2 倍で約 95%）`);
console.log(`デッキ: ${SPEC.label}\n`);
console.log('| カード | 禁止したときの勝率 | 優先したときの勝率 | 読み取り |');
console.log('|---|---|---|---|');
for (const card of cards) {
  const ban = rate(card, -1000);
  const push = rate(card, 1000);
  const lim = 2 * Number(se);
  const note =
    ban < 50 - lim ? '禁止すると負ける＝価値あり' : ban > 50 + lim ? '禁止したほうが勝つ＝使うと損' : '禁止しても差なし';
  const note2 = push > 50 + lim ? ' / 優先すると勝つ＝CPU が使い足りない' : push < 50 - lim ? ' / 優先すると負ける' : '';
  console.log(`| ${CARD_NAMES[card]} | ${ban.toFixed(1)}% | ${push.toFixed(1)}% | ${note}${note2} |`);
}

const per = (n: number) => (n / totals.games).toFixed(2);
console.log('');
console.log(
  `1 試合あたり（両者合計）: 建設 ${per(totals.build)} / アップグレード ${per(totals.upgrade)} / 買収 ${per(totals.acquire)}（${totals.games} 試合）`,
);
