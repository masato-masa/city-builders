import { useState } from 'react';

import type { Difficulty } from '@/ai/choose';

import { loadBalance } from './ui/balance-store';
import { Game } from './ui/Game';
import { Home } from './ui/Home';
import { PvpGame } from './ui/PvpGame';
import './ui/shared/tokens.css';
import './ui/shared/chrome.css';
import './ui/styles.css';

type Session =
  | { mode: 'cpu'; seed: number; difficulty: Difficulty }
  | { mode: 'pvp'; seed: number };

export function App() {
  const [session, setSession] = useState<Session | null>(null);

  const newSeed = () => Date.now() % 100000;

  if (session === null) {
    return (
      <Home
        onStart={(difficulty) => setSession({ mode: 'cpu', seed: newSeed(), difficulty })}
        onStartPvp={() => setSession({ mode: 'pvp', seed: newSeed() })}
      />
    );
  }

  if (session.mode === 'pvp') {
    // seed を key にして、もう一度のときに PvpGame を作り直す。
    return (
      <PvpGame
        key={session.seed}
        seed={session.seed}
        balance={loadBalance()}
        onExit={() => setSession(null)}
        onRestart={() => setSession({ mode: 'pvp', seed: newSeed() })}
      />
    );
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
      onRestart={() => setSession({ mode: 'cpu', seed: newSeed(), difficulty: session.difficulty })}
    />
  );
}
