import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

import type { Balance } from '@/game/balance';
import type { CardId } from '@/game/types';

import { cardArtOf } from './art';
import { districtRuleText } from './district-view';
import { HELP_SECTIONS, helpCards, helpSummary, type HelpSectionId } from './help-content';
import { CoinBagIcon, UpArrowIcon } from './icons';
import { playUiTap } from './sound';

/** あそびかた（CPU 戦・2 人対戦で共通）。上に 3 行の要点、その下に項目ごとに開く見出し。
 *  「長くて分からない」という指摘があったので、開くまでは見出しだけを並べる（1 画面に収まる）。 */
export function HelpText({ balance, deck }: { balance: Balance; deck?: readonly CardId[] }) {
  const [open, setOpen] = useState<HelpSectionId | null>(null);
  return (
    <div className="help-list">
      <ul className="help-summary">
        {helpSummary(balance).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {HELP_SECTIONS.map(({ id, title }) => {
        const isOpen = open === id;
        return (
          <section key={id} className={`help-acc${isOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              className="help-acc-head"
              aria-expanded={isOpen}
              onClick={() => {
                playUiTap();
                setOpen(isOpen ? null : id);
              }}
            >
              <span>{title}</span>
              <span className="help-acc-chev" aria-hidden="true">
                ›
              </span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  key="body"
                  className="help-acc-body"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0, pointerEvents: 'none' }}
                  transition={{ type: 'spring', stiffness: 420, damping: 40 }}
                >
                  <div className="help-acc-inner">
                    <HelpSection id={id} balance={balance} deck={deck} />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>
        );
      })}
      <p className="help-foot">演出が遅いと感じたら、設定の「早送り」。盤面に触れると今の演出を飛ばせます。</p>
    </div>
  );
}

function HelpSection({ id, balance, deck }: { id: HelpSectionId; balance: Balance; deck?: readonly CardId[] }) {
  switch (id) {
    case 'win':
      return (
        <>
          <p className="sheet-text">
            物件を建てて <b>VP（勝利点）</b>を集めます。{balance.market.length} 件すべてが建つか、
            それぞれ {balance.maxTurnsPerPlayer} ターンを終えたら、VP の多いほうの勝ち。
          </p>
          <p className="sheet-text">VP は物件・アップグレード・地区の称号で増えます。<b>物件の VP ＝ 毎ターンの収入</b>（商館だけ VP が低い代わりに、効果で追加の収入）。</p>
        </>
      );
    case 'turn':
      return (
        <ol className="help-steps">
          <li>
            始めに<b>収入</b>が入る（基礎 +{balance.baseIncome}・物件の VP・前のターンの投資）
          </li>
          <li>
            カードを盤面へ<b>ドラッグ</b>して使う。コインがあれば何枚でも（同じ札は 1 ターンに 1 回）
          </li>
          <li>物件をタップして、建てる・上げる・買う</li>
          <li>「ターン終了」</li>
          <li className="help-steps-note">
            使った札は山の底へ回り、左下の「次」の札が入ります。採掘師・銀行家のコインは<b>次の収入</b>に入ります。
            自分の街道をタップすると、手札を 1 枚山の底へ送れます。
          </li>
        </ol>
      );
    case 'plots':
      return (
        <>
          <p className="sheet-text">
            <b>空き地</b>: 金の数字が建設費。タップして建てる。
          </p>
          <p className="sheet-text">
            <b>自分の物件</b>:{' '}
            <span className="help-fig plot-upgrade">
              <UpArrowIcon />
              アップグレード費
            </span>{' '}
            で 1 段上げる（Lv{balance.maxLevel} まで。VP と効果が増える）。Lv{balance.maxLevel} は買収されない（名札に鍵の印）。
          </p>
          <p className="sheet-text">
            <b>相手の物件</b>:{' '}
            <span className="help-fig plot-value">
              <CoinBagIcon />
              買収に要るコイン
            </span>{' '}
            を払うと自分のものになる。買収のコインは相手に渡らず、消えます。買収に要るコインは市場価値（建物の建設費の定価 ＋ 上げた Lv までのアップグレード費の定価）の {balance.acquireMultiplier} 倍で、建築家などの割引や買収で払った額では変わりません。
          </p>
          <p className="sheet-text">同じ区画は 1 ターンに 1 回だけ動かせます。区画をタップすると、VP・建築・買収・増築のコストが見られます。</p>
        </>
      );
    case 'districts':
      return (
        <>
          <p className="sheet-text">
            盤面は{balance.districts.map((d) => d.name).join('・')}の {balance.districts.length} 地区。
            地区ごとに<b>称号 +{balance.districtTitleVp} VP</b>があります。{districtRuleText(balance)}
          </p>
          <p className="sheet-text">端の名札（旗の色が称号の持ち主）をタップすると、自分と相手の値と区画の一覧が見られます。</p>
        </>
      );
    case 'cards':
      return (
        <>
        <p className="sheet-text">
          同じカードを {balance.cardLevelUses[0]} 回使うと <b>Lv2</b>、{balance.cardLevelUses[1]} 回で <b>Lv3</b>（この試合の中だけ）。効果が上がります。長押しで今の効果と次の Lv が見られます。
        </p>
        <ul className="help-cards">
          {helpCards(deck, balance).map((c) => {
            const art = cardArtOf(c.card);
            return (
              <li key={c.card} className="help-card">
                {art ? <img className="help-card-art" src={art} alt="" /> : <span className="help-card-art" />}
                <span className="help-card-body">
                  <span className="help-card-title">
                    {c.name}
                    <span className="help-card-cost">コスト {c.cost}</span>
                  </span>
                  <span className="help-card-text">{c.text}</span>
                  {c.note ? <span className="help-card-note">{c.note}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
        </>
      );
  }
}
