# Step 3 実装コードレビュー結果 (2025-11-24)

## 概要
Step 3「content本機能＋Gemini連携・仕上げ」の実装に関するレビュー結果です。
DOM操作やイベントハンドリングの基本骨格はできていますが、**Gemini API連携部分に重大な実装漏れ**があり、このままでは動作しません。

## 重大な問題 (Critical)

### 1. Gemini API リクエスト形式の不備 (`src/background/index.js`)
- **現状**: `body: JSON.stringify(payload)` としており、`payload`（`{ month, transactions }`）を直接送信しています。
- **問題**: Gemini API (`generateContent`) は `contents` 配列を含む特定のJSONスキーマを要求します。現状のリクエストは `400 Bad Request` となる可能性が高いです。
- **修正**: `payload` をプロンプト（System Instruction + User Prompt）に変換し、正しいAPIスキーマ（`{ contents: [{ parts: [{ text: ... }] }] }`）に整形する必要があります。

### 2. プロンプト構築ロジックの欠落
- **現状**: どのファイルにも「サブスクリプションを判定せよ」という旨のプロンプトテキストが見当たりません。
- **問題**: データだけを投げても、AIは何をすべきか判断できません。
- **修正**: `src/background/index.js` 内で、受信した `transactions` リストをJSON文字列化し、「以下の取引リストからサブスクリプションの可能性が高いものを判定し、JSON形式で出力せよ」といった具体的な指示を含むプロンプトを構築してください。

### 3. レスポンス解析の不備 (`src/background/index.js`)
- **現状**: `const data = await res.json(); sendResponse({ ok: true, data });` となっています。
- **問題**: Gemini APIのレスポンスは深くネストされた構造（`candidates[0].content.parts[0].text`）であり、かつMarkdownコードブロックで囲まれている場合があります。これをパースして `results` 配列を取り出すロジックが欠落しています。
- **修正**: レスポンスからテキストを抽出し、`JSON.parse`（必要ならMarkdown記号の除去）を行うロジックを追加してください。

### 4. 設定変更の即時反映未実装 (`src/content/index.js`)
- **要件**: 「options 保存と storage.onChanged 反映」
- **現状**: `chrome.storage.onChanged` リスナーが実装されていません。
- **修正**: 設定（APIキーやモデル）が変更された際、キャッシュ（`sessionStorage`）をクリアして `runGemini` を再実行するリスナーを追加してください。

## 改善提案 (Suggestions)

### 1. エラーハンドリングの強化
- API呼び出し失敗時やJSONパースエラー時に、ユーザーに通知する（またはログに残す）仕組みを強化してください。

### 2. コード重複の解消（将来的な課題）
- `src/data/normalize.js` のロジックが `src/content/index.js` にコピーされています。ビルド導入までは許容範囲ですが、保守性に課題があります。

---

## アクションチェックリスト

以下の修正を行ってください。

- [x] **Fix: プロンプト構築とAPIリクエスト (`src/background/index.js`)**
  - [x] `transactions` データを受け取り、適切なシステムプロンプトと組み合わせてリクエストボディを作成する。
  - [x] Gemini API の `generateContent` スキーマに準拠させる。（`contents.parts[].text` に instruction+transactions を連結）

- [x] **Fix: レスポンス解析 (`src/background/index.js`)**
  - [x] APIレスポンスからJSONテキストを抽出・クリーニング・パースする。
  - [x] Content Script が期待する形式（`{ results: [...] }`）で返す。（コードフェンス除去後に `JSON.parse`）

- [x] **Feat: 設定変更検知 (`src/content/index.js`)**
  - [x] `chrome.storage.onChanged` を監視し、`settings` キーの変更時にセッションフラグのみクリア（自動実行はせず、ユーザー操作／再解析ボタンで実行）。
