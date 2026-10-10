import { motion } from 'motion/react';
import type { ReactNode } from 'react';

import { playUiTap } from './sound';

/** 下から出て下へ帰るシート。呼び出し側で <AnimatePresence> に包み、
 *  一意な key を付けること（閉じるときの退場アニメーションのため）。
 *  閉じている最中は pointerEvents: 'none' にして、フェード中の見えない
 *  当たり判定がクリックを吸ってしまわないようにする。 */
export function Sheet({
  title,
  subtitle,
  children,
  onClose,
  anchor = 'center',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  /** 'bottom' は画面の下端に揃える。カード・区画のシートは中身の長さが毎回違うので、
   *  中央に置くと「使う」「建てる」の位置が毎回動く。下端に揃えて、最後に置く主ボタンを
   *  いつも同じ位置に出す（UX の指摘）。 */
  anchor?: 'center' | 'bottom';
}) {
  return (
    <motion.div
      className={anchor === 'bottom' ? 'overlay overlay-bottom' : 'overlay'}
      onClick={() => {
        // 外側をタップして閉じる
        playUiTap();
        onClose();
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.16 } }}
      // exit はバネではなく tween にする。バネは目標値に漸近するだけで、
      // 状況によっては「止まった」と判定されるまでに時間がかかることがある。
      // AnimatePresence は全ての exit アニメーションが終わるまで要素を
      // DOM に残す（その間だけ pointerEvents: none でクリックを吸わせない）ので、
      // tween にして退場時間を固定し、確実に一定時間で終わるようにする。
      exit={{ opacity: 0, pointerEvents: 'none', transition: { duration: 0.16 } }}
    >
      <motion.div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: '14%' }}
        animate={{ opacity: 1, y: 0, transition: { type: 'spring', stiffness: 440, damping: 40 } }}
        exit={{ opacity: 0, y: '14%', pointerEvents: 'none', transition: { duration: 0.18, ease: 'easeIn' } }}
      >
        <h2 className="sheet-title">{title}</h2>
        {subtitle ? <p className="sheet-subtitle">{subtitle}</p> : null}
        {children}
      </motion.div>
    </motion.div>
  );
}
