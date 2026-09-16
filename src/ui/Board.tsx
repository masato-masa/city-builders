import { motion } from 'motion/react';

import { BUILDING_NAMES, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { buildCostFor } from '@/game/reducer';
import { vpOfSlot } from '@/game/selectors';
import type { GameState, PlayerId } from '@/game/types';

import { BUILDING_ART } from './art';
import { PLOTS, PLOT_WIDTH } from './board-layout';
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

export function Board({
  state,
  balance = DEFAULT_BALANCE,
  viewer = 'you',
  highlightSlot,
  targeting = false,
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
  onPick: (slotId: number) => void;
}) {
  return (
    <div className="board">
      {state.market.map((slot, i) => {
        const plot = PLOTS[i];
        if (!plot) return null;
        const owned = slot.owner !== null;
        // 封鎖中の空き地。blockedSlot は「押せない」判定のためプレイヤーごとに
        // 持つ値だが、盤面はどちらの操作でも同じ 1 枚を共有しているので、
        // 自分が押さえた／相手に押さえられたのどちらでも見えるよう、両者を見る
        // （disabled と同じ考え方。viewer 側だけ見ると、自分が封鎖者を使って
        // 相手を止めたときに何も見えなくなってしまう）。
        const blocked =
          !owned &&
          (state.players.you.blockedSlot === slot.slotId || state.players.cpu.blockedSlot === slot.slotId);
        // 封鎖者に効果を止められている自分の物件（要望 G2）。所有者本人の
        // disabledSlot で判定する（viewer とは無関係。盤面はどちらの操作でも
        // 同じ 1 枚を共有しているため）。
        const disabled = owned && slot.owner !== null && state.players[slot.owner].disabledSlot === slot.slotId;
        // 封鎖者の対象選択中は、自分の区画以外がタップできる対象になる。
        const targetable = targeting && slot.owner !== viewer;
        const targetInvalid = targeting && slot.owner === viewer;
        const art = BUILDING_ART[slot.buildingId];
        // 建った区画は plot-art の alt="" で物件名が読み上げに出ないので、
        // ボタン自体に物件名と VP を含む aria-label を付ける。
        const ariaLabel = `${BUILDING_NAMES[slot.buildingId]} ${vpTextFor(state, slot.slotId, balance)}${disabled ? ' 効果停止中' : ''}${blocked ? ' 封鎖中' : ''}`;
        const className = [
          'plot',
          blocked ? 'is-blocked' : null,
          disabled ? 'is-disabled' : null,
          targetable ? 'is-targetable' : null,
          targetInvalid ? 'is-target-invalid' : null,
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <button
            key={slot.slotId}
            className={className}
            style={{
              left: `${plot.x * 100}%`,
              top: `${plot.y * 100}%`,
              width: `${PLOT_WIDTH * 100}%`,
            }}
            aria-label={ariaLabel}
            onClick={() => onPick(slot.slotId)}
          >
            {/* 名前。常に出す。色だけ所有者で変える（要望 5）。 */}
            <span className={`plot-name${owned ? ` owner-${slot.owner}` : ''}`}>
              {BUILDING_NAMES[slot.buildingId]}
            </span>
            {/* 建物の絵。未建設でも最初から置き、状態が変わっても矩形は動かさない。
                沈める／光らせるは filter と drop-shadow の色だけで表す（要望 5）。 */}
            {art ? (
              <motion.img
                className={`plot-art${owned ? ` owner-${slot.owner}` : ' is-unbuilt'}`}
                src={art.url}
                alt=""
                style={{ width: `${art.scale * 100}%`, x: '-50%' }}
                animate={{ scale: owned ? 1 : 0.92 }}
                transition={{ type: 'spring', stiffness: 360, damping: 15 }}
              />
            ) : null}
            {/* CPU がいま建てた区画だけ、一瞬光らせる（要望 7）。絵そのものは染めない。 */}
            {highlightSlot === slot.slotId ? (
              <motion.span
                key={`flash-${state.turn}`}
                className="plot-flash"
                initial={{ opacity: 0.9 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
            ) : null}
            {/* 封鎖者に押さえられている区画のマーク。空き地（blocked）も
                既存物件（disabled）も同じ鎖アイコンで統一し、「封鎖者に
                止められている」ことをひと目で伝える。 */}
            {blocked || disabled ? (
              <span className="plot-chain-badge" aria-hidden="true">
                <ChainIcon />
              </span>
            ) : null}
            {/* コストと VP。常に両方出す（要望 5）。 */}
            <span className="plot-badges">
              {/* 実際にいま払う額を出す。建築家や石切場の割引が効いているターンは
                  基準費用と食い違うので、基準費用を出すと画面が嘘の数字を出す。
                  「買う前と後で情報を変えない」は出す項目の話であって、
                  値を固定しろという意味ではない。 */}
              <span className="plot-cost">{buildCostFor(state, viewer, slot.slotId, balance)}</span>
              <span className={`plot-vp${owned ? ` owner-${slot.owner}` : ''}`}>
                {vpTextFor(state, slot.slotId, balance)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
