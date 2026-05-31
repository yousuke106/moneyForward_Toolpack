# MoneyForward Toolpack

## Overview

MoneyForward Toolpack is a privacy-focused Chrome extension for MoneyForward
ME. It helps users review household finance data in their own browser by
detecting possible subscriptions, duplicate transactions, and category issues.
It also includes screen masking for safer screen sharing and screenshots.

The extension stores settings and labels locally in browser extension storage
and does not send household finance data to a developer-managed server. If the
AI analysis feature is enabled, Gemini API requests are made to Google using the
user's own API key. This project is independent and is not affiliated with
MoneyForward.

This is an early-stage project. The goal is to keep improvements reviewable,
privacy-conscious, and aligned with the actual Chrome extension behavior.

MoneyForward ME の家計簿ページで、サブスクリプション（固定費）の可能性が高い取引を Gemini API を用いて検出し、可視化・管理するための Chrome 拡張機能です。

## Why this project matters

Household finance tools often contain sensitive information. Users need
lightweight, privacy-friendly ways to identify recurring subscriptions,
duplicate payments, and category mistakes.

This extension keeps the workflow inside the user's browser and helps users
understand their own spending without uploading data to a developer-managed
backend. It is useful for people reviewing monthly budgets, reducing unused
subscriptions, and safely sharing screens or screenshots.

## Security / Privacy

- **Local-first design**: settings, labels, category rules, and UI preferences
  are stored with `chrome.storage`.
- **No developer-managed backend**: the extension does not upload household
  finance data to a server operated by the maintainer.
- **No MoneyForward credential collection**: the extension runs on
  MoneyForward pages but does not ask for, collect, or store MoneyForward login
  credentials.
- **User-controlled Gemini API key**: Gemini analysis is optional. When enabled,
  requests are sent to Google's Gemini API using the API key supplied by the
  user.
- **Feature toggles**: users can enable or disable AI analysis, screen masking,
  and CSV download behavior from the extension settings.
- **MV3 permission minimization**: permission scope should remain an ongoing
  maintenance goal as the extension evolves.
- **DOM-dependent behavior**: MoneyForward page structure changes may break
  parsing, highlighting, masking, or CSV helpers. Users should verify outputs
  before relying on them.

## 🚀 機能

- **AIによる自動解析**: Gemini API 対応モデルを利用して、取引明細からサブスクリプションの可能性をスコアリング（Gemma 4 は実験的・不安定）。
- **ハイライト表示**: 設定したしきい値を超える「サブスク候補」の行を自動でハイライト。
- **サブスク列（ラベル管理）**: 各取引に対して「利用中」「ほぼ未使用」「解約予定」などのステータスをラベル付けして管理（メモ列とは別の専用列）。
- **満足度列**: 各行に Top/Worst ランクとメモ入力欄を追加（任意）。
- **二重計上チェック**: 同日・同内容・同額の重複行をハイライト。
- **カテゴリルール警告**: 大項目×中項目の組み合わせをホワイト/ブラックリストで管理し、分類ミスを早期に検知（CSVインポート/エクスポート対応）。
- **画面マスキング**: 「内容」「金額（円）」と上部の月次収支、カレンダー内の金額、`/cf/summary` の支出（合計・金額列）を blur でぼかし、画面共有・スクショ時のチラ見えを防止（ページ内ボタンでワンクリック切替、状態は保存）。
- **画面マスキング機能のON/OFF**: オプション画面でマスキング機能自体を無効化可能（OFF時は家計簿ページ右上の `マスク: ON/OFF` ボタンを表示しません）。
- **Gemini解析のON/OFFトグル**: オプション画面で解析機能を有効/無効に切り替え可能。OFF時はポップアップの「再解析」ボタンも無効化されます。
- **右クリックCSVダウンロード（トグル対応）**: 家計簿ページで右クリックし、表示中の年月のCSVを保存できます。オプションのトグルで無効化可能。
- **プライバシー配慮**: 設定値・ラベル等はブラウザ内ストレージに保存され、開発者が管理するサーバーへ送信されません（Gemini API へのリクエストはユーザーのAPIキーで実行）。

## 🧭 使い方

### サブスク検出・ラベル
1. 家計簿ページ (`/cf`) を開きます。初回は解析トグルがONなら自動でスコアリングが走ります。
2. 各行に表示されるドロップダウンから「利用中/ほぼ未使用/解約予定」を選ぶと、行がハイライトされ状態が保存されます。
3. 解析を再実行したい場合はポップアップを開き「再解析」ボタンを押します（解析トグルがONのときのみ有効）。

### 画面マスキング（内容/金額のぼかし）
1. オプション画面で「画面マスキング機能を有効にする」がONであることを確認します（OFFの場合はボタン自体が表示されません）。
2. 家計簿ページ右上に表示されるボタン `マスク: ON/OFF` をクリックします。
3. ON の間は「内容」「金額（円）」等がぼかされ、状態は保存されるため再訪時も維持されます。

### 右クリックでCSVダウンロード
1. オプション画面で「右クリックで家計簿CSVをダウンロード」をONにします（デフォルトON）。
2. 家計簿ページで右クリックし「表示中の年月の家計簿CSVをダウンロード」を選択します。
3. バッジ `DL` が表示されたら保存ダイアログが開き、`moneyforward_YYYYMM.csv` でダウンロードされます。
4. 未ログインやDOM取得失敗時はバッジ `NG/NA` で通知されます（自動でログインタブは開きません）。

## 📦 インストール方法

1. このリポジトリをクローンまたはダウンロードします。
   ```bash
   git clone https://github.com/yousuke106/moneyForward_Toolpack.git
   ```
2. 依存関係をインストールし、ビルドします。
   ```bash
   corepack pnpm install --frozen-lockfile
   corepack pnpm run build
   ```
3. Google Chrome を開き、拡張機能管理ページ (`chrome://extensions`) にアクセスします。
4. 右上の「デベロッパーモード」をオンにします。
5. 「パッケージ化されていない拡張機能を読み込む」をクリックし、`dist/` フォルダを選択します。

## ⚙️ 設定方法

1. 拡張機能のアイコン、またはポップアップ内の「設定を開く」ボタンからオプション画面を開きます。
2. **Gemini APIキー**: [Google AI Studio](https://aistudio.google.com/) でAPIキーを取得し入力します。
3. **モデル**: 安定運用は `gemini-2.5-flash` を推奨します。Gemma 4 は実験的・不安定で、500エラーやJSON不整形が発生する場合があります。
4. **しきい値**: AIのスコア（0-100）に対する判定ラインを設定します（デフォルト: 70）。
5. **Gemini解析トグル**: 解析を無効化すると自動・手動解析を停止し、ポップアップの再解析ボタンも無効化されます（サブスク列などは利用可）。
6. **二重計上チェックトグル**: 同日・同内容・同額の重複行ハイライトをON/OFFできます。
7. **右クリックCSVダウンロードトグル**: ON で家計簿ページの右クリックメニューから当月CSVをダウンロードできます。OFF でメニューを非表示/無効化します。
8. **満足度列トグル**: Top/Worst ランク列を表示/非表示できます。
9. **サブスク列トグル**: サブスク列（ラベル選択）を表示/非表示できます。
10. **画面マスキング機能トグル**: OFF にすると家計簿ページ右上の `マスク: ON/OFF` ボタンを表示しません（機能自体を無効化）。
11. **カテゴリルール**: 大項目×中項目のホワイト/ブラックリストを管理できます（CSVでインポート/エクスポート可能）。

## 🛠️ 開発者向け情報

### ディレクトリ構成
- `src/`: ソースコード (content scripts, background, options, etc.)
- `tests/`: ユニットテスト、統合テスト用フィクスチャ
- `docs/`: 設計ドキュメント、チェックリスト

### 開発コマンド
```bash
corepack pnpm install --frozen-lockfile
corepack pnpm run build
corepack pnpm run check
corepack pnpm run test
```

### 動作環境
- Node.js (テスト実行用)
- Google Chrome (最新版)
- Chrome 拡張権限: `downloads`, `scripting`, `contextMenus`, `storage`, `unlimitedStorage`
- Host permissions: `https://moneyforward.com/*`, `https://generativelanguage.googleapis.com/*`

## 📄 ライセンス

MIT License

## 🔐 プライバシーポリシー

本拡張のプライバシーポリシーは `PRIVACY_POLICY.md` を参照してください。
