# マネーフォワードME拡張 — 設計準備メモ（v0.1）

要件定義書 `requirements/mf_subs_requirements_v1.md` を踏まえた実装方針の初稿。詳細設計やテストケース作成時の叩き台として利用する。

## 1. 目的と対象
- /cf 家計簿画面に表示される取引行へ「サブスク利用状態」ラベルを付与し、翌月以降も再適用する。
- Gemini はハイライトのみ（ラベルへは影響させない）という要件を満たす。

## 2. DOM 前提
- 対象行セレクタ: `tr.transaction_list`（class 追加あり得るため前方一致で拾う）。
- 取引ID: 行内 `input[name="user_asset_act[id]"]` の `value`。
- メモ欄: 行内のメモセルに `<select>` を挿入する。既存メモ文字列がある場合は保持し、UIを隣接配置する。

## 3. ラベルモデル
- 値: `"using" | "rarely" | "cancel" | ""`（未設定）。
- 優先順位: 取引ID > 店名+金額 > 未設定。
- 店名正規化: 前後空白除去 → 連続空白を単一スペース → 絵文字/不可視文字除去（全角/半角は変換しない）。
- キー形式:
  - 取引ID→ラベル: `tx:{transactionId}`。
  - 店名+金額→ラベル: `sa:{normalizedStore}|{amount}`。

## 4. ストレージ方針
- 永続化: `chrome.storage.local` を既定とし、設定値（APIキー・しきい値）は同期を優先するため `chrome.storage.sync` を検討。
- データ構造（案）
  - `labelsByTxId: Record<string, Label>`
  - `labelsByStoreAmount: Record<string, Label>`
  - `settings: { geminiApiKey: string; scoreThreshold: number; excludedCategories?: string[] }`
- セッションフラグ: `sessionStorage` に `mf_subs_checked_${YYYY-MM}` を保存し月内再解析を抑止。

## 5. モジュール構成（src 配下案）
- `content/` : DOM 解析・ラベルUI埋め込み・ハイライト適用。取引情報収集と Gemini 依頼トリガーを担当。
- `background/` : Gemini 呼び出し、外部通信、エラー通知を担う（MV3 service worker想定）。
- `data/` : 正規化ロジックとストレージCRUDをユニットテストしやすく分離。
- `messaging/` : `type` 安全なメッセージチャネル定義（content ↔ background ↔ options）。
- `options/` : APIキー・しきい値設定UI。保存後に `storage.onChanged` で反映。
- `styles/` : ハイライト用クラス `.mf-sub-highlight` などのCSS。
- `workers/` : 必要ならDOM重い処理/正規化をオフロードするWeb Worker（優先度低）。
- `tests/` : データ層の正規化・マッピング・フィルタリングを単体テスト。

## 6. 主なフロー
1) ページロード
   - DOM ready を待ち、全行を走査し取引ID/店名/金額を取得。
   - 既存ストレージからラベルを適用（取引ID優先）。
   - ハイライト: ラベルが設定済みなら即時 `.mf-sub-highlight` を付与。

2) Gemini 解析（未解析かつ設定ありの場合）
   - 除外カテゴリ（振替/投資積立/住宅ローン/その他固定費）をフィルタ。
   - `month` と `transactions[]` を構築し、**15件ずつのバッチ**に分割して background へ順次送信。
   - background が Gemini API を呼び、score >= しきい値のみ `highlightTargets` を返却。
   - content が該当行へ淡い黄色ハイライトを付与（ラベルは変更しない）。
   - 解析中は画面中央のモーダルインジケーターで進捗を表示し、オーバーレイで操作を抑止。完了/エラーで自動フェードアウト。

3) ラベル変更
   - `<select>` change → data層で正規化したキーに対して保存。
   - 取引IDと店名+金額の両方へ同じラベルを保存。
   - 未設定に戻した場合は両方削除し、ハイライトも解除。

4) 月跨ぎ自動適用
   - 新月で初期読み込み時、店名+金額マップを用いて初期値を設定。

5) エラー系
   - APIキー未設定 / 通信失敗時は Gemini をスキップし、手動ラベルのみ提供。
   - 解析中にエラーが発生したバッチはモーダルをエラー表示に切替えて通知し、手動再解析ボタン（Popup）で再実行を案内。

## 7. UI 仕様の詳細
- セレクト項目: 「未設定」「利用中」「ほぼ未使用」「解約予定」。
- 初期値: 優先順位ルールで決定。何もなければ未設定。
- ハイライト: `rgba(255, 255, 0, 0.25)` を行背景へ適用。Gemini スコア or ラベル設定時のみ。
- アクセシビリティ: セレクトに `aria-label` を付与し、キーボード操作で完結可能とする。

## 8. テスト観点（ドラフト）
- 正規化: 空白畳み・絵文字除去・全角保持の組み合わせ。
- 優先度: 取引IDがある場合に store+amount が上書きされないこと。
- 保存/削除: 未設定に戻した際に両方のマップが消えること。
- 除外フィルタ: 対象カテゴリが Gemini 送信対象から外れること。
- しきい値: 境界値 69/70/71 のハイライト有無。
- エラー: API キー欠如・fetch 失敗時も UI が壊れないこと。

## 9. 未決事項・次アクション
- [x] 要件 v1 の確認と設計方針初稿の作成
- [x] Gemini API エンドポイント / 認証ヘッダの詳細確認（`POST .../v1beta/models/{model}:generateContent`, `x-goog-api-key`）。
- [x] 家計簿テーブルDOMの実測（メモ欄セレクタ `td.memo.form-switch-td` / XPath・outerHTML を反映）。
- [x] 金額・店名セルの抽出ロジック最終確認（`data-title` → クラス → 列順フォールバック、支出は絶対値化）。ユーザー提供DOM例（店名: `td[3]`/`td.content`, 金額: `td[4]`/`td.number.amount.minus-color`, 金額値 `-2,860` → `2860`）を確認済み。
- [x] `chrome.storage.sync` と `local` の容量・同期速度のバランス決定。
- [x] オプション画面のUIワイヤーフレーム作成（モデル選択を含む）。`docs/plans/mf_options_wireframe.md` を参照。
- [x] 単体テストケース一覧の具体化（tests/配下）。`docs/checklists/test_cases_unit.md` を参照。
- [x] Fetch タイムアウト値とリトライ方針の決定（background: 60s、バッチ送信: 30s、ノーリトライ。長時間API待ち対策）
- [x] Options CSS の外部化と読み込みパス更新。
- [x] モデル選択の柔軟化（カスタム入力許容）。
- [x] Contentスクリプトでの注入失敗時警告ログ（開発モード限定）。
- [x] Popupに再解析ボタンを追加し、contentへ `mf_subs_rerun_gemini` を送信する仕様を追加。
- [x] Gemini API 呼び出しのエンドポイント権限を manifest に明記（`https://generativelanguage.googleapis.com/*`）。
- [x] 解析中インジケーター（中央モーダル）の実装：
  - 全画面オーバーレイで操作抑止、進捗バー・バッチ数表示、完了/エラーで自動フェードアウト（実装済み: `.mf-sub-overlay`, `.mf-sub-indicator`）。
