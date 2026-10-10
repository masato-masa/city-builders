import type { Balance } from '@/game/balance';
import type { IncomeStage } from '@/game/reducer';

/** 見込み収入の行（自分・相手の情報ボードの 2 段目）。用語は「次の収入」にそろえる
 *  （以前は「次ターン収入」。投資の説明と言い方が揃っていなかった）。 */
export function incomeLine(income: number): string {
  return `次の収入 ${income >= 0 ? `+${income}` : income}`;
}

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
    case 'tax':
      return `徴税官に徴収された −${Math.abs(amount)}`;
  }
}
