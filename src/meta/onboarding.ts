// 最初の 1 戦の手引き。どの場面でどの吹き出しを出すかを決める純粋関数だけを置く（React・保存に触らない）。
//
// 方針:
// - 実際の対戦の中で、その場面が来たときに 1 つずつ出す（一度に 1 つ）。
// - 自分の手番で、演出の途中でも操作中でもないときだけ出す（操作を止めない）。
// - 出した手引きは、タップ・教えた操作をした・手番を終えた、のどれかで閉じて「見た」にする。
// - 1 戦を最後まで終えたら、残りは出さない。

import type { Difficulty } from '@/ai/choose';
import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { canBuild, canUpgrade } from '@/game/reducer';
import type { Action, GameState, PlayerId } from '@/game/types';

export type TipId = 'drag' | 'build' | 'invest' | 'acquire' | 'district' | 'upgrade';

/** 出す順（同時に条件を満たしたら前のものから）。 */
export const TIP_ORDER: readonly TipId[] = ['drag', 'build', 'invest', 'acquire', 'district', 'upgrade'];

export interface Onboarding {
  /** 見た（閉じた）手引き */
  seen: TipId[];
  /** 手引きつきで 1 戦を最後まで終えた。true なら出さない */
  finished: boolean;
  /** テスト用メニューの「もう一度」。戦績があっても出す */
  replay: boolean;
}

export function emptyOnboarding(): Onboarding {
  return { seen: [], finished: false, replay: false };
}

/** 手引きを出す試合か。すでに対戦の記録がある人（この機能より前から遊んでいる人）には出さない。 */
export function tipsActive(onb: Onboarding, playedMatches: number): boolean {
  if (onb.finished) return false;
  return onb.replay || playedMatches === 0;
}

/** その手引きの場面が来ているか（自分の手番の盤面だけを見る）。 */
export function tipTriggered(
  id: TipId,
  state: GameState,
  balance: Balance = DEFAULT_BALANCE,
  viewer: PlayerId = 'you',
): boolean {
  const me = state.players[viewer];
  switch (id) {
    case 'drag':
      return true;
    case 'build':
      return state.market.some((s) => s.owner === null && canBuild(state, s.slotId, balance));
    case 'invest':
      return me.pendingIncome.length > 0;
    case 'acquire':
      return state.market.some((s) => s.owner !== null && s.owner !== viewer);
    case 'district':
      return state.market.some((s) => s.owner !== null);
    case 'upgrade':
      return state.market.some((s) => s.owner === viewer && canUpgrade(state, s.slotId, balance));
  }
}

/** いま出す手引き。出せる場面でなければ null。
 *  ready は「自分が操作できる間」（演出中・シート表示中・ドラッグ中でない）。 */
export function nextTip(
  state: GameState,
  seen: readonly TipId[],
  ready: boolean,
  balance: Balance = DEFAULT_BALANCE,
  viewer: PlayerId = 'you',
): TipId | null {
  if (!ready || state.phase !== 'playing' || state.current !== viewer) return null;
  return TIP_ORDER.find((id) => !seen.includes(id) && tipTriggered(id, state, balance, viewer)) ?? null;
}

/** その操作をしたら閉じる手引き（教えた操作をやったら、もう要らない）。 */
export function tipClosedBy(tip: TipId, action: Action['type']): boolean {
  switch (tip) {
    case 'drag':
    case 'invest':
      return action === 'useCard';
    case 'build':
    case 'district':
      return action === 'build';
    case 'acquire':
      return action === 'acquire';
    case 'upgrade':
      return action === 'upgrade';
  }
}

/** 手引きの文。短く 1〜2 文。 */
export function tipText(id: TipId, balance: Balance = DEFAULT_BALANCE): { title: string; body: string } {
  switch (id) {
    case 'drag':
      return { title: 'カードの使い方', body: 'カードは盤面へドラッグして使う。長押しで説明が見られる' };
    case 'build':
      return { title: '建てられる！', body: 'コインが足りる空き地がある。空き地をタップして建てよう' };
    case 'invest':
      return { title: '次の収入', body: 'このコインは今ではなく、自分の次のターンの始めに入る' };
    case 'acquire':
      return { title: '買収できる', body: '相手の物件もタップで買える。袋の数字が買収に要るコイン' };
    case 'district':
      return {
        title: '地区の称号',
        body: `端の名札は地区の件数（自分 対 相手）。多いほうに +${balance.districtTitleVp}VP`,
      };
    case 'upgrade':
      return {
        title: 'アップグレード',
        body: `自分の物件はタップで上げられる。Lv${balance.maxLevel} まで上げると買収されない`,
      };
  }
}

/** 見たものを足す（重複しない・順は見た順）。 */
export function withSeen(onb: Onboarding, id: TipId): Onboarding {
  return onb.seen.includes(id) ? onb : { ...onb, seen: [...onb.seen, id] };
}

/** 1 戦を最後まで終えた。 */
export function withFinished(onb: Onboarding): Onboarding {
  return { ...onb, finished: true, replay: false };
}

/** ホームで強調する難易度。はじめての人には「やさしい」を勧める（強制はしない。ほかも押せる）。 */
export function recommendedDifficulty(
  lastDifficulty: Difficulty,
  playedMatches: number,
  onb: Onboarding,
): { difficulty: Difficulty; tag: string } {
  if (playedMatches === 0 && !onb.finished) return { difficulty: 'easy', tag: 'はじめて' };
  return { difficulty: lastDifficulty, tag: '前回' };
}
