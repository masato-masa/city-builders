import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/** 下から出て下へ帰るシート。呼び出し側で <AnimatePresence> に包み、
 *  一意な key を付けること（閉じるときの退場アニメーションのため）。
 *  閉じている最中は pointerEvents: 'none' にして、フェード中の見えない
 *  当たり判定がクリックを吸ってしまわないようにする。 */
export function Sheet({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="overlay"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, pointerEvents: 'none' }}
      transition={{ duration: 0.16 }}
    >
      <motion.div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: '14%' }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: '14%', pointerEvents: 'none' }}
        transition={{ type: 'spring', stiffness: 440, damping: 40 }}
      >
        <h2 className="sheet-title">{title}</h2>
        {subtitle ? <p className="sheet-subtitle">{subtitle}</p> : null}
        {children}
      </motion.div>
    </motion.div>
  );
}
