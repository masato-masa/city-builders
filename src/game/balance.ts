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

/** カードの説明文。開発者メニューで効果値を変えたら、この文中の数字も
 *  連動させる必要があるので、固定文字列ではなく balance から組み立てる。 */
export function cardTextFor(card: CardId, balance: Balance): string {
  switch (card) {
    case 'miner':
      return `次の収入 コイン +${balance.minerIncome}。鉱山があれば安く、多くなる`;
    case 'banker': {
      const rate = balance.bankerVpRate === 1 ? '' : ` × ${balance.bankerVpRate}`;
      const base = balance.bankerIncome > 0 ? `${balance.bankerIncome} + ` : '';
      return `次の収入 コイン +（${base}自分の VP${rate}）。VP は収入を受け取るときの値（称号を含む）`;
    }
    case 'architect':
      return `このターン建てる物件すべて、建設費 −${balance.architectDiscount}（アップグレード・買収には効かない）`;
    case 'herald':
      return `手札 1 枚を使わずに山の底へ送り、補充する。街道があればコスト ${balance.heraldCostWithRoad}`;
    case 'festival':
      return `次の自分のターン、自分の物件の効果がすべて ${balance.festivalMultiplier} 倍。さらにそのターンの収入 +${balance.festivalIncomeBonus}`;
    case 'guard':
      return `次の自分のターンまで、相手の妨害（徴税官・封鎖者・検査官・顔役・密告者）と物件の買収を受けない。城壁があればコスト ${balance.guardCostWithWall}`;
    case 'usurer':
      return `このターン コイン +${balance.usurerGain}。次の自分のターン開始時 コイン −${balance.usurerDebt}（マイナスになる）`;
    case 'spy':
      return `このターン、相手の物件を買収する価格 −${balance.spyAcquireDiscount}（相手に渡る代金も減る）`;
    case 'taxman':
      return `次の相手のターン、収入を受け取ったあとの相手のコイン −${balance.taxmanAmount}（手持ちが足りなければ引けた分だけ）`;
    case 'blockader':
      return '地区 1 つを選ぶ。次の相手のターンだけ、その地区の空き地に相手は建てられず、地区内の相手の物件は効果（収益を含む）が止まる。自分の物件には何も起きない';
    case 'craftsman':
      return `このターン、自分の物件のアップグレード費 −${balance.craftsmanDiscount}（Lv1→2・Lv2→3 のどちらにも効く。建設・買収には効かない）`;
    case 'inspector':
      return `相手の物件 1 件の Lv を 1 段下げる（Lv3→2・Lv2→1。払われた額はそのまま）。Lv1 の物件なら払われた額 −${balance.inspectorPaidCut}（買収が安くなる）。衛兵で防がれる`;
    case 'boss':
      return `地区 1 つを選ぶ。その地区の物件の VP の合計が自分と相手で同じ（1 以上）なら、地区の称号（${balance.districtTitleVp} VP）を今すぐ自分のものにする。衛兵で防がれる`;
    case 'informer':
      return `相手の「次」の札を見て、相手の山の底へ送る（相手が次に補充する札が 1 枚うしろにずれる）。衛兵で防がれる`;
    case 'double':
      return `このターン直前に使った人物カードの効果をもう一度（そのカードの元のコストも払う）。対象が要る札は対象を選び直す。${balance.doubleExcluded
        .filter((c) => c !== 'double')
        .map((c) => CARD_NAMES[c])
        .join('・')}には使えない`;
    case 'clerk':
      return `このターン コイン +${balance.clerkPerHouse} × 自分の商館の数（最大 ${balance.clerkMaxHouses} 件。効果を止められた商館は数えない）`;
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
  mine: '鉱山',
};

/** 建物の説明文（収益の 1 文 + 効果）。カードと同じ理由で balance から組み立てる。
 *  level を渡すと、そのレベルでの値で書く（既定は Lv1）。収益と効果を分けて出す画面は
 *  buildingIncomeOf と buildingEffectTextFor を使う。 */
export function buildingTextFor(building: BuildingId, balance: Balance, level = 1): string {
  const income = buildingIncomeOf(balance, building, level);
  const head = income !== 0 ? `毎ターン 収益 コイン ${income > 0 ? '+' : '−'}${Math.abs(income)}。` : '';
  return head + buildingEffectTextFor(building, balance, level);
}

/** 建物の効果だけの説明文（収益は含まない）。level を渡すと、そのレベルでの効果値で書く。 */
export function buildingEffectTextFor(building: BuildingId, balance: Balance, level = 1): string {
  const v = (key: Level2EffectKey) => buildingEffect(balance, key, level);
  switch (building) {
    case 'tradingHouse':
      return '特別な効果は無い（収益が高い）';
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
    case 'fortress': {
      const d = balance.districts.find((x) => x.slots.some((id) => balance.market[id] === 'fortress'));
      return `${d ? d.name : 'この地区'}の自分の物件は、封鎖者の封鎖を受けない`;
    }
    case 'exchange':
      return `人物カードの「次の収入 コイン +X」がすべて +${v('exchangeBonus')}`;
    case 'quarry':
      return `建築家を使ったターン、2 件目以降の建設費がさらに −${v('quarryExtraDiscount')}`;
    case 'mine':
      return `採掘師のコスト −${v('mineMinerDiscount')}、採掘師の次の収入 +${v('mineMinerBonus')}`;
  }
}

/** レベルに応じた物件の毎ターンの収益（手番の開始で入る。封鎖で効果が止まっている物件は入らない）。 */
export function buildingIncomeOf(balance: Balance, building: BuildingId, level: number): number {
  if (level >= 3) return balance.upgrades3[building].income;
  return level >= 2 ? balance.upgrades[building].income : balance.buildings[building].income;
}

/** レベルで値が変わる物件の効果。Lv1 の値は Balance の同名の項目、Lv2 は Balance.level2、Lv3 は Balance.level3 にある。 */
export type Level2EffectKey =
  | 'factoryDiscount'
  | 'cathedralVpPerBuilding'
  | 'exchangeBonus'
  | 'quarryExtraDiscount'
  | 'roadUses'
  | 'mineMinerBonus'
  | 'mineMinerDiscount';

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
  /** 銀行家: 次の収入 = bankerIncome + floor(解決時の自分の VP × bankerVpRate) */
  bankerIncome: number;
  bankerVpRate: number;
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
  /** 番頭: 商館 1 件あたりのコインと、数える商館の上限 */
  clerkPerHouse: number;
  clerkMaxHouses: number;
  /** 影武者で写せない札。伝令（対象が手札で、写すと手札の並びが崩れる）・影武者自身・
   *  祝祭と衛兵（2 回目は何も起きない: 次の手番の祝祭・守りはもう立っている）が最低限 */
  doubleExcluded: CardId[];
  /** Lv1 の建設費・VP・毎ターンの収益 */
  buildings: Record<BuildingId, BuildingLevel>;
  factoryDiscount: number;
  cathedralVpPerBuilding: number;
  exchangeBonus: number;
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
  /** 買収の上乗せ。価格は「その物件に払われたコインの合計 + これ」 */
  acquireMarkup: number;
  /** 建設・アップグレード・買収のあと、その区画を動かせないターン数（1 人の手番を 1 と数える）。
   *  1 で「同じ区画は 1 ターンに 1 回まで」 */
  slotLockTurns: number;
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
 *  vp・income はその段での値（加算ではなく置き換え）。 */
export interface BuildingLevel {
  cost: number;
  vp: number;
  /** 毎ターンの収益（手番の開始で入る） */
  income: number;
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
  // 銀行家: 次の収入 = 自分の VP（ユーザー指定「獲得 VP の分だけ」）
  bankerIncome: 0,
  bankerVpRate: 1,
  architectDiscount: 6,
  taxmanAmount: 5,
  spyAcquireDiscount: 3,
  guardCostWithWall: 0,
  heraldCostWithRoad: 0,
  craftsmanDiscount: 3,
  inspectorPaidCut: 5,
  clerkPerHouse: 2,
  clerkMaxHouses: 3,
  doubleExcluded: ['herald', 'double', 'festival', 'guard'],
  // 建物は毎ターンの収益を持つ（ユーザー指定 2026-10-11: 商館 +3、ほかは任せる）。
  // 城塞 25（ユーザー指定）・鉱山 15（ユーザー指定）
  buildings: {
    tradingHouse: { cost: 7, vp: 2, income: 3 },
    wall: { cost: 10, vp: 2, income: 1 },
    factory: { cost: 12, vp: 3, income: 1 },
    quarry: { cost: 13, vp: 3, income: 1 },
    road: { cost: 14, vp: 2, income: 2 },
    mine: { cost: 15, vp: 3, income: 2 },
    cathedral: { cost: 18, vp: 0, income: 0 },
    exchange: { cost: 22, vp: 4, income: 2 },
    fortress: { cost: 25, vp: 8, income: 0 },
  },
  factoryDiscount: 2,
  cathedralVpPerBuilding: 2,
  exchangeBonus: 2,
  // 5 だと先手の 1 ターン目に商館（7）が建ち、地区の称号を先取りできて必須級だった（card-value 禁止 35.8%）
  usurerGain: 4,
  usurerDebt: 6,
  festivalMultiplier: 2,
  festivalIncomeBonus: 2,
  mineMinerBonus: 2,
  mineMinerDiscount: 1,
  quarryExtraDiscount: 4,
  roadUses: 1,
  secondPlayerFirstTurnBonus: 1,
  // Lv2 の費用は建設費と同じ、Lv3 は建設費 +3
  upgrades: {
    tradingHouse: { cost: 7, vp: 4, income: 4 },
    wall: { cost: 10, vp: 4, income: 2 },
    factory: { cost: 12, vp: 5, income: 2 },
    quarry: { cost: 13, vp: 5, income: 2 },
    road: { cost: 14, vp: 4, income: 3 },
    mine: { cost: 15, vp: 5, income: 3 },
    cathedral: { cost: 18, vp: 0, income: 0 },
    exchange: { cost: 22, vp: 6, income: 3 },
    fortress: { cost: 25, vp: 11, income: 0 },
  },
  level2: {
    factoryDiscount: 4,
    cathedralVpPerBuilding: 3,
    exchangeBonus: 4,
    quarryExtraDiscount: 6,
    roadUses: 2,
    mineMinerBonus: 3,
    mineMinerDiscount: 2,
  },
  // Lv3 の費用は建設費 +3。lab 100（Lv3 の費用 → 終了時に Lv3 の物件の割合 / 1 試合の買収）:
  // 建設費と同額 29.2% / 3.94 回、+1 25.3% / 4.01 回、+3 15.3% / 4.39 回（Lv3 なし 4.42 回）。
  // 安いと買収されない物件ばかりになり、買収の読み合いが減る
  upgrades3: {
    tradingHouse: { cost: 10, vp: 6, income: 5 },
    wall: { cost: 13, vp: 6, income: 2 },
    factory: { cost: 15, vp: 7, income: 3 },
    quarry: { cost: 16, vp: 7, income: 3 },
    road: { cost: 17, vp: 6, income: 4 },
    mine: { cost: 18, vp: 7, income: 4 },
    cathedral: { cost: 21, vp: 0, income: 0 },
    exchange: { cost: 25, vp: 8, income: 4 },
    fortress: { cost: 28, vp: 14, income: 0 },
  },
  level3: {
    factoryDiscount: 6,
    cathedralVpPerBuilding: 4,
    exchangeBonus: 6,
    quarryExtraDiscount: 8,
    roadUses: 3,
    mineMinerBonus: 4,
    mineMinerDiscount: 2,
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
