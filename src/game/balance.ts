import type { BuildingId, CardId } from './types';

export const ALL_CARDS: readonly CardId[] = [
  'miner',
  'merchant',
  'banker',
  'architect',
  'spy',
  'herald',
  'taxman',
  'blockader',
];

export const CARD_NAMES: Record<CardId, string> = {
  miner: '採掘師',
  merchant: '商人',
  banker: '銀行家',
  architect: '建築家',
  spy: '密偵',
  herald: '伝令',
  taxman: '徴税官',
  blockader: '封鎖者',
};

export const CARD_TEXTS: Record<CardId, string> = {
  miner: '次のターン コイン +3',
  merchant: '次のターン コイン +5',
  banker: '次のターン コイン +7。さらに解決時の自分の物件 1 件につき +1',
  architect: 'このターン建てる物件すべて、建設費 −3',
  spy: '相手の手札 4 枚を見る',
  herald: '手札 1 枚を使わずに山の底へ送り、補充する',
  taxman: '相手のコイン −5',
  blockader: '市場の物件 1 つを、次の相手のターン建設できなくする',
};

export const BUILDING_NAMES: Record<BuildingId, string> = {
  tradingHouse: '商館',
  wall: '城壁',
  factory: '工場',
  road: '街道',
  cathedral: '大聖堂',
  fortress: '城塞',
  exchange: '取引所',
};

export const BUILDING_TEXTS: Record<BuildingId, string> = {
  tradingHouse: '毎ターン開始時 コイン +1',
  wall: '徴税官・封鎖者の効果を受けない',
  factory: '毎ターン、最初に使用する人物カードのコスト −2',
  road: '毎ターン開始時、手札 1 枚を山の底へ送って補充してよい',
  cathedral: '自分の他の物件 1 件につき +2 VP',
  fortress: 'なし',
  exchange: '人物カードの「次のターン コイン +X」がすべて +2',
};

export interface Balance {
  handSize: number;
  baseIncome: number;
  startingCoins: { first: number; second: number };
  maxTurnsPerPlayer: number;
  cards: Record<CardId, { cost: number }>;
  minerIncome: number;
  merchantIncome: number;
  bankerIncome: number;
  bankerPerBuilding: number;
  architectDiscount: number;
  taxmanAmount: number;
  buildings: Record<BuildingId, { cost: number; vp: number }>;
  tradingHouseIncome: number;
  factoryDiscount: number;
  cathedralVpPerBuilding: number;
  exchangeBonus: number;
  /** 市場のスロット順。長さ 10 */
  market: BuildingId[];
}

/** 全数値はここに集約する。ロジックに数値リテラルを書かないこと。
 *  すべて仮置きで、scripts/simulate.ts の実測と実プレイで調整する。 */
export const DEFAULT_BALANCE: Balance = {
  handSize: 4,
  baseIncome: 1,
  startingCoins: { first: 4, second: 6 },
  maxTurnsPerPlayer: 20,
  cards: {
    miner: { cost: 1 },
    merchant: { cost: 2 },
    banker: { cost: 4 },
    architect: { cost: 2 },
    spy: { cost: 1 },
    herald: { cost: 1 },
    taxman: { cost: 3 },
    blockader: { cost: 3 },
  },
  minerIncome: 3,
  merchantIncome: 5,
  bankerIncome: 7,
  bankerPerBuilding: 1,
  architectDiscount: 3,
  taxmanAmount: 5,
  buildings: {
    tradingHouse: { cost: 7, vp: 2 },
    wall: { cost: 10, vp: 2 },
    factory: { cost: 12, vp: 3 },
    road: { cost: 14, vp: 2 },
    cathedral: { cost: 16, vp: 0 },
    fortress: { cost: 18, vp: 6 },
    exchange: { cost: 20, vp: 3 },
  },
  tradingHouseIncome: 1,
  factoryDiscount: 2,
  cathedralVpPerBuilding: 2,
  exchangeBonus: 2,
  market: [
    'tradingHouse',
    'tradingHouse',
    'tradingHouse',
    'wall',
    'factory',
    'road',
    'cathedral',
    'fortress',
    'fortress',
    'exchange',
  ],
};
