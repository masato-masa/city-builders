import { useState } from 'react';

import type { Difficulty } from '@/ai/choose';

import { Home } from './ui/Home';
import './ui/shared/tokens.css';
import './ui/shared/chrome.css';
import './ui/styles.css';

export function App() {
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);

  if (difficulty === null) return <Home onStart={setDifficulty} />;
  return (
    <div className="app">
      <p>準備中: {difficulty}</p>
      <button onClick={() => setDifficulty(null)}>戻る</button>
    </div>
  );
}
