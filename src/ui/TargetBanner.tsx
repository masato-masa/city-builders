import { motion } from 'motion/react';

/** 対象選択モード中に出す、控えめな案内。封鎖者（盤面の区画を選ぶ）と
 *  伝令（手札のカードを選ぶ）の両方で使う。以前は <Sheet> で対象の一覧を
 *  出していたが、実物を直接タップして選ぶ方式に変えたので、案内だけを
 *  浮かせる。全画面を覆うオーバーレイは持たないので、タップはそのまま
 *  この下（盤面／手札）を通る。 */
export function TargetBanner({
  label = '封鎖モード中・相手の区画をタップ（このターンだけの効果）',
  onCancel,
}: {
  label?: string;
  onCancel: () => void;
}) {
  return (
    <motion.div
      className="target-banner"
      role="status"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, pointerEvents: 'none' }}
      transition={{ duration: 0.18 }}
    >
      <span>{label}</span>
      <button className="target-banner-cancel" onClick={onCancel}>
        やめる
      </button>
    </motion.div>
  );
}
