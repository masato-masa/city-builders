import {
  buildingEffect,
  buildingEffectTextFor,
  buildingIncomeOf,
  buildingVp,
  DEFAULT_BALANCE,
  type Balance,
  type Level2EffectKey,
} from './balance';
import type { Blockade, BuildingId, BuildingSlot, CardId, GameState, PlayerId } from './types';

/** 勝者。まだ終わっていなければ null。 */
export function winnerOf(
  state: GameState,
  balance: Balance = DEFAULT_BALANCE,
): PlayerId | 'draw' | null {
  if (state.phase !== 'finished') return null;
  const you = scoreOf(state, 'you', balance);
  const cpu = scoreOf(state, 'cpu', balance);
  if (you !== cpu) return you > cpu ? 'you' : 'cpu';
  const youCoins = state.players.you.coins;
  const cpuCoins = state.players.cpu.coins;
  if (youCoins !== cpuCoins) return youCoins > cpuCoins ? 'you' : 'cpu';
  return 'draw';
}

export function opponentOf(player: PlayerId): PlayerId {
  return player === 'you' ? 'cpu' : 'you';
}

export function handOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): CardId[] {
  return state.players[player].hand.filter((c): c is CardId => c !== null);
}

/** 手札の固定スロットをそのまま返す（表示用）。空きスロットは null のまま返す
 *  （循環デッキが正常なら通常は起こらない）。添字がそのまま枠の位置になる。 */
export function handSlotsOf(state: GameState, player: PlayerId): (CardId | null)[] {
  return state.players[player].hand;
}

/** 手札の次に来る 1 枚。クラロワの next と同じ。 */
export function nextCardOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): CardId | null {
  return state.players[player].queue[0] ?? null;
}

export function ownedSlots(state: GameState, player: PlayerId): BuildingSlot[] {
  return state.market.filter((s) => s.owner === player);
}

/** 効果が生きている自分の物件。封鎖者の封鎖で効果が止まっている物件を除く。
 *  VP の計算には使わないこと（VP は止まらない）。 */
export function activeOwnedSlots(state: GameState, player: PlayerId, balance: Balance = DEFAULT_BALANCE): BuildingSlot[] {
  return ownedSlots(state, player).filter((s) => !slotEffectStopped(state, s, balance));
}

// ---------------------------------------------------------------------------
// 封鎖者の封鎖（地区単位・次の相手のターンだけ）
// ---------------------------------------------------------------------------

/** いま掛かっている封鎖。古い保存（blockades が無い状態）でも空として扱う。 */
export function blockadesOf(state: GameState): Blockade[] {
  return state.blockades ?? [];
}

/** player が地区 district の封鎖を受けているか（城塞の守りは見ない。空き地に建てられないかの判定はこれ）。 */
export function districtBlockedFor(state: GameState, player: PlayerId, district: number): boolean {
  return blockadesOf(state).some((b) => b.target === player && b.district === district);
}

/** player が地区 district に城塞を持っていて、そこの自分の物件が封鎖を受けないか。 */
export function fortressShields(
  state: GameState,
  player: PlayerId,
  district: number,
  balance: Balance = DEFAULT_BALANCE,
): boolean {
  const slots = balance.districts[district]?.slots ?? [];
  return slots.some((id) => {
    const s = state.market[id];
    return s?.owner === player && s.buildingId === 'fortress';
  });
}

/** 物件の効果（収益を含む）が封鎖で止まっているか。空き地は false。VP は止まらない。 */
export function slotEffectStopped(state: GameState, slot: BuildingSlot, balance: Balance = DEFAULT_BALANCE): boolean {
  if (slot.owner === null) return false;
  const d = districtOfSlot(slot.slotId, balance);
  if (d < 0 || !districtBlockedFor(state, slot.owner, d)) return false;
  return !fortressShields(state, slot.owner, d, balance);
}

/** player がその空き地に封鎖で建てられないか。 */
export function slotBuildBlocked(
  state: GameState,
  player: PlayerId,
  slotId: number,
  balance: Balance = DEFAULT_BALANCE,
): boolean {
  const d = districtOfSlot(slotId, balance);
  return d >= 0 && districtBlockedFor(state, player, d);
}

/** 盤面に出す封鎖の 1 件。remaining は残り: 1 = 使った側の手番の中（相手の次のターンの終わりまで）、
 *  0 = 封鎖を受けている側の手番の中（このターンの終わりで解ける）。 */
export interface BlockadeView {
  district: number;
  districtName: string;
  target: PlayerId;
  remaining: number;
  /** target がこの地区に城塞を持ち、物件の効果は止まらない（空き地に建てられないのは同じ） */
  shielded: boolean;
}
export function blockadeViewsOf(state: GameState, balance: Balance = DEFAULT_BALANCE): BlockadeView[] {
  return blockadesOf(state).map((b) => ({
    district: b.district,
    districtName: balance.districts[b.district]?.name ?? '',
    target: b.target,
    remaining: Math.max(0, b.untilTurn - state.turn),
    shielded: fortressShields(state, b.target, b.district, balance),
  }));
}

/** player が封鎖者で選べる地区（相手がまだその地区の封鎖を受けていない地区）。 */
export function blockadeDistrictsOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): number[] {
  const foe = opponentOf(player);
  return balance.districts.map((_, i) => i).filter((i) => !districtBlockedFor(state, foe, i));
}

/** 封鎖で、target の次の開始フェーズで入らなくなる収益（CPU の見積もり用）。開始フェーズがもう済んでいれば 0。 */
export function blockadeIncomeLossOf(
  state: GameState,
  target: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  if (!blockadesOf(state).some((b) => b.target === target && b.beforeIncome)) return 0;
  return ownedSlots(state, target)
    .filter((s) => slotEffectStopped(state, s, balance))
    .reduce((n, s) => n + buildingIncomeOf(balance, s.buildingId, s.level), 0);
}

// ---------------------------------------------------------------------------
// 建物の収益と固定の数値（画面の詳細用）
// ---------------------------------------------------------------------------

/** 区画の物件が持ち主にいま毎ターンもたらす収益。空き地・効果が止まっている物件は 0。 */
export function slotIncomeOf(state: GameState, slot: BuildingSlot, balance: Balance = DEFAULT_BALANCE): number {
  if (slot.owner === null || slotEffectStopped(state, slot, balance)) return 0;
  return buildingIncomeOf(balance, slot.buildingId, slot.level);
}

/** player の物件の毎ターンの収益の合計（効果が止まっている物件は除く）。 */
export function buildingIncomeTotalOf(state: GameState, player: PlayerId, balance: Balance = DEFAULT_BALANCE): number {
  return activeOwnedSlots(state, player, balance).reduce(
    (n, s) => n + buildingIncomeOf(balance, s.buildingId, s.level),
    0,
  );
}

/** 建物の 1 段分の固定の数値。建物の詳細に並べる。 */
export interface BuildingLevelStats {
  level: number;
  /** その段での VP。大聖堂は物件の数で決まるので 0（vpPerOtherBuilding を見る） */
  vp: number;
  /** 大聖堂だけ: 自分の他の物件 1 件あたりの VP。他は null */
  vpPerOtherBuilding: number | null;
  /** 毎ターンの収益 */
  income: number;
  /** Lv1: 建設費。Lv2・Lv3: その段へ上げる費用（アップグレード費） */
  cost: number;
  /** 買収の上乗せ額（払われた額 + これ が買収の価格）。最終段階は買収できないので null */
  acquireMarkup: number | null;
  /** 次の段へ上げる費用。最終段階は null */
  nextUpgradeCost: number | null;
  /** その段での効果の説明（収益は含まない） */
  effectText: string;
}
export function buildingStatsOf(building: BuildingId, balance: Balance = DEFAULT_BALANCE): BuildingLevelStats[] {
  const out: BuildingLevelStats[] = [];
  for (let level = 1; level <= balance.maxLevel; level++) {
    const table = level >= 3 ? balance.upgrades3 : level >= 2 ? balance.upgrades : balance.buildings;
    const next = level + 1 > balance.maxLevel ? null : level + 1 >= 3 ? balance.upgrades3 : balance.upgrades;
    out.push({
      level,
      vp: buildingVp(balance, building, level),
      vpPerOtherBuilding: building === 'cathedral' ? buildingEffect(balance, 'cathedralVpPerBuilding', level) : null,
      income: buildingIncomeOf(balance, building, level),
      cost: table[building].cost,
      acquireMarkup: level >= balance.maxLevel ? null : balance.acquireMarkup,
      nextUpgradeCost: next ? next[building].cost : null,
      effectText: buildingEffectTextFor(building, balance, level),
    });
  }
  return out;
}

/** 効果が生きている自分の物件のうち、指定した種類の効果値の合計（レベルを見る）。
 *  商館・城塞のように件数で積み上がる効果に使う。 */
export function activeEffectSum(
  state: GameState,
  player: PlayerId,
  id: BuildingId,
  key: Level2EffectKey,
  balance: Balance = DEFAULT_BALANCE,
): number {
  return activeOwnedSlots(state, player, balance)
    .filter((s) => s.buildingId === id)
    .reduce((n, s) => n + buildingEffect(balance, key, s.level), 0);
}

/** 効果が生きている自分の物件のうち、指定した種類の効果値の最大（持っていなければ 0）。
 *  工場・取引所・石切場・街道のように「持っているか」で効く効果に使う（重ねても増えない）。 */
export function activeEffectMax(
  state: GameState,
  player: PlayerId,
  id: BuildingId,
  key: Level2EffectKey,
  balance: Balance = DEFAULT_BALANCE,
): number {
  return activeOwnedSlots(state, player, balance)
    .filter((s) => s.buildingId === id)
    .reduce((n, s) => Math.max(n, buildingEffect(balance, key, s.level)), 0);
}

/** 区画を買収するときの価格。未建設なら Infinity。discount は買収者の割引（0 未満にはしない）。 */
export function acquirePriceOf(
  slot: BuildingSlot,
  balance: Balance = DEFAULT_BALANCE,
  discount = 0,
): number {
  if (slot.owner === null) return Number.POSITIVE_INFINITY;
  return Math.max(0, slot.paid + balance.acquireMarkup - discount);
}

/** player がいまその区画を買収するときに実際に払う額（このターンの買収者の割引を織り込む）。 */
export function acquireCostFor(
  state: GameState,
  player: PlayerId,
  slot: BuildingSlot,
  balance: Balance = DEFAULT_BALANCE,
): number {
  return acquirePriceOf(slot, balance, state.players[player].acquireDiscount - acquireLeadMarkupOf(state, player, balance));
}

/** 買収の上乗せに足す額: 買う側が売る側より多く持つ物件 1 件につき acquireLeadRate（少なければ引く。上乗せ全体は 0 未満にしない）。 */
export function acquireLeadMarkupOf(state: GameState, buyer: PlayerId, balance: Balance = DEFAULT_BALANCE): number {
  const rate = balance.acquireLeadRate ?? 0;
  if (rate === 0) return 0;
  const lead = ownedSlots(state, buyer).length - ownedSlots(state, opponentOf(buyer)).length;
  return Math.max(-balance.acquireMarkup, lead * rate);
}

/** buyer が買収するときの上乗せ（基本 + 物件の数の差の分。0 未満にはしない）。買収者の割引は含まない。 */
export function acquireMarkupFor(state: GameState, buyer: PlayerId, balance: Balance = DEFAULT_BALANCE): number {
  return balance.acquireMarkup + acquireLeadMarkupOf(state, buyer, balance);
}

/** 区画をアップグレードするときの価格。Lv1 → Lv2 は upgrades、Lv2 → Lv3 は upgrades3。
 *  最大レベル（balance.maxLevel）なら Infinity。 */
export function upgradePriceOf(slot: BuildingSlot, balance: Balance = DEFAULT_BALANCE): number {
  if (slot.owner === null || slot.level >= balance.maxLevel) return Number.POSITIVE_INFINITY;
  return slot.level >= 2
    ? balance.upgrades3[slot.buildingId].cost
    : balance.upgrades[slot.buildingId].cost;
}

/** player がいまその区画をアップグレードするときに実際に払う額（このターンの職人の割引を織り込む。0 未満にはしない）。
 *  最大レベルなら Infinity。 */
export function upgradeCostFor(
  state: GameState,
  player: PlayerId,
  slot: BuildingSlot,
  balance: Balance = DEFAULT_BALANCE,
): number {
  const price = upgradePriceOf(slot, balance);
  if (!Number.isFinite(price)) return price;
  return Math.max(0, price - state.players[player].upgradeDiscount);
}

/** 最終段階（balance.maxLevel）まで上げた物件か。最終段階の物件は買収されない。 */
export function slotMaxed(slot: BuildingSlot, balance: Balance = DEFAULT_BALANCE): boolean {
  return slot.owner !== null && slot.level >= balance.maxLevel;
}

/** player が区画 slotId を買収できない理由（コイン不足を除く）。買収の対象でない区画（自分の物件・空き地）は 'notForeign'。
 *  UI が「なぜ買えないか」を 1 行で言うためのもの。判定の順は canAcquire と同じ。買えるなら null。 */
export type AcquireBlock = 'notForeign' | 'guarded' | 'maxLevel' | 'locked' | 'lastTurn';
export function acquireBlockOf(
  state: GameState,
  slotId: number,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): AcquireBlock | null {
  const slot = state.market[slotId];
  const foe = opponentOf(player);
  if (!slot || slot.owner !== foe) return 'notForeign';
  if (state.players[foe].guarded) return 'guarded';
  if (slotMaxed(slot, balance)) return 'maxLevel';
  if (slotLocked(state, slot, balance)) return 'locked';
  if (acquireClosedAt(state.turn, balance)) return 'lastTurn';
  return null;
}

/** 手番 turn に買収ができないか。ターンの上限の手番（試合の最後の手番）は、相手に買い返す手番が残らないので買収できない。 */
export function acquireClosedAt(turn: number, balance: Balance = DEFAULT_BALANCE): boolean {
  return balance.lastTurnNoAcquire && turn >= balance.maxTurnsPerPlayer * 2;
}

/** いまの手番の終わりで試合が終わるか（endTurn と同じ規則）。全区画が埋まったか、ターンの上限。 */
export function endsAfterTurn(state: GameState, balance: Balance = DEFAULT_BALANCE): boolean {
  return state.turn >= balance.maxTurnsPerPlayer * 2 || state.market.every((s) => s.owner !== null);
}

/** 区画がまだ動かせない（アップグレード・買収できない）か。
 *  最後に建設・アップグレード・買収されたターンから slotLockTurns ターン（1 人の手番を 1 と数える）
 *  経つまで動かせない。1 なら「同じ区画は 1 ターンに 1 回まで」、2 なら「相手の直後の手番でも動かせない」。
 *  atTurn を渡すと、そのターンの時点で判定する（CPU が相手の次の手番を見積もるため）。 */
export function slotLocked(
  state: GameState,
  slot: BuildingSlot,
  balance: Balance = DEFAULT_BALANCE,
  atTurn: number = state.turn,
): boolean {
  if (slot.touchedTurn <= 0) return false;
  return atTurn - slot.touchedTurn < balance.slotLockTurns;
}

export function countBuilding(state: GameState, player: PlayerId, id: BuildingId): number {
  return state.market.filter((s) => s.owner === player && s.buildingId === id).length;
}

export function hasBuilding(state: GameState, player: PlayerId, id: BuildingId): boolean {
  return countBuilding(state, player, id) > 0;
}

/** 区画 1 つが所有者にもたらす VP。未建設なら 0。
 *  大聖堂だけ「自分の他の物件 1 件につき +N」と条件付きで決まる。 */
export function vpOfSlot(
  state: GameState,
  slot: BuildingSlot,
  balance: Balance = DEFAULT_BALANCE,
): number {
  if (slot.owner === null) return 0;
  if (slot.buildingId === 'cathedral') {
    return (
      (ownedSlots(state, slot.owner).length - 1) *
      buildingEffect(balance, 'cathedralVpPerBuilding', slot.level)
    );
  }
  return buildingVp(balance, slot.buildingId, slot.level);
}

/** 終了時の VP。物件の VP と、持っている地区の称号の VP。 */
export function scoreOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  return (
    ownedSlots(state, player).reduce((n, slot) => n + vpOfSlot(state, slot, balance), 0) +
    titleVpOf(state, player, balance)
  );
}

// ---------------------------------------------------------------------------
// 地区の称号
// ---------------------------------------------------------------------------

/** 区画が属する地区の番号。どの地区にも入っていなければ -1。 */
export function districtOfSlot(slotId: number, balance: Balance = DEFAULT_BALANCE): number {
  return balance.districts.findIndex((d) => d.slots.includes(slotId));
}

/** 地区の中の、持ち主ごとの物件の VP の合計（称号の判定に使う）。override を渡すと、その区画だけ
 *  持ち主・レベルを差し替えて数える（CPU の見積もり用。大聖堂の VP は今の盤面の件数で数える）。 */
export function districtVpOf(
  state: GameState,
  district: number,
  balance: Balance = DEFAULT_BALANCE,
  override?: { slotId: number; owner: PlayerId | null; level: number },
): Record<PlayerId, number> {
  const totals: Record<PlayerId, number> = { you: 0, cpu: 0 };
  for (const id of balance.districts[district]?.slots ?? []) {
    const real = state.market[id];
    if (!real) continue;
    const slot = override && override.slotId === id ? { ...real, owner: override.owner, level: override.level } : real;
    if (slot.owner === null) continue;
    totals[slot.owner] += vpOfSlot(state, slot, balance);
  }
  return totals;
}

/** VP の合計から決まる称号の持ち主。相手より多く、かつ minVp 以上ある側が持つ。
 *  どちらも満たさなければ（同数など）今の持ち主（current）のまま。 */
export function holderFrom(
  totals: Record<PlayerId, number>,
  current: PlayerId | null,
  minVp = 1,
): PlayerId | null {
  if (totals.you > totals.cpu && totals.you >= minVp) return 'you';
  if (totals.cpu > totals.you && totals.cpu >= minVp) return 'cpu';
  return current;
}

/** 盤面に合わせて称号を引き直した並び。今の持ち主は state.titles を見る（同数で保持するため）。 */
export function nextTitles(state: GameState, balance: Balance = DEFAULT_BALANCE): (PlayerId | null)[] {
  return balance.districts.map((_, i) =>
    holderFrom(districtVpOf(state, i, balance), state.titles?.[i] ?? null, balance.districtMinVp),
  );
}

/** 地区 i の称号の持ち主。 */
export function titleHolder(state: GameState, district: number): PlayerId | null {
  return state.titles?.[district] ?? null;
}

/** 持っている称号の数。 */
export function titleCountOf(state: GameState, player: PlayerId): number {
  return (state.titles ?? []).filter((t) => t === player).length;
}

/** 称号の VP の合計。 */
export function titleVpOf(state: GameState, player: PlayerId, balance: Balance = DEFAULT_BALANCE): number {
  return titleCountOf(state, player) * balance.districtTitleVp;
}

/** 区画 slotId の持ち主が newOwner に替わったら（level を渡すとそのレベルにもなったら）、
 *  player の称号の VP がいくら動くか（CPU の見積もり用）。その区画の地区だけを引き直す。 */
export function titleVpSwing(
  state: GameState,
  slotId: number,
  newOwner: PlayerId,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
  level: number = state.market[slotId]?.level ?? 1,
): number {
  const d = districtOfSlot(slotId, balance);
  if (d < 0) return 0;
  const current = titleHolder(state, d);
  const totals = districtVpOf(state, d, balance, { slotId, owner: newOwner, level });
  const after = holderFrom(totals, current, balance.districtMinVp);
  return ((after === player ? 1 : 0) - (current === player ? 1 : 0)) * balance.districtTitleVp;
}

/** 強制終了までの残りターン数（両者合計、いま進行中の 1 手を含む）。
 *  全区画が建ち切って先に終わる場合は、実際にはこれより早く終わる。
 *  プレイ画面右上の残りターン表示のために追加した読み取り専用の派生値。 */
export function turnsRemaining(state: GameState, balance: Balance = DEFAULT_BALANCE): number {
  if (state.phase === 'finished') return 0;
  // 半手番ではなく「自分があと何回打てるか」を返す。
  // 40 と出すとプレイヤーの数え方（20 ターンずつ）と合わない。
  return Math.ceil(Math.max(0, balance.maxTurnsPerPlayer * 2 - state.turn + 1) / 2);
}

/** 街道があと何回使えるか。祝祭中は festivalMultiplier 回、それ以外は 1 回。
 *  カード選択シートの「山の底へ送る」ボタンに添える残り回数のために追加した。 */
export function roadUsesRemaining(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  const p = state.players[player];
  // 街道を持っていないときは Lv1 の回数を返す（表示側は街道を持つときだけ出す。従来の振る舞いを保つ）
  const base = activeEffectMax(state, player, 'road', 'roadUses', balance) || balance.roadUses;
  const limit = p.festivalActive ? base * balance.festivalMultiplier : base;
  return Math.max(0, limit - p.roadUsesThisTurn);
}

/** 1 ターンあたりの見込み収入。基礎収入と、物件の毎ターンの収益。
 *  封鎖は次の 1 ターンだけなので、ここ（毎ターン続く収入）では止まっていないものとして数える。
 *  封鎖で次に入らなくなる分は blockadeIncomeLossOf。
 *  祝祭は 1 ターン限りなので、ここには入れない。祝祭の上乗せは festivalExtraOf。 */
export function incomePerTurnOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  const buildings = ownedSlots(state, player).reduce(
    (n, s) => n + buildingIncomeOf(balance, s.buildingId, s.level),
    0,
  );
  return balance.baseIncome + buildings;
}

/** 使った祝祭が、次の自分の収入に 1 度だけ上乗せするコインの見込み。
 *  基礎収入の +festivalIncomeBonus、商館の収入と取引所の投資ボーナスの倍増分を数える。
 *  祝祭を使っていなければ 0。 */
export function festivalExtraOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  const p = state.players[player];
  if (!p.festivalQueued) return 0;
  const extra = balance.festivalMultiplier - 1;
  const income = buildingIncomeTotalOf(state, player, balance);
  const exchange = activeEffectMax(state, player, 'exchange', 'exchangeBonus', balance);
  const minerBonus = activeEffectMax(state, player, 'mine', 'mineMinerBonus', balance);
  const miners = p.pendingIncome.filter((c) => c === 'miner').length;
  return (
    balance.festivalIncomeBonus +
    income * extra +
    exchange * extra * p.pendingIncome.length +
    minerBonus * extra * miners
  );
}

// ---------------------------------------------------------------------------
// 2 段目の新カード（顔役・影武者・番頭）
// ---------------------------------------------------------------------------

/** 影武者がいま写す札（このターン直前に使った人物カード）。写せない札（balance.doubleExcluded）や、
 *  まだ 1 枚も使っていなければ null。 */
export function doubleSourceOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): CardId | null {
  const used = state.players[player].usedThisTurn;
  const last = used[used.length - 1];
  if (!last || last === 'double' || balance.doubleExcluded.includes(last)) return null;
  return last;
}

/** 使う札の効果として実際に起きるカード。影武者は直前の札（写せなければ null）、それ以外はその札。 */
export function effectiveCardOf(
  state: GameState,
  player: PlayerId,
  card: CardId,
  balance: Balance = DEFAULT_BALANCE,
): CardId | null {
  return card === 'double' ? doubleSourceOf(state, player, balance) : card;
}

/** 顔役で称号を取れる地区。地区内の VP の合計が自分と相手で同じ（districtMinVp 以上）で、称号がまだ自分のものでない地区。 */
export function bossDistrictsOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): number[] {
  const out: number[] = [];
  balance.districts.forEach((_, i) => {
    const c = districtVpOf(state, i, balance);
    if (c.you === c.cpu && c.you >= Math.max(1, balance.districtMinVp) && titleHolder(state, i) !== player) out.push(i);
  });
  return out;
}

/** 番頭で今すぐ入るコイン。効果が生きている商館の数（上限 clerkMaxHouses）× clerkPerHouse。 */
export function clerkGainOf(state: GameState, player: PlayerId, balance: Balance = DEFAULT_BALANCE): number {
  const houses = activeOwnedSlots(state, player, balance).filter((s) => s.buildingId === 'tradingHouse').length;
  return Math.min(houses, balance.clerkMaxHouses) * balance.clerkPerHouse;
}

// ---------------------------------------------------------------------------
// 投資カード（採掘師・銀行家）
// ---------------------------------------------------------------------------

/** 1 枚の投資カードが、いま解決したら生むコイン。取引所・鉱山（採掘師だけ）の上乗せは物件の効果なので
 *  祝祭中は倍。銀行家は解決時の自分の VP（称号を含む）で決まる。投資カードでなければ 0。 */
export function investIncomeOf(
  state: GameState,
  player: PlayerId,
  card: CardId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  const p = state.players[player];
  const mult = p.festivalActive ? balance.festivalMultiplier : 1;
  const exchange = activeEffectMax(state, player, 'exchange', 'exchangeBonus', balance) * mult;
  switch (card) {
    case 'miner':
      return balance.minerIncome + exchange + activeEffectMax(state, player, 'mine', 'mineMinerBonus', balance) * mult;
    case 'banker':
      return balance.bankerIncome + Math.floor(scoreOf(state, player, balance) * balance.bankerVpRate) + exchange;
    default:
      return 0;
  }
}

/** 解決待ちの投資カードが次の開始フェーズで生むコインの合計（いまの盤面で見積もる）。 */
export function pendingInvestOf(state: GameState, player: PlayerId, balance: Balance = DEFAULT_BALANCE): number {
  return state.players[player].pendingIncome.reduce((n, c) => n + investIncomeOf(state, player, c, balance), 0);
}

// ---------------------------------------------------------------------------
// 多く稼ぐ側に強く効く妨害（徴税官）
// ---------------------------------------------------------------------------

/** player が徴税官を使ったら、相手の次の収入から引く額。基本 + 相手の建物の収益 × 率（いまの盤面で）。 */
export function taxmanAmountOf(state: GameState, player: PlayerId, balance: Balance = DEFAULT_BALANCE): number {
  const foe = opponentOf(player);
  const income = ownedSlots(state, foe).reduce((n, s) => n + buildingIncomeOf(balance, s.buildingId, s.level), 0);
  return balance.taxmanAmount + Math.floor(income * balance.taxmanIncomeRate);
}
