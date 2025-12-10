# マネーフォワードME拡張 — 詳細設計（v1.0草案）

要件定義書 `requirements/mf_subs_requirements_v1.md` を満たすための詳細設計。実装・テストの共通参照点とする。未確定事項は「未決」として明示する。

## 1. 前提・スコープ
- 対象: `https://moneyforward.com/cf` の家計簿画面。
- ブラウザ拡張: Chrome MV3 を想定。`content script` でDOM操作、`service worker (background)` で外部API呼び出し、`options` ページで設定管理。
- Gemini はハイライト判定のみ。ラベル値には一切影響させない。

## 2. 用語と型
- `Label`: `"using" | "rarely" | "cancel" | ""`（未設定）。
- `Transaction`: DOM から抽出する1行の情報。
  - `id: string` (input[name="user_asset_act[id]"])
  - `date: string` (YYYY-MM-DD; 表示値をパース)
  - `store: string`
  - `amount: number` (符号付き; 出金は正数で扱う想定)
  - `category: string`
  - `subcategory: string`
  - `memo: string`
  - `paymentSource: string`
- `NormalizedStoreKey`: `"sa:${normalizedStore}|${amount}"`
- `TxKey`: `"tx:${transactionId}"`
- `Settings`: `{ geminiApiKey: string; scoreThreshold: number; excludedCategories?: string[]; featureFlags?: { geminiAnalysisEnabled?: boolean } }`
- `GeminiRequest`: `{ month: string; transactions: Transaction[] }`
- `GeminiResult`: `{ id: string; score: number; service_name?: string; reason?: string }`

## 3. ストレージ設計
- 永続層: `chrome.storage.local`
  - `labelsByTxId: Record<TxKey, Label>`
  - `labelsByStoreAmount: Record<NormalizedStoreKey, Label>`
- 設定層: `chrome.storage.sync`
  - `settings: Settings` （APIキーと閾値）
- セッション抑止: `sessionStorage.setItem("mf_subs_checked_${YYYY-MM}", "true")`
- バージョニング: `schemaVersion` を `storage.local` に保持（初期値 `1`）。将来の移行で使用。
### 3.1 sync / local の容量・速度方針（確定）
- `storage.sync` は合計約 100KB・1アイテム 8KB、1時間 1,800 writes / 1分 120 writes の制限があるため、設定のみ格納する（APIキー、しきい値、将来の除外カテゴリの軽量設定）。
- ラベルデータ（取引ID・店名+金額マップ）は全て `storage.local` に保存する。保存量が増える前提のため `unlimitedStorage` permission を manifest に付与する。
- フォールバックポリシー:
  - 初回起動時に sync へ書き込むのは設定のみ。sync 書き込みエラー発生時はユーザーに「設定はこの端末にのみ保存されます」と通知し、`storage.local` に退避。
  - `storage.sync.getBytesInUse(null)` で 90KB 以上なら sync への新規書き込みを抑止し local へ転送（閾値は将来調整可能な定数で管理）。
- 速度面: ラベル読み込みはページロード時の大量アクセスとなるため `storage.local` から一括取得し、必要に応じてメモリキャッシュを併用する。`storage.sync` は高頻度アクセスを避ける。

### 保存/削除ロジック
- ラベル設定時: `labelsByTxId[TxKey]=label`, `labelsByStoreAmount[NormalizedStoreKey]=label`
- 未設定に戻すとき: 双方のキーを削除し、行のハイライトも解除。

## 4. 店名正規化アルゴリズム
1. `trim()` で前後空白除去。
2. 連続空白を単一スペースへ（`/\s+/g -> ' '`）。
3. 絵文字および不可視文字を除去（Unicode Property: `Emoji` と `Other_Default_Ignorable_Code_Point`）。
4. 全角/半角は変換しない（要件遵守）。

## 5. DOM 解析とラベルUI
- 対象行: `tr.transaction_list` を基点に前方一致（class追加を許容）。
- 取引ID: 行内 `input[name="user_asset_act[id]"]` の `value`。
- 送信対象フィルタ: `input[name="user_asset_act[is_target]"] === "1"`（計算対象）かつ金額テキストの先頭が `-`/`−` の支出行のみを Gemini へ送る。収入・非対象・プラス表記は除外。
- 店名・金額セルの抽出最終決定（2025-11-24 時点、`docs/smple/mf_sample.html` 実測）:
  - **店名セル**: `td[data-title="内容"]` を最優先。無ければ `td.content`。さらに取得できない場合のフォールバックとして、行内の `td` を左から数えて 3 番目（1:calc, 2:date, 3:content）を採用。
  - **金額セル**: `td[data-title*="金額"]` を最優先。無ければ `td.number.amount`（プラス/マイナス色クラスは任意）。それでも無い場合は 4 番目の `td` をフォールバック。セル内の `.offset` 要素の最初のテキストを採用し、余分な `(振替)` 行などの付随テキストは破棄する。
  - **符号処理**: テキストの先頭に `-` または Unicode マイナスがあればマイナスとしてパースし、最終的には「支出は絶対値の正数、収入は正数」で扱う。`is_income` hidden 値が `1` の場合は符号を正に固定し、`0`/`-1` の場合は絶対値化（`-4,950` → `4950`）。
  - **正規化手順**: テキストを `trim`→カンマ除去→`Number` 変換。空文字や `NaN` になった場合は当該行をスキップし、ログに残す。
  - **検証結果**: サンプル内の支出 (`-4,950`) / 収入 (`1,170`) / 振替付き (`-50,000 (振替)`) で上記ルールによりそれぞれ `4950`, `1170`, `50000` を取得できることを確認。
  - **実測追加例（ユーザー提供 DOM）**:
    - 行ID: `#js-transaction-1789318944805355669`
    - 店名セル XPath: `//*[@id="js-transaction-1789318944805355669"]/td[3]`（対応CSS: `td.content`）→ テキスト `VISA国内利用 VS GOOGLE CHATGPT`
    - 金額セル XPath: `//*[@id="js-transaction-1789318944805355669"]/td[4]`（対応CSS: `td.number.amount.minus-color`）→ `.offset` に `-2,860`。符号処理後の金額 `2860`。
    - 本例も `data-title` が無いケースだが、クラス優先のフォールバックで取得可能であることを確認。
- メモ欄セレクタ: サンプルDOM (`docs/smple/mf_sample.html`) より `td.memo.form-switch-td` が確実に存在。まず `td.memo.form-switch-td` を優先し、無い場合は `[data-title="メモ"]` をフォールバック。既存メモ文字列を保持し、`<div class="mf-sub-memo">{memoText} <select ...></select></div>` を挿入。
  - XPath 参考（提供値）: `/html/body/div[1]/div[2]/div/div/section/section/div[3]/div/div/table/tbody/tr[2]/td[8]` （メモ欄セル）。実装ではCSSセレクタを優先し、XPathはデバッグ/テストの目印として利用。
  - 具体例（提供値）:
    - CSS: `#js-transaction-1788783166253761188 > td.memo.form-switch-td`
    - XPath: `//*[@id="js-transaction-1788783166253761188"]/td[8]`
    - outerHTML: `<td class="memo form-switch-td" ...> ... </td>`（空メモと編集アイコン付き）。
  - 実装指針: 上記のように `td.memo.form-switch-td` が最も安定。`data-title="メモ"` はフォールバック。`querySelector` で取得し、未取得時はログを出してスキップ。
- セレクトUI
  - 選択肢: 「未設定」「利用中」「ほぼ未使用」「解約予定」
  - `aria-label="サブスク利用状態"`
  - 変更時に即保存し、行に `.mf-sub-highlight` を付与/解除。

### 5.x 家計簿テーブル満足度列（Top/Worst3）追加案（v0.1）
- 目的: 各支出行の主観的評価を後で見返せるように、テーブル右端に **満足度** と **満足度メモ** の2列を追加する。
- 満足度セレクト: 7択（未選択, Top1/Top2/Top3, Worst1/Worst2/Worst3）。`aria-label="満足度"` を付与。
- メモ入力: 単一行テキスト（~120文字想定）。`aria-label="満足度メモ"`。行高増を抑えるためセレクトと縦積みで配置。
- 保存スキーマ: `storage.local` に `satisfactionByTxId["tx:${id}"] = { rank, note }` を保存。rank は `"top1"|"top2"|"top3"|"worst1"|"worst2"|"worst3"|null`。
- 対象行: UI表示は全行で可。txId が取得できない行は描画しない。
- DOM 監視: 既存 MutationObserver のデバウンスチェーンに「満足度UI挿入」を追加し、月移動・フィルタ後も再挿入する。
- 影響範囲: 店名/金額フォールバック列 (2/3番目) には影響なし。横幅増によるスクロール発生の有無を実機で確認し、必要なら CSS で列幅を抑制。

### Popup（補足）
- 役割: ユーザーが手動で再解析をトリガーできるようにする。
- UI: ボタン「設定を開く」「このページで再解析」。Gemini解析トグルが OFF の場合は「このページで再解析」を disabled にし、`title` などで理由を表示（例: `Gemini解析は無効化中`）。
  - 「設定を開く」: options ページを `chrome.runtime.openOptionsPage` で開く。
  - 「このページで再解析」: アクティブタブへ `{ type: "mf_subs_rerun_gemini" }` を送信。content 側でセッションフラグをクリアし、Gemini を再実行する。
- 権限: manifest に `optional_permissions: ["activeTab"]` を追加済み。

### Gemini 解析中インジケーター（モーダル）
- 目的: 解析中に月移動などの操作を抑止し、進捗を可視化する。
- 配置: 画面中央。全画面オーバーレイ (`.mf-sub-overlay`) を表示しクリック・スクロールをブロック。
- カード: `.mf-sub-indicator`（幅約320px、max 90vw、角丸12px、ダーク背景 #111/0.9、影付き）
  - ステータス行（実行中/完了/エラー）
  - サブテキスト（バッチ進行: `バッチ 1/3（残り xx 件）`）
  - 進捗バー（ベース #2d3748 / フィル #38b2ac）
  - スピナー（#63c5be）
- 挙動:
  - 解析開始時にオーバーレイ＋カードを挿入し、`aria-live="polite"` を付与。
  - バッチごとに `current/total` を更新しバー幅を変更。
  - 完了: 「Gemini解析完了 / 結果を反映しました」に差し替え、約1.2sでフェードアウトしてDOM除去。
  - エラー: 赤系 (#f56565) のメッセージに切替し、4s表示後に除去（またはユーザーに再解析ボタン案内）。
  - セッションスキップ時は表示しない。
  - 表示中は `documentElement.style.overflow = "hidden"` でスクロールロック。解除時に元へ戻す。

## 6. ハイライト仕様
- クラス: `.mf-sub-highlight { background-color: rgba(255, 255, 0, 0.25); }`
- 付与条件
  - ラベルが設定済み（非空）
  - または Gemini `score >= threshold`
- ラベル解除（未設定）時はクラスを除去。

## 7. 処理フロー（時系列）
1. **ページロード/DOM準備**
   - DOMReady を待機し、取引行を収集。
   - ストレージからラベルを読み込み、優先度に従い初期値を適用。
   - 初期ラベルありの行へハイライト付与。
2. **Gemini 起動判定**
   - `sessionStorage` の月フラグを確認。未解析かつ API キー設定済みなら候補を収集。
   - 候補抽出時、除外カテゴリ（振替/投資積立/住宅ローン/その他固定費）をフィルタ。
3. **Gemini 呼び出し（background）**
   - content → background へ `requestGeminiAnalysis` を送信。
   - background が HTTP POST（未決: エンドポイントURL/認証ヘッダ）で Gemini API を呼ぶ。
   - タイムアウト（例: 10s）とエラー処理を実装。
4. **結果反映**
   - background → content へ `geminiAnalysisResult` を送信。
   - `score >= threshold` の行へハイライト付与（ラベルは変更しない）。
   - `sessionStorage` に解析済みフラグを書き込む。
5. **ユーザー操作**
   - `<select>` change で保存/削除を実行し、行のハイライトを即時更新。

## 8. メッセージ仕様（TypeScript Discriminated Union）
- content → background
  - `type: "requestGeminiAnalysis"`, `payload: { month: string; transactions: Transaction[] }`
- background → content
  - `type: "geminiAnalysisResult"`, `payload: { results: GeminiResult[] }`
  - `type: "geminiAnalysisError"`, `payload: { message: string }`
- options → background/content
  - `type: "settingsUpdated"`, `payload: Settings`

## 9. Gemini API 接続仕様
- リファレンス: https://ai.google.dev/gemini-api/docs （常にここを参照）。
- エンドポイント: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
  - 既定モデル: `gemini-2.5-flash`（推奨・高速）。オプションで `gemini-2.5-pro`, `gemini-2.5-flash-lite`, `gemini-3-pro-preview` など多数を選択可。カスタムID入力も許容。
- 認証ヘッダ: `x-goog-api-key: <API_KEY>` を必須で送信。Content-Type は `application/json`。
- リクエストボディ（実装形）
  ```json
  {
    "contents": [
      {
        "parts": [
          {
            "text": "You are an assistant ... Return JSON ...\\n\\nTransactions:\\n{\"month\":\"2025-11\",\"transactions\":[...]}"
          }
        ]
      }
    ]
  }
  ```
  - 役割は省略（デフォルト user）。`generationConfig` は未指定（既定設定で十分）。
- 本拡張では `transactions` をJSON文字列化して instructions と連結し、`GenerateContentResponse.candidates[0].content.parts[0].text` から結果JSONを抽出する。Markdownコードフェンスが付く場合は除去してから `JSON.parse`。
- タイムアウト: background fetch 60 秒、content→background 1バッチ送信 30 秒。リトライはしない。
- ストリーミング: 現状は非ストリーミング。必要になれば `:streamGenerateContent` を検討。
- モデル切替: オプション画面のセレクトで変更。保存時はセッションフラグのみクリアし、自動実行はしない（ユーザーが再解析ボタン/リロードで反映）。

## 10. エラーハンドリング
- APIキー未設定: Gemini 呼び出しをスキップし、UIに控えめな情報メッセージ（例: `Gemini解析はAPIキー未設定のためスキップしました`）。
- 通信/APIエラー: 解析を中止し、手動ラベルは継続利用可能。
- ストレージ失敗（例: quota）: エラーメッセージを console ではなく UI 上部に表示。必要に応じてストレージを縮退（txキーのみ保持など）。

## 11. UIデザイン指針（最高品質版）
- トーン&マナー: 家計簿UIに馴染む温かみのあるフラットデザイン。過度に主張せず、行動が一目で分かるコントラストを確保。
- カラーパレット（WCAG AA 以上を意識）
  - プライマリ: `#246BCE`（選択枠・アクションボタン）
  - アクセント: `#F5B301`（ハイライトと整合する控えめな黄系）
  - 成功: `#2F9E44`, 警告: `#F08C00`, 情報: `#1F7AED`, 失敗: `#D64545`
  - 背景: 既存テーブル背景を尊重し、追加要素は `#F7F9FC` ベースでカード化。
- タイポグラフィ: システムフォントスタック（`"Inter", "Noto Sans JP", system-ui`）。ラベルは 12–14px、見出しは 14–16px 太字で階層化。
- コンポーネント仕様
  - セレクト: 角丸 6px、枠線 `1px solid #CED4DA`。ホバー時 `border-color: #246BCE`、フォーカス時 `box-shadow: 0 0 0 2px rgba(36,107,206,0.2)` を付与。非アクティブ（未設定）はテキスト `#6C757D`。
  - ハイライト: 行背景に `.mf-sub-highlight`（rgba(255,255,0,0.25)）。選択と Gemini ハイライトで色が一致するため認知負荷を下げる。
  - トースト/通知: 画面上部右寄せに小さめのカード（影: `0 4px 12px rgba(0,0,0,0.08)`、角丸8px）。非モーダルで 3–5 秒表示、閉じるボタン付き。
  - オプション画面: 2カラムカードレイアウト（左に設定フォーム、右にヘルプ/プレビュー）。フォーム要素はラベル上、入力下にエラーテキスト。保存ボタンはプライマリ色、ロード中はスピナー表示。
- 状態定義（視覚フィードバック）
  - フォーカス: キーボード操作時に明示的アウトライン。
  - ホバー: 背景や枠線の軽い色変化のみ。色相は本来の意味色を変えない。
  - 無効: 不透明度 0.5 + カーソル `not-allowed`。
  - ローディング: Gemini 処理中はページ右上に "Gemini解析中..." をインラインスピナー付きで表示。
- アクセシビリティ
  - 各 `<select>` に `aria-label="サブスク利用状態"` を設定。
  - トーストには `role="status" aria-live="polite"`。
  - キーボードのみで操作完結（Tab で移動、Enter/Space で開閉、矢印で選択）。
  - コントラスト比: テキスト/背景は 4.5:1 以上。ハイライト上のテキストも視認性を確認。
- レイアウト安定性
  - メモ欄にセレクトを挿入する際、既存メモ文字列の折返しを維持し、`display: flex; gap: 6px; align-items: center;` で横並び。高さを固定せず、レスポンシブに追従。
  - テーブルリフロー防止のため、幅を `min(160px, 40vw)` の範囲に収め、行高を大きく変えない。
- モーション
  - セレクト開閉は OS 既定に任せる。
  - ハイライト付与/除去に 120ms のフェードトランジションを適用し、知覚しやすくする。

## 12. オプション画面仕様
- 入力項目:
  - Gemini APIキー（必須）
  - サブスクしきい値(0-100)
  - モデル選択（初期値 `gemini-2.5-flash` 推奨。候補: 2.5 Pro / 2.5 Flash-Lite / 3 Pro Preview など＋カスタム入力）
  - 将来用の除外カテゴリ配列（多選択）
  - Gemini解析トグル（ON/OFF, 初期値 ON）。OFF 時は Popup の再解析ボタンも自動で無効化される。
- バリデーション: しきい値は整数0-100、APIキーは非空。保存不可時は入力横にエラー文言。
- 保存: `chrome.storage.sync.set({ settings })`。保存成功をトースト表示。
- `storage.onChanged` ではセッションフラグをクリアするのみで自動再解析は行わず、ユーザーが再解析ボタン/リロードで反映する。

## 13. パフォーマンス・可用性
- DOM走査は1ページ1回。`requestIdleCallback` が利用可能なら初期ラベル適用後に Gemini 候補構築を遅延。
- 外部API呼び出しは1ページ1回だが、取引を**15件ずつ直列バッチ**で送信し、各バッチに 30 秒のローカルタイムアウトを設定（ネットワーク混雑時のハング防止）。
- background 側 fetch には 60 秒タイムアウトを付与。AbortError発生時はエラーを返却し、モーダルで通知。
- リトライ方針: 自動リトライは実施しない（理由: API課金・重複送信のリスク、月次トリガーで手動再解析/Popupボタンが許容されるため）。
- データ量は月数百行程度想定。オブジェクトマップで O(1) アクセス。

## 14. セキュリティ/プライバシ
- APIキーは `chrome.storage.sync` に保存し、メッセージ経路は background のみに限定。content にはキーを渡さない。
- 送信データは当月の候補行のみ。不要データを含めない。
- `target="_blank"` を使う場合は `rel="noopener"` を付与（現状該当UIなし）。
- ログ出力に個人情報（店名/金額）を含めない。デバッグ時はマスクする。

## 15. テスト計画（骨子）
- 単体（data/）
  - 正規化: 空白畳み・絵文字除去・全角保持。
  - 優先度: tx ラベルがあるとき store+amount で上書きされない。
  - 保存/削除: 未設定戻しで両マップ削除。
  - しきい値境界: 69/70/71 でハイライト有無が分岐。
- 結合（content+background）
  - セッションフラグにより2回目の解析が抑止される。
  - 除外カテゴリが Gemini 送信対象から除外される。
  - APIエラー時にUIが壊れず、手動ラベル可能。
- E2E（将来）
  - /cf モックDOMに対してラベル選択・保存・再適用を確認。

## 16. 未決事項とTODO
- [x] Gemini API エンドポイントと認証ヘッダ仕様の確定（`POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` / `x-goog-api-key` ヘッダ）。
- [x] メモ欄セレクタの決定（`td.memo.form-switch-td` 優先、`[data-title="メモ"]` フォールバック、XPath/outerHTML も記録済み）。
- [x] モデル選択ポリシー: オプション画面でモデル切替を許容し、初期値 `gemini-2.5-flash`（推奨）。型に `model` を追加。
- [x] 実DOMの金額・店名セル抽出の最終確認（符号処理と `data-title` / 列順マッピングの確定）。
- [x] `chrome.storage.sync` 容量・速度検証と local へのフォールバック方針。
- [x] オプション画面のワイヤーフレーム作成（UXと入力検証文言）。`docs/plans/mf_options_wireframe.md` を参照。
- [x] Fetch タイムアウト値の最適化とリトライ有無の決定（background 60s / バッチ送信30s、ノーリトライ）。
- [x] 単体テストケース一覧の具体化（tests/配下）。`docs/checklists/test_cases_unit.md` を参照。
- [x] Options ページのCSS外部化（`src/options/style.css` 作成と HTML からの参照差し替え）。
- [x] モデル選択の柔軟化（カスタム入力フィールド追加で任意モデルID指定を許容）。
- [x] コンテンツスクリプトのデバッグログ強化（開発フラグ時、注入ターゲット未検出で `console.warn` を出力）。
