import { buildingIncomeOf, DEFAULT_BALANCE, type Balance } from './balance';
import {
  acquireBlockOf,
  acquireCostFor,
  activeEffectMax,
  activeOwnedSlots,
  blockadeDistrictsOf,
  bossDistrictsOf,
  clerkGainOf,
  doubleSourceOf,
  effectiveCardOf,
  handOf,
  investIncomeOf,
  nextTitles,
  opponentOf,
  roadUsesRemaining,
  slotBuildBlocked,
  slotLocked,
  upgradeCostFor,
} from './selectors';
import type { Action, BuildingId, CardId, GameState, PlayerId, PlayerState } from './types';

/** 効果が生きている自分の物件のうち、指定した種類を持っているか。
 *  封鎖で効果が止まっている物件は「持っていない」扱いになる。 */
function hasActiveBuilding(state: GameState, player: PlayerId, id: BuildingId, balance: Balance): boolean {
  return activeOwnedSlots(state, player, balance).some((s) => s.buildingId === id);
}

/** 工場の割引を織り込んだ、いま実際に払う額。 */
export function cardCostFor(
  state: GameState,
  player: PlayerId,
  card: CardId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  let base = balance.cards[card].cost;
  // 影武者は写す札の元のコストも払う（城壁・街道・工場の割引は乗らない。写す札は「元のコスト」）
  if (card === 'double') {
    const source = doubleSourceOf(state, player, balance);
    if (source) base += balance.cards[source].cost;
  }
  // 物件との連携: 城壁があれば衛兵、街道があれば伝令が安くなる（効果が止められた物件は数えない）
  if (card === 'guard' && hasActiveBuilding(state, player, 'wall', balance)) {
    base = Math.min(base, balance.guardCostWithWall);
  }
  if (card === 'herald' && hasActiveBuilding(state, player, 'road', balance)) {
    base = Math.min(base, balance.heraldCostWithRoad);
  }
  const p = state.players[player];
  // 鉱山: 採掘師のコストを下げる（物件の効果なので祝祭中は倍）
  if (card === 'miner') {
    const mine = activeEffectMax(state, player, 'mine', 'mineMinerDiscount', balance);
    if (mine > 0) base = Math.max(0, base - (p.festivalActive ? mine * balance.festivalMultiplier : mine));
  }
  if (!p.usedAnyCardThisTurn && hasActiveBuilding(state, player, 'factory', balance)) {
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
  // 影武者は写す札（このターン直前に使った札）が無ければ使えない。以下の対象の判定は写す札で行う
  const eff = effectiveCardOf(state, player, card, balance);
  if (eff === null) return false;
  // 検査官は相手の物件が 1 件も無ければ撃つ先が無い
  if (eff === 'inspector' && !state.market.some((s) => s.owner !== null && s.owner !== player)) return false;
  // 顔役は同数の地区が無ければ撃つ先が無い
  if (eff === 'boss' && bossDistrictsOf(state, player, balance).length === 0) return false;
  // 封鎖者は封鎖できる地区が無ければ（全地区を封鎖済み）撃つ先が無い
  if (eff === 'blockader' && blockadeDistrictsOf(state, player, balance).length === 0) return false;
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
  // 封鎖者に地区を封鎖されている間は、その地区の空き地に建てられない
  if (slotBuildBlocked(state, player, slotId, balance)) return false;
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
  const cost = buildCostFor(state, player, action.slotId, balance);
  next.players[player].coins -= cost;
  const slot = next.market[action.slotId]!;
  slot.owner = player;
  // 買収の価格の元になるのは、実際に払った額（建築家・石切場で安く建てた物件は安く買われる）
  slot.paid = cost;
  slot.level = 1;
  slot.touchedTurn = next.turn;
  next.players[player].buildsThisTurn += 1;
  // 称号は地区内の VP の合計で決まる。大聖堂は物件の数で VP が変わるので、どの地区も引き直す
  next.titles = nextTitles(next, balance);
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
  return state.players[state.current].coins >= upgradeCostFor(state, state.current, slot, balance);
}

function upgrade(
  state: GameState,
  action: Extract<Action, { type: 'upgrade' }>,
  balance: Balance,
): GameState {
  if (!canUpgrade(state, action.slotId, balance)) return state;
  const next = structuredClone(state);
  const slot = next.market[action.slotId]!;
  // 職人の割引が乗った実額。買収の価格の元（paid）もこの額（建築家と同じく、安く上げた物件は安く買われる）
  const price = upgradeCostFor(state, state.current, state.market[action.slotId]!, balance);
  next.players[next.current].coins -= price;
  slot.paid += price;
  slot.level += 1;
  slot.touchedTurn = next.turn;
  // VP が増えるので、地区の称号が動くことがある
  next.titles = nextTitles(next, balance);
  return next;
}

/** 相手の物件を買収できるか。価格は paid + acquireMarkup。
 *  相手が衛兵で守られていれば買えない。最終段階（maxLevel）の物件も買えない。
 *  城壁は防がない。封鎖者で止められた物件も買える。理由の判定は selectors の acquireBlockOf。 */
export function canAcquire(
  state: GameState,
  slotId: number,
  balance: Balance = DEFAULT_BALANCE,
): boolean {
  if (state.phase !== 'playing') return false;
  const player = state.current;
  if (acquireBlockOf(state, slotId, player, balance) !== null) return false;
  const slot = state.market[slotId]!;
  return state.players[player].coins >= acquireCostFor(state, player, slot, balance);
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
  // 買収者の割引が乗った実額。相手に渡る代金も、次に買われるときの基準（paid）もこの額
  const price = acquireCostFor(state, player, state.market[action.slotId]!, balance);
  // コインの総量は変わらない。買収は VP と効果の移動
  next.players[player].coins -= price;
  next.players[foe].coins += price;
  slot.owner = player;
  slot.paid = price;
  slot.touchedTurn = next.turn;
  // 封鎖は「地区 × 受ける側」に掛かっているので、買った物件は新しい持ち主の封鎖の有無に従う
  next.titles = nextTitles(next, balance);
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
  // 効果として起きる札（影武者なら写す札）。canUseCard を通っているので null ではない
  const eff = effectiveCardOf(state, player, action.card, balance)!;

  // 対象を取るカードは、対象が妥当でなければ何も起きない（影武者は写す札の対象を取り直す）
  if (eff === 'herald') {
    const target = action.heraldTarget;
    if (!target || target === 'herald') return state;
    if (!handOf(state, player, balance).includes(target)) return state;
  }
  if (eff === 'blockader') {
    // 対象は地区。相手がまだその地区の封鎖を受けていない地区だけ
    const d = action.district;
    if (d === undefined || !blockadeDistrictsOf(state, player, balance).includes(d)) return state;
  }
  if (eff === 'inspector') {
    // 対象は相手の物件だけ（空き地・自分の物件には撃てない）
    const slot = action.inspectSlot;
    if (slot === undefined || state.market[slot]?.owner !== foe) return state;
  }
  if (eff === 'boss') {
    // 対象は地区内の VP の合計が同数（1 以上）で、称号がまだ自分のものでない地区だけ
    const d = action.district;
    if (d === undefined || !bossDistrictsOf(state, player, balance).includes(d)) return state;
  }

  const next = structuredClone(state);
  const p = next.players[player];

  p.coins -= cardCostFor(state, player, action.card, balance);
  p.usedAnyCardThisTurn = true;
  p.usedThisTurn = [...p.usedThisTurn, action.card];

  applyCardEffect(next, player, eff, action, balance);

  if (eff === 'herald') {
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

/** カード 1 枚分の効果を next に書き込む（コスト・手札の補充は呼び出し側）。
 *  影武者は写した札の効果をここでもう一度起こす。 */
function applyCardEffect(
  next: GameState,
  player: PlayerId,
  card: CardId,
  action: Extract<Action, { type: 'useCard' }>,
  balance: Balance,
): void {
  const foe = opponentOf(player);
  const p = next.players[player];

  if (INCOME_CARDS.includes(card)) {
    p.pendingIncome = [...p.pendingIncome, card];
  }
  if (card === 'architect') {
    p.buildDiscount += balance.architectDiscount;
  }
  if (card === 'usurer') {
    p.coins += balance.usurerGain;
    p.pendingDebt += balance.usurerDebt;
  }
  if (card === 'festival') {
    p.festivalQueued = true;
  }
  if (card === 'guard') {
    p.guarded = true;
  }
  if (card === 'spy') {
    // 自分にかかる効果なので衛兵・城壁では防げない（衛兵は買収そのものを防ぐ）
    p.acquireDiscount += balance.spyAcquireDiscount;
  }
  if (card === 'craftsman') {
    p.upgradeDiscount += balance.craftsmanDiscount;
  }
  if (card === 'clerk') {
    // 自分にかかる効果（今すぐ入るコイン）。商館が無ければ何も起きない
    p.coins += clerkGainOf(next, player, balance);
  }

  const foeGuarded = next.players[foe].guarded;
  const foeWalled = hasActiveBuilding(next, foe, 'wall', balance);

  if (card === 'taxman' && !foeGuarded && !foeWalled) {
    // 手持ちは相手の手番の合間にほぼ空なので、次の開始フェーズの収入から引く
    next.players[foe].pendingTax += balance.taxmanAmount;
  }
  if (card === 'blockader' && !foeGuarded && !foeWalled) {
    // 地区を封鎖する。次の相手のターンの終わりまで、相手はその地区の空き地に建てられず、
    // 地区内の相手の物件は効果（収益を含む）が止まる。自分の物件には何も起きない。VP は止まらない（称号は動かない）
    next.blockades = [
      ...(next.blockades ?? []),
      { district: action.district!, target: foe, untilTurn: next.turn + 1, beforeIncome: true },
    ];
  }
  if (card === 'inspector' && !foeGuarded) {
    // 衛兵では防げるが、城壁では防げない（城壁は徴税官・封鎖者だけ。全部防ぐと強すぎる）
    const target = next.market[action.inspectSlot!]!;
    if (target.level >= 2) {
      // Lv を 1 段下げる。払われた額はそのまま（買収の価格は下がらない）。
      // Lv3 → Lv2 で「最終段階は買収されない」が外れ、また買収できる物件になる
      target.level -= 1;
      // VP が減るので、地区の称号が動くことがある
      next.titles = nextTitles(next, balance);
    } else {
      target.paid = Math.max(0, target.paid - balance.inspectorPaidCut);
    }
  }
  if (card === 'boss' && !foeGuarded) {
    // VP の合計が同数の地区の称号を今すぐ自分へ。同数のあいだは「今の持ち主が保つ」ので、相手が VP を増やすか
    // 買収で同数を崩すまで自分のもの。衛兵では防げる、城壁では防げない（検査官と同じ）
    next.titles = [...next.titles];
    next.titles[action.district!] = player;
  }
  if (card === 'informer' && !foeGuarded) {
    // 相手の「次」の札（待機列の先頭）を待機列の底へ。相手の手札は動かない
    const q = next.players[foe].queue;
    if (q.length >= 2) q.push(q.shift()!);
  }
}

/** 手番の開始で入る収入の 1 段。UI が「基礎収入 → 建物収入 → …」と 1 つずつ見せるために分けてある。
 *  startTurn 自身もこの段の合計を足すので、見せる額と実際に入る額はずれない。 */
export interface IncomeStage {
  kind: 'base' | 'building' | 'invest' | 'debt' | 'tax';
  /** コインの増減（debt・tax は負） */
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

  // 建物の収益（封鎖で効果が止まっている物件は入らない）。祝祭中は 2 倍。
  const earning = activeOwnedSlots(state, player, balance).filter(
    (s) => buildingIncomeOf(balance, s.buildingId, s.level) !== 0,
  );
  const buildingOnce = earning.reduce((n, s) => n + buildingIncomeOf(balance, s.buildingId, s.level), 0);
  const buildingIncome = festival ? buildingOnce * balance.festivalMultiplier : buildingOnce;
  if (buildingIncome !== 0) {
    stages.push({
      kind: 'building',
      amount: buildingIncome,
      festival,
      festivalExtra: buildingIncome - buildingOnce,
      slots: earning.map((s) => s.slotId),
      cards: [],
    });
  }

  // 投資カード（採掘師・銀行家）の解決。取引所・鉱山の上乗せは物件の効果なので祝祭で倍になる。
  if (p.pendingIncome.length > 0) {
    let invest = 0;
    for (const card of p.pendingIncome) invest += investIncomeOf(state, player, card, balance);
    const exchange = activeOwnedSlots(state, player, balance).filter(
      (s) => s.buildingId === 'exchange' || (s.buildingId === 'mine' && p.pendingIncome.includes('miner')),
    );
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
  return stages;
}

/** いまの手番側の、次の startTurn で見せる収入の段。 */
export function incomeStages(state: GameState, balance: Balance = DEFAULT_BALANCE): IncomeStage[] {
  const c = structuredClone(state);
  const p = c.players[c.current];
  p.festivalActive = p.festivalQueued;
  return computeIncomeStages(c, balance);
}

/** player の次の開始フェーズで入る見込みの額（段の合計。借り・徴税を引いた後）。
 *  いまが player の手番でも相手の手番でも使える。player がいま受けている封鎖は、次の開始フェーズの前に
 *  解けるものは数えない（収入の前の封鎖だけ数える）。画面の「次の収入」と CPU の見積もりの共通の口。 */
export function nextIncomeOf(state: GameState, player: PlayerId, balance: Balance = DEFAULT_BALANCE): number {
  const c = structuredClone(state);
  c.current = player;
  c.blockades = (c.blockades ?? []).filter((b) => b.target === player && b.beforeIncome);
  const p = c.players[player];
  p.festivalActive = p.festivalQueued;
  // 後手の 1 ターン目の補正は turn 2 の開始フェーズだけ。見込みでは、いまが turn 1 で player が後手のときに乗る
  c.turn = state.current === player ? state.turn + 2 : state.turn + 1;
  return computeIncomeStages(c, balance).reduce((n, s) => n + s.amount, 0);
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
  // 封鎖を受けている側の収入はこれで済んだ（CPU の「次の収入が減る」の見積もりから外す）
  if (next.blockades?.some((b) => b.target === player && b.beforeIncome)) {
    next.blockades = next.blockades.map((b) => (b.target === player ? { ...b, beforeIncome: false } : b));
  }

  p.pendingDebt = 0;
  p.pendingTax = 0;
  p.pendingIncome = [];
  p.usedThisTurn = [];
  p.usedAnyCardThisTurn = false;
  p.buildDiscount = 0;
  p.buildsThisTurn = 0;
  p.roadUsesThisTurn = 0;
  p.acquireDiscount = 0;
  p.upgradeDiscount = 0;

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
  if (!hasActiveBuilding(state, player, 'road', balance)) return false;
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
  // 封鎖者の封鎖は「次の相手のターンだけ」: 受けた側の手番（untilTurn）の終わりで解ける
  if (next.blockades?.length) next.blockades = next.blockades.filter((b) => b.untilTurn > next.turn);
  next.players[player].festivalActive = false;
  // 買収者の割引はこのターン限り（次の startTurn でも消すが、相手の手番に残さない）
  next.players[player].acquireDiscount = 0;
  // 職人の割引も同じくこのターン限り
  next.players[player].upgradeDiscount = 0;

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
    // 影武者は写す札の対象で展開する（伝令は写せない）
    const eff = effectiveCardOf(state, player, card, balance);
    if (eff === 'boss') {
      for (const district of bossDistrictsOf(state, player, balance)) out.push({ type: 'useCard', card, district });
    } else if (card === 'herald') {
      for (const target of hand) {
        if (target !== 'herald') out.push({ type: 'useCard', card, heraldTarget: target });
      }
    } else if (eff === 'blockader') {
      // 対象は地区（相手がまだ封鎖を受けていない地区）
      for (const district of blockadeDistrictsOf(state, player, balance)) {
        out.push({ type: 'useCard', card, district });
      }
    } else if (eff === 'inspector') {
      // 対象は相手の物件だけ。相手が 1 件も持っていなければ撃てない
      for (const slot of state.market) {
        if (slot.owner !== null && slot.owner !== player) {
          out.push({ type: 'useCard', card, inspectSlot: slot.slotId });
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
