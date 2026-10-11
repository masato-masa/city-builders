import { motion } from 'motion/react';

import type { Balance } from '@/game/balance';
import { type TipId, tipText } from '@/meta/onboarding';

/** 最初の 1 戦の手引きの吹き出し。相手の情報ボードの上に重ねる（盤面・自分のコイン・手札を隠さない）。
 *  自分の手番の間、相手の帯は動かないので、そこを借りる。タップで閉じる。下の操作は止めない。 */
export function TipBubble({ tip, balance, onClose }: { tip: TipId; balance: Balance; onClose: () => void }) {
  const { title, body } = tipText(tip, balance);
  return (
    <motion.button
      type="button"
      className="tip-bubble"
      data-tip={tip}
      role="status"
      aria-label={`${title}。${body}。タップで閉じる`}
      onClick={onClose}
      initial={{ opacity: 0, y: -10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, pointerEvents: 'none', transition: { duration: 0.14 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
    >
      <span className="tip-bubble-mark" aria-hidden="true">
        !
      </span>
      <span className="tip-bubble-body">
        <span className="tip-bubble-title">{title}</span>
        <span className="tip-bubble-text">{body}</span>
      </span>
      <span className="tip-bubble-close" aria-hidden="true">
        タップで閉じる
      </span>
    </motion.button>
  );
}
