import { useState } from 'react';

import type { Difficulty } from '@/ai/choose';

import { Game } from './ui/Game';
import { Home } from './ui/Home';
import './ui/shared/tokens.css';
import './ui/shared/chrome.css';
import './ui/styles.css';

export function App() {
  const [session, setSession] = useState<{ seed: number; difficulty: Difficulty } | null>(null);

  if (session === null) {
    return <Home onStart={(difficulty) => setSession({ seed: Date.now() % 100000, difficulty })} />;
  }
  return (
    <Game
      seed={session.seed}
      difficulty={session.difficulty}
      onExit={() => setSession(null)}
    />
  );
}
