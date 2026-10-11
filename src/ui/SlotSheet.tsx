import { BUILDING_NAMES, CARD_NAMES, type Balance } from '@/game/balance';
import { buildCostFor, canBuild, canUseRoad } from '@/game/reducer';
import { handSlotsOf, roadUsesRemaining } from '@/game/selectors';
import type { CardId, GameState, PlayerId } from '@/game/types';

import { cardArtOf } from './art';
import { roadReason } from './feel';
import { Sheet } from './Sheets';
import {
  acquireButton,
  acquireNote,
  buildingSpecRows,
  districtNote,
  isMaxLevel,
  levelEffects,
  slotStatusLine,
  upgradeButton,
  type SlotButton,
} from './slot-actions';

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
  onRoad,
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
  /** 自分の街道で、手札の札を山の底へ送る。 */
  onRoad: (card: CardId) => void;
  onClose: () => void;
}) {
  const slot = state.market[slotId]!;
  const { current, next } = levelEffects(state, slotId, balance);
  const owned = slot.owner !== null;
  const disabledByBlockade = owned && state.players[slot.owner!].disabledSlot === slotId;
  const district = districtNote(state, slotId, viewer, balance, ownerName);
  // 一番上に今の状態（持ち主・Lv・今の市場価値）、その下に建物の固定の数値（いつも同じ並び）、その下に効果文
  const subtitle = slotStatusLine(state, slotId, viewer, balance, ownerName, buildCostFor(state, viewer, slotId, balance));

  return (
    <Sheet title={BUILDING_NAMES[slot.buildingId]} subtitle={subtitle} onClose={onClose} anchor="bottom">
      <dl className="spec-table">
        {buildingSpecRows(slot.buildingId, balance).map((r) => (
          <div key={r.label} className="spec-row">
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
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
          {isMaxLevel(state, slotId, balance) ? <b className="level-max">Lv{current.level}（最大）</b> : null}
          {current.text}
        </p>
      )}
      {disabledByBlockade ? <p className="sheet-text">封鎖者に効果を止められています（VP は残ります）。</p> : null}
      {district ? <p className="sheet-text district-note">{district}</p> : null}

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
        <>
          {slot.buildingId === 'road' ? (
            <RoadPicker state={state} viewer={viewer} balance={balance} locked={locked} onRoad={onRoad} />
          ) : null}
          <ActionButton button={upgradeButton(state, slotId, viewer, balance)} locked={locked} onClick={onUpgrade} />
        </>
      ) : (
        <>
          <p className="sheet-text">{acquireNote(state, slotId, balance)}</p>
          <ActionButton button={acquireButton(state, slotId, viewer, balance)} locked={locked} onClick={onAcquire} />
        </>
      )}
    </Sheet>
  );
}

/** 自分の街道のシートの中で、手札のどれを山の底へ送るかを選ぶ（街道の効果は建物の側から使う）。
 *  4 枚の札を並べ、押した札を送る。押せないときは理由を 1 行で言う。 */
function RoadPicker({
  state,
  viewer,
  balance,
  locked,
  onRoad,
}: {
  state: GameState;
  viewer: PlayerId;
  balance: Balance;
  locked: boolean;
  onRoad: (card: CardId) => void;
}) {
  const usesLeft = roadUsesRemaining(state, viewer, balance);
  const myTurn = state.phase === 'playing' && state.current === viewer;
  const disabledHere = state.players[viewer].disabledSlot !== null &&
    state.market[state.players[viewer].disabledSlot!]?.buildingId === 'road';
  const reason = disabledHere
    ? '封鎖者に効果を止められています'
    : roadReason(true, usesLeft, myTurn);
  return (
    <div className="road-picker">
      <p className="road-picker-head">
        <span>手札の札を山の底へ送る</span>
        <span className="road-btn-sub">{reason ?? `このターン あと ${usesLeft} 回`}</span>
      </p>
      <div className="road-picker-cards">
        {handSlotsOf(state, viewer).map((card, i) =>
          card ? (
            <button
              key={`${i}-${card}`}
              className="road-pick"
              disabled={locked || !canUseRoad(state, card, balance)}
              onClick={() => onRoad(card)}
            >
              <img src={cardArtOf(card)} alt="" draggable={false} />
              <span className="road-pick-name">{CARD_NAMES[card]}</span>
            </button>
          ) : (
            <span key={`${i}-empty`} className="road-pick is-empty" />
          ),
        )}
      </div>
    </div>
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
