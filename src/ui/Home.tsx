import type { Difficulty } from '@/ai/choose';
import { loadProgress } from '@/storage/storage';

const LABELS: Record<Difficulty, string> = {
  easy: 'やさしい',
  normal: 'ふつう',
  hard: 'つよい',
};

export function Home({ onStart }: { onStart: (d: Difficulty) => void }) {
  const progress = loadProgress();
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
              onClick={() => onStart(d)}
            >
              {LABELS[d]}
            </button>
          ))}
        </div>
        <p className="home-progress">
          {progress.wins} 勝 {progress.losses} 敗
        </p>
      </div>
    </div>
  );
}
