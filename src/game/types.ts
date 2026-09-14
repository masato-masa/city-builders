export type CardId =
  | 'miner'
  | 'merchant'
  | 'banker'
  | 'architect'
  | 'spy'
  | 'herald'
  | 'taxman'
  | 'blockader';

export type BuildingId =
  | 'tradingHouse'
  | 'wall'
  | 'factory'
  | 'road'
  | 'cathedral'
  | 'fortress'
  | 'exchange';

export type PlayerId = 'you' | 'cpu';

/** 市場のスロット。位置は固定で、建設されても動かない。 */
export interface BuildingSlot {
  slotId: number;
  buildingId: BuildingId;
  /** null なら未建設 */
  owner: PlayerId | null;
}

export interface PlayerState {
  coins: number;
  /** 先頭 handSize 枚が手札。使ったカードは末尾へ回る */
  deck: CardId[];
  /** このターン使用済みのカード */
  usedThisTurn: CardId[];
  /** 次のターン開始時に解決する投資カード */
  pendingIncome: CardId[];
  /** このターン限りの建設費割引（建築家） */
  buildDiscount: number;
  /** このターン 1 枚でもカードを使ったか（工場の割引判定） */
  usedAnyCardThisTurn: boolean;
  /** 封鎖者に指定されたスロット。自分のターンに建設できない */
  blockedSlot: number | null;
  /** このターン、街道の循環を使ったか */
  roadUsedThisTurn: boolean;
}

export interface GameState {
  seed: number;
  /** 1 始まり。1 人の手番を 1 と数える */
  turn: number;
  current: PlayerId;
  players: Record<PlayerId, PlayerState>;
  /** 長さ 10。順番は固定 */
  market: BuildingSlot[];
  phase: 'playing' | 'finished';
  /** 密偵で見えた相手の手札。ターン終了で消える */
  revealedOpponentHand: CardId[] | null;
}

export type Action =
  | { type: 'startTurn' }
  | { type: 'useCard'; card: CardId; heraldTarget?: CardId; blockadeSlot?: number }
  | { type: 'build'; slotId: number }
  | { type: 'useRoad'; target: CardId }
  | { type: 'endTurn' };
