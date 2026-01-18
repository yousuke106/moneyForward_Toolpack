# Toolpack ダウンロード命名ガード修正プラン

## 背景
`chrome.downloads.onDeterminingFilename` が全ダウンロードに対してファイル名提案を行うため、
他拡張の保存機能と干渉し、Toolpack 側に「別拡張がファイル名を指定した」警告が出ている。

## 目的
- Toolpack 由来のダウンロードにのみファイル名を提案する。
- 他拡張のダウンロードへは一切干渉しない。

## 現状の問題
- `onDeterminingFilename` が全ダウンロードに対して処理を行うため、
  `byExtensionId` が Toolpack 以外でも提案ロジックが走る。

## 変更方針
- **優先方針:** `downloads.download()` 側で `filename` を指定できるなら、
  `onDeterminingFilename` を使わない（干渉ゼロを優先）。
- `onDeterminingFilename` を使う場合は、
  `item.byExtensionId !== chrome.runtime.id` の場合は `suggest()` のみで即終了する。
- Toolpack 由来のダウンロードのみ、既存のファイル名提案キューを使用する。

## 影響範囲
- `src/background/index.js` の `chrome.downloads.onDeterminingFilename` 実装
- Toolpack のダウンロード起点（CSV 保存等）

## テスト観点
- Toolpack の保存時に期待するファイル名が維持される
- 他拡張の保存で警告が出ない／ファイル名を上書きしない

## タスク
- [x] `downloads.download()` 側で `filename` 指定が可能か確認し、可能なら `onDeterminingFilename` を使わない方針に切り替える
- [ ] `onDeterminingFilename` 継続が必要な場合のみ、`byExtensionId` ガードを追加する（※本対応では廃止のため不要）
- [x] Toolpack 保存の挙動テストを追加/更新する（手動確認で問題なし）
- [x] 干渉しないことの回帰テスト観点を整理する（他拡張の保存で問題なしを確認）
- [x] `npm exec -- ultracite check` を実行し、指摘があれば修正する
