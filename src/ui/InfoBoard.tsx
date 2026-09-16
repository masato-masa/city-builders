import type { ReactNode } from 'react';

import { COIN_URL } from './art';
import { RollingNumber } from './RollingNumber';

/** 自分・相手で共通の情報ボードの骨格（要望 3・4）。
 *  コイン・VP は 2 人とも同じ並びで出し、右側と 2 段目だけを
 *  差し替える（相手なら行動ログ、自分なら終了ボタン／2 段目は
 *  どちらも次のターンの見込み収入で揃える）。
 *  背景色（青/茶）だけで自他を区別し、名前は出さない。
 *  クラッシュ・ロワイヤルの「相手が上・自分が下」に合わせ、絵は真似ず
 *  この骨格だけを両者で揃える。
 *  VP とコインが紛らわしいという指摘を受け、VP を左上に控えめに、
 *  コインをその右に目立たせる並びにした。 */
export function InfoBoard({
  owner,
  coins,
  vp,
  right,
  sub,
}: {
  owner: 'you' | 'cpu';
  coins: number;
  vp: number;
  /** 行の右端。自分なら終了ボタン、相手（CPU）なら行動ログ。 */
  right?: ReactNode;
  /** 2 段目。自分・相手とも次のターンの見込み収入。 */
  sub: ReactNode;
}) {
  return (
    <div className={`info-board info-board-${owner}`}>
      <div className="info-board-row">
        <span className="info-board-vp">{vp} VP</span>
        {/* コイン画像 + 数字。以前はグラデーションだけのバッジだったが、
            チープに見えるという指摘を受けてコインの絵を敷いた（要望 B）。 */}
        <span className="info-board-coin-badge">
          <img className="info-board-coin-icon" src={COIN_URL} alt="" />
          <RollingNumber className="info-board-coins" value={coins} />
        </span>
        {right ? <span className="info-board-right">{right}</span> : null}
      </div>
      <div className="info-board-sub">{sub}</div>
    </div>
  );
}
