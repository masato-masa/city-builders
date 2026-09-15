import { useState } from 'react';

import type { Difficulty } from '@/ai/choose';

import { loadBalance } from './ui/balance-store';
import { Game } from './ui/Game';
import { Home } from './ui/Home';
import './ui/shared/tokens.css';
import './ui/shared/chrome.css';
import './ui/styles.css';

export function App() {
  const [session, setSession] = useState<{ seed: number; difficulty: Difficulty } | null>(null);

  const newSeed = () => Date.now() % 100000;

  if (session === null) {
    return <Home onStart={(difficulty) => setSession({ seed: newSeed(), difficulty })} />;
  }
  // seed を key にして、もう一度のときに Game を作り直す。
  // 同じ要素のまま props だけ替えると、盤面や手札の状態が残る。
  return (
    <Game
      key={session.seed}
      seed={session.seed}
      difficulty={session.difficulty}
      balance={loadBalance()}
      onExit={() => setSession(null)}
      onRestart={() => setSession({ seed: newSeed(), difficulty: session.difficulty })}
    />
  );
}
