// このゲーム専用のアイコン。shared-ui のものではないので、ここに直接置く。

/** 残りターン表示のそば（ヘッダー中央）に置く、時計を模した小さな印。 */
export function TurnClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9 v4 l3 2" />
      <path d="M9 2 h6" />
    </svg>
  );
}

/** 手札「次」の真上、横長メニューボタンの中の三本線（要望 2）。文字は入れない。 */
export function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7 h16 M4 12 h16 M4 17 h16" />
    </svg>
  );
}

/** 封鎖者に押さえられている区画・買収者に縛られた手札カードに重ねる、
 *  鎖のマーク。「効果が止められている」ことを禁止マークより直感的に伝える。 */
export function ChainIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.5 14.5 a3.6 3.6 0 0 1 0-5.1l2.2-2.2a3.6 3.6 0 0 1 5.1 5.1l-1.1 1.1" />
      <path d="M14.5 9.5 a3.6 3.6 0 0 1 0 5.1l-2.2 2.2a3.6 3.6 0 0 1-5.1-5.1l1.1-1.1" />
    </svg>
  );
}

/** 設定ボタン（? の隣）に置く歯車。 */
export function SettingsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.6 v2.6 M12 18.8 v2.6 M21.4 12 h-2.6 M5.2 12 H2.6 M18.7 5.3 l-1.84 1.84 M7.14 16.86 l-1.84 1.84 M18.7 18.7 l-1.84-1.84 M7.14 7.14 L5.3 5.3" />
    </svg>
  );
}
