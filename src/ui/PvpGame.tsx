import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import {
  BUILDING_NAMES,
  buildingTextFor,
  CARD_NAMES,
  cardTextFor,
  DEFAULT_BALANCE,
  type Balance,
} from '@/game/balance';
import { buildCostFor, canBuild, canUseCard, canUseRoad, cardCostFor, reduce } from '@/game/reducer';
import { handSlotsOf, opponentOf, ownedSlots, roadUsesRemaining, scoreOf, turnsRemaining, winnerOf } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { CardId, GameState } from '@/game/types';

import { CARD_ART, FIELD_URL } from './art';
import { Board } from './Board';
import { CoinBar, forecast } from './CoinBar';
import { CardFlightLayer, TurnBanner, useCardFlights, useTurnBanner } from './Fx';
import { hapticBuild, hapticReject, hapticTap, hapticUseCard, hapticWin, hapticYourTurn } from './haptics';
import { Hand } from './Hand';
import { InfoBoard } from './InfoBoard';
import { ResultScreen } from './ResultScreen';
import { Sheet } from './Sheets';
import { TargetBanner } from './TargetBanner';
import { TurnBadge } from './TurnBadge';
import {
  isHapticsEnabled,
  isSoundEnabled,
  setHapticsEnabled,
  setSoundEnabled,
} from './settings';
import {
  playBuild,
  playEndTurn,
  playReject,
  playSelect,
  playUiTap,
  playUseCard,
  playWin,
  playYourTurn,
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
  const waitingIncome = forecast(state, waiting, balance);

  // 結果画面は、最後の 1 手（建物の着地・数字の弾み）を見せてから出す。
  const [resultReady, setResultReady] = useState(false);
  useEffect(() => {
    if (!finished) return;
    const t = window.setTimeout(() => setResultReady(true), 900);
    return () => window.clearTimeout(t);
  }, [finished]);

  const boardAreaRef = useRef<HTMLDivElement>(null);
  const { flights, fly } = useCardFlights();
  /** 手札の札の絵を盤面の中央へ飛ばす（使った手応え）。札が手札から消える前に呼ぶ。 */
  const flyCard = (card: CardId) =>
    fly(document.querySelector(`.hand [data-card="${card}"]`), CARD_ART[card], boardAreaRef.current);

  // 手番が替わるたびに盤面を横切る帯を出す（ゲーム開始の 1 回目も）。
  const [banner, clearBanner] = useTurnBanner(`${state.phase}:${state.current}:${state.turn}`, () =>
    state.phase !== 'playing'
      ? null
      : {
          tone: state.current,
          label: state.current === 'you' ? 'あおのターン' : 'あかのターン',
          sub: `のこり ${turnsRemaining(state, balance)} ターン`,
        },
  );

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
    flyCard(card);
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
    // 手番交代の合図の鐘と、次の手番側の収入の音をまとめて鳴らす。
    playYourTurn(delta);
    hapticYourTurn();
    setSwapping(true);
    setState(afterStart);
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    playUiTap();
  };
  const toggleHaptics = () => {
    const next = !hapticsOn;
    setHapticsOn(next);
    setHapticsEnabled(next);
    playUiTap();
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
                  coins={state.players[waiting].coins}
                  vp={scoreOf(state, waiting, balance)}
                  sub={
                    <span className="coinbar-forecast">
                      次ターン収入 {waitingIncome >= 0 ? `+${waitingIncome}` : waitingIncome}
                    </span>
                  }
                />
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="board-area" ref={boardAreaRef}>
            <Board
              state={state}
              balance={balance}
              viewer={active}
              targeting={sheet?.kind === 'blockadeTarget'}
              onPick={(slotId) => {
                if (swapping) return;
                // 封鎖者の対象選択モード中は、通常の区画詳細シートを開かず、
                // タップした区画をそのまま対象にして確定する（要望 G3）。
                if (sheet?.kind === 'blockadeTarget') {
                  const slot = state.market[slotId];
                  if (!slot || slot.owner === active) {
                    playReject();
                    hapticReject();
                    return;
                  }
                  playUseCard('blockader');
                  hapticUseCard();
                  flyCard('blockader');
                  setState(
                    reduce(state, { type: 'useCard', card: 'blockader', blockadeSlot: slotId }, balance),
                  );
                  setSheet(null);
                  return;
                }
                const slot = state.market[slotId];
                if (slot && slot.owner === null && !canBuild(state, slotId, balance)) {
                  playReject();
                  hapticReject();
                } else {
                  playSelect();
                  hapticTap();
                }
                setSheet({ kind: 'slot', slotId });
              }}
            />
            <TurnBadge state={state} balance={balance} />
            <TurnBanner banner={banner} onDone={clearBanner} />
            {/* 対象選択中の案内はここ（盤面コンテナ）基準で上端中央に置く（要望
                G3）。伝令は手札が対象だが、案内を手札のすぐ上に出すと自分の
                コインバーと重なるため、封鎖者と同じ場所にまとめる。実際にどこを
                タップするかは対象側（盤面の区画／手札のカード）が光って示す。 */}
            <AnimatePresence>
              {sheet?.kind === 'blockadeTarget' ? (
                <TargetBanner key="blockadeTarget" onCancel={() => setSheet(null)} />
              ) : null}
              {sheet?.kind === 'heraldTarget' ? (
                <TargetBanner
                  key="heraldTarget"
                  label="伝令モード中・山の底へ送るカードを手札からタップ"
                  onCancel={() => setSheet(null)}
                />
              ) : null}
            </AnimatePresence>
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
                  onEndTurn={endTurn}
                  endTurnEnabled={!finished && !swapping}
                  active={!finished}
                  endTurnHint={
                    !handSlotsOf(state, active).some((c) => c !== null && canUseCard(state, c, balance)) &&
                    !state.market.some((m) => canBuild(state, m.slotId, balance))
                  }
                />
                <Hand
                  state={state}
                  balance={balance}
                  viewer={active}
                  canUse={(card) => !swapping && canUseCard(state, card, balance)}
                  targeting={sheet?.kind === 'heraldTarget'}
                  selected={sheet?.kind === 'card' ? sheet.card : null}
                  onPick={(card) => {
                    if (swapping) return;
                    if (sheet?.kind === 'heraldTarget') {
                      if (card === 'herald') {
                        playReject();
                        hapticReject();
                        return;
                      }
                      playUseCard('herald');
                      hapticUseCard();
                      flyCard('herald');
                      setState(
                        reduce(state, { type: 'useCard', card: 'herald', heraldTarget: card }, balance),
                      );
                      setSheet(null);
                      return;
                    }
                    if (canUseCard(state, card, balance)) {
                      playSelect();
                      hapticTap();
                    } else {
                      playReject();
                      hapticReject();
                    }
                    setSheet({ kind: 'card', card });
                  }}
                  onMenu={() => {
                    if (swapping) return;
                    playUiTap();
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
                  <p className="sheet-text">{buildingTextFor(slot.buildingId, balance)}</p>
                  {slot.owner === null && state.players[active].blockedSlot === sheet.slotId ? (
                    <p className="sheet-text">
                      相手の封鎖者に封鎖されています。解除されるまで建てられません。
                    </p>
                  ) : null}
                  <button
                    className="btn3d btn3d-yellow"
                    disabled={!canBuild(state, sheet.slotId, balance)}
                    onClick={() => {
                      playBuild();
                      hapticBuild();
                      setState(reduce(state, { type: 'build', slotId: sheet.slotId }, balance));
                      setSheet(null);
                    }}
                  >
                    {/* 押せない理由をボタンの上で言う（灰色のボタンだけでは何が足りないか分からない）。 */}
                    {slot.owner !== null
                      ? '建設済み'
                      : state.players[active].blockedSlot === sheet.slotId
                        ? '封鎖中'
                        : canBuild(state, sheet.slotId, balance) || state.current !== active
                          ? '建てる'
                          : `あと ${buildCostFor(state, active, sheet.slotId, balance) - state.players[active].coins} コイン`}
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
            <p className="sheet-text">{cardTextFor(sheet.card, balance)}</p>
            {sheet.card === 'blockader' ? (
              <p className="sheet-text">永続する効果です。解除する手段はいまはありません。</p>
            ) : null}
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
              className="btn3d btn3d-yellow"
              disabled={!canUseCard(state, sheet.card, balance)}
              onClick={() => {
                const card = sheet.card;
                setSheet(null);
                useCard(card);
              }}
            >
              {!canUseCard(state, sheet.card, balance) && state.players[active].boundCards.includes(sheet.card)
                ? '買収者に縛られている'
                : canUseCard(state, sheet.card, balance) ||
              state.current !== active ||
              state.players[active].coins >= cardCostFor(state, active, sheet.card, balance)
                ? '使う'
                : `あと ${cardCostFor(state, active, sheet.card, balance) - state.players[active].coins} コイン`}
            </button>
          </Sheet>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {sheet?.kind === 'menu' ? (
          <Sheet key="menu" title="メニュー" onClose={() => setSheet(null)}>
            <button className="sheet-row danger" onClick={() => { playUiTap(); setSheet({ kind: 'confirmExit' }); }}>
              あきらめる
            </button>
            <button className="sheet-row" onClick={() => { playUiTap(); setSheet({ kind: 'help' }); }}>
              あそびかた
            </button>
            <button className="sheet-row" onClick={() => { playUiTap(); setSheet({ kind: 'settings' }); }}>
              設定
            </button>
          </Sheet>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {sheet?.kind === 'confirmExit' ? (
          <Sheet key="confirmExit" title="あきらめますか？" onClose={() => setSheet({ kind: 'menu' })}>
            <p className="sheet-text">ここまでの進行はきろくに残りません。</p>
            <button className="btn3d btn3d-red" onClick={onExit}>
              あきらめる
            </button>
            <button className="sheet-link" onClick={() => { playUiTap(); setSheet({ kind: 'menu' }); }}>
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
              だからコインバーに「次ターン収入 +N」を出しています。今建てるか、
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
        {finished && resultReady
          ? (() => {
              const w = winnerOf(state, balance);
              return (
                <ResultScreen
                  key="result"
                  title={w === 'you' ? 'あおの勝ち！' : w === 'cpu' ? 'あかの勝ち！' : '引き分け'}
                  tone={w === null ? 'draw' : 'win'}
                  top={{
                    name: 'あか',
                    tone: 'cpu',
                    vp: scoreOf(state, 'cpu', balance),
                    buildings: ownedSlots(state, 'cpu').length,
                  }}
                  bottom={{
                    name: 'あお',
                    tone: 'you',
                    vp: scoreOf(state, 'you', balance),
                    buildings: ownedSlots(state, 'you').length,
                  }}
                  winner={w === 'you' ? 'bottom' : w === 'cpu' ? 'top' : null}
                  onRestart={onRestart}
                  onExit={onExit}
                />
              );
            })()
          : null}
      </AnimatePresence>

      <CardFlightLayer flights={flights} />
    </div>
  );
}
