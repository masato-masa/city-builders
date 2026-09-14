# Phase 1 / Phase 2 の判断の記録

実装を 15 タスクに分けて進めたときの、事前スキャン・各タスクの完了・
統括側が下した裁定をそのまま残したもの。`Ruling:` の行が裁定。

計画: `docs/superpowers/plans/2026-09-14-city-builders-phase1-2.md`
仕様: `docs/superpowers/specs/2026-09-14-city-builders-design.md`

ブランチ: phase1-2（master から分岐）

Ruling: worktree を作らず、リポジトリ内に phase1-2 ブランチを切って作業する — 新規かつ空のリポジトリで隔離すべき既存コードが無く、Task 15 の `gh repo create --source=.` は作業ディレクトリ直下で実行する必要があるため — 間違っていた場合のコスト: master に直接コミットしていないので、ブランチを捨てれば元に戻る。

## 事前スキャン

### タスク間（ファイル・インタフェースを共有する組）

| 組 | 産出 → 消費 | 結果 |
|---|---|---|
| T1 → T2〜15 | package.json / tsconfig（`@` エイリアス、noUncheckedIndexedAccess） / vite base | 一致。`Record<K,V>` の添字は noUncheckedIndexedAccess の影響を受けないので、`balance.cards[card]` に `!` は不要 |
| T2 → T4,11,12,14 | `createRng` `shuffle` `Rng`（型を export） | 一致。T14 が `type Rng` を import する |
| T3 → T4〜15 | `CardId` `BuildingId` `GameState` `Action` `DEFAULT_BALANCE` `ALL_CARDS` `CARD_NAMES` `CARD_TEXTS` `BUILDING_NAMES` `BUILDING_TEXTS` | 一致 |
| T4 → T5,6,8,9,14 | `handOf` `nextCardOf` `ownedSlots` `countBuilding` `hasBuilding` `scoreOf` `opponentOf` | 一致 |
| T5 → T6,7,8,9,10,14 | `reduce` `canUseCard` `cardCostFor` `moveToBottom`(内部) | 一致 |
| T7 → T10,14 | `canBuild` `buildCostFor` | 一致 |
| T9 → T10,14 | `canUseRoad` `winnerOf` | 一致 |
| T10 → T11 | `legalActions`（`reducer.ts` に置く） | 一致。`selectors → reducer` の逆依存を作らない |
| T11 → T12,13,14 | `Difficulty` `chooseAction` `playTurn` `evaluateState` | 一致。T13 の storage が `Difficulty` を `@/ai/choose` から取る |
| T13 → T15 | `Home` `loadProgress` `saveProgress` `clearProgress` | 一致。T15 が Home を差し替える |
| T14 → T15 | `Sheet`（Sheets.tsx） | 一致。T15 の Home が T14 の Sheet を使う（順序どおり） |
| T13/T14 | `src/ui/styles.css` を T13 が作り T14 が追記 | 一致。追記のみ |

### タスク単体（自己整合）

| タスク | 結果 |
|---|---|
| T1〜T8, T10〜T13, T15 | テストと実装が対応。作成ファイルと後続の変更ファイルが一致 |
| T9 | **不整合あり** → D1（下記） |
| T1 | **不足あり** → D2（下記） |
| T13/T14 | **不整合あり** → D3（下記） |

### 見つかった欠陥と裁定

Ruling: D1 — T9 の「VP 同点なら残コイン」テストが `g` を作った後に使わず `g2` を作り直す冗長な形だった。城塞を 1 つずつ持たせるだけの形に書き直し、`scoreOf` で同点であることも明示的に検査するようにした — レビュー側の「何も検査していないテスト」指摘を先に潰すため — 間違っていた場合のコスト: テストの意図が変わる可能性があるが、同点判定という検査対象は変えていない。

Ruling: D2 — T1 の vite.config に testTimeout が無く、T11 の「ふつうは、やさしいより強い」（40 試合を回す）が既定 5 秒でタイムアウトする恐れがあった。`testTimeout: 60000` / `hookTimeout: 60000` を追加した（animal-puzzle と同じ対処） — 実装者が原因不明の失敗で詰まるのを避けるため — 間違っていた場合のコスト: 本当に遅いテストが放置される。T12 の実測で試合時間は別途測る。

Ruling: D3 — `saveProgress` が定義されるだけで誰も呼ばず、ホームの戦績が永久に 0 勝 0 敗のままだった。終了判定は `endTurn` の中でしか起きないので、T14 の Game の `endTurn` ハンドラで 1 回だけ記録するようにした（useEffect を使わないので StrictMode の二重発火も起きない） — 仕様書に戦績の記録は明記されていないが、保存機能を作って呼ばないのは仕掛かりのまま残すことになるため — 間違っていた場合のコスト: 戦績の数え方（引き分けの扱いなど）が後で変わる可能性がある。引き分けは勝敗どちらにも数えない実装にした。

既知の割り切り（欠陥ではない）: `DEFAULT_BALANCE.buildings.cathedral.vp` は 0 だが、大聖堂の VP は `scoreOf` が条件付きで計算するため、この値は読まれない。開発者メニューからこの値を変えても何も起きない。Phase 3 で開発者メニューに大聖堂の係数（`cathedralVpPerBuilding`）を出すときに整理する。

## 進捗

Task 1: complete (commits b61574e..831bbe6, review clean)
Task 2: complete (commits 831bbe6..5fe8f08, review clean)
Task 3: complete (commits 5fe8f08..83bc770, review clean)
Task 4: minor (deferred): setup.ts の `as Record<PlayerId, PlayerState>` キャストは不要（計画のコードに含まれていたもの。Ruling: 計画どおりを維持し、最終レビューで判断する）
Task 4: fix round 1/5 (1 addressed, 0 open — Co-Authored-By が Claude Haiku 4.5 になっていた; commits 482287d..6ff2f69)
Ruling: Task 4 の修正はコミットメッセージの trailer のみで、`git diff 482287d HEAD` が空（コード変更ゼロ）だったため、スコープ再レビューのサブエージェント派遣を行わず、`git log -1` と `npm test`（20 件全通過）で直接検証した — 空の差分をレビュアーに渡しても検査対象が存在しないため — 間違っていた場合のコスト: 実際にはコードが変わっていた場合に見落とす。git diff が空であることを実行して確認済みなのでリスクは無い。
Task 4: complete (commits 83bc770..6ff2f69, review clean)
Task 5: complete (commits 6ff2f69..914c885, review clean。レビュアーの「型チェック未検証」は制御側で `npm run typecheck` を実行し exit 0 を確認)
Task 6: complete (commits 914c885..329e68d, review clean)
Ruling: Task 7 の「建築家の割引で建設費は 0 未満にならない」テストは計画側の誤りだった。`buildCostFor` は `players[player].buildDiscount` だけを見るのに、テストは建築家を DEFAULT_BALANCE で使って buildDiscount=3 を積んだあと、別の balance（architectDiscount:100）を buildCostFor に渡していたため 7-3=4 となり、期待値 0 と一致しなかった。実装ではなくテストを直す。建築家を使う時点で強い balance を渡して buildDiscount=100 を積む形に書き換え、さらに 0 まで下がった建設費が実際の建設でも使われることまで検査するようにした — 実装（計画の buildCostFor）は仕様どおり正しく、誤っているのはテストのシナリオだから — 間違っていた場合のコスト: 0 クランプの検査意図が変わる可能性があるが、検査対象（下限 0）は変えていない。
Task 7: fix round 1/5 (1 addressed, 0 open — 計画のテスト誤り; commits 0379333..729b90c)
Task 7: minor (deferred): canBuild の「存在しないスロット」分岐を直接検査するテストが無い（他の 3 条件は検査済み）
Task 7: complete (commits 329e68d..729b90c, review clean)
Ruling: Task 8 で cycle.test.ts の 2 件が落ちたのは、実装ではなく計画と仕様書の誤り。伝令は自分に加えて対象をもう 1 枚底へ送るので、8 枚を使い切ると合計 9 歩進み、循環位置は元に戻らず 1 つずれる。Task 5 のテストはダミーのつもりで渡していた heraldTarget:'miner' が、伝令の番にたまたま手札に存在して妥当な対象になっていた。テストを実際の挙動（ORDER.slice(1,5)）に直し、仕様書 §1 の性質 A も「使い切ると元に戻る」から「伝令のぶん 1 つずれる」に訂正した — 実装はブリーフどおりで仕様も満たしており、誤っているのは計画のテストと仕様書の記述だから — 間違っていた場合のコスト: 「使い切ると元に戻る」という性質を設計の売りとして残したい場合、伝令の仕様（対象を底へ送る）を変える必要がある。今回は伝令の仕様を優先した。
Ruling: Task 8 のレビューで出た Minor 3 件（伝令の不正な対象 2 ケース、封鎖者の存在しないスロット）と、Task 7 で保留していた Minor 1 件（canBuild の存在しないスロット）を、Important 1 件（封鎖者の城壁テストにコスト検証が無い）と同じ 1 回の修正にまとめて実施した — いずれもテストを数行足すだけで、別々の往復に分けるほうが高くつくため。1 回のラウンドに収まるので手戻りの上限は変わらない — 間違っていた場合のコスト: 修正差分がやや広がり、再レビューの対象が増える。src/ は変更しないので実装リスクは無い。
Task 8: fix round 1/5 (4 addressed, 0 open — 封鎖者のコスト検証欠落ほかテスト漏れ 3 件; commits 0765f37..fcca287)
Task 8: complete (commits 729b90c..fcca287, review clean)
Task 9: complete (commits fc79810..c5f8409, review clean)
Task 10: complete (commits c5f8409..e32ab10, review clean)
Ruling: Task 11 のレビューが Important とした「難易度で先読み深さを切り替えている分岐」は、指摘のほうを退ける。仕様書 §11 の難易度表が「ふつう＝1 手先読み／つよい＝2 手先読み」と明記しており、仕様が拘束力を持つ。CLAUDE.md の「条件でなく重みで調整する」は、レベル進行などでプレイヤーが意識しない境界が体験に出ることを避けるための原則であって、プレイヤー自身が選ぶ難易度設定には当たらない。探索の深さこそが「つよい」の中身である — 私が実装者への指示に書いた「難易度差はノイズだけで作る」という表現が仕様より厳しすぎたのが混乱の元。指示の言い過ぎであり、実装は仕様どおり正しい — 間違っていた場合のコスト: つよいとふつうの差が探索深さに依存するため、深さを変えるとバランスが動く。Phase 3 で難易度を詰めるときに再評価する。
Task 11: minor (deferred): ふつう対やさしいの勝率が 40 戦 25 勝（62.5%）と差が小さい。難易度の作り込みは Phase 3 で行う
Task 11: complete (commits e32ab10..d87904c, 1 parked)
Task 12: 初回実測 — 先手勝率 54.3% / 引き分け 0.9% / 平均 14.7 ターン / 手札詰まり 40.7% / 妨害使用 0.9%
Ruling: 手札詰まり率 40.7% は計画の計測バグ。scripts/simulate.ts が詰まりを playTurn の前（＝ startTurn による収入加算の前）で測っており、貪欲な CPU が前ターンに使い切った直後の残高を見ていた。行動フェーズ開始時点（startTurn 適用後）で測るよう直す — 数値ではなく計測が間違っているのに balance を動かすと、実在しない問題に合わせてゲームを歪めるため — 間違っていた場合のコスト: 直後の再測定で詰まり率が下がらなければ、今度こそ balance 側の問題として扱う必要がある。
Ruling: 妨害カード使用率 0.9% は evaluate.ts の実装漏れ。仕様書 §11 の評価軸表にある「手札の詰まり」と「妨害の期待値」が実装されておらず、相手のコインが評価に一切入らないため、徴税官は「3 払って自分は何も得しない札」と評価され CPU が絶対に撃たない状態だった。W.opponentCoin(-0.8) と W.stuck(-1.5) を追加する — 仕様が要求している軸であり、実装漏れを埋めるのは仕様適合そのものだから — 間違っていた場合のコスト: 重み -0.8 / -1.5 は勘で置いた値なので、妨害過多や伝令偏重になる可能性がある。再測定の妨害使用率（目標 10〜25%）で確認する。
Task 12: 再測定 — 先手勝率 45.1% / 引き分け 0.8% / 平均 17.7 ターン / 手札詰まり 0.9% / 妨害使用 7.3%（2 件の修正が効いた）
Ruling: 再測定後に「ふつうは、やさしいより強い」が 40 戦 20 勝で落ちた件は、計画 Task 11 Step 5 の指示どおり NOISE.easy を上げて対処する。評価軸を 2 つ足したことで評価値の幅が広がり、NOISE.easy=14 の揺らぎが相対的に効かなくなったのが原因 — 難易度差はノイズで作るという設計上の約束を保つため。評価関数の重みを難易度調整に使い始めると、仕様書 §11 の評価軸の意味が崩れる — 間違っていた場合のコスト: やさしいがランダムに近くなりすぎて不自然に見える可能性がある。Phase 3 で実際に遊んで確認する。
Ruling: 妨害使用率 7.3%（目標 10〜25%）は据え置く。計画の「明らかな破綻」の表に妨害使用率の項目は無く、目標値は最適化の目標ではなく破綻検出の門だと自分で定めたため — ここで重みを触り始めると、遊ぶ前にシミュレーターに合わせ込むことになる — 間違っていた場合のコスト: 実際に遊んだとき妨害が手応えとして薄い可能性がある。Phase 3 の調整項目として記録した。
Ruling: 先手勝率 45.1%（目標 48〜52%）も据え置く。破綻ライン（60% 超／40% 未満）の内側 — 同上 — 間違っていた場合のコスト: 後手がわずかに有利なまま出る。後手の初期コイン 6 を 5 にすれば動くので、Phase 3 で調整できる。
Task 12: fix round 1/5 (2 addressed — 計測位置と評価軸の実装漏れ; commits f433af1..7e64db0)
Task 12: fix round 2/5 (1 addressed — NOISE.easy 14→45 で難易度差を回復、normal 30勝/40戦; commits 7e64db0..337ff94)
Task 12: minor (deferred): simulate.ts の harassUsed 判定が before.current を使っており命名が紛らわしい（current は startTurn で変わらないので実害なし）
Task 12: minor (deferred): NOISE.easy=45 の根拠は使い捨てスクリプトでの 40 戦測定のみ
Task 12: complete (commits d87904c..337ff94, review clean)
Task 13: minor (deferred): storage.ts の loadProgress が lastDifficulty の値を検証しておらず、壊れた文字列が入っても素通りする（表示が崩れるだけでクラッシュはしない）
Task 13: complete (commits 5fdabcd..77aa8e7, review clean)
Task 14: レビュー指摘 — Important: .hand と .card に min-height:0 が無い（計画の CSS の抜け）/ Minor: 封鎖された枠が視覚的に区別されず、押せない理由が分からない
Ruling: Task 14 の Minor（封鎖枠の表示）も Important と同じ 1 回の修正に含める。押しても何も起きない枠はプレイヤーには壊れて見えるので、見た目の問題ではなく操作性の問題として扱う。枠線の太さやパディングは変えず opacity だけで沈め、理由は既存の詳細シートに 1 行足して伝える — レイアウトを 1px も動かさない原則を守りつつ理由を伝えられるため — 間違っていた場合のコスト: opacity 0.4 が沈みすぎ／足りない可能性がある。Phase 4 の質感調整で見直す。
Ruling: 参考画面の実測はスクリーンショットのファイルがディスクに無いと行えないため、refs/ を作って置き場所を用意し、Phase 2 は実測抜きで完走する。色と寸法は後から tokens.css に流し込む — 構造（レイアウト・情報の置き場所）は実測に依存せず確定でき、あとで直すのが高いのは構造のほうだから — 間違っていた場合のコスト: 実測値が入るまで質感は既存 4 本と同じトークンのままになる。Phase 4 で差し替える。
Task 14: fix round 1/5 (2 addressed, 0 open — min-height の抜けと封鎖枠の表示; commits 331e04c..2b70242)
Task 14: complete (commits 77aa8e7..2b70242, review clean)
Task 15: minor (deferred): task-15-brief の説明文とコード例が不整合（説明は startingCoins と VP も編集対象と書いているが、コード例と実装は baseIncome + カードコスト 8 + 物件コスト 7 のみ）
Task 15: complete (commits ba8fcde..7b3d11f, review clean)

## 最終レビュー（ブランチ全体）

最終レビューの指摘 4 件（? が無反応 / 街道ボタンでレイアウトが飛ぶ / 建築家の割引と大聖堂の VP が画面に出ない / 何も検査していないテスト）を 1 回の修正で対応し、スコープ再レビューで全件 ADDRESSED を確認（commits d12512d..ad5ad35）。
台帳の訂正: Task 7 の deferred「canBuild の存在しないスロットのテストが無い」は Task 8 の一括修正で解消済み。Task 15 の deferred は「説明文の不整合」ではなく「仕様 §12 に対するコードの不足」。
台帳の訂正: Task 12 の deferred「harassUsed が before.current を使い命名が紛らわしい」は誤り。playTurn 後の g.current は相手なので before 側を見るのが正しい。実害なしではなく必然。
Ruling: 最終レビューが覆した裁定「cathedral.vp は 0 だが読まれないので無害」を撤回する。Task 14 の物件シートが vp を素で表示するため、大聖堂を開くと「0 VP」という嘘の数字が画面に出ていた。T3 時点の割り切りが T14 で破れた、タスクをまたいだ破綻 — 画面に出る数字が間違っているのは無害ではないため — 間違っていた場合のコスト: 無し。指摘が正しい。シート側で大聖堂だけ表記を変えて解消した。
Ruling: 最終レビューが指摘した「つよいが読んでいるのは相手の応手ではなく自分の次の一手」を受け入れる。私の Task 11 の裁定は「深さを難易度で変えてよい」という結論は正しかったが、「実装は仕様どおり」と断じた部分が未検証だった。仕様 §11 の「相手の想定応手を 1 つ読む」は未実装 — 検証せずに正しいと断じたのは誤りだから — 間違っていた場合のコスト: 無し。仕様書に未実装として明記し、Phase 3 へ送った。
Ruling: 再レビューが新たに挙げた「説明文に英単語 next が混入」は、スキルの「最終レビューの修正は 1 波まで」という決まりを超えて 1 回だけ追加で直す。3 行の文言修正であり、いま公開する画面に自分たちで定めた規約（アプリ内の文言も日本語）の違反を残すことになるため。実測した参考画面も「次：」と日本語だった — 再レビューを伴わない小さな文言修正で、grep とビルドで検証できるため — 間違っていた場合のコスト: レイアウトが動く可能性。font-size のみの変更に限定し、実装者にレイアウト不動の確認を課した。
Ruling: 仕様書 §11 に「Phase 3 へ送った未実装」の節を追加した。つよいの先読み対象・密偵の AI 取り込み・固定戦略シミュレーター・開発者メニューの編集対象不足の 4 点 — 最終レビューの「実装したつもりで放置されるのが一番高くつく」という指摘のとおり、仕様書が実装済みであるかのように読める状態が最も危険だから — 間違っていた場合のコスト: 無し。
