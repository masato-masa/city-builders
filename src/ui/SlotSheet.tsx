import { BUILDING_NAMES, type Balance } from '@/game/balance';
import { buildCostFor, canBuild } from '@/game/reducer';
import type { GameState, PlayerId } from '@/game/types';

import { Sheet } from './Sheets';
import { acquireButton, acquireNote, levelEffects, upgradeButton, type SlotButton } from './slot-actions';

/** 区画をタップしたときのシート。CPU 戦と 2 人対戦で共有する。
 *  空き地 → 建てる / 自分の物件 → アップグレード / 相手の物件 → 買収。
 *  呼び出し側で <AnimatePresence> に包み、key を付けること（Sheet と同じ）。 */
export function SlotSheet({
  state,
  slotId,
  viewer,
  balance,
  locked,
  ownerName,
  onBuild,
  onUpgrade,
  onAcquire,
  onClose,
}: {
  state: GameState;
  slotId: number;
  /** いま操作している側（CPU 戦は 'you'、2 人対戦は手番側） */
  viewer: PlayerId;
  balance: Balance;
  /** 演出の途中など、操作を受け付けない間 */
  locked: boolean;
  /** 持ち主の呼び名（「あなた」「CPU」「あお」「あか」） */
  ownerName: Record<PlayerId, string>;
  onBuild: () => void;
  onUpgrade: () => void;
  onAcquire: () => void;
  onClose: () => void;
}) {
  const slot = state.market[slotId]!;
  const { current, next } = levelEffects(state, slotId, balance);
  const owned = slot.owner !== null;
  const disabledByBlockade = owned && state.players[slot.owner!].disabledSlot === slotId;
  const subtitle = owned
    ? `${ownerName[slot.owner!]}の物件 ・ Lv${current.level} ・ ${current.vp}`
    : `コスト ${buildCostFor(state, viewer, slotId, balance)} ・ ${current.vp}`;

  return (
    <Sheet title={BUILDING_NAMES[slot.buildingId]} subtitle={subtitle} onClose={onClose}>
      {next ? (
        // いまの Lv と、上げたあとの Lv を左右に並べる（何が増えるかを比べて決められるように）。
        <div className="level-compare">
          <div className="level-col">
            <span className="level-tag">Lv{current.level}（いま）</span>
            <span className="level-vp">{current.vp}</span>
            <span className="level-text">{current.text}</span>
          </div>
          <span className="level-arrow" aria-hidden="true">
            ▶
          </span>
          <div className="level-col is-next">
            <span className="level-tag">Lv{next.level}</span>
            <span className="level-vp">{next.vp}</span>
            <span className="level-text">{next.text}</span>
          </div>
        </div>
      ) : (
        <p className="sheet-text">
          {owned && current.level >= 2 ? <b className="level-max">Lv{current.level}（最大）</b> : null}
          {current.text}
        </p>
      )}
      {disabledByBlockade ? <p className="sheet-text">封鎖者に効果を止められています（VP は残ります）。</p> : null}

      {!owned ? (
        <>
          {state.players[viewer].blockedSlot === slotId ? (
            <p className="sheet-text">相手の封鎖者に封鎖されています。解除されるまで建てられません。</p>
          ) : null}
          <button
            className="btn3d btn3d-yellow"
            disabled={locked || !canBuild(state, slotId, balance) || state.current !== viewer}
            onClick={onBuild}
          >
            {/* 押せない理由をボタンの上で言う（灰色のボタンだけでは何が足りないか分からない）。 */}
            {state.players[viewer].blockedSlot === slotId
              ? '封鎖中'
              : canBuild(state, slotId, balance) || state.current !== viewer
                ? '建てる'
                : `あと ${buildCostFor(state, viewer, slotId, balance) - state.players[viewer].coins} コイン`}
          </button>
        </>
      ) : slot.owner === viewer ? (
        <ActionButton button={upgradeButton(state, slotId, viewer, balance)} locked={locked} onClick={onUpgrade} />
      ) : (
        <>
          <p className="sheet-text">{acquireNote(state, slotId, balance)}</p>
          <ActionButton button={acquireButton(state, slotId, viewer, balance)} locked={locked} onClick={onAcquire} />
        </>
      )}
    </Sheet>
  );
}

function ActionButton({
  button,
  locked,
  onClick,
}: {
  button: SlotButton | null;
  locked: boolean;
  onClick: () => void;
}) {
  if (!button) return null;
  return (
    <>
      {/* 理由の行は常に高さを取る。押せる/押せないでボタンの位置が上下しないように。 */}
      <p className="slot-reason" aria-live="polite">
        {button.reason ?? ' '}
      </p>
      <button className="btn3d btn3d-yellow" disabled={locked || !button.enabled} onClick={onClick}>
        {button.label}
      </button>
    </>
  );
}
