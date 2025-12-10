# 家計簿テーブル 満足度列 追加設計 (v0.1)

## 背景と目的
- 各支出の主観的価値を記録し、後から「改善すべき支出」と「満足度の高い支出」を見返せるようにする。
- UI は家計簿テーブル右端に 2 列追加し、Top3/Worst3 のランク選択と理由メモを入力できるようにする。

## UI 仕様
- 列配置: 既存最右の「削除」列の右に 2 列追加。
  - **満足度**: セレクト 7択（未選択, Top1/Top2/Top3, Worst1/Worst2/Worst3）。`aria-label="満足度"`。
  - **満足度メモ**: 単一行テキスト入力（~120文字想定）。`aria-label="満足度メモ"`。
- レイアウト: セレクトとメモを縦積み（行高抑制）。セル幅は CSS で `min(140px, 25vw)` 程度を想定。横スクロール発生の有無は実機確認。
- イベント: `stopPropagation` を付け、行クリック等への干渉を避ける。キーボード操作可。

## データモデル
- 保存先: `chrome.storage.local`。
- キー: 既存 `TxKey = "tx:${transactionId}"` を流用。
- 値: `{ rank: "top1"|"top2"|"top3"|"worst1"|"worst2"|"worst3"|null, note: string }`。
- 読み込み時に未設定行は空表示。txId が無い行は UI を描画しない。

## DOM 挿入・監視
- 既存 MutationObserver（`#cf-detail-table tbody` を監視）のデバウンスチェーンに「満足度列挿入」を追加し、月移動・フィルタ・編集後も再挿入する。
- ヘッダー行 `<thead>` が存在する前提で TH を追加。ボディ行には TD を append する。
- 店名/金額抽出のフォールバック列 (2/3番目) は右端追加では影響しない。

## エラーハンドリング
- storage 書き込み失敗時は行内に軽微なエラーメッセージまたはトーストを表示し、入力内容を保持。
- txId 未取得時はログを出し、その行では UI を出さない。

## テスト観点
- セーブ/ロード: rank・note を入力後、リロードして復元されること。
- 未選択: 何も選ばずに保存されず、再描画で空のままになること。
- 既存機能との共存: ラベルハイライト、Gemini ハイライト、二重計上警告、カテゴリ警告が動作し、`findStoreCell`/`findAmountCell` が壊れないこと。
- DOM 変化: 月移動やフィルタ後も列が再生成されること。
- アクセシビリティ: `aria-label` の付与と Tab 移動で操作できること。

## タスク一覧（ドラフト）
- [ ] 要件ドキュメントを requirements に反映（本設計に紐づけ）
- [ ] content script: TH/TD 挿入・デバウンス組み込み
- [ ] content script: storage への保存/復元ロジック追加
- [ ] content script: `stopPropagation` と aria 属性付与
- [ ] CSS: 列幅・縦積みレイアウトの最小スタイル追加
- [ ] tests: `tests/fixtures/mf_cf_transactions_sample.html` へ列追加、保存/復元ユニットテスト
- [ ] docs: リリースノート/README に機能追加を追記（実装後）
