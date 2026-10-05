import { AnimatePresence, motion } from 'motion/react';
import { useState, type CSSProperties } from 'react';

import { BUILDING_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { buildCostFor } from '@/game/reducer';
import { vpOfSlot } from '@/game/selectors';
import type { GameState, PlayerId } from '@/game/types';

import { BUILDING_ART } from './art';
import { PLOTS, PLOT_HEIGHT, PLOT_WIDTH, STREET_JUNCTIONS, STREET_Y, STUBS, rowOf } from './board-layout';
import { ChainIcon } from './icons';

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
function Roads({ state }: { state: GameState }) {
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
    </svg>
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
  const [prevOwner, setPrevOwner] = useState(owner);
  const [landing, setLanding] = useState(0);
  if (owner !== prevOwner) {
    setPrevOwner(owner);
    if (owner !== null) setLanding((n) => n + 1);
  }

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
  const ariaLabel = `${BUILDING_NAMES[slot.buildingId]} ${vpText}${disabled ? ' 効果停止中' : ''}${blocked ? ' 封鎖中' : ''}`;
  const stateClass = [
    blocked ? 'is-blocked' : null,
    disabled ? 'is-disabled' : null,
    targetInvalid ? 'is-target-invalid' : null,
  ];
  const ownerClass = owned ? ` owner-${owner}` : ' is-unbuilt';
  const box = boxStyle(slotId);
  // 下の段ほど手前に描く。建物の屋根が上の段の足元に掛かっても自然に見える。
  const z = 10 + rowOf(slotId) * 10;

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
              <img className={`plot-art${ownerClass}`} src={art.url} alt="" draggable={false} />
            </motion.span>
          </AnimatePresence>
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
            initial={landing > 0 ? { scaleY: 0 } : false}
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
        <span className="plot-badges">
          {/* 実際にいま払う額を出す。建築家や石切場の割引が効いているターンは
              基準費用と食い違うので、基準費用を出すと画面が嘘の数字を出す。
              「買う前と後で情報を変えない」は出す項目の話であって、
              値を固定しろという意味ではない。 */}
          <span className="plot-cost">{buildCostFor(state, viewer, slotId, balance)}</span>
          <span className={`plot-vp${owned ? ` owner-${owner}` : ''}`}>{vpText}</span>
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
  // 地（背景）は持たない。画面全体の地（.app-play）がそのまま続いて見える。
  return (
    <div className={`board${dropArmed ? ' is-drop-armed' : ''}`}>
      <Roads state={state} />
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
