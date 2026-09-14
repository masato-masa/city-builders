import { DEFAULT_BALANCE, type Balance } from './balance';
import { activeOwnedSlots, handOf, opponentOf, ownedSlots } from './selectors';
import { createRng } from './rng';
import type { Action, BuildingId, CardId, GameState, PlayerId } from './types';

/** 効果が生きている自分の物件のうち、指定した種類を持っているか。
 *  封鎖者に止められている 1 件は「持っていない」扱いになる。 */
function hasActiveBuilding(state: GameState, player: PlayerId, id: BuildingId): boolean {
  return activeOwnedSlots(state, player).some((s) => s.buildingId === id);
}

/** 効果が生きている自分の物件のうち、指定した種類の件数。 */
function countActiveBuilding(state: GameState, player: PlayerId, id: BuildingId): number {
  return activeOwnedSlots(state, player).filter((s) => s.buildingId === id).length;
}

/** 工場の割引を織り込んだ、いま実際に払う額。 */
export function cardCostFor(
  state: GameState,
  player: PlayerId,
  card: CardId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  const base = balance.cards[card].cost;
  const p = state.players[player];
  if (!p.usedAnyCardThisTurn && hasActiveBuilding(state, player, 'factory')) {
    const discount = p.festivalActive
      ? balance.factoryDiscount * balance.festivalMultiplier
      : balance.factoryDiscount;
    return Math.max(0, base - discount);
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
  if (p.boundCard === card) return false;
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

/** 次のターン開始時に払い出される投資カード。 */
const INCOME_CARDS: readonly CardId[] = ['miner', 'banker'];

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
  const foe = opponentOf(player);
  next.players[player].coins -= buildCostFor(state, player, action.slotId, balance);
  next.market[action.slotId]!.owner = player;

  // 城塞の通行料: 建てたのが自分でも、相手が城塞を持っていれば相手に入る。
  // 自分が城塞を持っていて自分で建てても、自分には入らない。
  const foeFortresses = countActiveBuilding(next, foe, 'fortress');
  if (foeFortresses > 0) {
    let toll = foeFortresses * balance.fortressToll;
    if (next.players[foe].festivalActive) toll *= balance.festivalMultiplier;
    next.players[foe].coins += toll;
  }

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
    // 対象は自分が所有していない区画すべて（空き地でも相手の物件でもよい）
    if (!state.market[slot] || state.market[slot]!.owner === player) return state;
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
  if (action.card === 'usurer') {
    p.coins += balance.usurerGain;
    p.pendingDebt += balance.usurerDebt;
  }
  if (action.card === 'festival') {
    p.festivalQueued = true;
  }
  if (action.card === 'guard') {
    p.guarded = true;
  }

  const foeGuarded = next.players[foe].guarded;
  const foeWalled = hasActiveBuilding(next, foe, 'wall');

  if (action.card === 'spy' && !foeGuarded) {
    next.players[foe].bindPending = true;
  }
  if (action.card === 'taxman' && !foeGuarded && !foeWalled) {
    next.players[foe].coins = Math.max(0, next.players[foe].coins - balance.taxmanAmount);
  }
  if (action.card === 'blockader' && !foeGuarded && !foeWalled) {
    const slotId = action.blockadeSlot!;
    const targetSlot = next.market[slotId]!;
    if (targetSlot.owner === null) {
      next.players[foe].blockedSlot = slotId;
    } else {
      next.players[foe].disabledSlot = slotId;
    }
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

/** 1 枚の投資カードが解決時に生むコイン。銀行家だけ解決時の物件数で変わる。
 *  取引所の投資ボーナスは物件の効果なので、祝祭中は 2 倍になる。 */
function incomeOf(
  state: GameState,
  player: PlayerId,
  card: CardId,
  balance: Balance,
): number {
  const p = state.players[player];
  let bonus = hasActiveBuilding(state, player, 'exchange') ? balance.exchangeBonus : 0;
  if (p.festivalActive) bonus *= balance.festivalMultiplier;
  switch (card) {
    case 'miner':
      return balance.minerIncome + bonus;
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

  // 祝祭: 収入を計算する前に有効化する
  p.festivalActive = p.festivalQueued;
  p.festivalQueued = false;

  p.coins += balance.baseIncome;
  if (p.festivalActive) p.coins += balance.festivalIncomeBonus;

  let houseIncome = countActiveBuilding(next, player, 'tradingHouse') * balance.tradingHouseIncome;
  if (p.festivalActive) houseIncome *= balance.festivalMultiplier;
  p.coins += houseIncome;

  for (const card of p.pendingIncome) {
    p.coins += incomeOf(next, player, card, balance);
  }

  // 高利貸の借り。収入を足したあとに引く。コインがマイナスになるのはここだけ。
  p.coins -= p.pendingDebt;
  p.pendingDebt = 0;

  p.pendingIncome = [];
  p.usedThisTurn = [];
  p.usedAnyCardThisTurn = false;
  p.buildDiscount = 0;
  p.roadUsesThisTurn = 0;

  // 買収者を受けていたら、このときの手札から 1 枚を抽選して縛る
  if (p.bindPending) {
    const hand = handOf(next, player, balance);
    const rng = createRng(next.seed * 7919 + next.turn);
    p.boundCard = hand[rng.int(hand.length)] ?? null;
    p.bindPending = false;
  }

  // 衛兵の保護は、この開始フェーズの処理が終わったところで切れる
  p.guarded = false;

  return next;
}

export function canUseRoad(
  state: GameState,
  target: CardId,
  balance: Balance = DEFAULT_BALANCE,
): boolean {
  if (state.phase !== 'playing') return false;
  const player = state.current;
  if (!hasActiveBuilding(state, player, 'road')) return false;
  const limit = state.players[player].festivalActive ? balance.festivalMultiplier : 1;
  if (state.players[player].roadUsesThisTurn >= limit) return false;
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
  p.roadUsesThisTurn += 1;
  return next;
}

function endTurn(state: GameState, balance: Balance): GameState {
  if (state.phase !== 'playing') return state;
  const next = structuredClone(state);
  const player = next.current;

  // 自分に掛かっていた効果はこのターンの終わりで解ける
  next.players[player].blockedSlot = null;
  next.players[player].disabledSlot = null;
  next.players[player].festivalActive = false;
  next.players[player].boundCard = null;

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
      // 対象は自分が所有していない区画すべて（空き地・相手の物件どちらも）
      for (const slot of state.market) {
        if (slot.owner !== player) {
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
