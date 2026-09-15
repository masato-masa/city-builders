import { useState } from 'react';

import type { Difficulty } from '@/ai/choose';
import { ALL_CARDS, BUILDING_NAMES, CARD_NAMES, type Balance } from '@/game/balance';
import { clearProgress, loadProgress } from '@/storage/storage';

import { loadBalance, resetBalance, saveBalance } from './balance-store';
import { Sheet } from './Sheets';
import { primeAudio } from './sound';

const LABELS: Record<Difficulty, string> = {
  easy: 'やさしい',
  normal: 'ふつう',
  hard: 'つよい',
};

export function Home({ onStart }: { onStart: (d: Difficulty) => void }) {
  const progress = loadProgress();
  const [dev, setDev] = useState(false);
  const [balance, setBalance] = useState<Balance>(() => loadBalance());

  const put = (next: Balance) => {
    setBalance(next);
    saveBalance(next);
  };

  return (
    <div className="app-home">
      <div className="home">
        <h1 className="home-title">シティビルダーズ</h1>
        <p className="home-sub">人物を回して、都市を建てる</p>
        <div className="home-buttons">
          {(['easy', 'normal', 'hard'] as const).map((d) => (
            <button
              key={d}
              className={`home-btn${d === progress.lastDifficulty ? ' primary' : ''}`}
              onClick={() => {
                // 最初のユーザー操作。AudioContext をここで作っておく
                // （ページ読み込み時に作るとブラウザに止められるため）。
                primeAudio();
                onStart(d);
              }}
            >
              {LABELS[d]}
            </button>
          ))}
        </div>
        <p className="home-progress">
          {progress.wins} 勝 {progress.losses} 敗
        </p>
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
