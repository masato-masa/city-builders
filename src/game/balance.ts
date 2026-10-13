import type { BuildingId, CardId } from './types';

export const ALL_CARDS: readonly CardId[] = [
  'miner',
  'banker',
  'architect',
  'herald',
  'festival',
  'guard',
  'usurer',
  'spy',
  'taxman',
  'blockader',
];

/** 既定のデッキ（いまの 10 枚）。createGame でデッキを省略したときに使う。 */
export const DEFAULT_DECK: readonly CardId[] = ALL_CARDS;

/** 既定のデッキに入っていない新しいカード。2 段目以降の抽選・ドラフトで入る。 */
export const NEW_CARDS: readonly CardId[] = ['craftsman', 'inspector', 'boss', 'informer', 'double', 'clerk'];

/** 存在するカードすべて（既定の 10 枚の後ろに新しいカード）。計測ツールの seed はこの並びの番号で決める。 */
export const CARD_POOL: readonly CardId[] = [...ALL_CARDS, ...NEW_CARDS];

/** 新しいカードを試すデッキ（設計書 §5 段 1）: 既定の 10 枚から祝祭・徴税官を抜き、職人・検査官を入れる。
 *  役割で入れ替える（祝祭=次の収入を伸ばす ↔ 職人=上げて固める、徴税官=妨害 ↔ 検査官=妨害）。 */
export const NEW_CARDS_DECK: readonly CardId[] = ALL_CARDS.map((c) =>
  c === 'festival' ? 'craftsman' : c === 'taxman' ? 'inspector' : c,
);

/** 抽選（ドミニオン式）で必ず入るコア 4 枚（設計書 §3）。高利貸は「使える札が 1 枚も無い」を潰すコスト 0 の札、
 *  残りは初心者でも分かる骨格（稼ぐ・建てる・回す）。抽選は残り 12 種から 6 枚。 */
export const CORE_CARDS: readonly CardId[] = ['usurer', 'herald', 'miner', 'architect'];


export const CARD_NAMES: Record<CardId, string> = {
  miner: '採掘師',
  banker: '銀行家',
  architect: '建築家',
  herald: '伝令',
  festival: '祝祭',
  guard: '衛兵',
  usurer: '高利貸',
  spy: '買収者',
  taxman: '徴税官',
  blockader: '封鎖者',
  craftsman: '職人',
  inspector: '検査官',
  boss: '顔役',
  informer: '密告者',
  double: '影武者',
  clerk: '番頭',
};

export const BUILDING_NAMES: Record<BuildingId, string> = {
  tradingHouse: '商館',
  wall: '城壁',
  factory: '工場',
  road: '街道',
  cathedral: '大聖堂',
  fortress: '城塞',
  exchange: '取引所',
  quarry: '石切場',
  mine: '鉱山',
};

// 札・建物の説明文は card-text.ts（行の配列。数字に種類を付けて返す）。旧 API の文字列版をここから再公開する
export { buildingEffectTextFor, buildingTextFor, cardTextFor } from './card-text';

/** レベルに応じた物件の毎ターンの収入（手番の開始で入る。封鎖で効果が止まっている物件は入らない）。
 *  収入 = その物件の VP（+ 商館だけ効果の追加収入）。大聖堂の VP は他の物件の数で決まるので、
 *  ここ（盤面を見ない値）では 0。盤面込みの値は selectors の slotIncomeValue。 */
export function buildingIncomeOf(balance: Balance, building: BuildingId, level: number): number {
  if (building === 'cathedral') return 0;
  return buildingVp(balance, building, level) + (building === 'tradingHouse' ? buildingEffect(balance, 'tradingHouseIncome', level) : 0);
}

/** レベルで値が変わる物件の効果。Lv1 の値は Balance の同名の項目、Lv2 は Balance.level2、Lv3 は Balance.level3 にある。 */
export type Level2EffectKey =
  | 'factoryDiscount'
  | 'cathedralVpPerBuilding'
  | 'exchangeBonus'
  | 'quarryExtraDiscount'
  | 'roadUses'
  | 'mineMinerBonus'
  | 'mineMinerDiscount'
  | 'tradingHouseIncome';

/** レベルに応じた物件の効果値。数値はすべて balance から引く（ロジックに直書きしない）。 */
export function buildingEffect(balance: Balance, key: Level2EffectKey, level: number): number {
  if (level >= 3) return balance.level3[key];
  return level >= 2 ? balance.level2[key] : balance[key];
}

/** レベルに応じた物件の VP（大聖堂は vpOfSlot が別に数える）。 */
export function buildingVp(balance: Balance, building: BuildingId, level: number): number {
  if (level >= 3) return balance.upgrades3[building].vp;
  return level >= 2 ? balance.upgrades[building].vp : balance.buildings[building].vp;
}

export interface Balance {
  handSize: number;
  baseIncome: number;
  startingCoins: { first: number; second: number };
  maxTurnsPerPlayer: number;
  /** 目標の VP。手番を終えた時点で自分の VP がこれ以上なら、その場で勝ち（全物件を自分のものにしても勝ち）。
   *  上限ターンは決着が付かない時の保険 */
  winVp: number;
  cards: Record<CardId, { cost: number }>;
  minerIncome: number;
  /** 銀行家: 次の収入 = bankerIncome + floor(解決時の自分の VP × bankerVpRate) */
  bankerIncome: number;
  bankerVpRate: number;
  architectDiscount: number;
  taxmanAmount: number;
  /** 徴税官: 相手の VP 1 につき、さらに引く額（勝っている側ほど多く取られる。端数は切り捨て） */
  taxmanIncomeRate: number;
  /** 徴税官: 自分の物件 1 件につきコストに足す額（端数は切り捨て。持っている側ほど撃ちにくい） */
  taxmanCostPerSlot: number;
  /** 買収者: このターンの買収価格の割引 */
  spyAcquireDiscount: number;
  /** 買収者: 相手の物件 1 件につき、さらに割引く額（端数は切り捨て。物件が多い相手ほど一気に買える） */
  spyPerSlot: number;
  /** 城壁（効果が生きているもの）を持っているときの衛兵のコスト */
  guardCostWithWall: number;
  /** 街道（効果が生きているもの）を持っているときの伝令のコスト */
  heraldCostWithRoad: number;
  /** 職人: このターンのアップグレード費の割引 */
  craftsmanDiscount: number;
  /** 番頭: 商館 1 件あたりのコインと、数える商館の上限 */
  clerkPerHouse: number;
  clerkMaxHouses: number;
  /** 影武者で写せない札。伝令（対象が手札で、写すと手札の並びが崩れる）・影武者自身・
   *  祝祭と衛兵（2 回目は何も起きない: 次の手番の祝祭・守りはもう立っている）が最低限 */
  doubleExcluded: CardId[];
  /** Lv1 の建設費・VP（VP がそのまま毎ターンの収入） */
  buildings: Record<BuildingId, BuildingLevel>;
  factoryDiscount: number;
  cathedralVpPerBuilding: number;
  exchangeBonus: number;
  /** 商館: VP とは別に、効果で入る毎ターンの追加収入（Lv1 の値。Lv2・Lv3 は level2・level3） */
  tradingHouseIncome: number;
  /** 高利貸: このターン受け取る額と、次のターン頭に引かれる額 */
  usurerGain: number;
  usurerDebt: number;
  /** 祝祭: 物件の効果に掛ける倍率と、そのターンの追加収入 */
  festivalMultiplier: number;
  festivalIncomeBonus: number;
  /** 鉱山: 採掘師の次の収入への上乗せと、採掘師のコストの割引 */
  mineMinerBonus: number;
  mineMinerDiscount: number;
  /** 石切場: 建築家を使ったターン、2 件目以降の建設費にさらに乗る割引 */
  quarryExtraDiscount: number;
  /** 街道: 1 ターンに山の底へ送れる回数（祝祭中は festivalMultiplier 倍） */
  roadUses: number;
  /** 後手の 1 ターン目だけ、開始フェーズに足す収入。先手有利の補正 */
  secondPlayerFirstTurnBonus: number;
  /** アップグレード（Lv1 → Lv2）。cost は払う額、vp は Lv2 での VP（加算ではなく置き換え）。
   *  大聖堂の VP は物件数で決まるので、Lv2 では level2.cathedralVpPerBuilding が効く */
  upgrades: Record<BuildingId, BuildingLevel>;
  /** Lv2 の効果値。Lv1 の値は同名の項目 */
  level2: Record<Level2EffectKey, number>;
  /** 2 回目のアップグレード（Lv2 → Lv3）。cost は払う額、vp は Lv3 での VP（置き換え） */
  upgrades3: Record<BuildingId, BuildingLevel>;
  /** Lv3 の効果値 */
  level3: Record<Level2EffectKey, number>;
  /** レベルの上限。上限まで上げた物件は買収されない */
  maxLevel: number;
  /** 買収費用 = 市場価値 × これ。市場価値 = 建物の建設費の定価 + 到達した Lv までのアップグレード費の定価。
   *  買収の代金は相手に渡らない（買う側が払うだけ） */
  acquireMultiplier: number;
  /** 建設・アップグレード・買収のあと、その区画を動かせないターン数（1 人の手番を 1 と数える）。
   *  1 で「同じ区画は 1 ターンに 1 回まで」 */
  slotLockTurns: number;
  /** 人物カードの Lv（試合の中で育つ。試合ごとにリセット）。同じカードを累計でこの回数使うと Lv2・Lv3 になる */
  cardLevelUses: [number, number];
  /** 劣勢（VP が相手より少ない）側がカードを使うと、使用回数に上乗せされる経験値 */
  cardXpBehindBonus: number;
  /** Lv2・Lv3 でのカードの数値。cost は払う額、power はそのカードの主な数値（cardPowerBase の項目）を置き換える */
  cardLv2: Record<CardId, CardLevelRow>;
  cardLv3: Record<CardId, CardLevelRow>;
  /** 市場のスロット順。長さ 10 */
  market: BuildingId[];
  /** 市場を分けた地区。slots は区画の番号。地区ごとに、地区内の物件の VP の合計が相手より多い側が称号を持つ */
  districts: District[];
  /** 称号 1 つの VP */
  districtTitleVp: number;
  /** 称号を取るのに要る、地区内の VP の合計の最少（相手より多いことに加えて） */
  districtMinVp: number;
}

/** 建物の 1 段分の数値。建設（Lv1）では cost は建設費、アップグレードの表では cost はその段へ上げる費用。
 *  vp はその段での値（加算ではなく置き換え）。VP がそのまま毎ターンの収入になる。 */
export interface BuildingLevel {
  cost: number;
  vp: number;
}

/** カードの 1 段分（Lv2・Lv3）の数値。 */
export interface CardLevelRow {
  cost: number;
  /** 主な数値。miner/banker: 次の収入、architect/craftsman: 割引、festival: 追加収入、usurer: 受け取る額、
   *  spy: 買収の割引、taxman: 徴収額、clerk: 商館 1 件あたり、informer: 送る枚数、herald/guard: 使ったときに入るコイン。
   *  blockader: 封鎖が続く相手のターンの追加回数。inspector・boss・double は主な数値が無く、コインだけが下がる */
  power: number;
}

export function cardLevelFromXp(balance: Balance, xp: number): number {
  return xp >= balance.cardLevelUses[1] ? 3 : xp >= balance.cardLevelUses[0] ? 2 : 1;
}

/** Lv1 のときの主な数値（Balance の同名の項目）。CardLevelRow.power が置き換える先。 */
export function cardPowerBase(balance: Balance, card: CardId): number {
  switch (card) {
    case 'miner': return balance.minerIncome;
    case 'banker': return balance.bankerIncome;
    case 'architect': return balance.architectDiscount;
    case 'festival': return balance.festivalIncomeBonus;
    case 'usurer': return balance.usurerGain;
    case 'spy': return balance.spyAcquireDiscount;
    case 'taxman': return balance.taxmanAmount;
    case 'craftsman': return balance.craftsmanDiscount;
    case 'clerk': return balance.clerkPerHouse;
    case 'informer': return 1;
    default: return 0;
  }
}

export function cardPower(balance: Balance, card: CardId, level: number): number {
  if (level >= 3) return balance.cardLv3[card].power;
  return level >= 2 ? balance.cardLv2[card].power : cardPowerBase(balance, card);
}

export function cardCostAt(balance: Balance, card: CardId, level: number): number {
  if (level >= 3) return balance.cardLv3[card].cost;
  return level >= 2 ? balance.cardLv2[card].cost : balance.cards[card].cost;
}

export interface District {
  name: string;
  slots: number[];
}

/** 全数値はここに集約する。ロジックに数値リテラルを書かないこと。
 *  すべて仮置きで、scripts/simulate.ts の実測と実プレイで調整する。 */
export const DEFAULT_BALANCE: Balance = {
  handSize: 4,
  baseIncome: 2,
  // 開始資金は両者 1。CPU の評価の盲点（手番後の建築家の割引・最後の手番の投資）を直して重みを探し直したら
  // 先手 42〜44% に下がった。先手だけ +1 は 60%、両者 +1 で 49.3%（lab 150）
  startingCoins: { first: 1, second: 1 },
  // 20 → 18（2026-10-11 雪だるまの対策の後、ふつう同士で 1 人 18.9 手番・ほぼ上限まで続いた。18 で 17.6）
  // 18 → 20（2026-10-13 終わりを「VP 40 に届く」にした後。18 だと上限で終わる試合が 17%、20 で 7%（lab --shape 1200））
  maxTurnsPerPlayer: 20,
  // 終わり方（2026-10-13 ユーザー指示）: 収入 = VP で全物件が建つのが早すぎたので、全区画が埋まっても終わらず、
  // 手番を終えた時点で VP が目標以上なら勝ち。ふつう同士 lab --shape 1200: 目標 30 は 手番 13.8、40 で 15.6・大差 58%・逆転 38%、
  // 45 で 16.5・上限 17.6%、50 で 17.4・上限 32%
  winVp: 40,
  cards: {
    miner: { cost: 3 },
    // 銀行家 5 → 6（2026-10-11 雪だるまの対策の後 card-value 400: 5 で 禁止 34.3 / 優先 42.8%、6 で 43.9 / 44.3%）
    banker: { cost: 6 },
    architect: { cost: 2 },
    herald: { cost: 1 },
    // 祝祭 3 → 2: 建物の収益で倍の対象は増えたが、使う手番を選ぶ札になった（card-value 400: 3 で 禁止 38.3 / 優先 34.6%、2 で 37.5 / 46.0%）
    // 2 → 3（同: 2 で 禁止 37.5 / 優先 46.8%、3 で 43.3 / 47.8%）
    // 2026-10-12（買収を市場価値の 2 倍に・収益を上げた後 card-value 400）: 3・追加収入 +2 は 禁止 43.4 / 優先 32.5%、
    // 2・+2 は 34.3 / 45.0%、2・+1 は 41.3 / 31.5%、3・+3 は 40.8 / 41.0%、3・+5 は 36.8 / 52.3%。3・+3 を採用
    festival: { cost: 3 },
    guard: { cost: 1 },
    usurer: { cost: 0 },
    spy: { cost: 1 },
    taxman: { cost: 3 },
    // 封鎖者 5 → 3: 効果が「次の相手のターンだけ」になったので（card-value 200 で 5: 禁止 46.0 / 優先 30.0%、3: 43.5 / 40.0%、2: 38.5 / 32.0%）
    // 2026-10-12 3 → 2（card-value 400: 3 で 禁止 41.5 / 優先 31.3%、2 で 41.3 / 37.0%、1 で 34.5 / 43.5%）
    // 2026-10-13 2 → 3（収入 = VP で物件の多い地区ほど封鎖が痛くなった。card-value 300: 2 で 禁止 29.3 / 優先 53.7%、3 で 37.0 / 44.7%）
    blockader: { cost: 3 },
    // 新しいカード（既定のデッキには入っていない。NEW_CARDS_DECK で測る）
    // 職人: 設計書の 2 コスト・−5 は優先 34.1%（上げる物件が無い手番にも撃つ損）。0 コスト・−3 で禁止 44.1 / 優先 49.4%
    // （card-value 400 --deck=new。1/−5 は 37.4/36.3、0/−5 は 39.1/54.3、0/−2 は 45.6/51.0）
    craftsman: { cost: 0 },
    // 検査官: 設計書の 3 は全体の幅が 35.0〜55.6%（封鎖者の優先 35.0・伝令の禁止 55.6）。4 で 39.0〜51.4%。
    // 払われた額の減り 5 → 3 は 37.0〜51.7%（card-value 400 --deck=new）
    inspector: { cost: 4 },
    // 2 段目の新カード。顔役・密告者・番頭は設計書のまま（card-value 300 --deck=draw で 禁止 42.8〜49.7%）
    boss: { cost: 2 },
    informer: { cost: 1 },
    // 影武者: 1 だと回転（手番に札を多く使う性格）だけが +8.7 点（deck-audit の係数）。2 で +7.2、3 で +3.6、
    // 写す札から高利貸・お金の札を外すと逆に +9.4〜12.8。3 で 4 性格 42〜58% を外れるデッキ 50% → 44%（推定）
    double: { cost: 3 },
    clerk: { cost: 1 },
  },
  // 採掘師 3 コスト・次の収入 +4（ユーザー指定 2026-10-11）
  minerIncome: 4,
  // 銀行家: 次の収入 = 2 + 自分の VP（ユーザー指定「獲得 VP の分だけ増やす」。VP の倍率は 1 のまま）。
  // 基本 0 は使う手番を選ぶ札になりすぎた（card-value 200: 基本 0 で 禁止 45.0 / 優先 31.5%、2 で 42.0 / 35.0%、4 で 36.3 / 38.3%）
  bankerIncome: 2,
  bankerVpRate: 1,
  architectDiscount: 4,
  taxmanAmount: 3,
  taxmanIncomeRate: 1,
  taxmanCostPerSlot: 0.5,
  spyAcquireDiscount: 3,
  spyPerSlot: 1,
  guardCostWithWall: 0,
  heraldCostWithRoad: 0,
  craftsmanDiscount: 3,
  clerkPerHouse: 2,
  clerkMaxHouses: 3,
  doubleExcluded: ['herald', 'double', 'festival', 'guard'],
  // 建物の毎ターンの収入 = その物件の VP（ユーザー指定 2026-10-13）。商館だけ VP が低く、効果で追加の収入（tradingHouseIncome）。
  // 城塞 25（ユーザー指定）・鉱山 15（ユーザー指定）
  buildings: {
    tradingHouse: { cost: 8, vp: 1 },
    wall: { cost: 11, vp: 2 },
    factory: { cost: 13, vp: 3 },
    quarry: { cost: 14, vp: 3 },
    road: { cost: 15, vp: 2 },
    mine: { cost: 15, vp: 3 },
    cathedral: { cost: 20, vp: 0 },
    exchange: { cost: 24, vp: 4 },
    fortress: { cost: 25, vp: 8 },
  },
  factoryDiscount: 2,
  cathedralVpPerBuilding: 2,
  exchangeBonus: 2,
  tradingHouseIncome: 3,
  // 5 だと先手の 1 ターン目に商館（7）が建ち、地区の称号を先取りできて必須級だった（card-value 禁止 35.8%）
  // 4/6 → 3/5: 建物に収益が付き、先手の 1 ターン目の商館（1 + 2 + 4 = 7）の価値が上がった（card-value 300: 4/6 で 禁止 37.7 / 優先 55.8%、3/5 で 42.0 / 50.3%）
  usurerGain: 3,
  usurerDebt: 5,
  festivalMultiplier: 2,
  festivalIncomeBonus: 3,
  mineMinerBonus: 2,
  mineMinerDiscount: 1,
  quarryExtraDiscount: 4,
  roadUses: 1,
  secondPlayerFirstTurnBonus: 1,
  // Lv2 の費用は建設費と同じ、Lv3 は建設費 +3
  upgrades: {
    tradingHouse: { cost: 7, vp: 2 },
    wall: { cost: 10, vp: 4 },
    factory: { cost: 12, vp: 5 },
    quarry: { cost: 13, vp: 5 },
    road: { cost: 14, vp: 4 },
    mine: { cost: 15, vp: 5 },
    cathedral: { cost: 18, vp: 0 },
    exchange: { cost: 22, vp: 6 },
    fortress: { cost: 25, vp: 11 },
  },
  level2: {
    factoryDiscount: 4,
    cathedralVpPerBuilding: 3,
    exchangeBonus: 4,
    tradingHouseIncome: 4,
    quarryExtraDiscount: 6,
    roadUses: 2,
    mineMinerBonus: 3,
    mineMinerDiscount: 2,
  },
  // Lv3 の費用は建設費 +3。lab 100（Lv3 の費用 → 終了時に Lv3 の物件の割合 / 1 試合の買収）:
  // 建設費と同額 29.2% / 3.94 回、+1 25.3% / 4.01 回、+3 15.3% / 4.39 回（Lv3 なし 4.42 回）。
  // 安いと買収されない物件ばかりになり、買収の読み合いが減る
  upgrades3: {
    tradingHouse: { cost: 10, vp: 3 },
    wall: { cost: 13, vp: 6 },
    factory: { cost: 15, vp: 7 },
    quarry: { cost: 16, vp: 7 },
    road: { cost: 17, vp: 6 },
    mine: { cost: 18, vp: 7 },
    cathedral: { cost: 21, vp: 0 },
    exchange: { cost: 25, vp: 8 },
    fortress: { cost: 28, vp: 14 },
  },
  level3: {
    factoryDiscount: 6,
    cathedralVpPerBuilding: 4,
    exchangeBonus: 6,
    tradingHouseIncome: 5,
    quarryExtraDiscount: 8,
    roadUses: 3,
    mineMinerBonus: 4,
    mineMinerDiscount: 2,
  },
  maxLevel: 3,
  acquireMultiplier: 2,
  slotLockTurns: 1,
  // 人物カードの Lv: 累計 2 回で Lv2、5 回で Lv3（仮置き）
  // 劣勢の側は使うと経験値が 2 倍（ユーザーの狙い: 劣勢側が人物カードで育って逆転する）。lab 400（ふつう同士）の 大差 / 逆転:
  // [2,5]・上乗せ 0 は 54.8 / 40.4%（income = VP の雪だるまが強い）、[2,5]・1 は 40.3 / 48.3%、[3,5]・1 は 55.8 / 33.8%、[3,5]・2 は 36.8 / 52.8%
  cardLevelUses: [2, 5],
  cardXpBehindBonus: 1,
  cardLv2: {
    miner: { cost: 3, power: 5 },
    banker: { cost: 6, power: 3 },
    architect: { cost: 2, power: 5 },
    herald: { cost: 1, power: 0 },
    festival: { cost: 3, power: 4 },
    guard: { cost: 1, power: 0 },
    usurer: { cost: 0, power: 4 },
    spy: { cost: 1, power: 4 },
    taxman: { cost: 3, power: 4 },
    blockader: { cost: 3, power: 0 },
    craftsman: { cost: 0, power: 4 },
    inspector: { cost: 4, power: 0 },
    boss: { cost: 1, power: 0 },
    informer: { cost: 1, power: 1 },
    double: { cost: 3, power: 0 },
    clerk: { cost: 1, power: 3 },
  },
  cardLv3: {
    miner: { cost: 3, power: 6 },
    banker: { cost: 6, power: 4 },
    architect: { cost: 2, power: 6 },
    herald: { cost: 1, power: 1 },
    festival: { cost: 3, power: 5 },
    guard: { cost: 1, power: 1 },
    usurer: { cost: 0, power: 4 },
    spy: { cost: 1, power: 5 },
    taxman: { cost: 3, power: 5 },
    // 封鎖が続く手番を増やす案（power 1）は 禁止 29.3 / 優先 53.0% で強すぎたので、コストを下げるだけ
    blockader: { cost: 2, power: 0 },
    craftsman: { cost: 0, power: 5 },
    inspector: { cost: 3, power: 0 },
    boss: { cost: 1, power: 0 },
    informer: { cost: 1, power: 2 },
    double: { cost: 2, power: 0 },
    clerk: { cost: 1, power: 4 },
  },
  market: [
    'tradingHouse',
    'tradingHouse',
    'quarry',
    'wall',
    'factory',
    'road',
    'cathedral',
    'fortress',
    'mine',
    'exchange',
  ],
  // 盤面の段（2/3/2/3）を通りで区切った形。上の段＋2 段目の左 / 2 段目の中・右＋3 段目の右 / 3 段目の左＋最下段
  districts: [
    { name: '商人街', slots: [0, 1, 2] },
    { name: '職人街', slots: [3, 4, 6] },
    { name: '城下', slots: [5, 7, 8, 9] },
  ],
  districtTitleVp: 2,
  districtMinVp: 1,
};
