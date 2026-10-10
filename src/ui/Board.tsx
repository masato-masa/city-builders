import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { BUILDING_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { buildCostFor } from '@/game/reducer';
import { districtCounts, titleHolder, vpOfSlot } from '@/game/selectors';
import type { GameState, PlayerId } from '@/game/types';

import { BUILDING_ART } from './art';
import {
  DISTRICT_TAGS,
  PLOTS,
  PLOT_HEIGHT,
  PLOT_WIDTH,
  STREET_JUNCTIONS,
  STREET_Y,
  STUBS,
  districtBorders,
  rowOf,
  type Segment,
} from './board-layout';
import { ChainIcon, CoinBagIcon, UpArrowIcon } from './icons';
import { isMaxLevel, plotFigures } from './slot-actions';
import { playTitle } from './sound';

/** 称号の持ち主が替わったら音を鳴らす（盤面に見えた瞬間に合わせるため、盤面が受け取る状態で見る）。
 *  viewer が取ったら明るく、奪われたら沈む。最初の描画と、誰も持っていない → 持つ、の両方で鳴らす
 *  （初めて取ったときも称号が動いた瞬間）。 */
function useTitleCue(state: GameState, viewer: PlayerId) {
  const prev = useRef(state.titles);
  useEffect(() => {
    const before = prev.current;
    prev.current = state.titles;
    if (before === state.titles || !before) return;
    const changed = state.titles.findIndex((t, i) => t !== null && t !== (before[i] ?? null));
    if (changed < 0) return;
    playTitle(state.titles[changed] === viewer);
  }, [state.titles, viewer]);
}

/** 大聖堂だけ VP が「自分の他の物件 1 件につき +N」で決まるため、未所有だと
 *  vpOfSlot が 0 を返す。未建設のときだけ、その決まり方が分かる表示に変える
 *  （要望 5。ここだけ建設前後で文字の内容が変わる、唯一の例外）。 */
function vpTextFor(state: GameState, slotId: number, balance: Balance): string {
  const slot = state.market[slotId]!;
  if (slot.owner === null) {
    // vpOfSlot は未所有だと必ず 0 を返す（大聖堂に限らず）ので、未建設のときは
    // balance 側の基準値を出す。大聖堂だけ基準値が 0（自分の他の物件 1 件に
    // つき +N で決まるため）なので、決まり方が分かる形に変える。
    if (slot.buildingId === 'cathedral') return `+${balance.cathedralVpPerBuilding}/件`;
    return `${balance.buildings[slot.buildingId].vp} VP`;
  }
  return `${vpOfSlot(state, slot, balance)} VP`;
}

/** 区画の箱の位置。transform を使わずに left/top/width/height で置く。
 *  transform を掛けると区画ごとに重なりの文脈ができ、z-index で
 *  「下の段ほど手前」を作れなくなる。 */
function boxStyle(i: number): CSSProperties {
  const p = PLOTS[i]!;
  return {
    left: `${(p.x - PLOT_WIDTH / 2) * 100}%`,
    top: `${(p.y - PLOT_HEIGHT / 2) * 100}%`,
    width: `${PLOT_WIDTH * 100}%`,
    height: `${PLOT_HEIGHT * 100}%`,
  };
}

/** 着地の土埃。角度を等分して決め打ちにする（毎回同じ形で出る）。 */
const DUST = Array.from({ length: 10 }, (_, k) => {
  const a = (k / 10) * Math.PI * 2 + 0.3;
  const r = k % 2 === 0 ? 1 : 0.7;
  return { dx: Math.cos(a) * 34 * r, dy: Math.sin(a) * 13 * r, size: k % 3 === 0 ? 9 : 6 };
});

/** 道。通り（横）は中立の石畳色。台座から伸びる縦の道と、同じ持ち主の区画どうしを
 *  つなぐ通りの区間は持ち主の色に塗る（クラロワで陣地ごとに道の色が違うのと同じ）。
 *  座標は viewBox 100×150（盤面 2:3）。 */
function Roads({ state, borders }: { state: GameState; borders: Segment[] }) {
  const owner = (slotId: number) => state.market[slotId]?.owner ?? null;
  const Y = (y: number) => y * 150;
  const X = (x: number) => x * 100;
  const streetX1 = (s: number) => X(STREET_JUNCTIONS[s]![0]!.x);
  const streetX2 = (s: number) => X(STREET_JUNCTIONS[s]!.at(-1)!.x);
  const segments: { x1: number; x2: number; y: number; owner: PlayerId }[] = [];
  STREET_JUNCTIONS.forEach((js, s) => {
    for (let k = 0; k + 1 < js.length; k++) {
      const a = owner(js[k]!.slotId);
      if (a !== null && a === owner(js[k + 1]!.slotId)) {
        segments.push({ x1: js[k]!.x, x2: js[k + 1]!.x, y: STREET_Y[s]!, owner: a });
      }
    }
  });
  return (
    <svg className="board-roads" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true">
      {/* 縁（暗い線）→ 路面 の 2 回描きで、道に縁石の段差を付ける。 */}
      <g className="road-edge">
        {STREET_Y.map((y, s) => (
          <line key={`se${y}`} x1={streetX1(s) - 1.6} x2={streetX2(s) + 1.6} y1={Y(y)} y2={Y(y)} />
        ))}
        {STUBS.map((s, k) => (
          <line key={`te${k}`} x1={X(s.x)} x2={X(s.x)} y1={Y(s.y1)} y2={Y(s.y2)} />
        ))}
      </g>
      <g className="road-fill">
        {STREET_Y.map((y, s) => (
          <line key={`sf${y}`} x1={streetX1(s) - 0.9} x2={streetX2(s) + 0.9} y1={Y(y)} y2={Y(y)} />
        ))}
        {STUBS.map((s, k) => (
          <line key={`tf${k}`} x1={X(s.x)} x2={X(s.x)} y1={Y(s.y1)} y2={Y(s.y2)} />
        ))}
      </g>
      {segments.map((seg, k) => (
        <line
          key={`o${k}`}
          className={`road-owner owner-${seg.owner}`}
          x1={X(seg.x1)}
          x2={X(seg.x2)}
          y1={Y(seg.y)}
          y2={Y(seg.y)}
        />
      ))}
      {STUBS.map((s, k) => {
        const o = owner(s.slotId);
        return o === null ? null : (
          <line
            key={`o-t${k}`}
            className={`road-owner owner-${o}`}
            x1={X(s.x)}
            x2={X(s.x)}
            y1={Y(s.y1)}
            y2={Y(s.y2)}
          />
        );
      })}
      {/* 地区の境界。道の上に細い点線で重ねる（持ち主の色は使わない。識別色は台座・旗・道が持つ）。 */}
      <g className="district-border">
        {borders.map((b, k) => (
          <line key={`d${k}`} x1={X(b.x1)} x2={X(b.x2)} y1={Y(b.y1)} y2={Y(b.y2)} />
        ))}
      </g>
    </svg>
  );
}

/** 地区の名札と称号の旗。盤面の端（建物の無いところ）に縦書きで置く。
 *  称号の持ち主が替わった瞬間だけ、名札が弾んで「称号 +N」の札が浮かぶ（どちらも絶対配置で、寸法は動かない）。 */
function DistrictTag({
  index,
  name,
  holder,
  counts,
  titleVp,
  viewer,
}: {
  index: number;
  name: string;
  holder: PlayerId | null;
  counts: Record<PlayerId, number>;
  titleVp: number;
  viewer: PlayerId;
}) {
  const foe = viewer === 'you' ? 'cpu' : 'you';
  const pos = DISTRICT_TAGS[Math.min(index, DISTRICT_TAGS.length - 1)]!;
  const [prev, setPrev] = useState(holder);
  const [moved, setMoved] = useState(0);
  if (holder !== prev) {
    setPrev(holder);
    if (holder !== null) setMoved((n) => n + 1);
  }
  const style: CSSProperties = { top: `${pos.top * 100}%`, [pos.side]: '1.2%' };
  return (
    <span
      className={`district-tag side-${pos.side}${holder ? ` owner-${holder}` : ' is-unclaimed'}`}
      style={style}
      data-district={index}
      aria-label={`${name} ${holder ? `称号 ${holder === viewer ? '自分' : '相手'}` : '称号なし'}（自分 ${counts[viewer]} 件・相手 ${counts[foe]} 件）`}
    >
      <motion.span
        key={`pop-${moved}`}
        className="district-tag-body"
        initial={moved > 0 ? { scale: 1 } : false}
        animate={moved > 0 ? { scale: [1, 1.35, 0.95, 1] } : { scale: 1 }}
        transition={{ duration: 0.6, times: [0, 0.3, 0.7, 1], ease: 'easeOut' }}
      >
        <span className="district-flag" aria-hidden="true">
          {holder ? <Flag owner={holder} /> : <span className="district-flag-empty" />}
        </span>
        <span className="district-name">{name}</span>
        {/* 件数「自分 対 相手」。多い側に称号（+N VP）。色は持ち主の明るい版（識別色そのものは変えない）。 */}
        <span className="district-count" aria-hidden="true">
          <span className={`district-count-n owner-${viewer}`}>{counts[viewer]}</span>
          <span className="district-count-vs">対</span>
          <span className={`district-count-n owner-${foe}`}>{counts[foe]}</span>
        </span>
        <span className="district-vp">+{titleVp}</span>
      </motion.span>
      {moved > 0 && holder ? (
        <motion.span
          key={`chip-${moved}`}
          className={`district-chip owner-${holder}`}
          aria-hidden="true"
          initial={{ opacity: 0, y: 6, scale: 0.6 }}
          animate={{ opacity: [0, 1, 1, 0], y: [6, -4, -10, -18], scale: [0.6, 1.15, 1, 1] }}
          transition={{ duration: 1.4, times: [0, 0.2, 0.75, 1], ease: 'easeOut' }}
        >
          称号 +{titleVp}
        </motion.span>
      ) : null}
    </span>
  );
}

/** 所有者の旗。台座の手前右の角に立てる。 */
function Flag({ owner }: { owner: PlayerId }) {
  return (
    <svg className={`plot-flag owner-${owner}`} viewBox="0 0 14 22" aria-hidden="true">
      <rect x="1" y="1" width="1.6" height="21" rx="0.8" className="plot-flag-pole" />
      <path className="plot-flag-cloth" d="M2.6 2 C6 1 8 3.4 13 2.2 L11 6 L13 9.6 C8 10.8 6 8.4 2.6 9.4 Z" />
    </svg>
  );
}

/** 収入で光らせる区画。id が変わるたびに出し直す。festival は祝祭で建物収入が増えたとき。 */
export interface IncomeFlash {
  id: number;
  slots: number[];
  festival: boolean;
}

function PlotView({
  state,
  slotId,
  balance,
  viewer,
  highlighted,
  flash,
  targeting,
  onPick,
}: {
  state: GameState;
  slotId: number;
  balance: Balance;
  viewer: PlayerId;
  highlighted: boolean;
  /** 収入の段でこの区画が元になっているとき、その光（無ければ null）。 */
  flash: IncomeFlash | null;
  targeting: boolean;
  onPick: (slotId: number) => void;
}) {
  const slot = state.market[slotId]!;
  const owner = slot.owner;
  const owned = owner !== null;

  // 持ち主が付いた（変わった）瞬間だけ着地の演出を出す。描画中に前回の値と
  // 比べて数え上げる（effect で後から立てると、一瞬だけ着地後の絵が出てから
  // 跳ね上がる）。最初の描画では数えないので、画面を開いただけでは降ってこない。
  // 空き地から建ったときだけ落とす。持ち主が替わった（買収）ときは建物は動かさず、
  // 札が元の持ち主の側から新しい持ち主の側へ移る演出を出す。
  const [prevOwner, setPrevOwner] = useState(owner);
  const [landing, setLanding] = useState(0);
  const [acquired, setAcquired] = useState<{ n: number; from: PlayerId; to: PlayerId } | null>(null);
  if (owner !== prevOwner) {
    setPrevOwner(owner);
    if (owner !== null && prevOwner === null) setLanding((n) => n + 1);
    else if (owner !== null && prevOwner !== null) {
      setAcquired((a) => ({ n: (a?.n ?? 0) + 1, from: prevOwner, to: owner }));
    }
  }
  // Lv が上がった瞬間だけ「光って少し膨らむ」。最初の描画では出さない。
  const [prevLevel, setPrevLevel] = useState(slot.level);
  const [upgraded, setUpgraded] = useState(0);
  if (slot.level !== prevLevel) {
    setPrevLevel(slot.level);
    if (owned && slot.level > prevLevel) setUpgraded((n) => n + 1);
  }
  // Lv が上がっている印（星）。最大かどうかは upgradePriceOf が Infinity かで見る（レベル数を直書きしない）。
  const leveled = owned && slot.level >= 2;
  const maxed = owned && isMaxLevel(state, slotId, balance);
  const figures = plotFigures(state, slotId, viewer, balance, (id) => buildCostFor(state, viewer, id, balance));

  // 封鎖中の空き地。blockedSlot は「押せない」判定のためプレイヤーごとに
  // 持つ値だが、盤面はどちらの操作でも同じ 1 枚を共有しているので、
  // 自分が押さえた／相手に押さえられたのどちらでも見えるよう、両者を見る
  // （disabled と同じ考え方。viewer 側だけ見ると、自分が封鎖者を使って
  // 相手を止めたときに何も見えなくなってしまう）。
  const blocked =
    !owned && (state.players.you.blockedSlot === slotId || state.players.cpu.blockedSlot === slotId);
  // 封鎖者に効果を止められている自分の物件（要望 G2）。所有者本人の
  // disabledSlot で判定する（viewer とは無関係。盤面はどちらの操作でも
  // 同じ 1 枚を共有しているため）。
  const disabled = owned && state.players[owner].disabledSlot === slotId;
  // 封鎖者の対象選択中は、自分の区画以外がタップできる対象になる。
  const targetable = targeting && owner !== viewer;
  const targetInvalid = targeting && owner === viewer;
  const art = BUILDING_ART[slot.buildingId];
  // 建った区画は plot-art の alt="" で物件名が読み上げに出ないので、
  // ボタン自体に物件名と VP を含む aria-label を付ける。
  const vpText = vpTextFor(state, slotId, balance);
  const figureText =
    figures.kind === 'unbuilt'
      ? ` 建設 ${figures.build} コイン`
      : ` 買収 ${figures.value} コイン${figures.upgrade !== null ? `・アップグレード ${figures.upgrade} コイン` : ''}`;
  const ariaLabel = `${BUILDING_NAMES[slot.buildingId]}${leveled ? ` Lv${slot.level}` : ''}${maxed ? '（最大）' : ''} ${vpText}${figureText}${disabled ? ' 効果停止中' : ''}${blocked ? ' 封鎖中' : ''}`;
  const stateClass = [
    blocked ? 'is-blocked' : null,
    disabled ? 'is-disabled' : null,
    targetInvalid ? 'is-target-invalid' : null,
  ];
  const ownerClass = owned ? ` owner-${owner}` : ' is-unbuilt';
  const box = boxStyle(slotId);
  // 下の段ほど手前に描く。建物の屋根が上の段の足元に掛かっても自然に見える。
  const z = 10 + rowOf(slotId) * 10;

  // 買収: 元の持ち主の色の札が、元の持ち主の側（盤面の上か下）から区画へ来て、
  // 新しい持ち主の色に替わり、新しい持ち主の側へ抜ける。下の段の区画に隠れないよう、
  // 名前・VP と同じ手前の層（plot-labels）に描く。
  const deed = acquired ? (
    <span key={`deed-${acquired.n}`} className="plot-deed-track">
      {(['from', 'to'] as const).map((which) => {
        const fromDy = acquired.from === 'cpu' ? -44 : 44;
        const toDy = -fromDy;
        const color = which === 'from' ? acquired.from : acquired.to;
        return (
          <motion.span
            key={which}
            className={`plot-deed owner-${color}`}
            initial={{ y: fromDy, opacity: 0, scale: 0.7 }}
            animate={{
              y: [fromDy, 0, 0, 0, toDy * 0.5, toDy * 0.6],
              opacity: which === 'from' ? [0, 1, 1, 0, 0, 0] : [0, 0, 0, 1, 1, 0],
              scale: [0.7, 1.15, 1.15, 1.15, 1, 0.9],
            }}
            transition={{ duration: 1.4, times: [0, 0.3, 0.45, 0.6, 0.85, 1], ease: 'easeInOut' }}
          >
            買収
          </motion.span>
        );
      })}
    </span>
  ) : null;

  return (
    <>
      <button
        className={['plot', ...stateClass, targetable ? 'is-targetable' : null].filter(Boolean).join(' ')}
        style={{ ...box, zIndex: z }}
        data-slot={slotId}
        aria-label={ariaLabel}
        onClick={() => onPick(slotId)}
      >
        {/* 台座。地面への落ち影・上面・手前の側面を持つ。所有者の色は上に重ねた
            tint の不透明度で出すので、建った瞬間にふわっと染まる。 */}
        <span className={`plot-base${ownerClass}`} aria-hidden="true">
          <span className="plot-base-tint" />
          {leveled ? <span className="plot-lv2-rim" /> : null}
        </span>
        {/* 建物の足元の接地影。グローではなく影で台座に置く。 */}
        <span className={`plot-contact${owned ? '' : ' is-unbuilt'}`} aria-hidden="true" />
        {highlighted ? (
          // CPU がいま建てた区画だけ、台座の上に光の輪を一瞬出す（要望 7）。
          <motion.span
            key={`flash-${state.turn}`}
            className="plot-flash"
            initial={{ opacity: 0.95, scale: 0.6 }}
            animate={{ opacity: 0, scale: 1.25 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        ) : null}
        {flash ? (
          // 収入の元になった建物。金の光と +/× の札を出す。祝祭のときは光を 2 度打ち、
          // 「×2」を大きく出して、建物収入が増えたことを建物そのものの上で見せる。
          <span key={`income-${flash.id}`} className="plot-income" aria-hidden="true">
            <motion.span
              className={`plot-income-glow${flash.festival ? ' is-festival' : ''}`}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: flash.festival ? [0, 1, 0.35, 1, 0] : [0, 1, 0], scale: flash.festival ? [0.6, 1.2, 1, 1.35, 1.5] : [0.6, 1.25, 1.4] }}
              transition={{ duration: flash.festival ? 1.5 : 1.0, ease: 'easeOut' }}
            />
            {flash.festival ? (
              <motion.span
                className="plot-income-tag"
                initial={{ opacity: 0, y: 8, scale: 0.4 }}
                animate={{ opacity: [0, 1, 1, 0], y: [8, -6, -14, -22], scale: [0.4, 1.4, 1.1, 1.1] }}
                transition={{ duration: 1.5, times: [0, 0.2, 0.75, 1], ease: 'easeOut' }}
              >
                ×{balance.festivalMultiplier}
              </motion.span>
            ) : null}
          </span>
        ) : null}
        {/* 建物の絵。未建設でも最初から置く（何が建つ区画か分かるように）。
            建つと絵を差し替え、上から落として着地させる。どちらも絶対配置なので
            区画の矩形は 1px も動かない。 */}
        {art ? (
          <AnimatePresence initial={false}>
            <motion.span
              key={owned ? `built-${landing}` : 'unbuilt'}
              className="plot-art-wrap"
              style={{ width: `${art.scale * 100}%`, left: `${(100 - art.scale * 100) / 2}%` }}
              initial={landing > 0 && owned ? { y: '-95%', opacity: 0 } : false}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{
                y: { type: 'spring', stiffness: 520, damping: 19, mass: 0.9 },
                opacity: { duration: 0.08 },
              }}
            >
              {/* アップグレードの瞬間だけ少し膨らむ（transform なので区画の矩形は動かない）。 */}
              <motion.span
                key={`pulse-${upgraded}`}
                className="plot-art-pulse"
                initial={upgraded > 0 ? { scale: 1 } : false}
                animate={upgraded > 0 ? { scale: [1, 1.16, 0.97, 1] } : { scale: 1 }}
                transition={{ duration: 0.55, times: [0, 0.35, 0.7, 1], ease: 'easeOut' }}
              >
                <img className={`plot-art${ownerClass}`} src={art.url} alt="" draggable={false} />
              </motion.span>
            </motion.span>
          </AnimatePresence>
        ) : null}
        {upgraded > 0 ? (
          // アップグレードの光。金の輪が広がって消える（収入の光と同じ系統の色）。
          <motion.span
            key={`upglow-${upgraded}`}
            className="plot-upgrade-glow"
            aria-hidden="true"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 1, 0], scale: [0.5, 1.15, 1.45] }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        ) : null}
        {landing > 0 && owned ? (
          <span key={`dust-${landing}`} className="plot-dust" aria-hidden="true">
            {DUST.map((d, k) => (
              <motion.span
                key={k}
                className="plot-dust-puff"
                style={{ width: d.size, height: d.size, marginLeft: -d.size / 2, marginTop: -d.size / 2 }}
                initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                animate={{ x: d.dx, y: d.dy, opacity: [0, 0.9, 0], scale: 1.6 }}
                transition={{ delay: 0.13, duration: 0.6, ease: 'easeOut' }}
              />
            ))}
          </span>
        ) : null}
        {owned ? (
          <motion.span
            key={`flag-${owner}-${landing}`}
            className="plot-flag-wrap"
            initial={landing > 0 || acquired ? { scaleY: 0 } : false}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.22, type: 'spring', stiffness: 420, damping: 14 }}
          >
            <Flag owner={owner} />
          </motion.span>
        ) : null}
        {/* 封鎖者に押さえられている区画のマーク。空き地（blocked）も
            既存物件（disabled）も同じ鎖アイコンで統一し、「封鎖者に
            止められている」ことをひと目で伝える。 */}
        {blocked || disabled ? (
          <span className="plot-chain-badge" aria-hidden="true">
            <ChainIcon />
          </span>
        ) : null}
      </button>
      {/* 名前・コスト・VP。常に出す（要望 5）。建物より必ず手前に来るよう、
          区画とは別の層（z-index 100）に置く。タップは下の区画へ通す。 */}
      <span className={['plot-labels', ...stateClass].filter(Boolean).join(' ')} style={box} aria-hidden="true">
        {/* 名前は台座の前面に刻む。色は台座の前面（所有者色）が担う。 */}
        <span className="plot-name">{BUILDING_NAMES[slot.buildingId]}</span>
        {deed}
        {/* Lv2 以上の印。旗の反対側（左）に金の星を立てる。持ち主の色（台座・旗・VP）は変えない。 */}
        {leveled ? (
          <span className="plot-level-badge" title={`Lv${slot.level}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2.2l2.9 6.1 6.6.8-4.9 4.5 1.3 6.6L12 16.9l-5.9 3.3 1.3-6.6-4.9-4.5 6.6-.8z" />
            </svg>
          </span>
        ) : null}
        <span className="plot-badges">
          {/* 実際にいま払う額を出す。建築家や石切場の割引が効いているターンは
              基準費用と食い違うので、基準費用を出すと画面が嘘の数字を出す。
              「買う前と後で情報を変えない」は出す項目の話であって、
              値を固定しろという意味ではない。 */}
          {figures.kind === 'unbuilt' ? <span className="plot-cost">{figures.build}</span> : null}
          <span className={`plot-vp${owned ? ` owner-${owner}` : ''}`}>{vpText}</span>
          {/* 建った物件は数字を 2 つ: 市場価値（買収に要るコイン、袋の印）とアップグレード費（上矢印）。
              凡例が無くても分かるよう、色だけでなく印を添える。最大レベルならアップグレードは出さない。 */}
          {figures.kind === 'built' ? (
            <span className="plot-value">
              <CoinBagIcon />
              {figures.value}
            </span>
          ) : null}
          {figures.kind === 'built' && figures.upgrade !== null ? (
            <span className="plot-upgrade">
              <UpArrowIcon />
              {figures.upgrade}
            </span>
          ) : null}
        </span>
      </span>
    </>
  );
}

export function Board({
  state,
  balance = DEFAULT_BALANCE,
  viewer = 'you',
  highlightSlot,
  targeting = false,
  dropArmed = false,
  flash = null,
  onPick,
}: {
  state: GameState;
  balance?: Balance;
  /** コスト表示・封鎖判定の基準になる「いま操作している側」。既定は 'you'
   *  （対 CPU モード）。PvP では手番側の PlayerId を渡す。 */
  viewer?: PlayerId;
  /** CPU がいま建てた区画。一瞬だけ光らせる（要望 7）。 */
  highlightSlot?: number | null;
  /** 封鎖者の対象選択モード中かどうか（要望 G3）。true の間は、自分の区画
   *  以外をタップ可能な対象として光らせ、自分の区画は選べないことが見えるよう
   *  沈める。実際にどう振る舞うか（対象を決定する／リジェクト音を出す）は
   *  呼び出し側の onPick が決める。 */
  targeting?: boolean;
  /** 手札をドラッグ中か。true の間は盤面全体を「ここへ落とすと使う」と分かる見た目にする。 */
  dropArmed?: boolean;
  /** 収入の段で光らせる区画。 */
  flash?: IncomeFlash | null;
  onPick: (slotId: number) => void;
}) {
  const districts = balance.districts;
  const borders = useMemo(
    () => districtBorders((slotId) => districts.findIndex((d) => d.slots.includes(slotId))),
    [districts],
  );
  useTitleCue(state, viewer);
  // 地（背景）は持たない。画面全体の地（.app-play）がそのまま続いて見える。
  return (
    <div className={`board${dropArmed ? ' is-drop-armed' : ''}`}>
      <Roads state={state} borders={borders} />
      {districts.map((d, i) => (
        <DistrictTag
          key={`district-${i}`}
          index={i}
          name={d.name}
          holder={titleHolder(state, i)}
          counts={districtCounts(state, i, balance)}
          titleVp={balance.districtTitleVp}
          viewer={viewer}
        />
      ))}
      {state.market.map((slot) =>
        PLOTS[slot.slotId] ? (
          <PlotView
            key={slot.slotId}
            state={state}
            slotId={slot.slotId}
            balance={balance}
            viewer={viewer}
            highlighted={highlightSlot === slot.slotId}
            flash={flash && flash.slots.includes(slot.slotId) ? flash : null}
            targeting={targeting}
            onPick={onPick}
          />
        ) : null,
      )}
    </div>
  );
}
