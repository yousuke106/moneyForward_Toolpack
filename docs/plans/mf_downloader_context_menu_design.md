# MoneyForward Toolpack — 家計簿ダウンロード（右クリックメニュー）移植設計メモ

## 背景・目的
- 既存別プロジェクト `tmp/moneyforwardDownloader` に実装されている「ページを右クリックして表示中の年月の家計簿CSVをダウンロード」機能を本拡張へ移植する。
- 既存のサブスク可視化機能と共存し、家計簿ページ (`/cf`) での補助的なダウンロード手段を提供する。

## 現行実装の挙動（出典: `tmp/moneyforwardDownloader/src/background.js`）
- **コンテキストメニュー**: 拡張インストール/起動時に `id: mf-download-visible-month` を作成。タイトルは「表示中の年月の家計簿CSVをダウンロード」、対象は `https://moneyforward.com/*` のページ全体。
- **クリック処理フロー**:
  1. クリックされたタブから `span.fc-header-title` を全フレーム検索し、先頭のテキストを取得（例: `2025年11月`）。
  2. 正規表現 `/(\d{4})\D+(\d{1,2})/` で年月を抽出し、`YYYY-MM` 形式を `chrome.storage.sync` の `mf_month_year` に保存。
  3. `https://moneyforward.com/cf/csv?from=YYYY%2FMM%2F01&month=M&year=YYYY` へ `fetch`（credentials: include）するスニペットを `chrome.scripting.executeScript` でページに注入し、レスポンスを base64 変換した data URL を取得。
  4. 正常時は `downloads.download({ url: dataUrl, saveAs: true })` を実行し、成功でバッジ `DL`（#10b981）、失敗で `NG`（#dc2626）。
- **ファイル名制御**: `onDeterminingFilename` でキューされた `moneyforward_YYYYMM.csv` を強制設定（衝突時は `uniquify`）。キューはメッセージ経由で enqueue/dequeue。
- **フォールバック/エラー時のバッジ**:
  - 月抽出不可やタブIDなし: `NA`（#dc2626）
  - その他エラー: `NG`（#dc2626）
  - バッジ表示は約2.8秒で自動クリア。
- **副作用**: 月抽出成功時に `mf_month_year` を保存するため、ポップアップ側の月入力初期値にも流用可能。

## 依存・要求権限
- 追加が必要な権限: `contextMenus`, `downloads`, `scripting`, `tabs`。既存 `storage` は流用。
- `host_permissions`: 少なくとも `https://moneyforward.com/cf*`, `https://moneyforward.com/cf/csv*`, `https://moneyforward.com/sign_in*` が必要。
- バッジ表示には `action` API を使用（既存 manifest の `action` と共存可能）。

## 移植方針
- 背景スクリプトは現在 ES Module (`src/background/index.js`) なので、コンテキストメニュー処理をモジュール対応のユーティリティとして追加し、起動時・インストール時に登録する。
- DOM 依存（`span.fc-header-title` の文言形式）に変更が入った場合に備え、抽出失敗時は早期にエラー表示し、将来のセレクタ差し替え箇所を関数に集約する。
- `mf_month_year` ストレージキーは既存ポップアップの入力初期化でも活用する前提で維持。
- `saveAs: true` により毎回保存ダイアログが開くため、オプションで自動保存可否を将来設定可能にする余地を残す（今回の移植スコープ外）。
- 未ログイン判定やログインタブ自動オープンは移植スコープ外とし、移植後はエラーバッジのみで通知する。
- 機能トグル（ON/OFF）は既存設定群に追加し、デフォルトON。OFF時はコンテキストメニューを非表示／クリック無効化のいずれかで実装する（UX要件に応じ選択）。

## 想定リスク・留意点
- MoneyForward 側のヘッダーDOM変更時に月抽出が失敗するリスク → セレクタ/正規表現を切り出し、差し替え容易にしておく。
- `downloads` 権限追加によるストア審査影響があり得るため、権限追加理由を README/ストア説明へ明記する必要あり。
- `chrome.contextMenus.removeAll` を毎回呼び出す実装のため、将来的に他のメニュー追加予定がある場合は統合管理が必要。
- 未ログイン時の挙動は「失敗バッジ表示のみ」となるため、ユーザーに明示する文言（README/リリースノート）を追加する。
- トグルで無効化した際にメニュー非表示を行う場合、ストレージ変化を受けて動的に `contextMenus` を再構築する必要がある。非表示漏れや競合に注意。

## 移植タスク（ドラフト・漏れチェック反映）
- [x] manifest に `contextMenus`, `downloads`, `scripting`, `tabs` と `cf/csv` 系 host permissions を追加。permissions 追加理由を README/ストア説明に追記。
- [x] 背景スクリプトにコンテキストメニュー作成・クリックハンドラ・バッジ処理・CSV取得ロジックを組み込み（ESM対応）。
- [x] `mf_month_year` 保存/復元が既存 UI と競合しないことを確認し、ポップアップ初期化で共用するか明示。
- [ ] DOM 抽出セレクタ・正規表現をユニット化し、将来差し替えやすくする（単体テスト可能な純粋関数化を含む）。
- [x] downloads filename キューの onDeterminingFilename リスナーを実装し、他URLダウンロードへの影響を抑止（拡張ID・フラグでガード）。
- [x] 未ログイン時はバッジで失敗を通知するだけである旨を README/リリースノートに明記。
- [x] 設定トグルを追加（デフォルトON）。OFF時にコンテキストメニューを非表示または無効化し、背景SWが設定変更を監視して即時反映する。
- [x] オプション画面にトグルUIを追加し、保存・初期表示・バリデーションを既存設定フローに統合。
- [x] 設定スキーマに feature flag を追加し、デフォルト値／マイグレーションを定義。
- [ ] バッジ表示/クリアの共通化（既存 action バッジ利用ポリシーと整合）と色定義の定数化。
- [ ] 単体テスト: 月抽出パーサ、リクエストURL組み立て、トグルOFF時のメニュー非生成、ファイル名キューのガード。
- [x] 手動確認: `docs/checklists/mf_downloader_context_menu_checklist.md` を実施。

## コード品質チェック（カテゴリ別）
- **背景サービスワーカー**: ESM 構造を維持、async/await で例外を適切に捕捉、タイマー/リスナーのクリーンアップ、`chrome.runtime.id` でダウンロード識別。
- **コンテキストメニュー管理**: ID/タイトルを定数化、登録/削除が冪等、トグル変更で即時再構築、`documentUrlPatterns` を最小限に限定。
- **ダウンロード処理**: `onDeterminingFilename` で自拡張発のダウンロードのみ対象、`saveAs: true` 明示、base64 変換はチャンク処理でメモリ圧抑制。
- **年月抽出・URL生成**: 正規表現とパディング関数を純粋関数化しテスト、ISO-like `YYYY-MM` を `mf_month_year` に保存、異常系は早期リターン。
- **設定・トグル**: feature flag のデフォルトON、オプションUIと storage スキーマが一致、`storage.onChanged` で背景SWが反映、無効時はメニューを非表示またはクリック無効化を保証。
- **権限・セキュリティ**: permissions/host_permissions は MoneyForward 関連の最小集合に限定し、説明文に記載。外部入力は使わず固定URLでリクエスト。
- **テスト/品質ゲート**: Ultracite lint/formatを通過、単体テストでパーサとトグル挙動を検証、手動チェックリストを更新・消化、console/debug文を残さない。
