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
};

export const CARD_TEXTS: Record<CardId, string> = {
  miner: '次のターン コイン +6',
  banker: '次のターン コイン +11。さらに解決時の自分の物件 1 件につき +1',
  architect: 'このターン建てる物件すべて、建設費 −6',
  herald: '手札 1 枚を使わずに山の底へ送り、補充する',
  festival: '次の自分のターン、自分の物件の効果がすべて 2 倍。さらにそのターンの収入 +2',
  guard: '次の自分のターンまで、徴税官・買収者・封鎖者の効果を受けない',
  usurer: 'このターン コイン +5。次の自分のターン開始時 コイン −7（マイナスになる）',
  spy: '次の相手のターン、相手の手札 1 枚がランダムに使えなくなる',
  taxman: '相手のコイン −6',
  blockader: '市場の区画 1 つを指定する。空き地ならそこに建設させない。相手の物件ならその効果を止める',
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
};

export const BUILDING_TEXTS: Record<BuildingId, string> = {
  tradingHouse: '毎ターン開始時 コイン +1',
  wall: '徴税官・封鎖者の効果を受けない',
  factory: '毎ターン、最初に使用する人物カードのコスト −2',
  road: '毎ターン開始時、手札 1 枚を山の底へ送って補充してよい',
  cathedral: '自分の他の物件 1 件につき +2 VP',
  fortress: '相手が物件を建てるたび コイン +2',
  exchange: '人物カードの「次のターン コイン +X」がすべて +2',
  quarry: '建築家を使ったターン、2 件目以降の建設費がさらに −4',
};

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
  /** 市場のスロット順。長さ 10 */
  market: BuildingId[];
}

/** 全数値はここに集約する。ロジックに数値リテラルを書かないこと。
 *  すべて仮置きで、scripts/simulate.ts の実測と実プレイで調整する。 */
export const DEFAULT_BALANCE: Balance = {
  handSize: 4,
  baseIncome: 2,
  startingCoins: { first: 0, second: 0 },
  maxTurnsPerPlayer: 20,
  cards: {
    miner: { cost: 2 },
    banker: { cost: 5 },
    architect: { cost: 5 },
    herald: { cost: 1 },
    festival: { cost: 3 },
    guard: { cost: 2 },
    usurer: { cost: 0 },
    spy: { cost: 3 },
    taxman: { cost: 4 },
    blockader: { cost: 4 },
  },
  minerIncome: 6,
  bankerIncome: 11,
  bankerPerBuilding: 1,
  architectDiscount: 6,
  taxmanAmount: 6,
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
  usurerGain: 5,
  usurerDebt: 7,
  festivalMultiplier: 2,
  festivalIncomeBonus: 2,
  fortressToll: 2,
  quarryExtraDiscount: 4,
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
};
