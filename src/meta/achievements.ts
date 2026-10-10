import type { Difficulty } from '@/ai/choose';
import type { CardId, GameState, PlayerId } from '@/game/types';
import type { MatchLog } from '@/ui/match-log';

/** 実績の判定に使うもの。すべて「あなた」（CPU 戦の人間側）から見る。 */
export interface AchievementContext {
  log: MatchLog;
  final: GameState;
  outcome: 'win' | 'lose' | 'draw';
  difficulty: Difficulty;
  /** この試合を含めた連勝数。 */
  streak: number;
}

export interface Achievement {
  id: string;
  name: string;
  /** 条件。一覧にそのまま出す（隠し実績は作らない）。 */
  text: string;
  test: (c: AchievementContext) => boolean;
}

const ME: PlayerId = 'you';

function myCards(c: AchievementContext) {
  return c.log.events.filter((e) => e.kind === 'card' && e.actor === ME).map((e) => (e.kind === 'card' ? e.card : null));
}

function mySlotEvents(c: AchievementContext, kind?: 'build' | 'upgrade' | 'acquire') {
  return c.log.events.filter(
    (e): e is Extract<typeof e, { kind: 'build' | 'upgrade' | 'acquire' }> =>
      e.kind !== 'card' && e.kind !== 'title' && e.actor === ME && (kind === undefined || e.kind === kind),
  );
}

const won = (c: AchievementContext) => c.outcome === 'win';
const usedCard = (c: AchievementContext, card: CardId) => myCards(c).includes(card);

/** 実績の一覧。並び順 = 一覧の表示順（やさしいもの → むずかしいもの）。
 *  低使用のカード（封鎖者・衛兵・伝令・買収者）を使ってみる動機になるものを混ぜている。 */
export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'firstWin', name: 'はじめの一歩', text: 'CPU に勝つ', test: won },
  { id: 'normalWin', name: '一人前の領主', text: 'ふつうの CPU に勝つ', test: (c) => won(c) && c.difficulty !== 'easy' },
  { id: 'hardWin', name: '名君', text: 'つよい CPU に勝つ', test: (c) => won(c) && c.difficulty === 'hard' },
  { id: 'streak3', name: '破竹の勢い', text: '3 連勝する', test: (c) => won(c) && c.streak >= 3 },
  {
    id: 'blockadeWin',
    name: '関所破り',
    text: '封鎖者を使って勝つ',
    test: (c) => won(c) && usedCard(c, 'blockader'),
  },
  {
    id: 'guardWin',
    name: '鉄壁',
    text: '衛兵を 2 回使って勝つ',
    test: (c) => won(c) && myCards(c).filter((x) => x === 'guard').length >= 2,
  },
  {
    id: 'heraldWin',
    name: '早馬',
    text: '伝令を使って勝つ',
    test: (c) => won(c) && usedCard(c, 'herald'),
  },
  {
    id: 'spyAcquire',
    name: '袖の下',
    text: '買収者を使ったターンに物件を買収する',
    test: (c) => {
      const spyTurns = new Set(
        c.log.events.filter((e) => e.kind === 'card' && e.actor === ME && e.card === 'spy').map((e) => e.turn),
      );
      return mySlotEvents(c, 'acquire').some((e) => spyTurns.has(e.turn));
    },
  },
  {
    id: 'acquire3',
    name: '乗っ取り屋',
    text: '物件を 3 件買収して勝つ',
    test: (c) => won(c) && mySlotEvents(c, 'acquire').length >= 3,
  },
  {
    id: 'level2x4',
    name: '二階建ての街',
    text: 'Lv2 の物件を 4 件持って勝つ',
    test: (c) => won(c) && c.final.market.filter((s) => s.owner === ME && s.level >= 2).length >= 4,
  },
  {
    id: 'festival2',
    name: 'お祭り騒ぎ',
    text: '祝祭のターンに建設・アップグレード・買収を 2 回する',
    test: (c) => {
      const perTurn = new Map<number, number>();
      for (const e of mySlotEvents(c)) {
        if (e.festival) perTurn.set(e.turn, (perTurn.get(e.turn) ?? 0) + 1);
      }
      return [...perTurn.values()].some((n) => n >= 2);
    },
  },
  {
    id: 'allTitles',
    name: '三地区の主',
    text: '3 つの地区の称号を全部持って勝つ',
    test: (c) => won(c) && c.final.titles.length >= 3 && c.final.titles.every((t) => t === ME),
  },
  {
    id: 'comeback',
    name: '大逆転',
    text: '10 VP 以上離されてから勝つ',
    test: (c) => won(c) && c.log.vp.some((p) => p.cpu - p.you >= 10),
  },
  {
    id: 'variety',
    name: '多芸',
    text: '1 試合で 7 種類のカードを使って勝つ',
    test: (c) => won(c) && new Set(myCards(c)).size >= 7,
  },
];

export const ACHIEVEMENT_IDS: readonly string[] = ACHIEVEMENTS.map((a) => a.id);

/** この試合で条件を満たした実績の id（既に持っているかは問わない）。 */
export function achievementsMet(c: AchievementContext): string[] {
  return ACHIEVEMENTS.filter((a) => a.test(c)).map((a) => a.id);
}

/** 新しく手に入った実績（一覧の順）。 */
export function newAchievements(c: AchievementContext, unlocked: readonly string[]): string[] {
  const have = new Set(unlocked);
  return achievementsMet(c).filter((id) => !have.has(id));
}

export function achievementName(id: string): string {
  return ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id;
}
