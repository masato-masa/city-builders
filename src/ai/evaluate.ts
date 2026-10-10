import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { cardCostFor } from '@/game/reducer';
import {
  acquireCostFor,
  acquirePriceOf,
  activeEffectMax,
  bossDistrictsOf,
  festivalExtraOf,
  handOf,
  incomePerTurnOf,
  opponentOf,
  ownedSlots,
  scoreOf,
  slotLocked,
  slotMaxed,
  titleVpSwing,
  upgradePriceOf,
  vpOfSlot,
} from '@/game/selectors';
import type { CardId, GameState, PlayerId, PlayerState } from '@/game/types';

/** 評価関数の重み。ハードな条件分岐ではなく、ここの重みで振る舞いを決める。
 *  外から差し替えられるようにして、性格の違う CPU（balance-lab）を作れるようにする。 */
export interface Weights {
  vp: number;
  coin: number;
  /** 相手の手持ちコイン。奪えば相手の購買力が落ちるので、マイナスに効く */
  opponentCoin: number;
  pendingIncome: number;
  incomePerTurn: number;
  opponentVp: number;
  /** いまの所持コインで、このターン中に VP の高い順に貪欲に買っていったときの、
   *  買えた VP の合計（まとめ買い込み）。建築家の割引・石切場の追加割引・高利貸で
   *  増やしたコインが、ここで初めて価値になる。 */
  reach: number;
  /** 相手の reach。マイナスに効く。封鎖者（相手の射程を削る）と徴税官（相手のコインを削る）の
   *  価値を、これで同じ物差しで測る。 */
  opponentReach: number;
  /** 相手の 1 ターンあたり収入。封鎖者で相手の物件を止めると下がるので、マイナスに効く */
  opponentIncome: number;
  /** 自分の pendingDebt（高利貸の借り）。マイナスに効く */
  debt: number;
  /** 衛兵が張れているか（0 か 1）。守っているものの大きさを掛けて使う */
  guarded: number;
  /** 手札のうち、いま払えないカードの枚数（工場・城壁・街道でのコストの変化を織り込む） */
  stuck: number;
  /** 相手の手札のうち、相手がいま払えない枚数。相手が詰まっているのは自分に有利なので正の重み */
  opponentStuck: number;
  /** 相手が次の手番で買収できてしまう自分の VP（相手の見込みの手持ちで、VP の高い順に貪欲に）。
   *  マイナスに効く。アップグレード（価格が上がる）と衛兵（買収を防ぐ）の価値をここで測る */
  exposed: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  vp: 10,
  coin: 1,
  opponentCoin: -0.8,
  pendingIncome: 1.2,
  incomePerTurn: 3,
  opponentVp: -8,
  reach: 2.0,
  opponentReach: -1.6,
  opponentIncome: -2.0,
  debt: -1.2,
  guarded: 0,
  stuck: -1.5,
  opponentStuck: 1.0,
  exposed: -4,
};

/** 性格。序盤と終盤で重みが変わる。進行度で線形に補間する。 */
export interface Profile {
  early: Weights;
  late: Weights;
}

export const DEFAULT_PROFILE: Profile = { early: DEFAULT_WEIGHTS, late: DEFAULT_WEIGHTS };

/** 残りターンの多さ。序盤は収入を、終盤は VP を重く見るための係数。 */
function lateness(state: GameState, balance: Balance): number {
  return Math.min(1, state.turn / (balance.maxTurnsPerPlayer * 2));
}

/** Profile を進行度で線形補間し、その局面用の Weights を作る。
 *  補間の係数は lateness（0=序盤、1=終盤）をそのまま使う。 */
export function weightsAt(profile: Profile, state: GameState, balance: Balance): Weights {
  const t = lateness(state, balance);
  // 重みの項目は DEFAULT_WEIGHTS を正とする。保存済みの性格（searched-profiles.json）に
  // 後から足した項目が無ければ、既定値で埋める（undefined で NaN にしない）
  const keys = Object.keys(DEFAULT_WEIGHTS) as (keyof Weights)[];
  const result = {} as Weights;
  for (const key of keys) {
    const early = profile.early[key] ?? DEFAULT_WEIGHTS[key];
    const late = profile.late[key] ?? DEFAULT_WEIGHTS[key];
    result[key] = early + (late - early) * t;
  }
  return result;
}

/** player にこの先「開始フェーズ」（収入・投資・祝祭・借り・徴税の解決）がまだ 1 回来るなら 1、来ないなら 0。
 *  投資・祝祭・借り・徴税はどれも次の開始フェーズで初めて効くので、来ない（試合がその前に終わる）なら価値も 0。
 *  終わり方は endTurn と同じ規則で見る: ターンの上限か、全区画が埋まった手番の終わり。 */
export function nextStartsOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  if (state.phase !== 'playing') return 0;
  if (state.market.every((s) => s.owner !== null)) return 0;
  const nextTurn = state.current === player ? state.turn + 2 : state.turn + 1;
  return nextTurn <= balance.maxTurnsPerPlayer * 2 ? 1 : 0;
}

/** いまの所持コインで、このターン中に実際に買えるもの（空き区画の建設・自分の物件の
 *  アップグレード・相手の物件の買収）を、増える VP の高い順に貪欲に買っていったときの、
 *  増えた VP の合計。建築家の割引・石切場の追加割引・すでに建てた件数を buildCostFor と
 *  同じ規則で織り込む。払えないものがあっても止めず、次の（もっと安いかもしれない）ものを試す。
 *  買えるものが 1 つも無ければ 0。structuredClone は使わず数値のコピーだけで済ませる。 */
export function reachOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  const p = state.players[player];
  const foe = opponentOf(player);
  // 建築家の割引・このターンの建設数は、その手番の中でだけ使える。手番を終えた後（相手の手番）に
  // 残っている値は次の startTurn で消えるので、次に買うときの値段には乗らない
  const ownTurn = state.phase === 'playing' && state.current === player;
  const buildDiscount = ownTurn ? p.buildDiscount : 0;
  // 職人の割引も同じ（手番を終えた後に残っていても次には乗らない。journal の盲点①と同じ扱い）
  const upgradeDiscount = ownTurn ? p.upgradeDiscount : 0;
  const quarryExtra = activeEffectMax(state, player, 'quarry', 'quarryExtraDiscount', balance);

  type Candidate = { vp: number; cost: (builds: number) => number; isBuild: boolean };
  const candidates: Candidate[] = [];
  for (const s of state.market) {
    if (s.owner === null) {
      if (s.slotId === p.blockedSlot) continue;
      const b = balance.buildings[s.buildingId];
      candidates.push({
        // 建てると地区の称号が取れるなら、その VP も込みで測る（あと 1 件で取れる）
        vp: b.vp + titleVpSwing(state, s.slotId, player, player, balance),
        isBuild: true,
        cost: (builds) => {
          let discount = buildDiscount;
          if (buildDiscount > 0 && builds >= 1) discount += quarryExtra;
          return Math.max(0, b.cost - discount);
        },
      });
      continue;
    }
    if (slotLocked(state, s, balance)) continue;
    if (s.owner === player && s.level < balance.maxLevel) {
      const price = Math.max(0, upgradePriceOf(s, balance) - upgradeDiscount);
      // 大聖堂も同じ式で測れるよう、レベルだけ上げた区画を vpOfSlot に渡して差を取る
      const gain = vpOfSlot(state, { ...s, level: s.level + 1 }, balance) - vpOfSlot(state, s, balance);
      candidates.push({ vp: gain, isBuild: false, cost: () => price });
    } else if (s.owner === foe && !state.players[foe].guarded && !slotMaxed(s, balance)) {
      // 最終段階（maxLevel）の物件は買収できない
      // 買収者を使ったターンは割引が乗る
      const price = acquireCostFor(state, player, s, balance);
      candidates.push({
        vp: vpOfSlot(state, s, balance) + titleVpSwing(state, s.slotId, player, player, balance),
        isBuild: false,
        cost: () => price,
      });
    }
  }
  candidates.sort((a, b) => b.vp - a.vp);

  let coins = p.coins;
  let builds = ownTurn ? p.buildsThisTurn : 0;
  let totalVp = 0;

  for (const c of candidates) {
    const cost = c.cost(builds);
    if (coins < cost) continue;
    coins -= cost;
    if (c.isBuild) builds += 1;
    totalVp += c.vp;
  }

  return totalVp;
}

/** 相手が次の手番で買収できてしまう、player の物件の VP の合計。
 *  相手の予算は「いまの手持ち + 1 ターンの見込み収入 + 解決待ちの投資（採掘師の額で近似）」。
 *  VP の高い順に貪欲に数える。player が衛兵で守られていれば 0。 */
export function exposedVpOf(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
): number {
  if (state.players[player].guarded) return 0;
  const foe = opponentOf(player);
  const f = state.players[foe];
  let budget =
    f.coins +
    incomePerTurnOf(state, foe, balance) +
    festivalExtraOf(state, foe, balance) +
    f.pendingIncome.length * balance.minerIncome;
  // 相手の手札に買収者があれば、使ったうえで割引の効いた値段で買ってくると見る（読み合いの核）
  let discount = 0;
  if (handOf(state, foe, balance).includes('spy')) {
    discount = balance.spyAcquireDiscount;
    budget -= balance.cards.spy.cost;
  }
  // 相手の次の手番の時点で、まだ動かせない区画は奪われない
  const foeTurn = state.current === foe ? state.turn : state.turn + 1;
  const mine = ownedSlots(state, player)
    // 最終段階の物件は買収されないので晒されない（アップグレードの価値の一部がここに出る）
    .filter((s) => !slotLocked(state, s, balance, foeTurn) && !slotMaxed(s, balance))
    .map((s) => ({
      // 奪われると地区の称号も失うなら、その VP も込みで測る（あと 1 件で奪われる）
      vp: vpOfSlot(state, s, balance) - titleVpSwing(state, s.slotId, foe, player, balance),
      price: acquirePriceOf(s, balance, discount),
    }))
    .sort((a, b) => b.vp - a.vp);
  let total = 0;
  for (const m of mine) {
    if (budget < m.price) continue;
    budget -= m.price;
    total += m.vp;
  }
  // 相手の手札に検査官があり、払えるなら、自分の Lv2 以上の 1 件が 1 段下がる（VP の減りがいちばん大きいもの）。
  // 衛兵の価値（検査官も防ぐ）とアップグレードの危うさを、買収と同じ物差しで数える
  if (handOf(state, foe, balance).includes('inspector') && budget >= balance.cards.inspector.cost) {
    let worst = 0;
    for (const s of ownedSlots(state, player)) {
      if (s.level < 2) continue;
      worst = Math.max(worst, vpOfSlot(state, s, balance) - vpOfSlot(state, { ...s, level: s.level - 1 }, balance));
    }
    total += worst;
  }
  // 相手の手札に顔役があり、払えるなら、自分が持っている同数の地区の称号を 1 つ取られる
  if (handOf(state, foe, balance).includes('boss') && budget >= balance.cards.boss.cost) {
    if (bossDistrictsOf(state, foe, balance).length > 0) total += balance.districtTitleVp;
  }
  return total;
}

/** 相手の「次」の札が相手の手札に入ったときの脅威の目安（コインの見当）。密告者の価値の物差し。
 *  妨害・買収の札と大きな投資ほど高く、手札回し・小さな札ほど低い。 */
export const NEXT_CARD_THREAT: Record<CardId, number> = {
  miner: 3,
  banker: 4,
  architect: 4,
  herald: 1,
  festival: 2,
  guard: 2,
  usurer: 3,
  spy: 3,
  taxman: 5,
  blockader: 5,
  craftsman: 2,
  inspector: 4,
  boss: 3,
  informer: 1,
  double: 2,
  clerk: 2,
};

/** 相手の「次」の札の脅威に掛ける重み（評価の点）。card-value で密告者の 禁止/優先 が 50% 付近になるように決める。 */
export const INFORMER_NEXT_WEIGHT = 1.5;

/** デッキ（手札＋待機列）にそのカードがあるか。デッキの中身は試合中に変わらないので、試合ごとの定数として使える。 */
function deckHas(p: PlayerState, card: CardId): boolean {
  return p.hand.includes(card) || p.queue.includes(card);
}

export function evaluateState(
  state: GameState,
  player: PlayerId,
  balance: Balance = DEFAULT_BALANCE,
  weights: Weights = DEFAULT_WEIGHTS,
): number {
  const foe = opponentOf(player);
  const p = state.players[player];
  const foeState = state.players[foe];
  const late = lateness(state, balance);
  const myNext = nextStartsOf(state, player, balance);
  const foeNext = nextStartsOf(state, foe, balance);

  const incomePerTurn = incomePerTurnOf(state, player, balance);
  const opponentIncome = incomePerTurnOf(state, foe, balance);

  const reach = reachOf(state, player, balance);
  const opponentReach = reachOf(state, foe, balance);
  const exposed = exposedVpOf(state, player, balance);

  // 衛兵が守っているものの大きさ。持っているコインと、これから積み上がる収入が
  // 大きいほど「守れて良かった」の価値が上がる。相手の手札は読まない。
  const guarded = p.guarded ? p.coins + incomePerTurn * 3 : 0;

  // 手札のうち、いま払えないカードの枚数
  const stuck = handOf(state, player, balance).filter(
    (c) => p.coins < cardCostFor(state, player, c, balance),
  ).length;
  // 相手について同じ計算をする（払えない枚数のみ）。相手が詰まっているのは自分に有利
  const opponentStuck = handOf(state, foe, balance).filter(
    (c) => foeState.coins < balance.cards[c].cost,
  ).length;

  // 密告者がある試合だけ、相手の「次」の札の脅威を数える（無い試合では 0 なので既定のデッキの評価は変わらない）
  const foeNext0 = foeState.queue[0];
  const nextThreat = deckHas(p, 'informer') && foeNext0 ? NEXT_CARD_THREAT[foeNext0] * INFORMER_NEXT_WEIGHT : 0;

  return (
    -nextThreat +
    scoreOf(state, player, balance) * weights.vp * (0.5 + late) +
    scoreOf(state, foe, balance) * weights.opponentVp * (0.5 + late) +
    p.coins * weights.coin +
    foeState.coins * weights.opponentCoin +
    stuck * weights.stuck +
    opponentStuck * weights.opponentStuck +
    // 投資・祝祭・借り・徴税は次の開始フェーズで解決する。それが来なければ（試合の最後の手番）価値は 0
    myNext * p.pendingIncome.length * weights.pendingIncome * 4 +
    // 祝祭は次の収入に 1 度だけ上乗せされる（毎ターンの収入ではない）。投資カードと同じ物差しで数える
    myNext * festivalExtraOf(state, player, balance) * weights.pendingIncome +
    foeNext * festivalExtraOf(state, foe, balance) * weights.opponentCoin +
    incomePerTurn * weights.incomePerTurn * (1 - late) +
    opponentIncome * weights.opponentIncome +
    ownedSlots(state, player).length * 2 +
    reach * weights.reach +
    opponentReach * weights.opponentReach +
    myNext * p.pendingDebt * weights.debt +
    // 徴税官で相手に課した徴収は、自分の借りの裏返しとして得になる
    (foeNext * foeState.pendingTax - myNext * p.pendingTax) * -weights.debt +
    guarded * weights.guarded +
    exposed * weights.exposed * (0.5 + late)
  );
}
