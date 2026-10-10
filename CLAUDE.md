# シティビルダーズ

共通の進め方は `C:\claude\CLAUDE.md`。ここにはこのアプリ固有のことだけ書く。

## 効果音

**全アプリ共通の「WebAudio で合成・ファイルを持たない」の例外**（ユーザー指定）。ElevenLabs の Sound Effects で
生成した音を `src/assets/sfx/*.wav` に置き、`src/ui/sound.ts` が AudioBuffer に読み込んで WebAudio で鳴らす
（鳴らすたびに音程・音量を少しゆらす）。無い音は合成音で代わりに鳴らす。

- 候補: `refs/sfx/<名前>_<番号>.mp3`（git 管理外、1 つの音に 4 本。.ogg も読める。形式はマジックバイトで判定）。
  指示文は `scripts/build-sfx.mjs` の `PROMPTS`（末尾に `SUFFIX` を付けて生成）。
- 選定と整形: `node scripts/build-sfx.mjs`。長さと打音の数を測って自動で選び、無音を切ってピークをそろえ、32kHz の WAV にする。
  耳で選び直すときは `node scripts/build-sfx.mjs build=3`（`scripts/sfx-picks.json` に残る。`select=tap_1` のように代用も書ける）。
  目標の長さ（`TARGET`）を変えたら `src/ui/sound.ts` の `SAMPLE_MAX_MS` と `src/ui/sfx-preview.ts` の `TARGET` もそろえる。
- 聴き比べ: `npm run dev` 中に `/city-builders/sfx.html`（本番ビルドには入れない）。
- 鳴らし分け: カードは `CARD_SAMPLE`（投資系 → cardBuff、買収者・徴税官 → cardAttack、封鎖者 → chain、衛兵 → shield、伝令 → horn）。
  コインは 6 以上増えたら coinBig。自分の手番が回ってきたら `playYourTurn(収入の増減)` で鐘とコインをまとめて鳴らす
  （別々に呼ぶと間引きで片方が消える）。ゲームに関わらない UI の操作は `playUiTap`。
- 層と鳴らし分け: 衝撃の大きい動作（買収・徴税官・封鎖者・アップグレード・建設・勝ち）は、生成音に合成の「カチ」「ドン」「ノイズ」を重ねる。
  繰り返す音は 3〜5 通りの音程・ローパス・開始位置から直前と違うものを選ぶ。判定は `src/ui/sound-plan.ts`（純粋関数）。
- BGM: `src/ui/bgm.ts` が WebAudio だけで合成する（ヘ長調 8 小節 92BPM、残り 3 手番以下で 100BPM・フィルタを開く）。プレイ画面だけで流す。
  効果音と BGM は別のバス（`src/ui/audio-graph.ts`）で、最後にコンプレッサーとリミッター。BGM は効果音より約 9dB 小さく、
  買収・Lv2・決着で一拍下げる（ダッキング）。設定の「BGM」スイッチ（`city-builders:bgm`）。聴き比べは `sfx.html`。

## 自走改善

ユーザーの指示が無くても改善を続ける。取り決めは `docs/autopilot/charter.md`、
次にやることは `backlog.md`、過去の試行と結果は `journal.md`。**作業を始める前に 3 つとも読む。**
ルール・演出・音・公開まで任されている。変更前に `autopilot/<連番>-<名前>` のタグでバックアップを取る。
