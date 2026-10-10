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

/** 区画の名札の「市場価値（買収に要るコイン）」に添える、口を縛ったコイン袋。 */
export function CoinBagIcon() {
  return (
    <svg className="fig-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9 3.2h6l-1.6 3.1c3.7 1.4 6.6 5.3 6.6 9.3 0 3.3-2.6 5.2-8 5.2s-8-1.9-8-5.2c0-4 2.9-7.9 6.6-9.3z"
      />
      <path d="M8.6 6.6h6.8" stroke="rgb(0 0 0 / 0.45)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** 区画の名札の「アップグレード費」に添える上矢印。 */
export function UpArrowIcon() {
  return (
    <svg className="fig-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2.5 21.5 13h-5.8v8.5H8.3V13H2.5z" />
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

/** VP（勝利点）の星。情報ボードと結果画面で使う。塗りつぶしの形で、
 *  色は currentColor ではなく呼び出し側の CSS（fill）が決める。 */
export function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 1.8 l3.05 6.2 6.85 1 -4.95 4.83 1.17 6.82 L12 17.43 5.88 20.65 7.05 13.83 2.1 9 l6.85-1 Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 王冠。勝者の印（結果画面）とホームの戦績に使う。 */
export function CrownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 40" aria-hidden="true">
      <defs>
        <linearGradient id="crown-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff2a8" />
          <stop offset="0.45" stopColor="#ffc93d" />
          <stop offset="1" stopColor="#d98a00" />
        </linearGradient>
      </defs>
      <path
        d="M4 13 L14 22 L24 5 L34 22 L44 13 L40 33 H8 Z"
        fill="url(#crown-gold)"
        stroke="#5a3500"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <rect x="7" y="31" width="34" height="6.5" rx="2" fill="#e6a300" stroke="#5a3500" strokeWidth="2.4" />
      <circle cx="24" cy="5" r="3" fill="#fff2a8" stroke="#5a3500" strokeWidth="2" />
      <circle cx="4" cy="13" r="2.6" fill="#fff2a8" stroke="#5a3500" strokeWidth="2" />
      <circle cx="44" cy="13" r="2.6" fill="#fff2a8" stroke="#5a3500" strokeWidth="2" />
      <path d="M21 25 l3-3.5 3 3.5-3 3.5z" fill="#39a7ff" stroke="#5a3500" strokeWidth="1.4" />
    </svg>
  );
}

/** ホームのタイトルに載せる紋章。盾の中に街のシルエットと王冠。 */
export function CityEmblem({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 132" aria-hidden="true">
      <defs>
        <linearGradient id="emblem-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4fb0ff" />
          <stop offset="1" stopColor="#1650a0" />
        </linearGradient>
        <linearGradient id="emblem-rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff2a8" />
          <stop offset="0.5" stopColor="#ffc93d" />
          <stop offset="1" stopColor="#c27600" />
        </linearGradient>
        <linearGradient id="emblem-city" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#cfe6ff" />
        </linearGradient>
      </defs>
      {/* 盾。外側の金の縁 → 内側の青い面の 2 枚重ね。 */}
      <path
        d="M60 8 C78 16 96 18 112 16 C112 64 100 102 60 126 C20 102 8 64 8 16 C24 18 42 16 60 8 Z"
        fill="url(#emblem-rim)"
        stroke="#3d2500"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M60 19 C75 25 89 27 101 26 C100 66 90 96 60 115 C30 96 20 66 19 26 C31 27 45 25 60 19 Z"
        fill="url(#emblem-face)"
        stroke="#0b2a57"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* 盾の上半分に光沢。 */}
      <path d="M60 22 C74 28 87 30 98 29 C97.5 44 95 55 91 64 C72 56 46 54 25 62 C22 52 21.5 42 21 29 C33 30 46 28 60 22 Z" fill="#ffffff" opacity="0.16" />
      {/* 街のシルエット: 左の塔・中央の大聖堂・右の家。 */}
      <path
        d="M30 92 V66 h3 v-6 h4 v6 h3 V76 h6 V56 l14 -14 14 14 V76 h6 v-6 l7 -7 7 7 V92 Z"
        fill="url(#emblem-city)"
        stroke="#0b2a57"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M56 92 V78 a4 4 0 0 1 8 0 V92 Z" fill="#1650a0" />
      <rect x="57.5" y="58" width="5" height="7" rx="2.5" fill="#1650a0" />
      <path d="M60 30 v12" stroke="#0b2a57" strokeWidth="2.5" />
      <path d="M60 30 l9 3.5 -9 3.5z" fill="#ff5a4e" stroke="#0b2a57" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M28 92 H92" stroke="#0b2a57" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** 難易度の剣。数で強さを表す（やさしい 1・ふつう 2・つよい 3）。 */
export function SwordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.5 2.5 L21.5 4.5 L10 16 L8 14 Z" fill="#eef4ff" stroke="#1d2a3a" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M5.5 12.5 L11.5 18.5" stroke="#1d2a3a" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M5.5 12.5 L11.5 18.5" stroke="#ffc93d" strokeWidth="2" strokeLinecap="round" />
      <path d="M7.5 16.5 L3.5 20.5" stroke="#1d2a3a" strokeWidth="4" strokeLinecap="round" />
      <path d="M7.5 16.5 L3.5 20.5" stroke="#9a6a3a" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** 2 人対戦。向かい合う 2 本の旗。 */
export function VersusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 21 V4" stroke="#1d2a3a" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M4.5 4.5 h8 l-2 3 2 3 h-8 z" fill="#4fb0ff" stroke="#1d2a3a" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M20 21 V9" stroke="#1d2a3a" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M19.5 9.5 h-8 l2 3 -2 3 h8 z" fill="#ff6a5a" stroke="#1d2a3a" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** 日替わり。日めくりに今日の日付。 */
export function CalendarIcon({ className, day }: { className?: string; day: number }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="17" rx="3" fill="#ffffff" stroke="#1d2a3a" strokeWidth="1.6" />
      <path d="M3.8 9.5 V7.5 a3 3 0 0 1 3 -3 h10.4 a3 3 0 0 1 3 3 V9.5 Z" fill="#ff6a5a" stroke="#1d2a3a" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 2.5 V6.5 M16 2.5 V6.5" stroke="#1d2a3a" strokeWidth="2" strokeLinecap="round" />
      <text x="12" y="19" textAnchor="middle" fontSize="9.5" fontWeight="900" fill="#1d2a3a">
        {day}
      </text>
    </svg>
  );
}
