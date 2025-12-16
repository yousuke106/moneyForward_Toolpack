# 画面マスキング（内容/金額のぼかし）設計メモ

## 目的
画面共有・配信・スクリーンショット時に、家計簿の **「内容」** と **「金額（円）」** をワンクリックでぼかして表示し、第三者へのチラ見えを減らす。

> 注意: 本機能は「表示上のマスク」であり、通信/保存/サーバ側の秘匿を目的としない。

## スコープ（v0）
- 対象ページ: `https://moneyforward.com/cf*`
- マスク対象: 明細テーブルの「内容」「金額（円）」セルのみ
- マスク方式: CSS `filter: blur()`（DOMのテキスト置換はしない）

## 実装方針
### 1. DOM耐性
MoneyForward 側の DOM 変更に備え、セル特定は既存ロジックに合わせる。
- 内容セル: `td[data-title="内容"]` → `td.content` → `row.cells[2]` の順でフォールバック
- 金額セル: `td[data-title*="金額"]` → `td.number.amount` → `row.cells[3]` の順でフォールバック

CSSだけではフォールバック指定ができないため、content script で特定したセルに `mf-tp-mask-target` クラスを付与し、`mf-tp-mask-on` 時のみ blur を適用する。

### 2. UI（ワンクリック）
- ページ右上に固定ボタン（`button#mf-tp-mask-toggle`）を表示
- `aria-pressed` で ON/OFF を表現し、テキストは `マスク: ON/OFF`

### 3. 永続化（再訪でもON）
- ストレージキー: `mf_toolpack_ui_prefs`
- 形: `{ maskingEnabled: boolean }`
- 保存先: `chrome.storage.sync` を優先し、同値を `chrome.storage.local` にも保存（sync が使えない/失敗する環境のフォールバック）

## タスク
- [x] content script にトグルボタン追加
- [x] 「内容」「金額」セルへターゲットクラス付与
- [x] blur の CSS 追加
- [x] ON/OFF の永続化（再訪維持）
- [ ] オプション画面でデフォルトON/OFFを設定可能にする
- [ ] ショートカット（Chrome commands）対応

