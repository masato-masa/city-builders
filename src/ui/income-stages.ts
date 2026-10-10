import type { Balance } from '@/game/balance';
import type { IncomeStage } from '@/game/reducer';

import { BUILDING_ART, cardArtOf, COIN_URL } from './art';
import type { CpuCalloutInfo } from './Fx';
import { stageText } from './income-text';
import { playUseCard } from './sound';

/** 収入の 1 段を見せる帯（盤面の上端）の中身。tone は誰の収入か（帯の色）。 */
export function stageCallout(
  stage: IncomeStage,
  balance: Balance,
  tone: 'you' | 'cpu',
  id: number,
): CpuCalloutInfo {
  const text = stageText(stage, balance);
  switch (stage.kind) {
    case 'base':
      return { id, tone, kind: 'coin', art: COIN_URL, text };
    case 'building':
      return stage.festival
        ? { id, tone, kind: 'card', art: cardArtOf('festival'), text }
        : { id, tone, kind: 'building', art: BUILDING_ART.tradingHouse?.url, text };
    case 'invest':
      return { id, tone, kind: 'card', art: cardArtOf(stage.cards[0] ?? 'miner'), text };
    case 'debt':
      return { id, tone, kind: 'card', art: cardArtOf('usurer'), text };
    case 'tax':
      return { id, tone, kind: 'card', art: cardArtOf('taxman'), text };
  }
}

/** 段が出た瞬間の効果音（コインの音は反映のときに別に鳴らす）。祝祭の効きだけ札の音。 */
export function playStageCue(stage: IncomeStage): void {
  if (stage.kind === 'building' && stage.festival) playUseCard('festival');
}
