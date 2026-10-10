import {
  buildingEffect,
  buildingVp,
  DEFAULT_BALANCE,
  type Balance,
  type Level2EffectKey,
} from './balance';
import type { BuildingId, BuildingSlot, CardId, GameState, PlayerId } from './types';

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

/** 効果が生きている自分の物件。封鎖者で止められている 1 件を除く。
 *  VP の計算には使わないこと（VP は止まらない）。 */
export function activeOwnedSlots(state: GameState, player: PlayerId): BuildingSlot[] {
  const disabled = state.players[player].disabledSlot;
  return ownedSlots(state, player).filter((s) => s.slotId !== disabled);
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
  return activeOwnedSlots(state, player)
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
  return activeOwnedSlots(state, player)
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
  return acquirePriceOf(slot, balance, state.players[player].acquireDiscount);
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
export type AcquireBlock = 'notForeign' | 'guarded' | 'maxLevel' | 'locked';
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
  return null;
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

/** 地区の中で、称号の件数に数える物件の数。owners を渡すと、その持ち主の並び（区画番号 → 持ち主）で数える。 */
export function districtCounts(
  state: GameState,
  district: number,
  balance: Balance = DEFAULT_BALANCE,
  ownerOf: (slotId: number) => PlayerId | null = (id) => state.market[id]?.owner ?? null,
): Record<PlayerId, number> {
  const counts: Record<PlayerId, number> = { you: 0, cpu: 0 };
  for (const id of balance.districts[district]?.slots ?? []) {
    const owner = ownerOf(id);
    if (owner === null) continue;
    if (!balance.districtCountsDisabled && state.players[owner].disabledSlot === id) continue;
    counts[owner] += 1;
  }
  return counts;
}

/** 件数から決まる称号の持ち主。相手より多く、かつ minCount 件以上ある側が持つ。
 *  どちらも満たさなければ（同数など）今の持ち主（current）のまま。 */
export function holderFrom(
  counts: Record<PlayerId, number>,
  current: PlayerId | null,
  minCount = 1,
): PlayerId | null {
  if (counts.you > counts.cpu && counts.you >= minCount) return 'you';
  if (counts.cpu > counts.you && counts.cpu >= minCount) return 'cpu';
  return current;
}

/** 盤面に合わせて称号を引き直した並び。今の持ち主は state.titles を見る（同数で保持するため）。 */
export function nextTitles(state: GameState, balance: Balance = DEFAULT_BALANCE): (PlayerId | null)[] {
  return balance.districts.map((_, i) =>
    holderFrom(districtCounts(state, i, balance), state.titles?.[i] ?? null, balance.districtMinCount),
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

/** 区画 slotId の持ち主が newOwner に替わったら、player の称号の VP がいくら動くか（CPU の見積もり用）。
 *  その区画の地区だけを引き直す。 */
export function titleVpSwing(
  state: GameState,
  slotId: number,
  newOwner: PlayerId,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  const d = districtOfSlot(slotId, balance);
  if (d < 0) return 0;
  const current = titleHolder(state, d);
  const counts = districtCounts(state, d, balance, (id) =>
    id === slotId ? newOwner : (state.market[id]?.owner ?? null),
  );
  const after = holderFrom(counts, current, balance.districtMinCount);
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

/** 1 ターンあたりの見込み収入。商館の毎ターン収入と、城塞の通行料の期待値
 *  （相手が残りの区画の半分を建てるという見込み）を織り込む。封鎖者で止まって
 *  いる物件は activeOwnedSlots が除外するのでここには含まれない。
 *  祝祭は 1 ターン限りなので、ここ（毎ターン続く収入）には入れない。祝祭の上乗せは festivalExtraOf。 */
export function incomePerTurnOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  const houseIncome = activeEffectSum(state, player, 'tradingHouse', 'tradingHouseIncome', balance);
  const fortressToll = activeEffectSum(state, player, 'fortress', 'fortressToll', balance);
  const unbuiltCount = state.market.filter((s) => s.owner === null).length;
  return balance.baseIncome + houseIncome + fortressToll * (unbuiltCount / 2);
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
  const houseIncome = activeEffectSum(state, player, 'tradingHouse', 'tradingHouseIncome', balance);
  const exchange = activeEffectMax(state, player, 'exchange', 'exchangeBonus', balance);
  return balance.festivalIncomeBonus + houseIncome * extra + exchange * extra * p.pendingIncome.length;
}
