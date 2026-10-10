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
export const NEW_CARDS: readonly CardId[] = ['craftsman', 'inspector'];

/** 存在するカードすべて（既定の 10 枚の後ろに新しいカード）。計測ツールの seed はこの並びの番号で決める。 */
export const CARD_POOL: readonly CardId[] = [...ALL_CARDS, ...NEW_CARDS];

/** 新しいカードを試すデッキ（設計書 §5 段 1）: 既定の 10 枚から祝祭・徴税官を抜き、職人・検査官を入れる。
 *  役割で入れ替える（祝祭=次の収入を伸ばす ↔ 職人=上げて固める、徴税官=妨害 ↔ 検査官=妨害）。 */
export const NEW_CARDS_DECK: readonly CardId[] = ALL_CARDS.map((c) =>
  c === 'festival' ? 'craftsman' : c === 'taxman' ? 'inspector' : c,
);

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
};

/** カードの説明文。開発者メニューで効果値を変えたら、この文中の数字も
 *  連動させる必要があるので、固定文字列ではなく balance から組み立てる。 */
export function cardTextFor(card: CardId, balance: Balance): string {
  switch (card) {
    case 'miner':
      return `次の収入 コイン +${balance.minerIncome}`;
    case 'banker':
      return `次の収入 コイン +${balance.bankerIncome}。さらに解決時の自分の物件 1 件につき +${balance.bankerPerBuilding}`;
    case 'architect':
      return `このターン建てる物件すべて、建設費 −${balance.architectDiscount}（アップグレード・買収には効かない）`;
    case 'herald':
      return `手札 1 枚を使わずに山の底へ送り、補充する。街道があればコスト ${balance.heraldCostWithRoad}`;
    case 'festival':
      return `次の自分のターン、自分の物件の効果がすべて ${balance.festivalMultiplier} 倍。さらにそのターンの収入 +${balance.festivalIncomeBonus}`;
    case 'guard':
      return `次の自分のターンまで、徴税官・封鎖者の効果と、物件の買収を受けない。城壁があればコスト ${balance.guardCostWithWall}`;
    case 'usurer':
      return `このターン コイン +${balance.usurerGain}。次の自分のターン開始時 コイン −${balance.usurerDebt}（マイナスになる）`;
    case 'spy':
      return `このターン、相手の物件を買収する価格 −${balance.spyAcquireDiscount}（相手に渡る代金も減る）`;
    case 'taxman':
      return `次の相手のターン、収入を受け取ったあとの相手のコイン −${balance.taxmanAmount}（手持ちが足りなければ引けた分だけ）`;
    case 'blockader':
      return '市場の区画 1 つを指定する。空き地ならそこに建設させない。相手の物件ならその効果を止める';
    case 'craftsman':
      return `このターン、自分の物件のアップグレード費 −${balance.craftsmanDiscount}（Lv1→2・Lv2→3 のどちらにも効く。建設・買収には効かない）`;
    case 'inspector':
      return `相手の物件 1 件の Lv を 1 段下げる（Lv3→2・Lv2→1。払われた額はそのまま）。Lv1 の物件なら払われた額 −${balance.inspectorPaidCut}（買収が安くなる）。衛兵で防がれる`;
  }
}

export const BUILDING_NAMES: Record<BuildingId, string> = {
  tradingHouse: '商館',
  wall: '城壁',
  factory: '工場',
  road: '街道',
  cathedral: '大聖堂',
  fortress: '城塞',
  exchange: '取引所',
  quarry: '石切場',
};

/** 建物の説明文。カードと同じ理由で balance から組み立てる。
 *  level を渡すと、そのレベルでの効果値で書く（既定は Lv1）。 */
export function buildingTextFor(building: BuildingId, balance: Balance, level = 1): string {
  const v = (key: Level2EffectKey) => buildingEffect(balance, key, level);
  switch (building) {
    case 'tradingHouse':
      return `毎ターン開始時 コイン +${v('tradingHouseIncome')}`;
    case 'wall':
      return `徴税官・封鎖者の効果を受けない。衛兵のコスト ${balance.guardCostWithWall}`;
    case 'factory':
      return `毎ターン、最初に使用する人物カードのコスト −${v('factoryDiscount')}`;
    case 'road': {
      const uses = v('roadUses');
      const herald = `。伝令のコスト ${balance.heraldCostWithRoad}`;
      return uses > 1
        ? `毎ターン開始時、手札を ${uses} 回まで山の底へ送って補充してよい${herald}`
        : `毎ターン開始時、手札 1 枚を山の底へ送って補充してよい${herald}`;
    }
    case 'cathedral':
      return `自分の他の物件 1 件につき +${v('cathedralVpPerBuilding')} VP`;
    case 'fortress':
      return `相手が物件を建てるたび コイン +${v('fortressToll')}`;
    case 'exchange':
      return `人物カードの「次の収入 コイン +X」がすべて +${v('exchangeBonus')}`;
    case 'quarry':
      return `建築家を使ったターン、2 件目以降の建設費がさらに −${v('quarryExtraDiscount')}`;
  }
}

/** レベルで値が変わる物件の効果。Lv1 の値は Balance の同名の項目、Lv2 は Balance.level2、Lv3 は Balance.level3 にある。 */
export type Level2EffectKey =
  | 'tradingHouseIncome'
  | 'factoryDiscount'
  | 'cathedralVpPerBuilding'
  | 'exchangeBonus'
  | 'fortressToll'
  | 'quarryExtraDiscount'
  | 'roadUses';

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
  cards: Record<CardId, { cost: number }>;
  minerIncome: number;
  bankerIncome: number;
  bankerPerBuilding: number;
  architectDiscount: number;
  taxmanAmount: number;
  /** 買収者: このターンの買収価格の割引 */
  spyAcquireDiscount: number;
  /** 城壁（効果が生きているもの）を持っているときの衛兵のコスト */
  guardCostWithWall: number;
  /** 街道（効果が生きているもの）を持っているときの伝令のコスト */
  heraldCostWithRoad: number;
  /** 職人: このターンのアップグレード費の割引 */
  craftsmanDiscount: number;
  /** 検査官: Lv1 の物件に撃ったとき、払われた額（買収の価格の元）から引く額。0 未満にはしない */
  inspectorPaidCut: number;
  buildings: Record<BuildingId, { cost: number; vp: number }>;
  tradingHouseIncome: number;
  factoryDiscount: number;
  cathedralVpPerBuilding: number;
  exchangeBonus: number;
  /** 高利貸: このターン受け取る額と、次のターン頭に引かれる額 */
  usurerGain: number;
  usurerDebt: number;
  /** 祝祭: 物件の効果に掛ける倍率と、そのターンの追加収入 */
  festivalMultiplier: number;
  festivalIncomeBonus: number;
  /** 城塞: 相手が物件を建てたとき、城塞 1 件につき入るコイン */
  fortressToll: number;
  /** 石切場: 建築家を使ったターン、2 件目以降の建設費にさらに乗る割引 */
  quarryExtraDiscount: number;
  /** 街道: 1 ターンに山の底へ送れる回数（祝祭中は festivalMultiplier 倍） */
  roadUses: number;
  /** 後手の 1 ターン目だけ、開始フェーズに足す収入。先手有利の補正 */
  secondPlayerFirstTurnBonus: number;
  /** アップグレード（Lv1 → Lv2）。cost は払う額、vp は Lv2 での VP（加算ではなく置き換え）。
   *  大聖堂の VP は物件数で決まるので、Lv2 では level2.cathedralVpPerBuilding が効く */
  upgrades: Record<BuildingId, { cost: number; vp: number }>;
  /** Lv2 の効果値。Lv1 の値は同名の項目 */
  level2: Record<Level2EffectKey, number>;
  /** 2 回目のアップグレード（Lv2 → Lv3）。cost は払う額、vp は Lv3 での VP（置き換え） */
  upgrades3: Record<BuildingId, { cost: number; vp: number }>;
  /** Lv3 の効果値 */
  level3: Record<Level2EffectKey, number>;
  /** レベルの上限。上限まで上げた物件は買収されない */
  maxLevel: number;
  /** 買収の上乗せ。価格は「その物件に払われたコインの合計 + これ」 */
  acquireMarkup: number;
  /** 建設・アップグレード・買収のあと、その区画を動かせないターン数（1 人の手番を 1 と数える）。
   *  1 で「同じ区画は 1 ターンに 1 回まで」 */
  slotLockTurns: number;
  /** 市場のスロット順。長さ 10 */
  market: BuildingId[];
  /** 市場を分けた地区。slots は区画の番号。地区ごとに物件の数が相手より多い側が称号を持つ */
  districts: District[];
  /** 称号 1 つの VP */
  districtTitleVp: number;
  /** 称号を取るのに要る最少の件数（相手より多いことに加えて） */
  districtMinCount: number;
  /** 封鎖者に効果を止められた物件も、称号の件数に数えるか */
  districtCountsDisabled: boolean;
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
  maxTurnsPerPlayer: 20,
  cards: {
    miner: { cost: 3 },
    banker: { cost: 5 },
    architect: { cost: 2 },
    herald: { cost: 1 },
    festival: { cost: 3 },
    guard: { cost: 1 },
    usurer: { cost: 0 },
    spy: { cost: 1 },
    taxman: { cost: 3 },
    blockader: { cost: 5 },
    // 新しいカード（既定のデッキには入っていない。NEW_CARDS_DECK で測る）
    // 職人: 設計書の 2 コスト・−5 は優先 34.1%（上げる物件が無い手番にも撃つ損）。0 コスト・−3 で禁止 44.1 / 優先 49.4%
    // （card-value 400 --deck=new。1/−5 は 37.4/36.3、0/−5 は 39.1/54.3、0/−2 は 45.6/51.0）
    craftsman: { cost: 0 },
    // 検査官: 設計書の 3 は全体の幅が 35.0〜55.6%（封鎖者の優先 35.0・伝令の禁止 55.6）。4 で 39.0〜51.4%。
    // 払われた額の減り 5 → 3 は 37.0〜51.7%（card-value 400 --deck=new）
    inspector: { cost: 4 },
  },
  minerIncome: 3,
  // 銀行家 5 → 4・採掘師のコスト 2 → 3: 盲点を直した後の回転（ゲーム内 CPU）は銀行家・採掘師を禁止すると
  // 勝率が 10〜12 点落ちた（投資の利回り頼み）。lab 150 で回転 63.9% → 50.3%
  bankerIncome: 4,
  bankerPerBuilding: 1,
  architectDiscount: 6,
  taxmanAmount: 5,
  spyAcquireDiscount: 3,
  guardCostWithWall: 0,
  heraldCostWithRoad: 0,
  craftsmanDiscount: 3,
  inspectorPaidCut: 5,
  buildings: {
    tradingHouse: { cost: 7, vp: 2 },
    wall: { cost: 10, vp: 2 },
    factory: { cost: 12, vp: 3 },
    road: { cost: 14, vp: 2 },
    cathedral: { cost: 16, vp: 0 },
    fortress: { cost: 18, vp: 6 },
    exchange: { cost: 20, vp: 3 },
    quarry: { cost: 13, vp: 3 },
  },
  tradingHouseIncome: 1,
  factoryDiscount: 2,
  cathedralVpPerBuilding: 2,
  exchangeBonus: 2,
  // 5 だと先手の 1 ターン目に商館（7）が建ち、地区の称号を先取りできて必須級だった（card-value 禁止 35.8%）
  usurerGain: 4,
  usurerDebt: 6,
  festivalMultiplier: 2,
  festivalIncomeBonus: 2,
  fortressToll: 2,
  quarryExtraDiscount: 4,
  roadUses: 1,
  secondPlayerFirstTurnBonus: 1,
  upgrades: {
    tradingHouse: { cost: 7, vp: 4 },
    wall: { cost: 10, vp: 4 },
    factory: { cost: 12, vp: 5 },
    road: { cost: 14, vp: 4 },
    cathedral: { cost: 16, vp: 0 },
    fortress: { cost: 18, vp: 9 },
    exchange: { cost: 20, vp: 5 },
    quarry: { cost: 13, vp: 5 },
  },
  level2: {
    tradingHouseIncome: 2,
    factoryDiscount: 4,
    cathedralVpPerBuilding: 3,
    exchangeBonus: 4,
    fortressToll: 3,
    quarryExtraDiscount: 6,
    roadUses: 2,
  },
  // Lv3 の費用は建設費 +3。lab 100（Lv3 の費用 → 終了時に Lv3 の物件の割合 / 1 試合の買収）:
  // 建設費と同額 29.2% / 3.94 回、+1 25.3% / 4.01 回、+3 15.3% / 4.39 回（Lv3 なし 4.42 回）。
  // 安いと買収されない物件ばかりになり、買収の読み合いが減る
  upgrades3: {
    tradingHouse: { cost: 10, vp: 6 },
    wall: { cost: 13, vp: 6 },
    factory: { cost: 15, vp: 7 },
    road: { cost: 17, vp: 6 },
    cathedral: { cost: 19, vp: 0 },
    fortress: { cost: 21, vp: 12 },
    exchange: { cost: 23, vp: 7 },
    quarry: { cost: 16, vp: 7 },
  },
  level3: {
    tradingHouseIncome: 3,
    factoryDiscount: 6,
    cathedralVpPerBuilding: 4,
    exchangeBonus: 6,
    fortressToll: 4,
    quarryExtraDiscount: 8,
    roadUses: 3,
  },
  maxLevel: 3,
  acquireMarkup: 4,
  slotLockTurns: 1,
  market: [
    'tradingHouse',
    'tradingHouse',
    'quarry',
    'wall',
    'factory',
    'road',
    'cathedral',
    'fortress',
    'fortress',
    'exchange',
  ],
  // 盤面の段（2/3/2/3）を通りで区切った形。上の段＋2 段目の左 / 2 段目の中・右＋3 段目の右 / 3 段目の左＋最下段
  districts: [
    { name: '商人街', slots: [0, 1, 2] },
    { name: '職人街', slots: [3, 4, 6] },
    { name: '城下', slots: [5, 7, 8, 9] },
  ],
  districtTitleVp: 2,
  districtMinCount: 1,
  districtCountsDisabled: true,
};
