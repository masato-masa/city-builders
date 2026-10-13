import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

import type { Difficulty } from '@/ai/choose';
import { BUILDING_NAMES, CARD_NAMES, CARD_POOL, type Balance } from '@/game/balance';
import { dailyFor, formatScore, localDateKey } from '@/meta/daily';
import { stepInfo } from '@/meta/rank';
import { clearDaily, loadDaily } from '@/storage/daily';
import { clearMeta, loadMeta } from '@/storage/meta';
import { recommendedDifficulty } from '@/meta/onboarding';
import { loadOnboarding, replayOnboarding } from '@/storage/onboarding';
import { clearProgress, loadProgress } from '@/storage/storage';

import { FIELD_URL } from './art';
import { loadBalance, loadTestDeck, resetBalance, saveBalance, saveTestDeck, type TestDeck } from './balance-store';
import { hapticTap } from './haptics';
import { CalendarIcon, CityEmblem, SwordIcon, VersusIcon } from './icons';
import { RankSheet, RankStars } from './RankRoad';
import { Sheet } from './Sheets';
import { playUiTap, primeAudio } from './sound';

/** 遊んだ感想を書く記録表（Claude の Artifact）。開発者向けのテスト用メニューの中だけに置く。 */
const REVIEW_BOARD_URL = 'https://claude.ai/artifact/Pye1XcbHCx3TfDkBpm2z2d';

const LABELS: Record<Difficulty, string> = {
  easy: 'やさしい',
  normal: 'ふつう',
  hard: 'つよい',
};

// CPU の強さが一言で伝わるように。文言はここだけで決めている。
/** 難易度の剣の本数。強さを文字を読まずに比べられるように。 */
const SWORDS: Record<Difficulty, number> = { easy: 1, normal: 2, hard: 3 };

const DESCRIPTIONS: Record<Difficulty, string> = {
  easy: 'CPU は迷いが多く妨害も控えめ',
  normal: 'CPU がふつうに戦います',
  hard: 'CPU が次の手番まで読んできます',
};

// タイトル → ボタン → 戦績の順に、少しずつ遅らせて出す。全体で 500ms 程度に収める。
// transform と opacity だけで動かす（レイアウトが動かないため）。
const SPRING = { type: 'spring', stiffness: 320, damping: 28, mass: 0.9 } as const;
const ENTER = [
  { hidden: { opacity: 0, y: -14 }, delay: 0 },
  { hidden: { opacity: 0, y: 16 }, delay: 0.08 },
  { hidden: { opacity: 0, y: 12 }, delay: 0.16 },
] as const;

/** 登場アニメーションを再生してよいか。
 *
 *  アニメーションは opacity 0 から始まるので、これが最後まで進まないと
 *  ホームがタイトルだけの画面になる。requestAnimationFrame は隠れたタブでは
 *  止まるため、「見えるようにする唯一の手段」をアニメーションに任せてはいけない。
 *  読み込み時点で隠れていたら、動かさず最初から最終形で描く。
 *  「動きを減らす」設定の人にも同じ扱いにする。 */
function shouldAnimateEntrance(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.hidden) return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function Home({
  onStart,
  onStartPvp,
  onStartDaily,
}: {
  onStart: (d: Difficulty) => void;
  onStartPvp: () => void;
  onStartDaily: (dateKey: string) => void;
}) {
  const progress = loadProgress();
  // 日替わり: 開いた時点の端末の日付で決める。
  const [today] = useState(() => localDateKey(new Date()));
  const daily = dailyFor(today);
  const [dailyRec, setDailyRec] = useState(() => loadDaily(today));
  const [meta, setMeta] = useState(loadMeta);
  const [dev, setDev] = useState(false);
  const [rankOpen, setRankOpen] = useState(false);
  // 初回に一度だけ決める。以後の再描画で値が変わって動きがちらつかないようにする。
  const [animateEntrance] = useState(shouldAnimateEntrance);
  const [balance, setBalance] = useState<Balance>(() => loadBalance());
  const [testDeck, setTestDeck] = useState<TestDeck>(loadTestDeck);

  const put = (next: Balance) => {
    setBalance(next);
    saveBalance(next);
  };

  const hasPlayed = progress.wins > 0 || progress.losses > 0;
  // はじめての人には「やさしい」を強調して勧める（ほかの難易度もそのまま押せる）。
  const [onboarding, setOnboarding] = useState(loadOnboarding);
  const recommended = recommendedDifficulty(progress.lastDifficulty, progress.wins + progress.losses, onboarding);

  return (
    <div className="app app-home" style={{ backgroundImage: `url(${FIELD_URL})` }}>
      {/* 奥行き: 石畳の上に、中央から差す光と周辺の落ち込みを重ねる（装飾のみ）。 */}
      <div className="home-light" aria-hidden="true" />
      <div className="home">
        <motion.div
          className="home-logo"
          initial={animateEntrance ? { opacity: 0, y: -24, scale: 0.86 } : false}
          animate={{ opacity: 1, y: 0, scale: 1, transition: { ...SPRING, delay: ENTER[0].delay } }}
        >
          <CityEmblem className="home-emblem" />
          <h1 className="home-title" aria-label="シティビルダーズ">
            <span className="home-title-small" data-text="シティ">シティ</span>
            <span className="home-title-big" data-text="ビルダーズ">ビルダーズ</span>
          </h1>
          <p className="home-sub">
            <span>人物を回して、都市を建てる</span>
          </p>
        </motion.div>

        <motion.div
          className="home-buttons"
          initial={animateEntrance ? ENTER[1].hidden : false}
          animate={{ opacity: 1, y: 0, transition: { ...SPRING, delay: ENTER[1].delay } }}
        >
          {(['easy', 'normal', 'hard'] as const).map((d) => {
            const primary = d === recommended.difficulty;
            return (
              <button
                key={d}
                className={`btn3d home-mode ${primary ? 'btn3d-yellow is-primary' : 'btn3d-blue'}`}
                onClick={() => {
                  // 最初のユーザー操作。AudioContext をここで作っておく
                  // （ページ読み込み時に作るとブラウザに止められるため）。
                  primeAudio();
                  playUiTap();
                  hapticTap();
                  onStart(d);
                }}
              >
                <span className="home-mode-icon" aria-hidden="true">
                  {Array.from({ length: SWORDS[d] }, (_, k) => (
                    <SwordIcon key={k} className="home-mode-sword" />
                  ))}
                </span>
                <span className="home-mode-text">
                  <span className="btn3d-label home-mode-label">{LABELS[d]}</span>
                  <span className="home-mode-desc">{DESCRIPTIONS[d]}</span>
                </span>
                {primary ? <span className="home-mode-tag">{recommended.tag}</span> : null}
              </button>
            );
          })}
          {/* 日替わりの一戦。日付で決まる同じ盤面・同じ条件で、その日の自己ベスト（VP 差）を競う。 */}
          <button
            className="btn3d btn3d-green home-mode home-daily"
            aria-label={`日替わり。今日の条件 ${daily.label}`}
            onClick={() => {
              primeAudio();
              playUiTap();
              hapticTap();
              onStartDaily(today);
            }}
          >
            <span className="home-mode-icon" aria-hidden="true">
              <CalendarIcon className="home-mode-cal" day={Number(today.slice(8))} />
            </span>
            <span className="home-mode-text">
              <span className="btn3d-label home-mode-label">日替わり</span>
              <span className="home-mode-desc home-daily-rule">今日: {daily.label}</span>
            </span>
            {dailyRec.best !== null ? (
              <span className="home-mode-tag is-best">ベスト {formatScore(dailyRec.best)}</span>
            ) : null}
          </button>
          <button
            className="btn3d btn3d-red home-mode"
            onClick={() => {
              primeAudio();
              playUiTap();
              hapticTap();
              onStartPvp();
            }}
          >
            <span className="home-mode-icon" aria-hidden="true">
              <VersusIcon className="home-mode-vs" />
            </span>
            <span className="home-mode-text">
              <span className="btn3d-label home-mode-label">2人で対戦</span>
              <span className="home-mode-desc">スマホを交互に渡して遊びます</span>
            </span>
          </button>
        </motion.div>

        {/* 戦績の位置に、段位と星。タップで段位ロードと実績の一覧（ボタンは増やさない）。 */}
        <motion.button
          type="button"
          className="home-progress"
          aria-label={`段位 ${stepInfo(meta.rank.step).label}。段位ロードと実績を見る`}
          initial={animateEntrance ? ENTER[2].hidden : false}
          animate={{ opacity: 1, y: 0, transition: { ...SPRING, delay: ENTER[2].delay } }}
          onClick={() => {
            primeAudio();
            playUiTap();
            hapticTap();
            setMeta(loadMeta());
            setRankOpen(true);
          }}
        >
          <span className="rank-badge">{stepInfo(meta.rank.step).label}</span>
          <RankStars rank={meta.rank} />
          {hasPlayed ? (
            <span className="home-progress-record">
              <span className="home-progress-num home-progress-win">{progress.wins}</span>勝
              <span className="home-progress-num home-progress-lose">{progress.losses}</span>敗
            </span>
          ) : (
            <span className="home-progress-empty">はじめての挑戦</span>
          )}
          <span className="home-progress-more" aria-hidden="true">›</span>
        </motion.button>

        <AnimatePresence>
          {rankOpen ? <RankSheet key="rank" meta={meta} onClose={() => setRankOpen(false)} /> : null}
        </AnimatePresence>
      </div>

      <button className="dev-pill" onClick={() => { primeAudio(); playUiTap(); setDev(true); }}>
        テスト用
      </button>

      {dev ? (
        <Sheet title="テスト用" subtitle="数値はすぐ反映される" onClose={() => setDev(false)}>
          <div className="dev-grid">
            <div className="dev-section-title">感想</div>
            <a className="dev-link" href={REVIEW_BOARD_URL} target="_blank" rel="noopener noreferrer">
              レビュー記録表を開く（遊んだ感想を書く）
            </a>
            <div className="dev-section-title">デッキ（CPU 戦・2 人対戦。日替わりは既定のまま）</div>
            {/* 2 つは排他（片方を入れるともう片方は切れる）。両方切ると既定の 10 枚 */}
            {(
              [
                ['newCards', `新カード入り（祝祭・徴税官 → ${CARD_NAMES.craftsman}・${CARD_NAMES.inspector}）`, '新カード入りのデッキ'],
                ['draw', `抽選デッキ（全 ${CARD_POOL.length} 種から 10 枚・両者共通）`, '抽選デッキ'],
              ] as const
            ).map(([kind, text, label]) => (
              <div className="dev-deck-row" key={kind}>
                <span>{text}</span>
                <button
                  className="switch"
                  role="switch"
                  aria-checked={testDeck === kind}
                  aria-label={label}
                  onClick={() => {
                    const next: TestDeck = testDeck === kind ? 'default' : kind;
                    setTestDeck(next);
                    saveTestDeck(next);
                    playUiTap();
                  }}
                />
              </div>
            ))}
            <div className="dev-section-title">基本</div>
            <label>
              基本収入
              <input
                type="number"
                value={balance.baseIncome}
                onChange={(e) => put({ ...balance, baseIncome: Number(e.target.value) })}
              />
            </label>
            <label>
              手札枚数
              <input
                type="number"
                value={balance.handSize}
                onChange={(e) => put({ ...balance, handSize: Number(e.target.value) })}
              />
            </label>
            <label>
              先手の初期コイン
              <input
                type="number"
                value={balance.startingCoins.first}
                onChange={(e) =>
                  put({
                    ...balance,
                    startingCoins: { ...balance.startingCoins, first: Number(e.target.value) },
                  })
                }
              />
            </label>
            <label>
              後手の初期コイン
              <input
                type="number"
                value={balance.startingCoins.second}
                onChange={(e) =>
                  put({
                    ...balance,
                    startingCoins: { ...balance.startingCoins, second: Number(e.target.value) },
                  })
                }
              />
            </label>
            <label>
              後手1ターン目のボーナス
              <input
                type="number"
                value={balance.secondPlayerFirstTurnBonus}
                onChange={(e) =>
                  put({ ...balance, secondPlayerFirstTurnBonus: Number(e.target.value) })
                }
              />
            </label>
            <label>
              最大ターン数
              <input
                type="number"
                value={balance.maxTurnsPerPlayer}
                onChange={(e) => put({ ...balance, maxTurnsPerPlayer: Number(e.target.value) })}
              />
            </label>

            <div className="dev-section-title">カード: コスト</div>
            {CARD_POOL.map((id) => (
              <label key={id}>
                {CARD_NAMES[id]} コスト
                <input
                  type="number"
                  value={balance.cards[id].cost}
                  onChange={(e) =>
                    put({
                      ...balance,
                      cards: { ...balance.cards, [id]: { cost: Number(e.target.value) } },
                    })
                  }
                />
              </label>
            ))}

            <div className="dev-section-title">カード: 効果</div>
            <label>
              {CARD_NAMES.miner}: 収入
              <input
                type="number"
                value={balance.minerIncome}
                onChange={(e) => put({ ...balance, minerIncome: Number(e.target.value) })}
              />
            </label>
            <label>
              {CARD_NAMES.banker}: 収入
              <input
                type="number"
                value={balance.bankerIncome}
                onChange={(e) => put({ ...balance, bankerIncome: Number(e.target.value) })}
              />
            </label>
            <label>
              {CARD_NAMES.banker}: VP の倍率
              <input
                type="number"
                step="0.25"
                value={balance.bankerVpRate}
                onChange={(e) => put({ ...balance, bankerVpRate: Number(e.target.value) })}
              />
            </label>
            <label>
              {CARD_NAMES.architect}: 建設費の割引
              <input
                type="number"
                value={balance.architectDiscount}
                onChange={(e) => put({ ...balance, architectDiscount: Number(e.target.value) })}
              />
            </label>
            <label>
              {CARD_NAMES.festival}: 効果の倍率
              <input
                type="number"
                value={balance.festivalMultiplier}
                onChange={(e) => put({ ...balance, festivalMultiplier: Number(e.target.value) })}
              />
            </label>
            <label>
              {CARD_NAMES.festival}: 追加収入
              <input
                type="number"
                value={balance.festivalIncomeBonus}
                onChange={(e) =>
                  put({ ...balance, festivalIncomeBonus: Number(e.target.value) })
                }
              />
            </label>
            <label>
              {CARD_NAMES.usurer}: 受け取る額
              <input
                type="number"
                value={balance.usurerGain}
                onChange={(e) => put({ ...balance, usurerGain: Number(e.target.value) })}
              />
            </label>
            <label>
              {CARD_NAMES.usurer}: 次ターンに引かれる額
              <input
                type="number"
                value={balance.usurerDebt}
                onChange={(e) => put({ ...balance, usurerDebt: Number(e.target.value) })}
              />
            </label>
            <label>
              {CARD_NAMES.craftsman}: アップグレード費の割引
              <input
                type="number"
                value={balance.craftsmanDiscount}
                onChange={(e) => put({ ...balance, craftsmanDiscount: Number(e.target.value) })}
              />
            </label>
            <label>
              {CARD_NAMES.clerk}: 商館 1 件あたりのコイン
              <input
                type="number"
                value={balance.clerkPerHouse}
                onChange={(e) => put({ ...balance, clerkPerHouse: Number(e.target.value) })}
              />
            </label>
            <label>
              {CARD_NAMES.taxman}: 効果額
              <input
                type="number"
                value={balance.taxmanAmount}
                onChange={(e) => put({ ...balance, taxmanAmount: Number(e.target.value) })}
              />
            </label>

            <div className="dev-section-title">建物: コスト</div>
            {(Object.keys(balance.buildings) as (keyof typeof balance.buildings)[]).map((id) => (
              <label key={id}>
                {BUILDING_NAMES[id]} コスト
                <input
                  type="number"
                  value={balance.buildings[id].cost}
                  onChange={(e) =>
                    put({
                      ...balance,
                      buildings: {
                        ...balance.buildings,
                        [id]: { ...balance.buildings[id], cost: Number(e.target.value) },
                      },
                    })
                  }
                />
              </label>
            ))}

            <div className="dev-section-title">建物: VP</div>
            {(Object.keys(balance.buildings) as (keyof typeof balance.buildings)[]).map((id) => (
              <label key={`${id}-vp`}>
                {BUILDING_NAMES[id]} VP
                <input
                  type="number"
                  value={balance.buildings[id].vp}
                  onChange={(e) =>
                    put({
                      ...balance,
                      buildings: {
                        ...balance.buildings,
                        [id]: { ...balance.buildings[id], vp: Number(e.target.value) },
                      },
                    })
                  }
                />
              </label>
            ))}

            <div className="dev-section-title">建物: 効果</div>
            <label>
              {BUILDING_NAMES.tradingHouse}: 追加収入（Lv1）
              <input
                type="number"
                value={balance.tradingHouseIncome}
                onChange={(e) => put({ ...balance, tradingHouseIncome: Number(e.target.value) })}
              />
            </label>
            <label>
              {BUILDING_NAMES.factory}: コスト割引
              <input
                type="number"
                value={balance.factoryDiscount}
                onChange={(e) => put({ ...balance, factoryDiscount: Number(e.target.value) })}
              />
            </label>
            <label>
              {BUILDING_NAMES.cathedral}: 建物ごとのVP加算
              <input
                type="number"
                value={balance.cathedralVpPerBuilding}
                onChange={(e) =>
                  put({ ...balance, cathedralVpPerBuilding: Number(e.target.value) })
                }
              />
            </label>
            <label>
              {BUILDING_NAMES.mine}: 採掘師の上乗せ
              <input
                type="number"
                value={balance.mineMinerBonus}
                onChange={(e) => put({ ...balance, mineMinerBonus: Number(e.target.value) })}
              />
            </label>
            <label>
              {BUILDING_NAMES.exchange}: ボーナス
              <input
                type="number"
                value={balance.exchangeBonus}
                onChange={(e) => put({ ...balance, exchangeBonus: Number(e.target.value) })}
              />
            </label>
            <label>
              {BUILDING_NAMES.quarry}: 追加割引
              <input
                type="number"
                value={balance.quarryExtraDiscount}
                onChange={(e) => put({ ...balance, quarryExtraDiscount: Number(e.target.value) })}
              />
            </label>
            <label>
              物件の買収: 市場価値の何倍か
              <input
                type="number"
                value={balance.acquireMultiplier}
                onChange={(e) => put({ ...balance, acquireMultiplier: Number(e.target.value) })}
              />
            </label>
            <label>
              区画を動かせないターン数
              <input
                type="number"
                value={balance.slotLockTurns}
                onChange={(e) => put({ ...balance, slotLockTurns: Number(e.target.value) })}
              />
            </label>
          </div>
          <button
            className="sheet-row"
            onClick={() => {
              resetBalance();
              setBalance(loadBalance());
            }}
          >
            数値を既定に戻す
          </button>
          <button
            className="sheet-row"
            onClick={() => {
              replayOnboarding();
              setOnboarding(loadOnboarding());
              playUiTap();
            }}
          >
            {onboarding.replay && onboarding.seen.length === 0 ? '手引きは次の CPU 戦で出ます' : '最初の 1 戦の手引きをもう一度'}
          </button>
          <button
            className="sheet-row"
            onClick={() => {
              clearProgress();
              clearMeta();
              clearDaily();
              setMeta(loadMeta());
              setDailyRec(loadDaily(today));
            }}
          >
            きろくをけす
          </button>
        </Sheet>
      ) : null}
    </div>
  );
}
