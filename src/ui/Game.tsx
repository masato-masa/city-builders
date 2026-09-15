import { AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';

import type { Difficulty } from '@/ai/choose';
import { BUILDING_NAMES, BUILDING_TEXTS, CARD_NAMES, CARD_TEXTS, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { buildCostFor, canBuild, canUseCard, canUseRoad, reduce } from '@/game/reducer';
import { createRng, type Rng } from '@/game/rng';
import { handOf, roadUsesRemaining, scoreOf, turnsRemaining, winnerOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';
import { loadProgress, saveProgress } from '@/storage/storage';

import { CARD_ART, FIELD_URL } from './art';
import { Board } from './Board';
import { CoinBar } from './CoinBar';
import { type CpuStep, playTurnSteps } from './cpu-turn';
import { hapticBuild, hapticLose, hapticReject, hapticUseCard, hapticWin } from './haptics';
import { Hand } from './Hand';
import { SettingsIcon, TurnClockIcon } from './icons';
import { OpponentStrip } from './OpponentStrip';
import { Sheet } from './Sheets';
import {
  isHapticsEnabled,
  isSoundEnabled,
  setHapticsEnabled,
  setSoundEnabled,
} from './settings';
import {
  playBuild,
  playCoinGain,
  playDebtSink,
  playEndTurn,
  playLose,
  playReject,
  playSelect,
  playUseCard,
  playWin,
} from './sound';

type Pending =
  | { kind: 'slot'; slotId: number }
  | { kind: 'card'; card: CardId }
  | { kind: 'heraldTarget' }
  | { kind: 'blockadeTarget' }
  | { kind: 'help' }
  | { kind: 'settings' }
  | null;

export function Game({
  seed,
  difficulty,
  balance = DEFAULT_BALANCE,
  onExit,
  onRestart,
}: {
  seed: number;
  difficulty: Difficulty;
  balance?: Balance;
  onExit: () => void;
  onRestart: () => void;
}) {
  const [rng] = useState<Rng>(() => createRng(seed * 7919 + 13));
  const [state, setState] = useState<GameState>(() => {
    const g = createGame(seed, balance);
    // プレイヤーが先手なら、ここで最初のターンの開始処理をすませる。
    // 後手（CPU が先手）なら何もせず、下の useEffect が CPU の 1 手番を
    // ログ付きで進める（プレイヤーの最初の startTurn はその手番の終わりに続く）。
    return g.current === 'you' ? reduce(g, { type: 'startTurn' }, balance) : g;
  });
  const [sheet, setSheet] = useState<Pending>(null);
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [hapticsOn, setHapticsOn] = useState(() => isHapticsEnabled());

  // CPU の手番を 1 手ずつ出すための進行役。null のときは進行中ではない。
  const [cpuTurn, setCpuTurn] = useState<{ steps: CpuStep[]; revealed: number } | null>(null);
  // 画面に見せる実況ログ。直前の CPU の手番ぶんが、次の CPU の手番が始まるまで残る。
  const [cpuLog, setCpuLog] = useState<string[]>([]);
  const cpuActing = cpuTurn !== null;

  const finished = state.phase === 'finished';

  const recordIfFinished = (result: GameState) => {
    if (result.phase !== 'finished') return;
    const progress = loadProgress();
    const winner = winnerOf(result, balance);
    saveProgress({
      wins: progress.wins + (winner === 'you' ? 1 : 0),
      losses: progress.losses + (winner === 'cpu' ? 1 : 0),
      lastDifficulty: difficulty,
    });
  };

  // CPU の 1 手番の結果を、実際の state に反映する。次のプレイヤーの手番があれば
  // その startTurn も済ませ、ゲームが終わっていれば記録する。
  // startTurn の前後でコインが増えていれば「コインが増える」音、減っていれば
  // （高利貸の返済が収入を上回ったときだけ起こる。startTurn 内で唯一マイナスに
  // なりうる処理）「引かれる」沈む音を鳴らす。
  const finishCpuTurn = (result: GameState) => {
    const before = result.players.you.coins;
    const final = result.phase === 'playing' ? reduce(result, { type: 'startTurn' }, balance) : result;
    if (result.phase === 'playing') {
      const delta = final.players.you.coins - before;
      if (delta > 0) playCoinGain(delta);
      else if (delta < 0) playDebtSink();
    }
    recordIfFinished(final);
    setState(final);
  };

  const endTurn = () => {
    playEndTurn();
    const next = reduce(state, { type: 'endTurn' }, balance);
    recordIfFinished(next);
    setState(next);
  };

  // CPU の手番になったら、1 手ずつ出す行動列をまとめて計算しておく。
  // src/ai は変更せず、公開されている chooseAction を使う playTurnSteps に任せる。
  useEffect(() => {
    if (state.phase !== 'playing') return;
    if (state.current !== 'cpu') return;
    if (cpuTurn !== null) return;
    // ゲーム開始時、後手（CPU が先手）の最初の 1 手番だけは seed 直結の乱数を使う
    // （それ以外の CPU の手番は、ずっと使い続けている共有の rng を使う）。
    // これは元の実装（seed だけから作る乱数で先手番を進める）をそのまま踏襲している。
    const stepRng = state.turn === 1 ? createRng(seed) : rng;
    setCpuLog([]);
    setCpuTurn({ steps: playTurnSteps(state, difficulty, stepRng, balance), revealed: 0 });
  }, [state]);

  // 1 手ずつ間を空けて出す。手数に応じて間隔を決め、合計がだいたい 2 秒に収まるようにする。
  // 振動は入れない（プレイヤーが起こしていない操作でスマホを震わせると誤動作に見えるため）。
  // 音は CPU の手番も鳴らし、進行を実況ログと一緒に音でも伝える。
  useEffect(() => {
    if (!cpuTurn) return;
    const { steps, revealed } = cpuTurn;
    const step = steps[revealed];
    if (!step) return;
    const isLast = revealed === steps.length - 1;
    const delayMs = Math.max(220, Math.min(650, 2000 / steps.length));
    const timer = window.setTimeout(() => {
      setCpuLog((prev) => [...prev, step.log]);
      if (step.action.type === 'useCard') playUseCard(step.action.card);
      else if (step.action.type === 'build') playBuild();
      else if (step.action.type === 'endTurn') playEndTurn();
      if (isLast) {
        finishCpuTurn(step.state);
        setCpuTurn(null);
      } else {
        setState(step.state);
        setCpuTurn((prev) => (prev ? { ...prev, revealed: prev.revealed + 1 } : prev));
      }
    }, delayMs);
    return () => window.clearTimeout(timer);
    // eslint 的な exhaustive-deps はこのプロジェクトに無い。cpuTurn の変化だけを見る。
  }, [cpuTurn]);

  // 勝敗が付いた瞬間に 1 回だけ鳴らす。
  useEffect(() => {
    if (!finished) return;
    const winner = winnerOf(state, balance);
    if (winner === 'you') {
      playWin();
      hapticWin();
    } else if (winner === 'cpu') {
      playLose();
      hapticLose();
    }
    // eslint 的な exhaustive-deps はこのプロジェクトに無い。finished の変化だけを見る。
  }, [finished]);

  const useCard = (card: CardId) => {
    if (card === 'herald') return setSheet({ kind: 'heraldTarget' });
    if (card === 'blockader') return setSheet({ kind: 'blockadeTarget' });
    playUseCard(card);
    hapticUseCard();
    const next = reduce(state, { type: 'useCard', card }, balance);
    setState(next);
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  };
  const toggleHaptics = () => {
    const next = !hapticsOn;
    setHapticsOn(next);
    setHapticsEnabled(next);
  };

  return (
    <div className="app app-play" style={{ backgroundImage: `url(${FIELD_URL})` }}>
      <header className="header">
        <div className="header-row">
          <div className="header-left">
            <button className="icon-btn" onClick={onExit} aria-label="戻る">
              ←
            </button>
          </div>
          <div className="turn-clock" aria-label={`残り ${turnsRemaining(state, balance)} ターン`}>
            <TurnClockIcon />
            <span className="turn-clock-text">
              残り <span className="turn-clock-num">{turnsRemaining(state, balance)}</span> ターン
            </span>
          </div>
          <div className="header-actions">
            <button className="icon-btn" aria-label="あそびかた" onClick={() => setSheet({ kind: 'help' })}>
              ?
            </button>
            <button className="icon-btn" aria-label="設定" onClick={() => setSheet({ kind: 'settings' })}>
              <SettingsIcon />
            </button>
          </div>
        </div>
      </header>

      <main className="play">
        <div className="board-shell">
          <OpponentStrip state={state} balance={balance} log={cpuLog} />
          <div className="board-area">
            <Board
              state={state}
              balance={balance}
              onPick={(slotId) => {
                if (cpuActing) return;
                const slot = state.market[slotId];
                if (slot && slot.owner === null && !canBuild(state, slotId, balance)) {
                  playReject();
                  hapticReject();
                } else {
                  playSelect();
                }
                setSheet({ kind: 'slot', slotId });
              }}
            />
          </div>
          <CoinBar
            state={state}
            balance={balance}
            onEndTurn={endTurn}
            endTurnEnabled={!finished && !cpuActing}
          />
          <Hand
            state={state}
            balance={balance}
            canUse={(card) => !cpuActing && canUseCard(state, card, balance)}
            onPick={(card) => {
              if (cpuActing) return;
              if (canUseCard(state, card, balance)) {
                playSelect();
              } else {
                playReject();
                hapticReject();
              }
              setSheet({ kind: 'card', card });
            }}
          />
        </div>
      </main>

      <AnimatePresence>
        {sheet?.kind === 'slot'
          ? (() => {
              const slot = state.market[sheet.slotId]!;
              return (
                <Sheet
                  key="slot"
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
                      playBuild();
                      hapticBuild();
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
      </AnimatePresence>

      <AnimatePresence>
        {sheet?.kind === 'card' ? (
          <Sheet
            key="card"
            title={CARD_NAMES[sheet.card]}
            subtitle={`コスト ${balance.cards[sheet.card].cost}`}
            onClose={() => setSheet(null)}
          >
            {CARD_ART[sheet.card] ? (
              <img className="sheet-card-art" src={CARD_ART[sheet.card]} alt="" />
            ) : null}
            <p className="sheet-text">{CARD_TEXTS[sheet.card]}</p>
            {/* 街道の効果。以前はコインバーの専用ボタンから対象を選んでいたが、
                いまはカードを選んだこのシートの中、「使う」の上に置く（要望 2）。
                街道を持っていない／使い切っているときも、ボタンは消さず disabled にする。 */}
            <button
              className="sheet-row road-btn"
              disabled={!canUseRoad(state, sheet.card, balance)}
              onClick={() => {
                const card = sheet.card;
                playSelect();
                setSheet(null);
                setState(reduce(state, { type: 'useRoad', target: card }, balance));
              }}
            >
              <span>山の底へ送る</span>
              <span className="road-btn-sub">街道・あと {roadUsesRemaining(state, 'you', balance)} 回</span>
            </button>
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
      </AnimatePresence>

      <AnimatePresence>
        {sheet?.kind === 'heraldTarget' ? (
          <Sheet key="heraldTarget" title="どのカードを底へ送る？" onClose={() => setSheet(null)}>
            {handOf(state, 'you', balance)
              .filter((c) => c !== 'herald')
              .map((c) => (
                <button
                  key={c}
                  className="sheet-row"
                  onClick={() => {
                    playUseCard('herald');
                    hapticUseCard();
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
      </AnimatePresence>

      <AnimatePresence>
        {sheet?.kind === 'blockadeTarget' ? (
          <Sheet key="blockadeTarget" title="どの区画を封鎖する？" onClose={() => setSheet(null)}>
            {state.market
              .filter((s) => s.owner !== 'you')
              .map((s) => (
                <button
                  key={s.slotId}
                  className="sheet-row"
                  onClick={() => {
                    playUseCard('blockader');
                    hapticUseCard();
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
      </AnimatePresence>

      <AnimatePresence>
        {sheet?.kind === 'help' ? (
          <Sheet key="help" title="あそびかた" onClose={() => setSheet(null)}>
            <p className="sheet-text">
              人物カードを使ってコインを稼ぎ、まん中の物件を建てます。物件は早い者勝ちで、
              VP（勝利点）は物件からしか手に入りません。10 件すべてが建つとゲームが終わり、
              VP の多いほうが勝ちです。
            </p>
            <p className="sheet-text">
              投資カード（採掘師・銀行家）のコインが入るのは<b>次のターン</b>です。
              だからコインの右に「次のターン +N」を出しています。今建てるか、
              次のターンに回すかを、この 2 つの数字で比べてください。
            </p>
            <p className="sheet-text">
              手札 4 枚はデッキの先頭 4 枚です。使ったカードだけが山の一番下へ回り、
              使わなかったカードは残ります。つまり<b>何枚で止めるかが、次のターンの手札を決めます</b>。
              左下の「次」で 1 枚先まで見えます。
            </p>
            <p className="sheet-text">
              相手も同じ 10 種を持っています。徴税官でコインを奪われ、封鎖者で区画を 1 つ
              押さえられ、買収者で手札を 1 枚縛られます。衛兵を張るか、城壁を建てて防いでください。
            </p>
          </Sheet>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {sheet?.kind === 'settings' ? (
          <Sheet key="settings" title="設定" onClose={() => setSheet(null)}>
            <div className="sheet-row static">
              <span>効果音</span>
              <button
                className="switch"
                role="switch"
                aria-checked={soundOn}
                aria-label="効果音"
                onClick={toggleSound}
              />
            </div>
            <div className="sheet-row static">
              <span>振動</span>
              <button
                className="switch"
                role="switch"
                aria-checked={hapticsOn}
                aria-label="振動"
                onClick={toggleHaptics}
              />
            </div>
          </Sheet>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {finished ? (
          <Sheet
            key="finished"
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
            <button className="home-btn primary" onClick={onRestart}>
              もう一度
            </button>
            <button className="home-btn" onClick={onExit}>
              ホームへ
            </button>
          </Sheet>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
