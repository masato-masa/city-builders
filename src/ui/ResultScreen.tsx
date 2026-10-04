import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useMemo } from 'react';

import { hapticTap } from './haptics';
import { CrownIcon, StarIcon } from './icons';
import { playUiTap } from './sound';

export interface ResultSide {
  /** 帯に出す名前（あなた／CPU、あお／あか）。 */
  name: string;
  vp: number;
  buildings: number;
  tone: 'you' | 'cpu';
}

/** 結果画面。クラロワの勝利画面（refs/image2.png）の構成に合わせた:
 *  上に相手の赤い帯、中央に VS、下に自分の青い帯。勝った側の帯に王冠が降り、
 *  VP は 0 から数え上がる。勝ったときは金の紙吹雪。
 *  帯の色は実測（青 #2764b2・下端 #133875 / 赤 #a00e47・下端 #671530）。
 *  閉じる途中はクリックを吸わない（pointerEvents: 'none'）。 */
export function ResultScreen({
  title,
  tone,
  top,
  bottom,
  winner,
  onRestart,
  onExit,
}: {
  title: string;
  /** 見出しの色。win = 金、lose = 灰青、draw = 白。 */
  tone: 'win' | 'lose' | 'draw';
  top: ResultSide;
  bottom: ResultSide;
  winner: 'top' | 'bottom' | null;
  onRestart: () => void;
  onExit: () => void;
}) {
  return (
    <motion.div
      className={`result result-${tone}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.25 } }}
      exit={{ opacity: 0, pointerEvents: 'none', transition: { duration: 0.18 } }}
    >
      {tone !== 'lose' ? <Confetti /> : null}
      <motion.h2
        className="result-title"
        initial={{ scale: 2.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 380, damping: 16 }}
      >
        {title}
      </motion.h2>

      <div className="result-sides">
        <ResultRibbon side={top} crowned={winner === 'top'} delay={0.3} from={-1} />
        <motion.span
          className="result-vs"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.55, type: 'spring', stiffness: 500, damping: 15 }}
        >
          VS
        </motion.span>
        <ResultRibbon side={bottom} crowned={winner === 'bottom'} delay={0.42} from={1} />
      </div>

      <motion.div
        className="result-actions"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.35, type: 'spring', stiffness: 420, damping: 30 }}
      >
        <button
          className="btn3d btn3d-yellow btn3d-lg"
          onClick={() => {
            playUiTap();
            hapticTap();
            onRestart();
          }}
        >
          <span className="btn3d-label">もう一度</span>
        </button>
        <button
          className="btn3d btn3d-blue btn3d-lg"
          onClick={() => {
            playUiTap();
            hapticTap();
            onExit();
          }}
        >
          <span className="btn3d-label">ホームへ</span>
        </button>
      </motion.div>
    </motion.div>
  );
}

function ResultRibbon({
  side,
  crowned,
  delay,
  from,
}: {
  side: ResultSide;
  crowned: boolean;
  delay: number;
  /** 入ってくる向き（-1 = 左から、1 = 右から）。 */
  from: -1 | 1;
}) {
  return (
    <motion.div
      className={`result-ribbon result-ribbon-${side.tone}${crowned ? ' is-winner' : ''}`}
      initial={{ x: `${from * 120}%`, opacity: 0 }}
      animate={{ x: '0%', opacity: 1 }}
      transition={{ delay, type: 'spring', stiffness: 360, damping: 30 }}
    >
      <span className="result-crown-slot">
        {crowned ? (
          <motion.span
            className="result-crown"
            initial={{ y: -90, scale: 1.6, opacity: 0, rotate: -20 }}
            animate={{ y: 0, scale: 1, opacity: 1, rotate: 0 }}
            transition={{ delay: 1.0, type: 'spring', stiffness: 420, damping: 13 }}
          >
            <CrownIcon />
          </motion.span>
        ) : null}
      </span>
      <span className="result-name">{side.name}</span>
      <span className="result-vp">
        <StarIcon className="result-vp-star" />
        <CountUp to={side.vp} delay={delay + 0.35} />
        <span className="result-vp-unit">VP</span>
      </span>
      <span className="result-buildings">物件 {side.buildings} 件</span>
    </motion.div>
  );
}

function CountUp({ to, delay }: { to: number; delay: number }) {
  const v = useMotionValue(0);
  const text = useTransform(v, (x) => Math.round(x));
  useEffect(() => {
    const c = animate(v, to, { delay, duration: 0.7, ease: 'easeOut' });
    return () => c.stop();
  }, [to]);
  return <motion.span className="result-vp-num">{text}</motion.span>;
}

/** 紙吹雪。位置・色・回転は番号から決め打ちで作る（毎回同じ降り方。乱数を使わない）。 */
const CONFETTI_COLORS = ['#ffd84a', '#ffb800', '#4fb0ff', '#ff5a7a', '#ffffff', '#7fe0a0'];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => {
        // 黄金比で散らすと、乱数無しでも偏りなく広がる。
        const u = (i * 0.618034) % 1;
        const w = (i * 0.414214) % 1;
        return {
          left: u * 100,
          delay: 0.15 + w * 1.2,
          duration: 2.4 + ((i * 0.7548) % 1) * 1.6,
          drift: (w - 0.5) * 120,
          spin: (i % 2 ? 1 : -1) * (360 + w * 540),
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          size: 6 + (i % 3) * 2,
        };
      }),
    [],
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="confetti-piece"
          style={{ left: `${p.left}%`, width: p.size, height: p.size * 0.55, background: p.color }}
          initial={{ y: '-10vh', x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '110vh', x: p.drift, rotate: p.spin, opacity: [1, 1, 0.8] }}
          transition={{ delay: p.delay, duration: p.duration, ease: 'linear', repeat: 1, repeatDelay: 0.2 }}
        />
      ))}
    </div>
  );
}
