import { useAnimate } from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';

import { COIN_URL } from './art';
import { DeltaPops, useDeltaPops } from './Fx';
import { StarIcon } from './icons';
import { RollingNumber } from './RollingNumber';

/** 自分・相手で共通の情報ボードの骨格（要望 3・4）。
 *  コイン・VP は 2 人とも同じ並びで出し、右側と 2 段目だけを
 *  差し替える（相手なら行動ログ、自分なら終了ボタン／2 段目は
 *  どちらも次のターンの見込み収入で揃える）。
 *  背景色（青/茶）だけで自他を区別し、名前は出さない。
 *  VP とコインが紛らわしいという指摘を受け、VP を左上に控えめに、
 *  コインをその右に目立たせる並びにした。
 *
 *  数字が動いたら、その場で弾ませて +N / −N を浮かせる（増えたのか減ったのかが
 *  数字を読まなくても分かる）。手番の側は縁を光らせる（active）。
 *  どちらも transform と box-shadow だけで出すので、ボードの寸法は 1px も動かない。 */
export function InfoBoard({
  owner,
  coins,
  vp,
  right,
  sub,
  active = false,
}: {
  owner: 'you' | 'cpu';
  coins: number;
  vp: number;
  /** 行の右端。自分なら終了ボタン、相手（CPU）なら行動ログ。 */
  right?: ReactNode;
  /** 2 段目。自分・相手とも次のターンの見込み収入。 */
  sub: ReactNode;
  /** いまこの側の手番か。縁を光らせ、「手番」の札を出す。 */
  active?: boolean;
}) {
  const coinPops = useDeltaPops(coins);
  const vpPops = useDeltaPops(vp);
  const [coinScope, animateCoin] = useAnimate<HTMLSpanElement>();
  const [vpScope, animateVp] = useAnimate<HTMLSpanElement>();
  const first = useRef(true);
  const prevCoins = useRef(coins);
  const prevVp = useRef(vp);

  useEffect(() => {
    if (first.current) return;
    if (coins === prevCoins.current) return;
    const up = coins > prevCoins.current;
    prevCoins.current = coins;
    animateCoin(
      coinScope.current,
      up ? { scale: [1, 1.28, 1], rotate: [0, -6, 0] } : { scale: [1, 0.86, 1], x: [0, -3, 3, 0] },
      { duration: 0.42, ease: 'easeOut' },
    );
  }, [coins]);

  useEffect(() => {
    if (first.current) return;
    if (vp === prevVp.current) return;
    prevVp.current = vp;
    animateVp(vpScope.current, { scale: [1, 1.45, 1] }, { duration: 0.5, ease: 'easeOut' });
  }, [vp]);

  useEffect(() => {
    first.current = false;
  }, []);

  return (
    <div className={`info-board info-board-${owner}${active ? ' is-active' : ''}`}>
      <div className="info-board-row">
        <span className="info-board-vp" ref={vpScope}>
          <StarIcon className="info-board-vp-star" />
          <span className="info-board-vp-num">{vp}</span>
          <span className="info-board-vp-unit">VP</span>
          <DeltaPops pops={vpPops} />
        </span>
        {/* コイン画像 + 数字。以前はグラデーションだけのバッジだったが、
            チープに見えるという指摘を受けてコインの絵を敷いた（要望 B）。 */}
        <span className="info-board-coin-badge">
          <span className="info-board-coin-bump" ref={coinScope}>
            <img className="info-board-coin-icon" src={COIN_URL} alt="" />
            <RollingNumber className="info-board-coins" value={coins} />
          </span>
          <DeltaPops pops={coinPops} />
        </span>
        {right ? <span className="info-board-right">{right}</span> : null}
      </div>
      <div className="info-board-sub">{sub}</div>
    </div>
  );
}
