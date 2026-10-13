import { useState } from 'react';

import type { Balance } from '@/game/balance';
import { KEYWORD_LABELS, keywordDefs, lineHasKeyword, type KeywordId, type NumSeg, type TextLine } from '@/game/card-text';

import { playUiTap } from './sound';

/** 数字 1 つ。種類で色と印を付ける（金=Lv で上がった値／緑=得／赤=損）。差分は「元の値 → 新しい値」。 */
export function RichNum({ seg }: { seg: NumSeg }) {
  return (
    <span className={`tx-num tx-${seg.kind}`}>
      {seg.from !== undefined ? (
        <>
          <span className="tx-from">{seg.from}</span>
          <span className="tx-arrow" aria-hidden="true">
            {' → '}
          </span>
        </>
      ) : null}
      {seg.text}
      {seg.mark ? (
        <span className="tx-mark" aria-hidden="true">
          {seg.mark}
        </span>
      ) : null}
    </span>
  );
}

/** 説明文（行の配列）の描画。下線語は interactive のときタップで 1 行の定義を出す
 *  （定義の行は常に高さを取る。出し入れで下の部品が 1px も動かないように）。 */
export function RichLines({
  lines,
  balance,
  interactive = false,
  className = '',
  reserveDef = true,
}: {
  lines: readonly TextLine[];
  balance: Balance;
  interactive?: boolean;
  className?: string;
  /** 定義の行を、開いていないときも空のまま高さを取るか（一覧では false） */
  reserveDef?: boolean;
}) {
  const [open, setOpen] = useState<KeywordId | null>(null);
  const defs = keywordDefs(balance);
  const hasKw = interactive && lines.some(lineHasKeyword);
  return (
    <div className={`tx-lines ${className}`}>
      {lines.map((line, i) => (
        <p key={i} className={`tx-line${i === 0 ? ' is-main' : ''}`}>
          {line.map((seg, j) => {
            if (typeof seg === 'string') return <span key={j}>{seg}</span>;
            if (seg.t === 'num') return <RichNum key={j} seg={seg} />;
            if (!interactive) {
              return (
                <span key={j} className="tx-kw">
                  {KEYWORD_LABELS[seg.id]}
                </span>
              );
            }
            return (
              <button
                key={j}
                type="button"
                className={`tx-kw is-tappable${open === seg.id ? ' is-open' : ''}`}
                onClick={() => {
                  playUiTap();
                  setOpen(open === seg.id ? null : seg.id);
                }}
              >
                {KEYWORD_LABELS[seg.id]}
              </button>
            );
          })}
        </p>
      ))}
      {hasKw && (reserveDef || open) ? (
        <p className="tx-kwdef" aria-live="polite">
          {open ? (
            <>
              <b>{KEYWORD_LABELS[open]}</b>: {defs[open]}
            </>
          ) : (
            ' '
          )}
        </p>
      ) : null}
    </div>
  );
}
