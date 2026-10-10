import { DEFAULT_BALANCE, type Balance } from './balance';
import {
  acquirePriceOf,
  activeEffectMax,
  activeEffectSum,
  activeOwnedSlots,
  handOf,
  opponentOf,
  ownedSlots,
  roadUsesRemaining,
  slotLocked,
  upgradePriceOf,
} from './selectors';
import { createRng, shuffle } from './rng';
import type { Action, BuildingId, CardId, GameState, PlayerId, PlayerState } from './types';

/** 効果が生きている自分の物件のうち、指定した種類を持っているか。
 *  封鎖者に止められている 1 件は「持っていない」扱いになる。 */
function hasActiveBuilding(state: GameState, player: PlayerId, id: BuildingId): boolean {
  return activeOwnedSlots(state, player).some((s) => s.buildingId === id);
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
    const once = activeEffectMax(state, player, 'factory', 'factoryDiscount', balance);
    const discount = p.festivalActive ? once * balance.festivalMultiplier : once;
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
  if (p.boundCards.includes(card)) return false;
  const cost = cardCostFor(state, player, card, balance);
  // コスト 0 のカード（高利貸）は、コインがマイナスのときでも必ず打てる。
  // 高利貸は「使える札が 1 枚も無い」を構造的に潰すための札なので、
  // 借金でマイナスの間だけ払えなくなる、ということが起きてはいけない。
  if (cost <= 0) return true;
  return p.coins >= cost;
}

/** 手札のカードを 1 枚、使った/送った枠にそのまま補充する。
 *  そのカードがあった枠だけを待機列の先頭で埋め、他の枠は動かさない
 *  （手札全体がシフトして見える、を避けるための核）。カード自身は待機列の
 *  最後尾へ回り、循環を維持する。 */
function playCardInto(p: PlayerState, card: CardId): void {
  const i = p.hand.indexOf(card);
  if (i < 0) return;
  p.hand[i] = p.queue.shift() ?? null;
  p.queue.push(card);
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
    case 'upgrade':
      return upgrade(state, action, balance);
    case 'acquire':
      return acquire(state, action, balance);
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

/** 建築家の割引と、石切場の追加割引を織り込んだ、いま実際に払う額。
 *  石切場の追加割引は、建築家を使っているとき（buildDiscount > 0）かつ、
 *  そのターンすでに 1 件以上建てている（buildsThisTurn >= 1）ときだけ乗る。
 *  石切場自体が封鎖者で効果を止められていれば乗らない（activeOwnedBuilding で判定）。 */
export function buildCostFor(
  state: GameState,
  player: PlayerId,
  slotId: number,
  balance: Balance = DEFAULT_BALANCE,
): number {
  const slot = state.market[slotId];
  if (!slot) return Number.POSITIVE_INFINITY;
  const base = balance.buildings[slot.buildingId].cost;
  const p = state.players[player];
  let discount = p.buildDiscount;
  if (p.buildDiscount > 0 && p.buildsThisTurn >= 1) {
    discount += activeEffectMax(state, player, 'quarry', 'quarryExtraDiscount', balance);
  }
  return Math.max(0, base - discount);
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
  const cost = buildCostFor(state, player, action.slotId, balance);
  next.players[player].coins -= cost;
  const slot = next.market[action.slotId]!;
  slot.owner = player;
  // 買収の価格の元になるのは、実際に払った額（建築家・石切場で安く建てた物件は安く買われる）
  slot.paid = cost;
  slot.level = 1;
  slot.touchedTurn = next.turn;
  next.players[player].buildsThisTurn += 1;

  // 城塞の通行料: 建てたのが自分でも、相手が城塞を持っていれば相手に入る。
  // 自分が城塞を持っていて自分で建てても、自分には入らない。
  const foeToll = activeEffectSum(next, foe, 'fortress', 'fortressToll', balance);
  if (foeToll > 0) {
    let toll = foeToll;
    if (next.players[foe].festivalActive) toll *= balance.festivalMultiplier;
    next.players[foe].coins += toll;
  }

  return next;
}

/** 自分の物件を 1 段上げられるか。手札は使わない。建築家・石切場の割引は乗らない（建設ではないため）。 */
export function canUpgrade(
  state: GameState,
  slotId: number,
  balance: Balance = DEFAULT_BALANCE,
): boolean {
  if (state.phase !== 'playing') return false;
  const slot = state.market[slotId];
  if (!slot || slot.owner !== state.current) return false;
  if (slotLocked(state, slot, balance)) return false;
  return state.players[state.current].coins >= upgradePriceOf(slot, balance);
}

function upgrade(
  state: GameState,
  action: Extract<Action, { type: 'upgrade' }>,
  balance: Balance,
): GameState {
  if (!canUpgrade(state, action.slotId, balance)) return state;
  const next = structuredClone(state);
  const slot = next.market[action.slotId]!;
  const price = upgradePriceOf(slot, balance);
  next.players[next.current].coins -= price;
  slot.paid += price;
  slot.level += 1;
  slot.touchedTurn = next.turn;
  return next;
}

/** 相手の物件を買収できるか。価格は paid + acquireMarkup。
 *  相手が衛兵で守られていれば買えない。城壁は防がない。封鎖者で止められた物件も買える。 */
export function canAcquire(
  state: GameState,
  slotId: number,
  balance: Balance = DEFAULT_BALANCE,
): boolean {
  if (state.phase !== 'playing') return false;
  const player = state.current;
  const foe = opponentOf(player);
  const slot = state.market[slotId];
  if (!slot || slot.owner !== foe) return false;
  if (state.players[foe].guarded) return false;
  if (slotLocked(state, slot, balance)) return false;
  return state.players[player].coins >= acquirePriceOf(slot, balance);
}

function acquire(
  state: GameState,
  action: Extract<Action, { type: 'acquire' }>,
  balance: Balance,
): GameState {
  if (!canAcquire(state, action.slotId, balance)) return state;
  const next = structuredClone(state);
  const player = next.current;
  const foe = opponentOf(player);
  const slot = next.market[action.slotId]!;
  const price = acquirePriceOf(slot, balance);
  // コインの総量は変わらない。買収は VP と効果の移動
  next.players[player].coins -= price;
  next.players[foe].coins += price;
  slot.owner = player;
  slot.paid = price;
  slot.touchedTurn = next.turn;
  // 封鎖者の disabledSlot は「その区画を持つ側」に掛かっている。持ち主が変われば外れ、
  // 買い戻されればまた効く（区画に対する永続の封鎖、という既存の意味のまま）
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
    // 手持ちは相手の手番の合間にほぼ空なので、次の開始フェーズの収入から引く
    next.players[foe].pendingTax += balance.taxmanAmount;
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
    // 対象を先に処理し、伝令自身をそのあとに処理する。
    // 対象が待機列の先に、伝令がその下（＝より後ろ）に積まれる、という
    // 元の実装の順序をそのまま保つ。
    playCardInto(p, action.heraldTarget!);
    playCardInto(p, 'herald');
    return next;
  }

  playCardInto(p, action.card);
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
  let bonus = activeEffectMax(state, player, 'exchange', 'exchangeBonus', balance);
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

/** 手番の開始で入る収入の 1 段。UI が「基礎収入 → 建物収入 → …」と 1 つずつ見せるために分けてある。
 *  startTurn 自身もこの段の合計を足すので、見せる額と実際に入る額はずれない。 */
export interface IncomeStage {
  kind: 'base' | 'building' | 'invest' | 'debt' | 'tax' | 'bind';
  /** コインの増減（debt は負）。bind は 0 */
  amount: number;
  /** 祝祭が効いているターンか */
  festival: boolean;
  /** 祝祭で上乗せされた分（base: festivalIncomeBonus、building/invest: 倍にならなければ入らなかった額） */
  festivalExtra: number;
  /** この段の収入の元になった物件の区画（光らせる） */
  slots: number[];
  /** この段の元になった投資カード */
  cards: CardId[];
}

/** 手番の開始で入る収入を段に分ける。state.current の側が対象で、festivalActive は
 *  すでに立っている（startTurn が立てたあと）前提。 */
function computeIncomeStages(state: GameState, balance: Balance): IncomeStage[] {
  const player = state.current;
  const p = state.players[player];
  const festival = p.festivalActive;
  const stages: IncomeStage[] = [];

  // 基礎収入（後手の 1 ターン目の補正と、祝祭の +N もここ）。
  // 後手の 1 ターン目だけ補正する。先手は市場を先に取れるぶん有利なので、
  // その差を整数 1 つのつまみで埋める。turn 2 が後手の 1 ターン目。
  const festivalBonus = festival ? balance.festivalIncomeBonus : 0;
  stages.push({
    kind: 'base',
    amount:
      balance.baseIncome + (state.turn === 2 ? balance.secondPlayerFirstTurnBonus : 0) + festivalBonus,
    festival,
    festivalExtra: festivalBonus,
    slots: [],
    cards: [],
  });

  // 建物収入（商館）。祝祭中は 2 倍。
  const houses = activeOwnedSlots(state, player).filter((s) => s.buildingId === 'tradingHouse');
  const houseOnce = activeEffectSum(state, player, 'tradingHouse', 'tradingHouseIncome', balance);
  const houseIncome = festival ? houseOnce * balance.festivalMultiplier : houseOnce;
  if (houseIncome !== 0) {
    stages.push({
      kind: 'building',
      amount: houseIncome,
      festival,
      festivalExtra: houseIncome - houseOnce,
      slots: houses.map((s) => s.slotId),
      cards: [],
    });
  }

  // 投資カード（採掘師・銀行家）の解決。取引所のボーナスは物件の効果なので祝祭で倍になる。
  if (p.pendingIncome.length > 0) {
    let invest = 0;
    for (const card of p.pendingIncome) invest += incomeOf(state, player, card, balance);
    const exchange = activeOwnedSlots(state, player).filter((s) => s.buildingId === 'exchange');
    stages.push({
      kind: 'invest',
      amount: invest,
      festival,
      festivalExtra: 0,
      slots: exchange.map((s) => s.slotId),
      cards: [...p.pendingIncome],
    });
  }

  // 高利貸の借り。収入を足したあとに引く。コインがマイナスになるのはここだけ。
  if (p.pendingDebt > 0) {
    stages.push({ kind: 'debt', amount: -p.pendingDebt, festival, festivalExtra: 0, slots: [], cards: [] });
  }

  // 徴税官。ここまでの収入を足した手持ちを上限に引く（マイナスにはしない）。
  if (p.pendingTax > 0) {
    const have = Math.max(0, p.coins + stages.reduce((sum, s) => sum + s.amount, 0));
    const taken = Math.min(p.pendingTax, have);
    stages.push({ kind: 'tax', amount: -taken, festival, festivalExtra: 0, slots: [], cards: [] });
  }

  // 買収者を受けていたら、このときの手札から spyBindCount 枚を抽選して縛る（コインは動かない）
  if (p.bindPending) {
    stages.push({ kind: 'bind', amount: 0, festival, festivalExtra: 0, slots: [], cards: [] });
  }
  return stages;
}

/** いまの手番側の、次の startTurn で見せる収入の段。 */
export function incomeStages(state: GameState, balance: Balance = DEFAULT_BALANCE): IncomeStage[] {
  const c = structuredClone(state);
  const p = c.players[c.current];
  p.festivalActive = p.festivalQueued;
  return computeIncomeStages(c, balance);
}

/** 段ごとの「その段まで反映した盤面」。コインだけを段ごとに足した見せる用の状態で、
 *  最後の 1 つだけは startTurn を完全に済ませた状態（手札の抽選・フラグのリセットを含む）。 */
export function incomeStageStates(
  state: GameState,
  balance: Balance = DEFAULT_BALANCE,
): { stage: IncomeStage; state: GameState }[] {
  const stages = incomeStages(state, balance);
  const final = startTurn(state, balance);
  let coins = state.players[state.current].coins;
  return stages.map((stage, i) => {
    coins += stage.amount;
    if (i === stages.length - 1) return { stage, state: final };
    const view = structuredClone(state);
    view.players[view.current].coins = coins;
    return { stage, state: view };
  });
}

function startTurn(state: GameState, balance: Balance): GameState {
  if (state.phase !== 'playing') return state;
  const next = structuredClone(state);
  const player = next.current;
  const p = next.players[player];

  // 祝祭: 収入を計算する前に有効化する
  p.festivalActive = p.festivalQueued;
  p.festivalQueued = false;

  for (const stage of computeIncomeStages(next, balance)) p.coins += stage.amount;

  p.pendingDebt = 0;
  p.pendingTax = 0;
  p.pendingIncome = [];
  p.usedThisTurn = [];
  p.usedAnyCardThisTurn = false;
  p.buildDiscount = 0;
  p.buildsThisTurn = 0;
  p.roadUsesThisTurn = 0;

  // 買収者を受けていたら、このときの手札から spyBindCount 枚を抽選して縛る
  if (p.bindPending) {
    const hand = handOf(next, player, balance);
    const rng = createRng(next.seed * 7919 + next.turn);
    p.boundCards = shuffle(hand, rng).slice(0, balance.spyBindCount);
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
  if (roadUsesRemaining(state, player, balance) <= 0) return false;
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
  playCardInto(p, action.target);
  p.roadUsesThisTurn += 1;
  return next;
}

function endTurn(state: GameState, balance: Balance): GameState {
  if (state.phase !== 'playing') return state;
  const next = structuredClone(state);
  const player = next.current;

  // 自分に掛かっていた効果はこのターンの終わりで解ける。
  // ただし封鎖者（blockedSlot/disabledSlot）は「1 ターンで解けると効果が
  // 意味をなさない」という指摘を受け、ひとまず永続にする（ここでは解除しない）。
  next.players[player].festivalActive = false;
  next.players[player].boundCards = [];

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
  for (const slot of state.market) {
    if (canUpgrade(state, slot.slotId, balance)) out.push({ type: 'upgrade', slotId: slot.slotId });
  }
  for (const slot of state.market) {
    if (canAcquire(state, slot.slotId, balance)) out.push({ type: 'acquire', slotId: slot.slotId });
  }

  for (const card of hand) {
    if (canUseRoad(state, card, balance)) out.push({ type: 'useRoad', target: card });
  }

  out.push({ type: 'endTurn' });
  return out;
}
