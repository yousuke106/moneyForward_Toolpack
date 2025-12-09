# MoneyForward Toolpack — 大項目×中項目ルール警告 詳細設計 (v0.1)

## 目的・方針
- 家計簿テーブルで大項目と中項目の組み合わせを評価し、ホワイトリスト／ブラックリストに基づいて警告色で可視化する。
- 明示的に許可された組み合わせを優先しつつ、よくある誤分類を早期に発見できる UX を提供する。
- 既存のサブスクハイライト（黄色）・重複警告（アンバー）と共存し、視覚的競合を避ける。

## 前提
- 対象 DOM: `tr.transaction_list` 内の `.v_l_ctg`（大項目）および `.v_m_ctg`（中項目）。
- データ抽出: 既存 `collectTransactions()` で `category` / `subcategory` を取得済み。
- ストレージ: `settings`（sync/local）に featureFlags を持つ。容量は sync 100KB 未満。

## データモデル
- ルール構造: `CategoryRule = { large: string, middle: string }`。
- 正規化: `normalizeCategory(text)` で `trim` → 連続空白圧縮 → `normalize("NFKC")` → 全角・半角スペース除去。絵文字は除去しない（カテゴリ名に含まれない前提）。
- キー形式: `ruleKey = `${large}|${middle}``。
- 保存形: `settings.categoryRules = { whitelist: CategoryRule[], blacklist: CategoryRule[] }`。

## 設定・永続化
- feature flag: `featureFlags.categoryRuleAlertEnabled`（デフォルト true）。
- ルール保存
  - sync 保存を試み、90KB 超えで local にフォールバック（既存の保存方針と同じ）。
  - 最大 200 件まで許容し、それ以上の保存要求はバリデーションエラー表示。
- オプション UI
  - 配置: 既存「解析パラメータ」「トグル群」の下に新カード「カテゴリルール」を追加。
  - 構成: 上段にフィーチャートグル（ON/OFF）、下段にホワイト/ブラックの2カラム編集領域。
  - ホワイト/ブラック切替: タブ UI（`Whitelist` / `Blacklist`）で切り替え。タブ内にリストと入力行を表示。
  - 入力行: 大項目入力 + 中項目入力 + 追加ボタン。
    - 大項目は自由入力（後方互換のため）＋入力補完候補: 既存家計簿から抽出した最近のカテゴリを suggestion として datalist 表示（実装コスト見合い、v0.1 では静的 placeholder に留める）。
    - 中項目も同様。
  - 既存リスト表示: 各行に `大項目 - 中項目` と削除アイコン（🗑）を水平に配置。スクロールコンテナで最大高さ 240px。
  - 重複キー追加時: トースト/エラー文で「すでに登録されています」を表示し、既存リストは変更しない。
  - 200 件超保存: 保存ボタン押下時にバリデーションし、カード上部にエラー文を表示して保存中断。
  - 一括クリア／JSON インポート・エクスポート: 将来タスクとして別チケット化（本リリースでは UI 非対応）。

## 判定ロジック
1. ルール読み込み: `settings.categoryRules` をセット化
   - `whitelistKeys = Set(ruleKey)` / `blacklistKeys = Set(ruleKey)`。
2. 判定: 各行の `large`, `middle` を正規化 → `key` を生成。
   - `!large || !middle` または `large === "未分類"` → 判定スキップ。
   - `whitelistKeys.size > 0` の場合: `key` が含まれなければ `violation = "whitelist_miss"`。
   - 上記で警告となった場合でも、`blacklistKeys` には依存しない（ホワイトリスト優先）。
   - `whitelist` が空の場合: `blacklistKeys.has(key)` なら `violation = "blacklist_hit"`。
3. 結果に応じて DOM へクラス付与／除去。

## UI / スタイル仕様
- 新規クラス
  - 行: `.mf-sub-category-alert-row`
  - セル: `.mf-sub-category-alert-cell`
- スタイル案
  - 背景: `rgba(232, 87, 76, 0.22)`（淡いコーラル系で既存黄色・アンバーと差別化）。
  - 左ボーダー: `4px solid #E8574C` を `.mf-sub-category-alert-row` に付与。
  - 文字色: デフォルト色を維持しコントラストを確保。
  - ホバー時 title: `"カテゴリ組み合わせがルール外です（ホワイトリスト未登録）"` など理由別に出し分け。
- 共存ルール
  - 行全体のボーダーは重複警告より優先度を高くする（CSS 順序で後勝ち）。
  - セル背景は `.mf-sub-category-alert-cell` のみ変更し、他のハイライトは不透明度で透過合成されるよう `background-color` のみ設定。

## 処理フロー
1. コンテンツスクリプト起動時に `loadSettings()` → ルールとフラグを取得。
2. `applyCategoryRuleAlert()` を追加し、`scheduleInit` / MutationObserver のループ内でサブスクラベル注入後に実行。
3. 各行で `violation` 判定 → 該当セルへクラス付与、title 設定。非該当はクリーンアップ。
4. ルールが空、または flag OFF、または設定読み込み失敗時は即 return して副作用を避ける。

## エラー・フェイルセーフ
- 設定読み込み失敗、ルールパース失敗時は警告を表示しない（UI を壊さない）。
- 正規化後 key が空になった場合はスキップ。
- オプション保存時に重複キーや過剰件数をバリデーションしてユーザーに表示。

## テスト観点（抜粋）
- ルール判定
  - ホワイトリストあり: 未登録組み合わせで `whitelist_miss` になる。
  - ホワイトリストあり + ブラックリスト登録: ホワイトリストが優先され警告しない。
  - ブラックリストのみ: 一致時のみ警告、その他は非警告。
  - 正規化: `食費` と ` 食費 `、全角スペース混在で同一キーと判定。
  - 未分類/空文字行はスキップされる。
- DOM 付与
  - 大項目セル・中項目セルのみに `.mf-sub-category-alert-cell` が付与される。
  - 行 title が理由別に設定され、他行へリークしない。
- 設定
  - 200件超保存でエラー表示。
  - フィーチャーフラグ OFF でハイライトが消える。

## 実装タスクリスト（進捗管理）
- [x] 要件整理ドキュメント作成（`docs/requirements/budget_category_rules_requirements.md`）
- [x] 詳細設計ドキュメント作成（本ファイル）
- [ ] データモデル・ユーティリティ実装
  - `CategoryRule` 型、`normalizeCategory()`, `buildRuleKey()` を追加
  - ルール Set 生成と判定ヘルパー（ホワイト優先）
  - 200件上限・重複キーのバリデーション
- [ ] 設定ストレージ拡張
  - `settings.categoryRules{whitelist, blacklist}` と `featureFlags.categoryRuleAlertEnabled` を追加
  - sync→local フォールバックに上限バリデーションを統合
- [ ] オプション画面 UI
  - 新カード「カテゴリルール」＋タブ切替（Whitelist/Blacklist）
  - 入力行・リスト表示・削除・重複/空欄エラー表示
  - 保存時に設定へ反映しステータス表示更新
- [ ] コンテンツスクリプト
  - 設定読込対応と判定ロジック適用
  - 警告クラス/title 付与と共存ルール実装
- [ ] スタイル
  - `.mf-sub-category-alert-row` / `.mf-sub-category-alert-cell` を `src/content/style.css` に追加
  - 既存ハイライトとの優先度調整
- [ ] テスト
  - 単体: 正規化・判定・保存バリデーション
  - 手動/E2E: `docs/checklists/budget_category_rules_checklist.md` に沿って確認
- [ ] ドキュメント更新
  - リリースノートや overview への追記
  - チェックリスト進捗チェック

## レビュー対応タスク（2025-12-08）
- [ ] カテゴリ警告判定を対象行に限定
  - `applyCategoryAlert` で `getIsTarget(row) && !getIsIncome(row) && isNegativeAmount(row)` のみ評価するフィルタを追加。
  - 判定から外れた行では警告クラス・title をクリアする。
- [ ] 回帰テスト
  - 収入行・非ターゲット行で警告が付かないことを手動確認（チェックリストに追記）。
  - 単体またはスモールテストでフィルタ条件をカバーする（余力があれば追加）。
