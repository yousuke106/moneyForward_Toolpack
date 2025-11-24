# 統合テスト／手動確認 手順 (暫定)

対象: Step3 （content + background + options）連携の動作確認  
環境: Chrome 拡張をアンパック読み込み、`tests/fixtures/mf_cf_transactions_sample.html` をローカルファイルで開くか、実ページ `/cf` で確認

## 事前準備
- `npm install` 済み
- 拡張を `chrome://extensions` から「パッケージ化されていない拡張機能を読み込む」でロード
- options に以下を入力して保存
  - APIキー: 実キー
  - しきい値: 70（デフォルト）
  - モデル: gemini-2.5-flash（デフォルト）

## 手動確認チェックリスト
- [ ] 家計簿行にセレクタが表示され、クリックで選択肢が維持される
- [ ] ラベル選択で行がハイライト（薄い黄色）になる／未設定で解除される
- [ ] 保存後、ページ再読込しても選択状態が復元される（取引ID優先）
- [ ] 同一店名＋金額の別行にもラベルが自動適用される（store+amount キー）
- [ ] options でモデルやキーを変更 → content が `storage.onChanged` で再解析する
- [ ] 月替わりフラグ: 一度実行後、同月は Gemini 呼び出しが抑止される（セッションストレージ）
- [ ] Gemini 呼び出しが成功し、スコア >= しきい値の行だけハイライトされる（デバッグは `mf_subs_debug=true` で console に warn/err 出力）
- [ ] APIキー未設定時: Gemini 呼び出しはスキップされるが UI は壊れない

## 補足
- デバッグ時は console で `sessionStorage.setItem("mf_subs_debug","true")` を実行し再読込すると、注入失敗や Gemini エラーを warn ログで確認できます。
- しきい値・モデル変更は options 保存直後に反映されます（content で storage.onChanged を監視）。
