import type { Balance } from '@/game/balance';
import type { IncomeStage } from '@/game/reducer';

/** 収入の 1 段を、画面に出す 1 行の文にする（盤面の帯・CPU の実況ログで共通）。 */
export function stageText(stage: IncomeStage, balance: Balance): string {
  const { amount, festival, festivalExtra } = stage;
  switch (stage.kind) {
    case 'base':
      return festival && festivalExtra > 0
        ? `基礎収入 +${amount}（祝祭 +${festivalExtra}）`
        : `基礎収入 +${amount}`;
    case 'building':
      return festival
        ? `祝祭！建物収入が ${balance.festivalMultiplier} 倍 +${amount}`
        : `建物収入 +${amount}`;
    case 'invest':
      return `投資の収入 +${amount}`;
    case 'debt':
      return `高利貸の返済 −${Math.abs(amount)}`;
    case 'bind':
      return '買収者に手札を縛られた';
  }
}
