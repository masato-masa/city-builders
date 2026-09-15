import { motion } from 'motion/react';
import { useState } from 'react';

import type { Difficulty } from '@/ai/choose';
import { ALL_CARDS, BUILDING_NAMES, CARD_NAMES, type Balance } from '@/game/balance';
import { clearProgress, loadProgress } from '@/storage/storage';

import { FIELD_URL } from './art';
import { loadBalance, resetBalance, saveBalance } from './balance-store';
import { hapticUseCard } from './haptics';
import { Sheet } from './Sheets';
import { playSelect, primeAudio } from './sound';

const LABELS: Record<Difficulty, string> = {
  easy: 'やさしい',
  normal: 'ふつう',
  hard: 'つよい',
};

// CPU の強さが一言で伝わるように。文言はここだけで決めている。
const DESCRIPTIONS: Record<Difficulty, string> = {
  easy: 'CPU は手加減します',
  normal: 'CPU がふつうに戦います',
  hard: 'CPU が本気で攻めてきます',
};

// タイトル → ボタン → 戦績の順に、少しずつ遅らせて出す。全体で 500ms 程度に収める。
// transform と opacity だけで動かす（レイアウトが動かないため）。
const SPRING = { type: 'spring', stiffness: 320, damping: 28, mass: 0.9 } as const;
const ENTER = [
  { hidden: { opacity: 0, y: -14 }, delay: 0 },
  { hidden: { opacity: 0, y: 16 }, delay: 0.08 },
  { hidden: { opacity: 0, y: 12 }, delay: 0.16 },
] as const;

export function Home({ onStart }: { onStart: (d: Difficulty) => void }) {
  const progress = loadProgress();
  const [dev, setDev] = useState(false);
  const [balance, setBalance] = useState<Balance>(() => loadBalance());

  const put = (next: Balance) => {
    setBalance(next);
    saveBalance(next);
  };

  const hasPlayed = progress.wins > 0 || progress.losses > 0;

  return (
    <div className="app app-home" style={{ backgroundImage: `url(${FIELD_URL})` }}>
      <div className="home">
        <motion.div
          initial={ENTER[0].hidden}
          animate={{ opacity: 1, y: 0, transition: { ...SPRING, delay: ENTER[0].delay } }}
        >
          <h1 className="home-title">シティビルダーズ</h1>
          <p className="home-sub">人物を回して、都市を建てる</p>
        </motion.div>

        <motion.div
          className="home-buttons"
          initial={ENTER[1].hidden}
          animate={{ opacity: 1, y: 0, transition: { ...SPRING, delay: ENTER[1].delay } }}
        >
          {(['easy', 'normal', 'hard'] as const).map((d) => (
            <button
              key={d}
              className={`home-btn${d === progress.lastDifficulty ? ' primary' : ''}`}
              onClick={() => {
                // 最初のユーザー操作。AudioContext をここで作っておく
                // （ページ読み込み時に作るとブラウザに止められるため）。
                primeAudio();
                playSelect();
                hapticUseCard();
                onStart(d);
              }}
            >
              <span className="home-btn-label">{LABELS[d]}</span>
              <span className="home-btn-desc">{DESCRIPTIONS[d]}</span>
            </button>
          ))}
        </motion.div>

        <motion.p
          className="home-progress"
          initial={ENTER[2].hidden}
          animate={{ opacity: 1, y: 0, transition: { ...SPRING, delay: ENTER[2].delay } }}
        >
          {hasPlayed ? (
            <>
              <span className="home-progress-num home-progress-win">{progress.wins}</span>勝
              <span className="home-progress-num home-progress-lose">{progress.losses}</span>敗
            </>
          ) : (
            <span className="home-progress-empty">はじめての挑戦です</span>
          )}
        </motion.p>
      </div>

      <button className="dev-pill" onClick={() => setDev(true)}>
        テスト用
      </button>

      {dev ? (
        <Sheet title="テスト用" subtitle="数値はすぐ反映される" onClose={() => setDev(false)}>
          <div className="dev-grid">
            <label>
              基本収入
              <input
                type="number"
                value={balance.baseIncome}
                onChange={(e) => put({ ...balance, baseIncome: Number(e.target.value) })}
              />
            </label>
            {ALL_CARDS.map((id) => (
              <label key={id}>
                {CARD_NAMES[id]} コスト
                <input
                  type="number"
                  value={balance.cards[id].cost}
                  onChange={(e) =>
                    put({
                      ...balance,
                      cards: { ...balance.cards, [id]: { cost: Number(e.target.value) } },
                    })
                  }
                />
              </label>
            ))}
            {(Object.keys(balance.buildings) as (keyof typeof balance.buildings)[]).map((id) => (
              <label key={id}>
                {BUILDING_NAMES[id]} コスト
                <input
                  type="number"
                  value={balance.buildings[id].cost}
                  onChange={(e) =>
                    put({
                      ...balance,
                      buildings: {
                        ...balance.buildings,
                        [id]: { ...balance.buildings[id], cost: Number(e.target.value) },
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
          <button
            className="sheet-row"
            onClick={() => {
              resetBalance();
              setBalance(loadBalance());
            }}
          >
            数値を既定に戻す
          </button>
          <button className="sheet-row" onClick={() => clearProgress()}>
            きろくをけす
          </button>
        </Sheet>
      ) : null}
    </div>
  );
}
