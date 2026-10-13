// 札・建物の説明文。「行の配列（主文 1 行＋補足 1〜2 行）」で返し、数字には種類を付ける（描画側が色と印を付ける）。
// 表記の決まりは docs/autopilot/text-style.md。数値は全部 balance から差し込む（ルールの中身は変えない）。

import {
  buildingEffect,
  buildingVp,
  CARD_NAMES,
  cardCostAt,
  cardPower,
  type Balance,
  type Level2EffectKey,
} from './balance';
import type { BuildingId, CardId } from './types';

/** 数字の種類。lv=Lv で上がった値（金）／good=持ち主に得な変化（緑）／bad=損な変化（赤）／plain=変わっていない。 */
export type NumKind = 'plain' | 'lv' | 'good' | 'bad';

export interface NumSeg {
  t: 'num';
  text: string;
  kind: NumKind;
  /** 次の Lv との差分表示で、いまの値（「+4 → +5」の左側）。 */
  from?: string;
  /** 色だけに頼らない印。コストが下がれば ▼、上がれば ▲（効果の数値は ▲=増・▼=減） */
  mark?: string;
}

export type KeywordId = 'income' | 'harass' | 'guard' | 'blockade' | 'acquire' | 'marketValue' | 'debt';

export interface KwSeg {
  t: 'kw';
  id: KeywordId;
}

export type Seg = string | NumSeg | KwSeg;
export type TextLine = Seg[];

export const KEYWORD_LABELS: Record<KeywordId, string> = {
  income: '収入',
  harass: '妨害',
  guard: '守り',
  blockade: '封鎖',
  acquire: '買収',
  marketValue: '市場価値',
  debt: '負債',
};

export const KEYWORD_ORDER: readonly KeywordId[] = ['income', 'harass', 'guard', 'blockade', 'acquire', 'marketValue', 'debt'];

/** キーワードの定義（1 行）。説明文の下線語のタップと、あそびかたの「言葉の意味」で共用。 */
export function keywordDefs(balance: Balance): Record<KeywordId, string> {
  return {
    income: '手番の開始時に入るコイン。物件の VP と同じ値',
    harass: '相手に使う札（徴税官・封鎖者・検査官・顔役・密告者）。守りで防げる',
    guard: '次の自分のターンまで、妨害と買収を受けない',
    blockade: 'その地区の空き地に建てられず、地区内の物件の効果が止まる。防げるのは城塞だけ',
    acquire: `相手の物件を市場価値 × ${balance.acquireMultiplier} で奪う`,
    marketValue: '物件の定価（建設＋到達 Lv のアップグレード）。Lv が下がると安くなる',
    debt: '次のターン開始時に払うコイン。マイナスになる',
  };
}

const K = (id: KeywordId): KwSeg => ({ t: 'kw', id });
const plainNum = (text: string | number): NumSeg => ({ t: 'num', text: String(text), kind: 'plain' });

/** 行を 1 本の文字にする（テスト・読み上げ・旧 API 用）。差分の数字は「4→5」。 */
export function flattenLine(line: TextLine): string {
  return line
    .map((s) => (typeof s === 'string' ? s : s.t === 'kw' ? KEYWORD_LABELS[s.id] : s.from !== undefined ? `${s.from}→${s.text}` : s.text))
    .join('');
}

export function flattenLines(lines: readonly TextLine[]): string {
  return lines.map(flattenLine).join('。');
}

export function lineHasKeyword(line: TextLine): boolean {
  return line.some((s) => typeof s !== 'string' && s.t === 'kw');
}

/** 行の中の差分（from 付き）の数字があるか。 */
function lineHasDiff(line: TextLine): boolean {
  return line.some((s) => typeof s !== 'string' && s.t === 'num' && s.from !== undefined);
}

/** level の値で数字を作る道具。compareTo を渡すと「いまの値 → 次の値」の差分（違う数字だけ from を付ける）。 */
function numMaker(level: number, compareTo?: number) {
  return (get: (lv: number) => number, fmt: (n: number) => string = String): NumSeg => {
    const v = get(level);
    const text = fmt(v);
    if (compareTo !== undefined) {
      const c = get(compareTo);
      return c === v ? { t: 'num', text, kind: 'plain' } : { t: 'num', text, kind: 'lv', from: fmt(c) };
    }
    return { t: 'num', text, kind: level > 1 && v !== get(1) ? 'lv' : 'plain' };
  };
}

const plus = (n: number) => `+${n}`;
const minus = (n: number) => `−${n}`;

function cardLinesRaw(card: CardId, b: Balance, level: number, compareTo?: number): TextLine[] {
  const mk = numMaker(level, compareTo);
  const power = (fmt?: (n: number) => string) => mk((lv) => cardPower(b, card, lv), fmt);
  const fixed = (n: number): NumSeg => plainNum(n);
  switch (card) {
    case 'miner':
      return [
        ['次の', K('income'), ' ', power(plus)],
        [`鉱山: コスト ${minus(b.mineMinerDiscount)}、`, K('income'), ` ${plus(b.mineMinerBonus)}`],
      ];
    case 'banker': {
      const rate = b.bankerVpRate === 1 ? '' : ` × ${b.bankerVpRate}`;
      const baseNum = cardPower(b, card, level) > 0 || (compareTo !== undefined && cardPower(b, card, compareTo) > 0);
      return [
        ['次の', K('income'), ' +（', ...(baseNum ? [power(), ' ＋ '] : []), `自分の VP${rate}）`],
        ['VP は受け取る時点の値（称号込み）'],
      ];
    }
    case 'architect':
      return [['このターン、建設費 ', power(minus), '（物件ごと）'], ['建設だけに効く（アップグレード・買収は対象外）']];
    case 'herald': {
      const lines: TextLine[] = [['手札 1 枚を山の底へ送り、補充する']];
      if (cardPower(b, card, level) > 0 || (compareTo !== undefined && cardPower(b, card, compareTo) > 0)) lines.push(['コイン ', power(plus)]);
      lines.push([`街道: コスト ${b.heraldCostWithRoad}`]);
      return lines;
    }
    case 'festival':
      return [
        ['次の自分のターン、物件の効果 × ', fixed(b.festivalMultiplier)],
        ['そのターンの', K('income'), ' ', power(plus)],
      ];
    case 'guard': {
      const lines: TextLine[] = [['次の自分のターンまで', K('guard')]];
      if (cardPower(b, card, level) > 0 || (compareTo !== undefined && cardPower(b, card, compareTo) > 0)) lines.push(['コイン ', power(plus)]);
      lines.push([`城壁: コスト ${b.guardCostWithWall}`]);
      return lines;
    }
    case 'usurer':
      return [
        ['このターン コイン ', power(plus)],
        ['次の自分のターン開始時 ', K('debt'), ` ${minus(b.usurerDebt)}`],
      ];
    case 'spy': {
      const lines: TextLine[] = [['このターン、', K('acquire'), '費用 ', power(minus)]];
      if (b.spyPerSlot > 0) lines.push([`相手の物件 ${Math.round(1 / b.spyPerSlot)} 件につき −1`]);
      return lines;
    }
    case 'taxman': {
      const r = b.taxmanIncomeRate;
      const scaled = r === 0 ? '' : r === 1 ? ' ＋ 相手の VP' : r === 0.5 ? ' ＋ 相手の VP の半分' : ` ＋ 相手の VP × ${r}`;
      const main: TextLine = scaled
        ? ['次の相手のターン、', K('income'), 'のあと 相手のコイン −（', power(), scaled, '）']
        : ['次の相手のターン、', K('income'), 'のあと 相手のコイン ', power(minus)];
      const lines: TextLine[] = [main, ['所持が足りなければ、あるだけ']];
      if (b.taxmanCostPerSlot > 0) lines.push([`自分の物件 ${Math.round(1 / b.taxmanCostPerSlot)} 件につき コスト +1`]);
      return lines;
    }
    case 'blockader': {
      const turns = (lv: number) => (cardPower(b, card, lv) > 0 ? `次の相手のターンと、その次（${cardPower(b, card, lv) + 1} 回）` : '次の相手のターン');
      const main: TextLine = ['地区 1 つを', K('blockade'), `（${turns(level)}）`];
      return [main, ['相手の物件だけが止まる']];
    }
    case 'craftsman':
      return [['このターン、アップグレード費 ', power(minus)], ['建設・買収には効かない']];
    case 'inspector':
      return [[K('harass'), ' 相手の物件 1 件の Lv −1'], [K('marketValue'), 'も下がる'], ['Lv1 には使えない']];
    case 'boss':
      return [
        [K('harass'), ` 地区 1 つ。双方の VP 合計が同じ（${b.districtMinVp} 以上）なら称号（${b.districtTitleVp} VP）を得る`],
      ];
    case 'informer':
      return [
        [K('harass'), ' 相手の次の札を見て、山の底へ送る'],
        ['相手の次の補充が ', power(), ' 枚うしろにずれる'],
      ];
    case 'double': {
      const names = b.doubleExcluded
        .filter((c) => c !== 'double')
        .map((c) => CARD_NAMES[c])
        .join('・');
      return [['直前に使った人物カードの効果をもう一度'], ['元のコストを払う／対象は選び直す'], [`${names}には使えない`]];
    }
    case 'clerk':
      return [
        ['このターン コイン ', power(plus), ` × 自分の商館の数（最大 ${b.clerkMaxHouses}）`],
        ['封鎖された商館は数えない'],
      ];
  }
}

/** 札の説明（行の配列）。level は札の Lv（数字が Lv で上がっていれば金）。 */
export function cardLinesFor(card: CardId, balance: Balance, level = 1): TextLine[] {
  return cardLinesRaw(card, balance, level);
}

/** 次の Lv で変わる行だけ（「+4 → +5」の差分つき）。コストが変わるなら先頭にその行。level が最大なら空。 */
export function cardUpgradeLines(card: CardId, balance: Balance, level: number): TextLine[] {
  if (level >= balance.maxLevel) return [];
  const lines = cardLinesRaw(card, balance, level + 1, level).filter(lineHasDiff);
  const before = cardCostAt(balance, card, level);
  const after = cardCostAt(balance, card, level + 1);
  if (before !== after) lines.unshift(['コスト ', { t: 'num', text: String(after), kind: after < before ? 'good' : 'bad', from: String(before), mark: after < before ? '▼' : '▲' }]);
  return lines;
}

/** 札の説明を 1 本の文字列にしたもの（旧 API。あそびかたの読み上げ・テスト用）。 */
export function cardTextFor(card: CardId, balance: Balance, level = 1): string {
  return flattenLines(cardLinesFor(card, balance, level));
}

/** 建物の効果の行（収入＝VP の行は含まない）。level はその Lv での値。 */
export function buildingEffectLinesRaw(building: BuildingId, b: Balance, level: number, compareTo?: number): TextLine[] {
  const mk = numMaker(level, compareTo);
  const eff = (key: Level2EffectKey, fmt?: (n: number) => string) => mk((lv) => buildingEffect(b, key, lv), fmt);
  switch (building) {
    case 'tradingHouse':
      return [[K('income'), ' ', eff('tradingHouseIncome', plus), '（VP とは別に）']];
    case 'wall':
      return [['徴税官を受けない'], ['封鎖は防げない（防げるのは城塞）'], [`衛兵: コスト ${b.guardCostWithWall}`]];
    case 'factory':
      return [['毎ターン、最初に使う人物カードのコスト ', eff('factoryDiscount', minus)]];
    case 'road':
      return [
        ['毎ターン開始時、手札を山の底へ送って補充 ', eff('roadUses'), ' 回まで'],
        [`伝令: コスト ${b.heraldCostWithRoad}`],
      ];
    case 'cathedral':
      return [['自分の他の物件 1 件につき VP ', eff('cathedralVpPerBuilding', plus)]];
    case 'fortress': {
      const d = b.districts.find((x) => x.slots.some((id) => b.market[id] === 'fortress'));
      return [[`${d ? d.name : 'この地区'}の自分の物件は`, K('blockade'), 'を受けない']];
    }
    case 'exchange':
      return [['「次の', K('income'), ' +X」の札はすべて さらに ', eff('exchangeBonus', plus)]];
    case 'quarry':
      return [['建築家を使ったターン、2 件目以降の建設費 さらに ', eff('quarryExtraDiscount', minus)]];
    case 'mine':
      return [['採掘師: コスト ', eff('mineMinerDiscount', minus), '、', K('income'), ' ', eff('mineMinerBonus', plus)]];
  }
}

/** 建物の詳細の 1 行目に固定する VP の行（VP ＝ 収入）。大聖堂だけ「他の物件につき」の式。 */
export function buildingVpLine(building: BuildingId, b: Balance, level: number, compareTo?: number): TextLine {
  const mk = numMaker(level, compareTo);
  if (building === 'cathedral') {
    return ['VP: 他の物件 1 件につき ', mk((lv) => buildingEffect(b, 'cathedralVpPerBuilding', lv), plus)];
  }
  return ['VP ', mk((lv) => buildingVp(b, building, lv)), '（＝', K('income'), '）'];
}

/** 建物の説明（行の配列）。withVp なら 1 行目に VP（＝収入）の行。 */
export function buildingLinesFor(building: BuildingId, balance: Balance, level = 1, withVp = true): TextLine[] {
  const lines = buildingEffectLinesRaw(building, balance, level);
  return withVp ? [buildingVpLine(building, balance, level), ...lines] : lines;
}

/** 次の Lv で変わる行だけ（VP の行を先頭に固定）。最大 Lv なら空。大聖堂は VP の行が式なので、効果の行と重なる分は 1 行にまとめる。 */
export function buildingUpgradeLines(building: BuildingId, balance: Balance, level: number): TextLine[] {
  if (level >= balance.maxLevel) return [];
  const vp = buildingVpLine(building, balance, level + 1, level);
  const eff = buildingEffectLinesRaw(building, balance, level + 1, level).filter(lineHasDiff);
  const out: TextLine[] = [];
  if (lineHasDiff(vp)) out.push(vp);
  if (building !== 'cathedral') out.push(...eff);
  return out;
}

/** 建物の効果文（VP の行を含まない旧 API）。 */
export function buildingTextFor(building: BuildingId, balance: Balance, level = 1): string {
  return flattenLines(buildingEffectLinesRaw(building, balance, level));
}

export function buildingEffectTextFor(building: BuildingId, balance: Balance, level = 1): string {
  return buildingTextFor(building, balance, level);
}

/** 札の Lv の進み具合。xp は累計の使用回数。filled=今の段で貯めた回数、total=その段の必要回数。最大 Lv なら null。 */
export function levelProgress(balance: Balance, xp: number): { filled: number; total: number } | null {
  const [l2, l3] = balance.cardLevelUses;
  if (xp >= l3) return null;
  if (xp >= l2) return { filled: xp - l2, total: l3 - l2 };
  return { filled: Math.min(xp, l2), total: l2 };
}

/** ★の 3 枠。level=2 なら ★★☆。 */
export function starSlots(level: number, max = 3): string {
  const n = Math.max(0, Math.min(max, level));
  return '★'.repeat(n) + '☆'.repeat(max - n);
}

/** 点（●○）。filled 個を塗る。 */
export function progressDots(filled: number, total: number): string {
  const f = Math.max(0, Math.min(total, filled));
  return '●'.repeat(f) + '○'.repeat(total - f);
}
