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
  /** この物件に払われたコインの合計（建設・アップグレード・買収で払った実額）。未建設は 0。
   *  買収の価格は paid + acquireMarkup。買収されると、買った側が払った額に置き換わる。 */
  paid: number;
  /** 物件のレベル。未建設と建てた直後は 1。アップグレードで 2、3（最大は balance.maxLevel。最大の物件は買収されない）。買収されても保つ */
  level: number;
  /** 最後に建設・アップグレード・買収されたターン（GameState.turn）。0 は一度も無い。
   *  同じ区画は 1 ターンに 1 回しか動かせない（建てたその手でアップグレード、などを防ぐ） */
  touchedTurn: number;
}

export interface PlayerState {
  coins: number;
  /** 手札の固定スロット。長さは常に handSize。使ったスロットだけ待機列の先頭で
   *  補充され、他のスロットは動かない（表示上、手札全体がシフトしない）。 */
  hand: (CardId | null)[];
  /** 手札の後ろに続く待機列。先頭から順に手札の空きスロットへ入り、
   *  使ったカードは末尾へ回る（循環を維持）。 */
  queue: CardId[];
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
  /** 封鎖者に指定されたスロット。建設できない。解除する手段が無いので永続 */
  blockedSlot: number | null;
  /** このターン、街道の循環を使った回数 */
  roadUsesThisTurn: number;
  /** 高利貸の借り。次の自分の開始フェーズで引かれる */
  pendingDebt: number;
  /** 徴税官。次の自分の開始フェーズの収入から引かれる（手持ちが無ければ引けた分だけ） */
  pendingTax: number;
  /** 祝祭。使ったターンは queued、次の自分のターンだけ active */
  festivalQueued: boolean;
  festivalActive: boolean;
  /** 衛兵。次の自分のターンが始まるまで妨害を受けない */
  guarded: boolean;
  /** このターン限りの買収価格の割引（買収者） */
  acquireDiscount: number;
  /** 封鎖者に効果を止められている自分の物件の区画。解除する手段が無いので永続 */
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
  /** 地区（balance.districts）ごとの称号の持ち主。誰も持たなければ null。
   *  同数なら今の持ち主が保持するので、盤面から毎回計算せず状態として持つ */
  titles: (PlayerId | null)[];
  phase: 'playing' | 'finished';
}

export type Action =
  | { type: 'startTurn' }
  | { type: 'useCard'; card: CardId; heraldTarget?: CardId; blockadeSlot?: number }
  | { type: 'build'; slotId: number }
  /** 自分の物件を 1 段上げる。手札は使わない */
  | { type: 'upgrade'; slotId: number }
  /** 相手の物件を paid + acquireMarkup で買い取る。代金は元の持ち主に入る。手札は使わない */
  | { type: 'acquire'; slotId: number }
  | { type: 'useRoad'; target: CardId }
  | { type: 'endTurn' };
