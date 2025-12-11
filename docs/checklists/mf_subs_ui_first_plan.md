# mfSubscriptionChecker — UI先行実装チェックリスト（ブラウザ登録可能レベル）

## ゴール
- ステップ2時点で Chrome 拡張として読み込める状態で UI（content/options/popup の最小骨格とスタイル）が動作すること。

## 進行ステップ
## Step 1: UIモック実装（完了）
  - [x] content: メモ欄にセレクト挿入のダミー実装（固定データでレンダリング）→ 今後はラベル専用列生成へ移行予定
  - [x] styles: `.mf-sub-highlight` とセレクト用の最小CSSを追加
  - [x] options: APIキー/しきい値フォームのモック＋バリデーションと保存（sync→local フォールバック含む、モデル候補拡充・デフォルト推奨を明記、APIキー表示トグル）
  - [x] popup: プレースホルダー表示（設定画面へのリンク）
  - [x] manifest/build設定: 拡張として読み込める構成を追加（MV3, storage/unlimitedStorage, content/options/popup）
  - [x] 手動確認: `chrome://extensions` で読み込み、content セレクト表示と options 保存・ハイライト確認済み
  - [x] 改善タスク反映（レビュー指摘）
    - [x] options の CSS を外部ファイル化（`src/options/style.css` へ移動）
    - [x] モデル選択にカスタム入力オプションを追加
    - [x] content 注入ターゲット未検出時に開発モードで warn ログを出す

## Step 2: データ層＋ストレージCRUD＋ユニットテスト（完了）
  - [x] 正規化・キー生成・金額パースを `src/data/normalize.js` に実装
  - [x] ラベルCRUD（取引ID／店名+金額）と APIキー読み出しヘルパーを `src/data/storage.js` に実装
  - [x] chrome.storage をスタブしたユニットテスト `tests/unit/data.test.js`
  - [x] テストランナー `tests/run-tests.js`（ESM）
  - [x] `node tests/run-tests.js` 実行済み
  - [x] ESM統一（`package.json` に `"type": "module"`、テストも import 形式へ統一）
- [x] Step 2: データ層＋ストレージCRUD＋ユニットテスト
  - [x] 正規化ロジック（店名・金額キー生成）実装
  - [x] `labelsByTxId` / `labelsByStoreAmount` CRUD 実装
  - [x] 単体テスト（ロジック中心・モック利用）
  - [x] ストレージ方針反映: 設定は `storage.sync`（軽量）、ラベルは `storage.local`＋`unlimitedStorage`。sync 書込失敗時の local フォールバックと 90KB しきい値判定の実装。
  - [x] 改善タスク反映（レビュー指摘）
    - [x] モジュールシステムの統一（ESM化: `package.json` に `"type": "module"` 追加、テストコードの `import` 化）
    - [x] `parseAmount` のエッジケーステスト追加
- [ ] Step 3: content本機能＋Gemini連携・仕上げ
  - [x] 取引行抽出・ハイライト付与・ラベル保存/解除
  - [x] Gemini 呼び出し・閾値判定返却
  - [x] options 保存と storage.onChanged 反映
  - [ ] ラベル専用列生成（メモ列直後）と既存メモ表示の維持を実装
  - [ ] 満足度OFF時の削除処理がラベル列へ影響しないことを実装
  - [ ] 統合テスト／手動確認（ビルド・ロードテスト） ※手順: `docs/checklists/integration_manual_plan.md`
  - [ ] ラベル専用列がメモ列直後に生成され、満足度OFF時でも列が残ることを手動確認
  - [ ] オプションの「サブスク列を表示する」トグルON/OFFで列の表示が切り替わることを手動確認
  - [x] `npx ultracite check` / `npx ultracite fix`
  - [x] 修正タスク（レビュー指摘 & 実データ確認）
    - [x] プロンプト構築とAPIリクエスト形式の修正 (`src/background/index.js`)
    - [x] レスポンス解析とJSONパース処理の実装 (`src/background/index.js`)
    - [x] `storage.onChanged` 監視の実装 (`src/content/index.js`)
    - [x] Popup に「このページで再解析」ボタン追加、content へ `mf_subs_rerun_gemini` 送信（手動再実行用）
    - [x] manifest に Gemini API ホスト権限と activeTab optional permission を明記
    - [x] リファインメント: Gemini連携の分割実行（バッチサイズ15・直列）とUIブロック実装 (`src/content/index.js`)

## 付随ドキュメント
- オプションUIワイヤーフレーム: `docs/plans/mf_options_wireframe.md`
- 単体テストケース一覧: `docs/checklists/test_cases_unit.md`

## 受け入れ条件（Step 1 時点）
- ビルド後の拡張を `chrome://extensions` でロードできる。
- 対象DOMでセレクトが表示され、行レイアウトが大きく崩れない。
- options のフォームが開き、入力UIが操作可能（保存は未実装でも可）。

## 追加チェック（ラベル列分離に伴う）
- ラベル列がメモ列直後に存在し、満足度列OFFでも削除されない。
- 既存メモテキストの表示・編集が従来どおり維持される。

## メモ
- 店名/金額抽出は data-title → クラス → 列順フォールバック方針を維持（詳細は `docs/plans/mf_subs_design_detail.md`）。
- Step 1 は固定データでよいが、DOM走査の枠組みは本番構造に寄せる（セレクト挿入位置はメモ欄）。
