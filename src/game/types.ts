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
  | 'blockader'
  /** 職人: このターンのアップグレード費を下げる（既定のデッキには入っていない） */
  | 'craftsman'
  /** 検査官: 相手の Lv2 以上の物件の Lv を 1 段下げる（既定のデッキには入っていない） */
  | 'inspector'
  /** 顔役: 地区内の VP の合計が同数の地区の称号を今すぐ自分へ（既定のデッキには入っていない） */
  | 'boss'
  /** 密告者: 相手の「次」の札を相手の山の底へ送る（既定のデッキには入っていない） */
  | 'informer'
  /** 影武者: このターン直前に使った人物カードの効果をもう一度（既定のデッキには入っていない） */
  | 'double'
  /** 番頭: このターン、自分の商館の数に応じてコイン（既定のデッキには入っていない） */
  | 'clerk';

export type BuildingId =
  | 'tradingHouse'
  | 'wall'
  | 'factory'
  | 'road'
  | 'cathedral'
  | 'fortress'
  | 'exchange'
  | 'quarry'
  /** 鉱山: 採掘師の収入を増やし、コストを下げる（市場の城塞 2 つのうち 1 つを置き換えた） */
  | 'mine';

export type PlayerId = 'you' | 'cpu';

/** 市場のスロット。位置は固定で、建設されても動かない。 */
export interface BuildingSlot {
  slotId: number;
  buildingId: BuildingId;
  /** null なら未建設 */
  owner: PlayerId | null;
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
  /** このターン限りのアップグレード費の割引（職人）。Lv1→2・Lv2→3 のどちらにも効く */
  upgradeDiscount: number;
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
  /** 封鎖者が掛けた封鎖。対象の地区の空き地に target は建てられず、地区内の target の物件は効果（収益を含む）が止まる。
   *  使った側の物件には何も起きない。target の次の手番の終わり（turn が untilTurn の手番の終わり）で解ける */
  blockades: Blockade[];
  phase: 'playing' | 'finished';
}

export interface Blockade {
  /** 地区の番号（balance.districts の添字） */
  district: number;
  /** 封鎖を受ける側 */
  target: PlayerId;
  /** この手番（GameState.turn）の終わりで解ける。使った手番の次（= target の次の手番） */
  untilTurn: number;
  /** target の開始フェーズ（収入）がまだ来ていないか。来たら false（CPU が「次の収入が減る」を数えるため） */
  beforeIncome: boolean;
}

export type Action =
  | { type: 'startTurn' }
  | {
      type: 'useCard';
      card: CardId;
      heraldTarget?: CardId;
      inspectSlot?: number;
      /** 封鎖者・顔役（と、それを写した影武者）の対象の地区（balance.districts の番号） */
      district?: number;
    }
  | { type: 'build'; slotId: number }
  /** 自分の物件を 1 段上げる。手札は使わない */
  | { type: 'upgrade'; slotId: number }
  /** 相手の物件を市場価値 × acquireMultiplier で買い取る。代金は誰にも入らない。手札は使わない */
  | { type: 'acquire'; slotId: number }
  | { type: 'useRoad'; target: CardId }
  | { type: 'endTurn' };
