# Gemini解析トグル（OFF時にPopup無効化）チェックリスト

## 実装タスク
- [x] `Settings` 型に `featureFlags.geminiAnalysisEnabled` を追加し、デフォルト `true` を適用する（未設定時も ON 扱い）。
- [x] オプション画面に ON/OFF トグルを追加し、保存・復元・ステータス表示まで通す。
- [x] `storage.onChanged` でトグル変更を検知し、Popup にも即時反映されるようブロードキャストする。
- [x] Popup の「このページで再解析」ボタンをトグル状態に応じて disabled 切替し、無効時は tooltip/title を表示する。
- [x] content/background 間のメッセージ送信時に、トグル OFF なら Gemini 呼び出しをスキップする。
- [x] 既存ユーザー設定に対するマイグレーション: `featureFlags` が未定義なら `geminiAnalysisEnabled=true` を挿入する。

## テスト観点
- [ ] トグル ON のまま: `/cf` で従来通り解析・ハイライトされる。
- [ ] トグル OFF: 解析リクエストが送られず、行ハイライトは「ラベルあり」のみで付与される。
- [ ] トグル OFF のとき Popup ボタンが disabled になり、hover/focus で無効理由が表示される。
- [ ] OFF→ON に戻した後、Popup ボタンが即時有効化され、再解析が発火する。
- [ ] `storage.sync` 読み出しで `featureFlags` が存在しない場合でもエラーにならず、デフォルト ON で動作する。
