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
