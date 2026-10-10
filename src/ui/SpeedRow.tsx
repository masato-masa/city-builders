import { useState } from 'react';

import { getSpeed, setSpeed } from './settings';
import { playUiTap } from './sound';

/** 設定シートの「早送り」の行。入れると演出が「はやい」になる（既定は「ふつう」＝読める速さ）。
 *  効果音・振動の行と同じスイッチの形。切り替えは次の演出から効く。 */
export function SpeedRow() {
  const [fast, setFast] = useState(() => getSpeed() === 'fast');
  return (
    <div className="sheet-row static">
      <span>
        早送り
        <span className="speed-row-sub">{fast ? 'はやい' : 'ふつう'}</span>
      </span>
      <button
        className="switch"
        role="switch"
        aria-checked={fast}
        aria-label="早送り"
        onClick={() => {
          const next = !fast;
          setFast(next);
          setSpeed(next ? 'fast' : 'normal');
          playUiTap();
        }}
      />
    </div>
  );
}
