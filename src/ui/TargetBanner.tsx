import { motion } from 'motion/react';

/** 封鎖者の対象選択モード中に出す、控えめな案内（要望 G3）。
 *  以前はここで <Sheet> が対象の一覧を出していたが、盤面を直接タップして
 *  選ぶ方式に変えたので、画面上部に短い案内だけを浮かせる。全画面を覆う
 *  オーバーレイは持たないので、盤面のタップはそのままこの下を通る。 */
export function TargetBanner({ onCancel }: { onCancel: () => void }) {
  return (
    <motion.div
      className="target-banner"
      role="status"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, pointerEvents: 'none' }}
      transition={{ duration: 0.18 }}
    >
      <span>封鎖モード中・相手の区画をタップ（このターンだけの効果）</span>
      <button className="target-banner-cancel" onClick={onCancel}>
        やめる
      </button>
    </motion.div>
  );
}
