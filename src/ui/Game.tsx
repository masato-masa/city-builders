import { useState } from 'react';

import { type Difficulty, playTurn } from '@/ai/choose';
import { BUILDING_NAMES, BUILDING_TEXTS, CARD_NAMES, CARD_TEXTS, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { buildCostFor, canBuild, canUseCard, canUseRoad, reduce } from '@/game/reducer';
import { createRng, type Rng } from '@/game/rng';
import { handOf, hasBuilding, scoreOf, winnerOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';
import { loadProgress, saveProgress } from '@/storage/storage';

import { Board } from './Board';
import { CoinBar } from './CoinBar';
import { Hand } from './Hand';
import { OpponentStrip } from './OpponentStrip';
import { Sheet } from './Sheets';

type Pending =
  | { kind: 'slot'; slotId: number }
  | { kind: 'card'; card: CardId }
  | { kind: 'heraldTarget' }
  | { kind: 'blockadeTarget' }
  | { kind: 'roadTarget' }
  | { kind: 'spyResult'; hand: CardId[] }
  | { kind: 'help' }
  | null;

export function Game({
  seed,
  difficulty,
  balance = DEFAULT_BALANCE,
  onExit,
}: {
  seed: number;
  difficulty: Difficulty;
  balance?: Balance;
  onExit: () => void;
}) {
  const [rng] = useState<Rng>(() => createRng(seed * 7919 + 13));
  const [state, setState] = useState<GameState>(() => {
    const g = createGame(seed, balance);
    // プレイヤーが後手なら、先に CPU の 1 手番を消化する
    const started = g.current === 'cpu' ? playTurn(g, difficulty, createRng(seed), balance) : g;
    return reduce(started, { type: 'startTurn' }, balance);
  });
  const [sheet, setSheet] = useState<Pending>(null);

  const finished = state.phase === 'finished';

  const endTurn = () => {
    let next = reduce(state, { type: 'endTurn' }, balance);
    if (next.phase === 'playing') {
      next = playTurn(next, difficulty, rng, balance);
    }
    if (next.phase === 'playing') {
      next = reduce(next, { type: 'startTurn' }, balance);
    }
    // 終了判定は endTurn の中でしか起きないので、記録もここで 1 回だけ行う
    if (next.phase === 'finished') {
      const progress = loadProgress();
      const winner = winnerOf(next, balance);
      saveProgress({
        wins: progress.wins + (winner === 'you' ? 1 : 0),
        losses: progress.losses + (winner === 'cpu' ? 1 : 0),
        lastDifficulty: difficulty,
      });
    }
    setState(next);
  };

  const useCard = (card: CardId) => {
    if (card === 'herald') return setSheet({ kind: 'heraldTarget' });
    if (card === 'blockader') return setSheet({ kind: 'blockadeTarget' });
    const next = reduce(state, { type: 'useCard', card }, balance);
    setState(next);
    // 密偵は結果を見せないと使った意味が無い
    if (card === 'spy' && next.revealedOpponentHand) {
      setSheet({ kind: 'spyResult', hand: next.revealedOpponentHand });
    }
  };

  // 街道を持っているあいだ、毎ターン 1 回だけ手札を 1 枚無料で流せる
  const roadAvailable =
    hasBuilding(state, 'you', 'road') &&
    handOf(state, 'you', balance).some((c) => canUseRoad(state, c, balance));

  return (
    <div className="app app-play">
      <header className="header">
        <div className="header-row">
          <div className="header-left">
            <button className="icon-btn" onClick={onExit} aria-label="戻る">
              ←
            </button>
          </div>
          <h1 className="title">シティビルダーズ</h1>
          <div className="header-actions">
            <button className="icon-btn" aria-label="あそびかた" onClick={() => setSheet({ kind: 'help' })}>
              ?
            </button>
          </div>
        </div>
        <div className="status-bar">
          <span className="stat">ターン {Math.ceil(state.turn / 2)}</span>
          <span className="stat">あなた {scoreOf(state, 'you', balance)} VP</span>
          <span className="stat">CPU {scoreOf(state, 'cpu', balance)} VP</span>
          <span className="stat">残り {state.market.filter((s) => s.owner === null).length}</span>
        </div>
      </header>

      <main className="play">
        <div className="board-shell">
          <OpponentStrip state={state} balance={balance} />
          <div className="board-area">
            <Board
              state={state}
              balance={balance}
              onPick={(slotId) => setSheet({ kind: 'slot', slotId })}
            />
          </div>
          <CoinBar
            state={state}
            balance={balance}
            onRoad={() => setSheet({ kind: 'roadTarget' })}
            roadEnabled={roadAvailable}
            onEndTurn={endTurn}
            endTurnEnabled={!finished}
          />
          <Hand
            state={state}
            balance={balance}
            canUse={(card) => canUseCard(state, card, balance)}
            onPick={(card) => setSheet({ kind: 'card', card })}
          />
        </div>
      </main>

      {sheet?.kind === 'slot'
        ? (() => {
            const slot = state.market[sheet.slotId]!;
            return (
              <Sheet
                title={BUILDING_NAMES[slot.buildingId]}
                subtitle={`コスト ${buildCostFor(state, 'you', sheet.slotId, balance)} ・ ${
                  slot.buildingId === 'cathedral'
                    ? `自分の他の物件 1 件につき +${balance.cathedralVpPerBuilding} VP`
                    : `${balance.buildings[slot.buildingId].vp} VP`
                }`}
                onClose={() => setSheet(null)}
              >
                <p className="sheet-text">{BUILDING_TEXTS[slot.buildingId]}</p>
                {slot.owner === null && state.players.you.blockedSlot === sheet.slotId ? (
                  <p className="sheet-text">
                    相手の封鎖者に封鎖されています。次のターンまで建てられません。
                  </p>
                ) : null}
                <button
                  className="home-btn primary"
                  disabled={!canBuild(state, sheet.slotId, balance)}
                  onClick={() => {
                    setState(reduce(state, { type: 'build', slotId: sheet.slotId }, balance));
                    setSheet(null);
                  }}
                >
                  建てる
                </button>
              </Sheet>
            );
          })()
        : null}

      {sheet?.kind === 'card' ? (
        <Sheet
          title={CARD_NAMES[sheet.card]}
          subtitle={`コスト ${balance.cards[sheet.card].cost}`}
          onClose={() => setSheet(null)}
        >
          <p className="sheet-text">{CARD_TEXTS[sheet.card]}</p>
          <button
            className="home-btn primary"
            disabled={!canUseCard(state, sheet.card, balance)}
            onClick={() => {
              const card = sheet.card;
              setSheet(null);
              useCard(card);
            }}
          >
            使う
          </button>
        </Sheet>
      ) : null}

      {sheet?.kind === 'heraldTarget' ? (
        <Sheet title="どのカードを底へ送る？" onClose={() => setSheet(null)}>
          {handOf(state, 'you', balance)
            .filter((c) => c !== 'herald')
            .map((c) => (
              <button
                key={c}
                className="sheet-row"
                onClick={() => {
                  setState(
                    reduce(state, { type: 'useCard', card: 'herald', heraldTarget: c }, balance),
                  );
                  setSheet(null);
                }}
              >
                {CARD_NAMES[c]}
              </button>
            ))}
        </Sheet>
      ) : null}

      {sheet?.kind === 'blockadeTarget' ? (
        <Sheet title="どの物件を封鎖する？" onClose={() => setSheet(null)}>
          {state.market
            .filter((s) => s.owner === null)
            .map((s) => (
              <button
                key={s.slotId}
                className="sheet-row"
                onClick={() => {
                  setState(
                    reduce(
                      state,
                      { type: 'useCard', card: 'blockader', blockadeSlot: s.slotId },
                      balance,
                    ),
                  );
                  setSheet(null);
                }}
              >
                {BUILDING_NAMES[s.buildingId]}
              </button>
            ))}
        </Sheet>
      ) : null}

      {sheet?.kind === 'roadTarget' ? (
        <Sheet
          title="どのカードを底へ送る？"
          subtitle="街道の効果。コストはかからない"
          onClose={() => setSheet(null)}
        >
          {handOf(state, 'you', balance)
            .filter((c) => canUseRoad(state, c, balance))
            .map((c) => (
              <button
                key={c}
                className="sheet-row"
                onClick={() => {
                  setState(reduce(state, { type: 'useRoad', target: c }, balance));
                  setSheet(null);
                }}
              >
                {CARD_NAMES[c]}
              </button>
            ))}
        </Sheet>
      ) : null}

      {sheet?.kind === 'spyResult' ? (
        <Sheet
          title="相手の手札"
          subtitle="覚えておくのはあなたの仕事"
          onClose={() => setSheet(null)}
        >
          {sheet.hand.map((c, i) => (
            <p key={`${c}-${i}`} className="sheet-row">
              {CARD_NAMES[c]}
            </p>
          ))}
        </Sheet>
      ) : null}

      {sheet?.kind === 'help' ? (
        <Sheet title="あそびかた" onClose={() => setSheet(null)}>
          <p className="sheet-text">
            人物カードを使ってコインを稼ぎ、まん中の物件を建てます。物件は早い者勝ちで、
            VP（勝利点）は物件からしか手に入りません。10 件すべてが建つとゲームが終わり、
            VP の多いほうが勝ちです。
          </p>
          <p className="sheet-text">
            投資カード（採掘師・商人・銀行家）のコインが入るのは<b>次のターン</b>です。
            だからコインの右に「次のターン +N」を出しています。今建てるか、
            次のターンに回すかを、この 2 つの数字で比べてください。
          </p>
          <p className="sheet-text">
            手札 4 枚はデッキの先頭 4 枚です。使ったカードだけが山の一番下へ回り、
            使わなかったカードは残ります。つまり<b>何枚で止めるかが、次のターンの手札を決めます</b>。
            左下の「次」で 1 枚先まで見えます。
          </p>
          <p className="sheet-text">
            相手も同じ 8 種を持っています。徴税官でコインを奪われ、封鎖者で物件を 1 つ
            押さえられます。密偵で相手の手札を覗くか、城壁を建てて防いでください。
          </p>
        </Sheet>
      ) : null}

      {finished ? (
        <Sheet
          title={
            winnerOf(state, balance) === 'you'
              ? 'あなたの勝ち'
              : winnerOf(state, balance) === 'cpu'
                ? 'CPU の勝ち'
                : '引き分け'
          }
          subtitle={`${scoreOf(state, 'you', balance)} VP 対 ${scoreOf(state, 'cpu', balance)} VP`}
          onClose={onExit}
        >
          <button className="home-btn primary" onClick={onExit}>
            ホームへ
          </button>
        </Sheet>
      ) : null}
    </div>
  );
}
