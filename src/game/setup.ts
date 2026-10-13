import { CARD_POOL, CORE_CARDS, DEFAULT_BALANCE, DEFAULT_DECK, type Balance } from './balance';
import { createRng, shuffle } from './rng';
import type { BuildingSlot, CardId, GameState, PlayerId, PlayerState } from './types';

function emptyPlayer(
  coins: number,
  hand: PlayerState['hand'],
  queue: PlayerState['queue'],
): PlayerState {
  return {
    coins,
    hand,
    queue,
    usedThisTurn: [],
    pendingIncome: [],
    buildDiscount: 0,
    buildsThisTurn: 0,
    usedAnyCardThisTurn: false,
    roadUsesThisTurn: 0,
    pendingDebt: 0,
    pendingTax: 0,
    festivalQueued: false,
    festivalActive: false,
    guarded: false,
    acquireDiscount: 0,
    upgradeDiscount: 0,
    cardXp: {},
  };
}

/** 各プレイヤーのデッキ（カード ID の並び）。省略した側は既定の 10 枚（DEFAULT_DECK）。 */
export type Decks = Partial<Record<PlayerId, readonly CardId[]>>;

/** デッキが使えるか。同じカードは 1 枚まで（手札の表示・使用判定がカード名で持つため）、
 *  枚数は手札 + 待機列 1 枚以上（使った札が補充できるように）。 */
export function validateDeck(deck: readonly CardId[], balance: Balance = DEFAULT_BALANCE): string | null {
  if (new Set(deck).size !== deck.length) return '同じカードが 2 枚以上入っています';
  if (deck.length <= balance.handSize) return `デッキは ${balance.handSize + 1} 枚以上が必要です`;
  for (const c of deck) if (!balance.cards[c]) return `コストの無いカードです: ${c}`;
  return null;
}

/** シードからゲーム全体を決める。同じシードからは必ず同じ試合になる。
 *  decks を省略すると両者とも既定の 10 枚。デッキを渡しても、山札の並べ替えの乱数の使い方は同じ
 *  （既定のデッキなら、渡しても渡さなくても同じ試合になる）。 */
export function createGame(
  seed: number,
  balance: Balance = DEFAULT_BALANCE,
  forcedFirst?: PlayerId,
  decks: Decks = {},
): GameState {
  const youCards = decks.you ?? DEFAULT_DECK;
  const cpuCards = decks.cpu ?? DEFAULT_DECK;
  for (const deck of [youCards, cpuCards]) {
    const err = validateDeck(deck, balance);
    if (err) throw new Error(err);
  }
  const rng = createRng(seed);
  const youDeck = shuffle(youCards, rng);
  const cpuDeck = shuffle(cpuCards, rng);
  const first: PlayerId = forcedFirst ?? (rng.int(2) === 0 ? 'you' : 'cpu');
  const second: PlayerId = first === 'you' ? 'cpu' : 'you';

  const market: BuildingSlot[] = balance.market.map((buildingId, slotId) => ({
    slotId,
    buildingId,
    owner: null,
    level: 1,
    touchedTurn: 0,
  }));

  const players = {
    you: emptyPlayer(0, youDeck.slice(0, balance.handSize), youDeck.slice(balance.handSize)),
    cpu: emptyPlayer(0, cpuDeck.slice(0, balance.handSize), cpuDeck.slice(balance.handSize)),
  } as Record<PlayerId, PlayerState>;
  players[first].coins = balance.startingCoins.first;
  players[second].coins = balance.startingCoins.second;

  return {
    seed,
    turn: 1,
    current: first,
    players,
    market,
    titles: balance.districts.map(() => null),
    blockades: [],
    phase: 'playing',
  };
}

/** 抽選デッキの乱数の種を、試合の seed から別の系列にずらす定数。createGame の山札の並べ替えと
 *  同じ乱数列を使わないため（同じ seed の試合でも、抽選と山札の並びが連動しない）。 */
const DRAW_SALT = 0x5eed_d3c4;

/** 抽選（ドミニオン式）のデッキ。コア 4 枚（CORE_CARDS）は必ず入り、残りの札（CARD_POOL からコアを除いた 12 種）から
 *  seed で 6 枚を選ぶ。両者共通で使う。同じ seed からは必ず同じ 10 枚（決定性）。
 *  並びは CARD_POOL の順に揃える（山札の並べ替えは createGame が行う）。 */
export function drawDeck(seed: number, balance: Balance = DEFAULT_BALANCE): CardId[] {
  const rng = createRng((seed ^ DRAW_SALT) >>> 0);
  const rest = CARD_POOL.filter((c) => !CORE_CARDS.includes(c) && balance.cards[c]);
  const size = 10;
  const picked = new Set<CardId>([...CORE_CARDS, ...shuffle(rest, rng).slice(0, size - CORE_CARDS.length)]);
  return CARD_POOL.filter((c) => picked.has(c));
}
