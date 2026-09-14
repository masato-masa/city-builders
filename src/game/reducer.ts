import { DEFAULT_BALANCE, type Balance } from './balance';
import { countBuilding, handOf, hasBuilding, opponentOf, ownedSlots } from './selectors';
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
    case 'startTurn':
      return startTurn(state, balance);
    case 'useCard':
      return useCard(state, action, balance);
    case 'build':
      return build(state, action, balance);
    case 'useRoad':
      return useRoad(state, action, balance);
    case 'endTurn':
      return endTurn(state, balance);
    default:
      return state;
  }
}

const INCOME_CARDS: readonly CardId[] = ['miner', 'merchant', 'banker'];

/** 建築家の割引を織り込んだ、いま実際に払う額。 */
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
