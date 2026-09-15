import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useEffect } from 'react';

/** 増減をバネで転がすように見せる数字。文字列の差し替えだけなので、
 *  桁が増えても（1桁→3桁）自分の座標もまわりの座標も動かない。
 *  親側で min-width と font-variant-numeric: tabular-nums を持たせておくこと。 */
export function RollingNumber({ value, className }: { value: number; className?: string }) {
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, { stiffness: 260, damping: 30, mass: 0.9 });
  const rounded = useTransform(spring, (latest) => Math.round(latest));

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  return <motion.span className={className}>{rounded}</motion.span>;
}
