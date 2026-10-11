import type { Balance } from '@/game/balance';
import type { GameState, PlayerId } from '@/game/types';

import { districtDetail } from './district-view';
import { Sheet } from './Sheets';

/** 地区の名札をタップしたときのシート。盤面からは「◯対◯」を外したので、内訳はここで見せる。
 *  称号の持ち主 → 自分と相手の値（件数か VP の合計。いまのルールで判定に使う値）→ 区画の一覧 → 決まり方。
 *  呼び出し側で <AnimatePresence> に包み、key を付けること。 */
export function DistrictSheet({
  state,
  district,
  viewer,
  balance,
  ownerName,
  onClose,
}: {
  state: GameState;
  district: number;
  viewer: PlayerId;
  balance: Balance;
  ownerName: Record<PlayerId, string>;
  onClose: () => void;
}) {
  const d = districtDetail(state, district, viewer, balance);
  const subtitle = d.holder
    ? `称号 ${ownerName[d.holder]}（+${d.titleVp} VP）`
    : `称号 まだ誰も持っていない（+${d.titleVp} VP）`;
  return (
    <Sheet title={d.name} subtitle={subtitle} onClose={onClose} anchor="bottom">
      <div className="district-tally" role="group" aria-label={d.measure === 'count' ? '物件の数' : 'VP の合計'}>
        {d.tally.map((t) => (
          <div key={t.player} className={`district-tally-col owner-${t.player}${d.holder === t.player ? ' is-holder' : ''}`}>
            <span className="district-tally-who">{ownerName[t.player]}</span>
            <span className="district-tally-n">{t.text}</span>
          </div>
        ))}
      </div>
      <ul className="district-slots">
        {d.slots.map((s) => (
          <li key={s.slotId} className={`district-slot${s.owner ? ` owner-${s.owner}` : ' is-unbuilt'}`}>
            <span className="district-slot-dot" aria-hidden="true" />
            <span className="district-slot-name">{s.name}</span>
            <span className="district-slot-meta">
              {s.owner === null ? '空き地' : `${ownerName[s.owner]} ・ Lv${s.level} ・ ${s.vp} VP`}
            </span>
          </li>
        ))}
      </ul>
      <p className="sheet-text district-rule">{d.rule}</p>
    </Sheet>
  );
}
