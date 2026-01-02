# 画面マスキング（内容/金額のぼかし）設計メモ

## 目的
画面共有・配信・スクリーンショット時に、家計簿の **「内容」** と **「金額（円）」** をワンクリックでぼかして表示し、第三者へのチラ見えを減らす。

> 注意: 本機能は「表示上のマスク」であり、通信/保存/サーバ側の秘匿を目的としない。

## スコープ（v0）
- 対象ページ: `https://moneyforward.com/cf*`
- マスク対象:
  - 明細テーブルの「内容」「金額（円）」セル
  - 上部の月次収支（当月収入/当月支出/当月収支）の合計値
  - カレンダー（月表示）内の金額（イベントに表示される + / - の値）
  - `/cf/summary` の支出セクション（合計、支出内訳の金額列）
  - `/analysis/monthly_reports` の合計/内訳/グラフ金額（¥/￥/円 表記）
- マスク方式: CSS `filter: blur()`（DOMのテキスト置換はしない）

## 実装方針
### 1. DOM耐性
MoneyForward 側の DOM 変更に備え、セル特定は既存ロジックに合わせる。
- 内容セル: `td[data-title="内容"]` → `td.content` → `row.cells[2]` の順でフォールバック
- 金額セル: `td[data-title*="金額"]` → `td.number.amount` → `row.cells[3]` の順でフォールバック

CSSだけではフォールバック指定ができないため、content script で特定したセルに `mf-tp-mask-target` クラスを付与し、`mf-tp-mask-on` 時のみ blur を適用する。

月次収支（上部合計）は、`/cf` と `/cf/summary` でテーブルIDが異なるため両方を対象にする。
- `/cf`: `table#monthly_total_table_kakeibo`
- `/cf/summary`: `table#monthly_total_table`

いずれも `tbody tr.js-monthly_total td` のうち値が入る `0/2/4` 列を対象にする。

カレンダー（月表示）の金額は `#calendar .fc-event-title .plus-color/.minus-color` に描画されるため、該当要素をマスク対象としてマーキングする。

`/cf/summary` の支出セクションは、合計が `#cache-flow .heading-radius-box` に表示され、支出内訳の「金額」列は `#table-outgo tbody tr td:nth-child(2)` に並ぶため、それぞれをマスク対象としてマーキングする（割合列は除外）。

### 2. UI（ワンクリック）
- ページ右上に固定ボタン（`button#mf-tp-mask-toggle`）を表示
- `aria-pressed` で ON/OFF を表現し、テキストは `マスク: ON/OFF`

### 3. 永続化（再訪でもON）
- ストレージキー: `mf_toolpack_ui_prefs`
- 形: `{ maskingFeatureEnabled: boolean, maskingEnabled: boolean }`
- 保存先: `chrome.storage.sync` を優先し、同値を `chrome.storage.local` にも保存（sync が使えない/失敗する環境のフォールバック）

## タスク
- [x] content script にトグルボタン追加
- [x] 「内容」「金額」セルへターゲットクラス付与
- [x] blur の CSS 追加
- [x] ON/OFF の永続化（再訪維持）
- [x] オプション画面で「マスク機能の有効/無効」を設定可能にする（OFF時はボタン非表示）
- [ ] ショートカット（Chrome commands）対応
