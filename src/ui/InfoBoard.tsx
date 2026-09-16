import type { ReactNode } from 'react';

import { RollingNumber } from './RollingNumber';

/** 自分・相手で共通の情報ボードの骨格（要望 3・4）。
 *  印・名前・コイン・VP は 2 人とも同じ並びで出し、右側と 2 段目だけを
 *  差し替える（相手なら残りターンと行動ログ、自分なら見込みと終了ボタン）。
 *  クラッシュ・ロワイヤルの「相手が上・自分が下」に合わせ、絵は真似ず
 *  この骨格だけを両者で揃える。 */
export function InfoBoard({
  owner,
  name,
  coins,
  vp,
  right,
  sub,
}: {
  owner: 'you' | 'cpu';
  name: string;
  coins: number;
  vp: number;
  /** 行の右端。自分なら終了ボタン。相手側は残りターン表示を盤面右上へ
   *  移したので、いまは渡さなくてよい（要望 F）。 */
  right?: ReactNode;
  /** 2 段目。相手なら行動ログ、自分なら次のターンの見込み。 */
  sub: ReactNode;
}) {
  return (
    <div className={`info-board info-board-${owner}`}>
      <div className="info-board-row">
        <span className="info-board-name">{name}</span>
        {/* コインをコイン型のバッジで囲む（要望 B）。 */}
        <span className="info-board-coin-badge">
          <RollingNumber className="info-board-coins" value={coins} />
        </span>
        <span className="info-board-vp">{vp} VP</span>
        {right ? <span className="info-board-right">{right}</span> : null}
      </div>
      <div className="info-board-sub">{sub}</div>
    </div>
  );
}
