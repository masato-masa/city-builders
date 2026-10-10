import { useState } from 'react';

import type { Difficulty } from '@/ai/choose';
import { dailyFor } from '@/meta/daily';

import { loadBalance, testDeckCards } from './ui/balance-store';
import { Game } from './ui/Game';
import { Home } from './ui/Home';
import { PvpGame } from './ui/PvpGame';
import './ui/shared/tokens.css';
import './ui/shared/chrome.css';
import './ui/styles.css';
import './ui/fx.css';

type Session =
  | { mode: 'cpu'; seed: number; difficulty: Difficulty }
  | { mode: 'pvp'; seed: number }
  /** 日替わり。seed は日付で決まって毎回同じなので、作り直しは attempt で見分ける。 */
  | { mode: 'daily'; dateKey: string; attempt: number };

export function App() {
  const [session, setSession] = useState<Session | null>(null);

  const newSeed = () => Date.now() % 100000;

  if (session === null) {
    return (
      <Home
        onStart={(difficulty) => setSession({ mode: 'cpu', seed: newSeed(), difficulty })}
        onStartPvp={() => setSession({ mode: 'pvp', seed: newSeed() })}
        onStartDaily={(dateKey) => setSession({ mode: 'daily', dateKey, attempt: 0 })}
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
        deck={testDeckCards(session.seed)}
        onExit={() => setSession(null)}
        onRestart={() => setSession({ mode: 'pvp', seed: newSeed() })}
      />
    );
  }

  if (session.mode === 'daily') {
    // 日替わりは端末の数値の上書き（テスト用）を使わない。誰がやっても同じ条件にするため。
    const daily = dailyFor(session.dateKey);
    return (
      <Game
        key={`daily:${session.dateKey}:${session.attempt}`}
        seed={daily.seed}
        difficulty={daily.difficulty}
        balance={daily.balance}
        first={daily.first}
        daily={{ dateKey: daily.dateKey, label: daily.label }}
        onExit={() => setSession(null)}
        onRestart={() => setSession({ ...session, attempt: session.attempt + 1 })}
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
      deck={testDeckCards(session.seed)}
      onExit={() => setSession(null)}
      onRestart={() => setSession({ mode: 'cpu', seed: newSeed(), difficulty: session.difficulty })}
    />
  );
}
