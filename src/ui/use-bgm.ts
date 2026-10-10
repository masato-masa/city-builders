// プレイ画面の BGM。入ったら流し、出たら消す。残り手番で緊張させ、決着したら結果画面の前に消す
// （勝ち負けの音が鳴るときは playWin / playLose がもっと早く消す。引き分けはここで消す）。

import { useEffect, useState } from 'react';

import { refreshBgm, setBgmTension, startBgm, stopBgm } from './bgm';
import { isBgmEnabled, setBgmEnabled } from './settings';
import { RESULT_DELAY_MS } from './tempo';

export function useGameBgm(turnsLeft: number, finished: boolean) {
  const [bgmOn, setBgmOn] = useState(() => isBgmEnabled());

  useEffect(() => {
    startBgm(turnsLeft);
    return () => stopBgm(0.5);
  }, []);

  useEffect(() => {
    setBgmTension(turnsLeft);
  }, [turnsLeft]);

  useEffect(() => {
    if (!finished) return;
    const t = window.setTimeout(() => stopBgm(1), RESULT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [finished]);

  const toggleBgm = () => {
    const next = !bgmOn;
    setBgmOn(next);
    setBgmEnabled(next);
    refreshBgm();
  };

  return { bgmOn, toggleBgm };
}
