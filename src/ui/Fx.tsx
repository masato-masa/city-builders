// プレイ画面の演出の部品。どれも pointer-events: none の層に描き、操作を妨げない。
// 画面の寸法には一切関わらない（すべて absolute / fixed で重ねる）。

import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Aftermath } from './feel';
import { CARD_CHARGE_MS, CARD_CHARGE_SCALE, DELTA_POP_MS, tempo } from './tempo';

/* ---------------- 手番のバナー ---------------- */

export type BannerTone = 'you' | 'cpu';

export interface TurnBannerInfo {
  /** 出すたびに変える。同じ手番の 2 回目でも出し直せるように。 */
  id: number;
  tone: BannerTone;
  label: string;
  sub?: string;
}

/** 手番が替わった瞬間に盤面の中央を横切る帯。
 *  tempo().bannerMs の間出して抜ける。操作は一切止めない
 *  （pointer-events: none）。クラロワの帯（実測 青 #2764b2・赤 #a00e47、下端に 2px の濃い縁）に合わせた。 */
export function TurnBanner({ banner, onDone }: { banner: TurnBannerInfo | null; onDone: () => void }) {
  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(onDone, tempo().bannerMs);
    return () => window.clearTimeout(t);
  }, [banner?.id]);
  return (
    <div className="turn-banner-layer" aria-live="polite">
      <AnimatePresence>
        {banner ? (
          <motion.div
            key={banner.id}
            className={`turn-banner turn-banner-${banner.tone}`}
            initial={{ x: '-110%', skewX: -12, opacity: 0.6 }}
            animate={{ x: '0%', skewX: 0, opacity: 1 }}
            exit={{ x: '110%', skewX: 12, opacity: 0, transition: { duration: 0.2, ease: 'easeIn' } }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          >
            <motion.span
              className="turn-banner-label"
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.08, type: 'spring', stiffness: 600, damping: 14 }}
            >
              {banner.label}
            </motion.span>
            {banner.sub ? <span className="turn-banner-sub">{banner.sub}</span> : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** 手番の切り替わりを見張って、バナーを出す。初回（ゲーム開始）も出す。 */
export function useTurnBanner(key: string, make: () => Omit<TurnBannerInfo, 'id'> | null) {
  const [banner, setBanner] = useState<TurnBannerInfo | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const next = make();
    if (!next) return;
    seq.current += 1;
    setBanner({ ...next, id: seq.current });
  }, [key]);
  const clear = useCallback(() => setBanner(null), []);
  return [banner, clear] as const;
}

/* ---------------- カードが盤面へ飛ぶ ---------------- */

interface Flight {
  id: number;
  /** 'use' は使った札が盤面へ飛んで弾ける。'discard' は山の底へ送る札が「次」の札へ小さくなって消える。 */
  mode: 'use' | 'discard';
  art: string;
  from: { x: number; y: number; w: number; h: number };
  to: { x: number; y: number };
  /** 飛ぶ長さ（秒）。出した時点の速さの設定で決める。 */
  durationS: number;
}

/** 手札のカードを使ったとき、その絵が盤面の中央へ飛んで弾ける演出。
 *  手札の札そのものは即座に入れ替わるので、見た目だけの複製を fixed で飛ばす。 */
export function useCardFlights() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const seq = useRef(0);
  const fly = useCallback((fromEl: Element | null, art: string | undefined, toEl: Element | null, mode: 'use' | 'discard' = 'use') => {
    if (!fromEl || !art || !toEl) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    seq.current += 1;
    const id = seq.current;
    const t = tempo();
    // 使う札は効果の反映（cardEffectDelayMs）と同じ時刻に着く。捨てる札は cardFlightS。
    const durationS = mode === 'discard' ? t.cardFlightS : t.cardEffectDelayMs / 1000;
    setFlights((prev) => [
      ...prev,
      {
        id,
        mode,
        art,
        from: { x: a.left, y: a.top, w: a.width, h: a.height },
        to: mode === 'discard' ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : { x: b.left + b.width / 2, y: b.top + b.height * 0.45 },
        durationS,
      },
    ]);
    window.setTimeout(() => setFlights((prev) => prev.filter((f) => f.id !== id)), durationS * 1000 + 400);
  }, []);
  return { flights, fly };
}

export function CardFlightLayer({ flights }: { flights: Flight[] }) {
  return (
    <div className="fx-layer" aria-hidden="true">
      {flights.map((f) => {
        const dx = f.to.x - (f.from.x + f.from.w / 2);
        const dy = f.to.y - (f.from.y + f.from.h / 2);
        if (f.mode === 'discard') {
          return (
            <motion.img
              key={f.id}
              className="fx-card fx-card-discard"
              src={f.art}
              alt=""
              style={{ left: f.from.x, top: f.from.y, width: f.from.w, height: f.from.h }}
              initial={{ x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }}
              animate={{
                x: [0, dx * 0.45, dx],
                y: [0, dy * 0.45 - 24, dy],
                scale: [1, 1.12, 0.3],
                rotate: [0, 8, 26],
                opacity: [1, 1, 0],
              }}
              transition={{ duration: f.durationS, times: [0, 0.4, 1], ease: 'easeInOut' }}
            />
          );
        }
        // 3 段の 1・2 段目。溜め（その場で 0.9 倍に縮んで光る）→ 発動（盤面へ飛んで弾ける）。
        // 3 段目の余韻（数字）は効果を反映した時点で AftermathLayer が出す。
        const total = f.durationS;
        const c = CARD_CHARGE_MS / 1000 / total;
        return (
          <div key={f.id}>
            <motion.img
              className="fx-card"
              src={f.art}
              alt=""
              style={{ left: f.from.x, top: f.from.y, width: f.from.w, height: f.from.h }}
              initial={{ x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, filter: 'brightness(1)' }}
              animate={{
                x: [0, 0, dx * 0.5, dx],
                y: [0, 0, dy * 0.5 - 40, dy],
                scale: [1, CARD_CHARGE_SCALE, 1.3, 0.85],
                rotate: [0, 0, -6, 0],
                opacity: [1, 1, 1, 0],
                filter: ['brightness(1)', 'brightness(1.7)', 'brightness(1.25)', 'brightness(1)'],
              }}
              transition={{ duration: total, times: [0, c, c + (1 - c) * 0.55, 1], ease: 'easeOut' }}
            />
            <motion.span
              className="fx-burst"
              style={{ left: f.to.x, top: f.to.y }}
              initial={{ scale: 0.2, opacity: 0 }}
              animate={{ scale: [0.2, 1.6], opacity: [0, 0.9, 0] }}
              transition={{ delay: total * 0.88, duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- 相手が何をしたか ---------------- */

export interface CpuCalloutInfo {
  id: number;
  art?: string;
  /** 誰の出来事か（帯の色）。省略は相手（CPU）。自分の収入も同じ帯で出す。 */
  tone?: 'you' | 'cpu';
  /** 'card' は縦長のカード枠、'building' は台座なしの建物の絵、'coin' はコインの絵。 */
  kind: 'card' | 'building' | 'coin' | 'none';
  text: string;
}

/** CPU の 1 手を、盤面の上端中央に「絵 + 帯」で大きく出す。
 *  ログの文字だけでは追えないという指摘（要望 7）への上乗せ。次の 1 手が来たら差し替わる。 */
export function CpuCallout({
  info,
  placement = 'board',
}: {
  info: CpuCalloutInfo | null;
  /** 'board' は盤面の上端中央。'strip' は相手の情報ボードの右側（行動ログの上）に横並びで出し、
   *  盤面の建物を隠さない（UX の指摘）。 */
  placement?: 'board' | 'strip';
}) {
  const strip = placement === 'strip';
  return (
    <div className={`cpu-callout-layer${strip ? ' is-strip' : ''}`} aria-hidden="true">
      <AnimatePresence>
        {info ? (
          <motion.div
            key={info.id}
            className={`cpu-callout cpu-callout-${info.tone ?? 'cpu'}`}
            initial={strip ? { opacity: 0, x: 24, scale: 0.8 } : { opacity: 0, y: -30, scale: 0.7 }}
            animate={strip ? { opacity: 1, x: 0, scale: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.9, transition: { duration: 0.16 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 26 }}
          >
            {info.art ? (
              <img className={`cpu-callout-art cpu-callout-art-${info.kind}`} src={info.art} alt="" />
            ) : null}
            <span className="cpu-callout-text">{info.text}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- カード使用の余韻 ---------------- */

interface AftermathPop extends Aftermath {
  id: number;
  x: number;
  y: number;
  ms: number;
}

/** カード使用の 3 段目。効果を反映した時点で、盤面の着地点に「次の収入 +3」のような一言を出して消す。
 *  操作は止めない（pointer-events: none）。skip で即座に消す（盤面のどこかを触ったとき）。 */
export function useAftermath() {
  const [pops, setPops] = useState<AftermathPop[]>([]);
  const seq = useRef(0);
  const show = useCallback((info: Aftermath | null, at: Element | null, ms: number) => {
    if (!info || !at || ms <= 0) return;
    const r = at.getBoundingClientRect();
    seq.current += 1;
    const id = seq.current;
    setPops([{ ...info, id, x: r.left + r.width / 2, y: r.top + r.height * 0.45, ms }]);
    window.setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), ms);
  }, []);
  const skip = useCallback(() => setPops((p) => (p.length > 0 ? [] : p)), []);
  return { pops, show, skip };
}

export function AftermathLayer({ pops }: { pops: AftermathPop[] }) {
  return (
    <div className="fx-layer" aria-hidden="true">
      <AnimatePresence>
        {pops.map((p) => (
          <motion.span
            key={p.id}
            className={`fx-aftermath is-${p.tone}`}
            style={{ left: p.x, top: p.y }}
            initial={{ opacity: 0, scale: 0.6, y: 0 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1.15, 1, 1], y: [0, -6, -14, -24] }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: p.ms / 1000, times: [0, 0.2, 0.7, 1], ease: 'easeOut' }}
          >
            {p.text}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- 数字の増減のポップ ---------------- */

export interface DeltaPop {
  id: number;
  value: number;
}

/** 値が変わるたびに +N / −N を 1 つ積む。0.9s で自動的に消える。 */
export function useDeltaPops(value: number) {
  const [pops, setPops] = useState<DeltaPop[]>([]);
  const prev = useRef(value);
  const seq = useRef(0);
  useEffect(() => {
    const d = value - prev.current;
    prev.current = value;
    if (d === 0) return;
    seq.current += 1;
    const id = seq.current;
    setPops((p) => [...p.slice(-2), { id, value: d }]);
    // 次の変化で消さない（連続で増減したときに前のポップが居残らないよう、個別に消す）。
    window.setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), DELTA_POP_MS + 50);
  }, [value]);
  return pops;
}

export function DeltaPops({ pops, unit = '' }: { pops: DeltaPop[]; unit?: string }) {
  return (
    <span className="delta-pops" aria-hidden="true">
      <AnimatePresence>
        {pops.map((p) => (
          <motion.span
            key={p.id}
            className={`delta-pop ${p.value > 0 ? 'is-up' : 'is-down'}`}
            initial={{ opacity: 0, y: 6, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: [6, -10, -18, -26], scale: [0.6, 1.2, 1, 1] }}
            exit={{ opacity: 0 }}
            transition={{ duration: DELTA_POP_MS / 1000, times: [0, 0.18, 0.7, 1], ease: 'easeOut' }}
          >
            {p.value > 0 ? `+${p.value}` : `−${Math.abs(p.value)}`}
            {unit}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}
