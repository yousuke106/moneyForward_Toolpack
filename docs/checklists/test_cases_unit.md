# 単体テストケース一覧（ドラフト） — MF Subscription Checker

## data 層
- **storeNormalizer**
  - 前後空白削除: `"  abc  "` → `"abc"`
  - 連続空白畳み: `"a   b   c"` → `"a b c"`
  - 絵文字除去: `"abc😀"` → `"abc"`
  - 不可視文字除去: `"a\u200Bb"` → `"ab"`
  - 全角/半角維持: `"ＡＢＣ"` → `"ＡＢＣ"`
- **key builders**
  - TxKey: `tx:12345` が生成されること
  - StoreAmountKey: `sa:abc|4950` が生成されること（店名は正規化後文字列）
- **amount parser**
  - `-4,950` → `4950`（支出は絶対値化）
  - `1,170` → `1170`（収入も正値）
  - `-50,000 (振替)` → `50000`（付随テキスト除去）
  - マイナス記号が全角/Unicode マイナスでも同様に動作
- **filters (除外カテゴリ)**
  - 大項目・中項目が「振替/投資積立/住宅ローン/その他固定費」なら候補から除外される
  - is_income=1 の行は Gemini 候補にならないこと
- **storage (sync/local)**
  - 90KB 以上の場合に sync 書き込みを抑止して local 保存すること
  - sync 書込みエラー時に local 保存へフォールバックすること
  - 読み込み時: sync にあれば sync、無ければ local を返すこと

## content DOM 解析
- 取引行取得: `tr.transaction_list` を全件取得できる
- 取引ID抽出: `input[name="user_asset_act[id]"]` の value が取得できる
- 店名セル抽出:
  - data-title=内容あり → 優先で取得
  - data-titleなし → `td.content` で取得
  - どちらも無い → 3番目の td をフォールバック
- 金額セル抽出:
  - data-title*="金額" あり → 優先で取得
  - 無い → `td.number.amount` で取得
  - 無い → 4番目の td をフォールバック
  - `.offset` の先頭テキストのみ採用し付随 `(振替)` は無視
- 符号処理: is_income=1 なら正値、その他は絶対値化
- メモ欄セレクタ: `td.memo.form-switch-td` → 無ければ `[data-title="メモ"]`
- ハイライト付与/解除: ラベル非空で `.mf-sub-highlight` が付与・空で除去
- ラベル列生成: メモ列直後に `<td class="mf-sub-label">` が生成され、既存メモは残る
- 満足度OFF時: 満足度列のみ削除され、ラベル列は保持されること
- サブスク列トグルOFF/ON: ラベル列が非表示→再表示できる
- 満足度保存/復元: `tx:{id}` 優先で復元し、無ければ `sd:{store}|{amount}|{date}` を用いて復元できる

## options
- 初期ロード: sync → local の順で読み込み、ステータスにロード元表示
- バリデーション:
  - APIキー空でエラー表示、保存不可
  - しきい値が 0〜100 の整数以外でエラー表示、保存不可
- 保存:
  - sync正常: ステータスに「保存しました: sync」
  - sync容量超過: local に保存し「…local（sync容量超過のため）」と表示
  - syncエラー: local 保存し「…local（sync書き込みエラーのため）」と表示

## messaging（後続で統合）
- content→background: requestGeminiAnalysis が型どおり送信される
- background→content: highlightTargets がスキーマに沿って返る

## 非機能
- `npx ultracite check` で lint に通ること（全ファイル）
