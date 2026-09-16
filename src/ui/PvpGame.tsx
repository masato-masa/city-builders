import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

import { BUILDING_NAMES, BUILDING_TEXTS, CARD_NAMES, CARD_TEXTS, DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { buildCostFor, canBuild, canUseCard, canUseRoad, reduce } from '@/game/reducer';
import { handOf, opponentOf, roadUsesRemaining, scoreOf, turnsRemaining, winnerOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { CardId, GameState, PlayerId } from '@/game/types';

import { CARD_ART, FIELD_URL } from './art';
import { Board } from './Board';
import { CoinBar } from './CoinBar';
import { hapticBuild, hapticReject, hapticUseCard, hapticWin } from './haptics';
import { Hand } from './Hand';
import { TurnClockIcon } from './icons';
import { InfoBoard } from './InfoBoard';
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
  | { kind: 'menu' }
  | { kind: 'confirmExit' }
  | { kind: 'help' }
  | { kind: 'settings' }
  | null;

// 対 CPU モードの表示色（--owner-you=青系, --owner-cpu=赤/橙系）に合わせた
// PvP の呼び方。内部 ID（'you'/'cpu'）は変えず、表示ラベルだけこれを使う。
const PLAYER_LABEL: Record<PlayerId, string> = { you: 'あお', cpu: 'あか' };

// 手番交代のスライドが終わるまでの時間。この間は操作を無効化する。
const SWAP_DURATION_MS = 380;
const SWAP_DURATION_S = SWAP_DURATION_MS / 1000;

export function PvpGame({
  seed,
  balance = DEFAULT_BALANCE,
  onExit,
  onRestart,
}: {
  seed: number;
  balance?: Balance;
  onExit: () => void;
  onRestart: () => void;
}) {
  // PvP は常に 'you' を先手にする（対 CPU モードの乱数先手とは別扱い）。
  const [state, setState] = useState<GameState>(() => {
    const g = createGame(seed, balance, 'you');
    return reduce(g, { type: 'startTurn' }, balance);
  });
  const [sheet, setSheet] = useState<Pending>(null);
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [hapticsOn, setHapticsOn] = useState(() => isHapticsEnabled());
  // ターン交代のスライド演出中は操作を無効化する。
  const [swapping, setSwapping] = useState(false);

  const finished = state.phase === 'finished';
  const active = state.current;
  const waiting = opponentOf(active);

  useEffect(() => {
    if (!swapping) return;
    const timer = window.setTimeout(() => setSwapping(false), SWAP_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [swapping]);

  // 勝敗が付いた瞬間に 1 回だけ鳴らす。PvP はどちらも人間なので勝ち/負けの
  // 効果音を出し分けず、対戦終了のファンファーレだけ鳴らす。
  useEffect(() => {
    if (!finished) return;
    playWin();
    hapticWin();
  }, [finished]);

  const useCard = (card: CardId) => {
    if (card === 'herald') return setSheet({ kind: 'heraldTarget' });
    if (card === 'blockader') return setSheet({ kind: 'blockadeTarget' });
    playUseCard(card);
    hapticUseCard();
    setState(reduce(state, { type: 'useCard', card }, balance));
  };

  // 終了ボタン: endTurn → (終わっていなければ) startTurn まで進めてから、
  // 帯の入れ替えアニメーションを始める。コインの増減音は次の手番側の
  // startTurn 前後の差分で判定する（Game.tsx の finishCpuTurn と同じ考え方）。
  const endTurn = () => {
    playEndTurn();
    const afterEnd = reduce(state, { type: 'endTurn' }, balance);
    if (afterEnd.phase === 'finished') {
      setState(afterEnd);
      return;
    }
    const before = afterEnd.players[afterEnd.current].coins;
    const afterStart = reduce(afterEnd, { type: 'startTurn' }, balance);
    const delta = afterStart.players[afterStart.current].coins - before;
    if (delta > 0) playCoinGain(delta);
    else if (delta < 0) playDebtSink();
    setSwapping(true);
    setState(afterStart);
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
      <main className="play">
        <div className="board-shell">
          <div className="pvp-opponent">
            <AnimatePresence initial={false}>
              <motion.div
                key={waiting}
                initial={{ opacity: 0, y: -28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 28, pointerEvents: 'none' }}
                transition={{ duration: SWAP_DURATION_S, ease: 'easeInOut' }}
              >
                <InfoBoard
                  owner={waiting}
                  name={PLAYER_LABEL[waiting]}
                  coins={state.players[waiting].coins}
                  vp={scoreOf(state, waiting, balance)}
                  right={
                    <span className="turn-clock" aria-label={`残り ${turnsRemaining(state, balance)} ターン`}>
                      <TurnClockIcon />
                      <span className="turn-clock-num">{turnsRemaining(state, balance)}</span>
                    </span>
                  }
                  sub={null}
                />
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="board-area">
            <Board
              state={state}
              balance={balance}
              viewer={active}
              onPick={(slotId) => {
                if (swapping) return;
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
          <div className="pvp-self">
            <AnimatePresence initial={false}>
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -28, pointerEvents: 'none' }}
                transition={{ duration: SWAP_DURATION_S, ease: 'easeInOut' }}
              >
                <CoinBar
                  state={state}
                  balance={balance}
                  viewer={active}
                  name={PLAYER_LABEL[active]}
                  onEndTurn={endTurn}
                  endTurnEnabled={!finished && !swapping}
                />
                <Hand
                  state={state}
                  balance={balance}
                  viewer={active}
                  canUse={(card) => !swapping && canUseCard(state, card, balance)}
                  onPick={(card) => {
                    if (swapping) return;
                    if (canUseCard(state, card, balance)) {
                      playSelect();
                    } else {
                      playReject();
                      hapticReject();
                    }
                    setSheet({ kind: 'card', card });
                  }}
                  onMenu={() => {
                    if (swapping) return;
                    playSelect();
                    setSheet({ kind: 'menu' });
                  }}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* シート類は Game.tsx と同じ構成。'you' 決め打ちの参照だけ、いまの
          手番側を表す active (= state.current) に置き換えている。 */}
      <AnimatePresence>
        {sheet?.kind === 'slot'
          ? (() => {
              const slot = state.market[sheet.slotId]!;
              return (
                <Sheet
                  key="slot"
                  title={BUILDING_NAMES[slot.buildingId]}
                  subtitle={`コスト ${buildCostFor(state, active, sheet.slotId, balance)} ・ ${
                    slot.buildingId === 'cathedral'
                      ? `自分の他の物件 1 件につき +${balance.cathedralVpPerBuilding} VP`
                      : `${balance.buildings[slot.buildingId].vp} VP`
                  }`}
                  onClose={() => setSheet(null)}
                >
                  <p className="sheet-text">{BUILDING_TEXTS[slot.buildingId]}</p>
                  {slot.owner === null && state.players[active].blockedSlot === sheet.slotId ? (
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
              <span className="road-btn-sub">街道・あと {roadUsesRemaining(state, active, balance)} 回</span>
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
            {handOf(state, active, balance)
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
              .filter((s) => s.owner !== active)
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
        {sheet?.kind === 'menu' ? (
          <Sheet key="menu" title="メニュー" onClose={() => setSheet(null)}>
            <button className="sheet-row danger" onClick={() => setSheet({ kind: 'confirmExit' })}>
              あきらめる
            </button>
            <button className="sheet-row" onClick={() => setSheet({ kind: 'help' })}>
              あそびかた
            </button>
            <button className="sheet-row" onClick={() => setSheet({ kind: 'settings' })}>
              設定
            </button>
          </Sheet>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {sheet?.kind === 'confirmExit' ? (
          <Sheet key="confirmExit" title="あきらめますか？" onClose={() => setSheet({ kind: 'menu' })}>
            <p className="sheet-text">ここまでの進行はきろくに残りません。</p>
            <button className="home-btn primary" onClick={onExit}>
              あきらめる
            </button>
            <button className="sheet-link" onClick={() => setSheet({ kind: 'menu' })}>
              もどる
            </button>
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
                ? 'あおの勝ち'
                : winnerOf(state, balance) === 'cpu'
                  ? 'あかの勝ち'
                  : '引き分け'
            }
            subtitle={`あお ${scoreOf(state, 'you', balance)} VP 対 あか ${scoreOf(state, 'cpu', balance)} VP`}
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
