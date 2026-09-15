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
