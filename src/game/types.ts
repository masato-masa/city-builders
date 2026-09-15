export type CardId =
  | 'miner'
  | 'banker'
  | 'architect'
  | 'herald'
  | 'festival'
  | 'guard'
  | 'usurer'
  | 'spy'
  | 'taxman'
  | 'blockader';

export type BuildingId =
  | 'tradingHouse'
  | 'wall'
  | 'factory'
  | 'road'
  | 'cathedral'
  | 'fortress'
  | 'exchange'
  | 'quarry';

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
  /** このターンにすでに建てた件数。石切場の「2 件目以降」判定に使う */
  buildsThisTurn: number;
  /** このターン 1 枚でもカードを使ったか（工場の割引判定） */
  usedAnyCardThisTurn: boolean;
  /** 封鎖者に指定されたスロット。自分のターンに建設できない */
  blockedSlot: number | null;
  /** このターン、街道の循環を使った回数 */
  roadUsesThisTurn: number;
  /** 高利貸の借り。次の自分の開始フェーズで引かれる */
  pendingDebt: number;
  /** 祝祭。使ったターンは queued、次の自分のターンだけ active */
  festivalQueued: boolean;
  festivalActive: boolean;
  /** 衛兵。次の自分のターンが始まるまで妨害を受けない */
  guarded: boolean;
  /** 買収者を受けた。次の自分の開始フェーズで手札から 1 枚抽選する */
  bindPending: boolean;
  /** 抽選された結果。このターン使用できない */
  boundCard: CardId | null;
  /** 封鎖者に効果を止められている自分の物件の区画 */
  disabledSlot: number | null;
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
}

export type Action =
  | { type: 'startTurn' }
  | { type: 'useCard'; card: CardId; heraldTarget?: CardId; blockadeSlot?: number }
  | { type: 'build'; slotId: number }
  | { type: 'useRoad'; target: CardId }
  | { type: 'endTurn' };
