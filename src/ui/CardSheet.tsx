import { CARD_NAMES, cardTextFor, type Balance } from '@/game/balance';
import { canUseCard, canUseRoad, cardCostFor } from '@/game/reducer';
import { activeOwnedSlots, roadUsesRemaining } from '@/game/selectors';
import type { CardId, GameState, PlayerId } from '@/game/types';

import { CARD_ART } from './art';
import { roadReason } from './feel';
import { Sheet } from './Sheets';

/** 手札の札をタップしたときのシート。CPU 戦と 2 人対戦で共有する。
 *  画面の下端に揃え、主ボタン（使う）をいつも同じ位置に出す。
 *  呼び出し側で <AnimatePresence> に包み、key を付けること（Sheet と同じ）。 */
export function CardSheet({
  state,
  card,
  viewer,
  balance,
  locked,
  onRoad,
  onUse,
  onClose,
}: {
  state: GameState;
  card: CardId;
  viewer: PlayerId;
  balance: Balance;
  locked: boolean;
  onRoad: () => void;
  onUse: () => void;
  onClose: () => void;
}) {
  const usable = canUseCard(state, card, balance);
  const cost = cardCostFor(state, viewer, card, balance);
  const coins = state.players[viewer].coins;
  const hasRoad = activeOwnedSlots(state, viewer).some((s) => s.buildingId === 'road');
  const usesLeft = roadUsesRemaining(state, viewer, balance);
  // 押せない灰色の行には、押せない理由を一文で添える（UX の指摘）。
  const roadOk = canUseRoad(state, card, balance);
  const reason = roadOk ? null : roadReason(hasRoad, usesLeft, state.current === viewer);
  return (
    <Sheet title={CARD_NAMES[card]} subtitle={`コスト ${cost}`} onClose={onClose} anchor="bottom">
      {CARD_ART[card] ? <img className="sheet-card-art" src={CARD_ART[card]} alt="" /> : null}
      <p className="sheet-text">{cardTextFor(card, balance)}</p>
      {card === 'blockader' ? <p className="sheet-text">永続する効果です。解除する手段はいまはありません。</p> : null}
      {/* 街道の効果。カードを選んだこのシートの中、「使う」の上に置く（要望 2）。
          街道を持っていない／使い切っているときも、ボタンは消さず disabled にする。 */}
      <button className="sheet-row road-btn" disabled={locked || !roadOk} onClick={onRoad}>
        <span>山の底へ送る</span>
        <span className="road-btn-sub">{reason ?? `街道・あと ${usesLeft} 回`}</span>
      </button>
      <button className="btn3d btn3d-yellow" disabled={locked || !usable} onClick={onUse}>
        {usable || state.current !== viewer || coins >= cost ? '使う' : `あと ${cost - coins} コイン`}
      </button>
    </Sheet>
  );
}
