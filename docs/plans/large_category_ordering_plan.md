# MoneyForward ME 大項目の並び順変更（拡張機能）— 不明点整理 & 対応計画（案）

## 背景
- マネーフォワードMEの家計簿で使う「大項目」の並び順を、ユーザーが自分の好みに並び替えたい。
- MoneyForward 本体の設定画面の並び順が他画面のセレクター（ドロップダウン）と連動して見えるため、まずは **ブラウザ拡張側で並び替えを実現できるか** を検討する。

## ゴール / 非ゴール
- ゴール
  - 設定画面（カテゴリ一覧）で大項目を **ドラッグ&ドロップ** で並び替えできる UI を提供する。
  - 並び順をブラウザ内に保持し、他画面のカテゴリ選択 UI（セレクター）で同じ順序に並び替えて表示する。
- 非ゴール
  - MoneyForward サーバー側へ並び順を保存・同期する（拡張OFF時に反映される状態は作らない）。
  - MoneyForward API や内部エンドポイントを呼ぶ（DOM操作のみで完結させる）。

## 前提（現時点の把握）
- 本リポジトリは Chrome 拡張（MV3）で、`src/content/index.js` が `https://moneyforward.com/cf*` など複数ページに注入される。
- 「カテゴリ設定画面」は `https://moneyforward.com/profile/rule`（= `/profile/rule`）である。
  - 現状 `manifest.json` の `content_scripts.matches` に `/profile/rule` が含まれていないため、実装時は追加が必要。

## 画面DOM（ユーザー提示の断片）から読み取れること（仮説）
- 設定画面（`/profile/rule`）
  - 大項目の識別子は `a.dropdown-toggle.anchor-color-off#<id>`（例: `id="14"` = 衣服・美容）。
  - 大項目は `ul.nav` 配下の `li.dropdown-submenu` として並ぶ。
- 取引画面（`/cf`）
  - 大項目は `ul.dropdown-menu.main_menu.minus > li.dropdown-submenu` 配下に並ぶ。
  - 大項目の識別子は `a.l_c_name#<id>`（例: `id="11"` = 食費）。
  - 中項目は各 `li.dropdown-submenu > ul.dropdown-menu.sub_menu#<largeId>` 内に `a.m_c_name#<middleId>` として並ぶ。
  - 特殊として「未分類」が `id="0"` で存在する（例: `a.l_c_name#0`）。

## データ保持案（ブラウザ内）
- 保存先候補
  - `chrome.storage.sync`（同期したい場合。容量上限が厳しい）
  - `chrome.storage.local`（ローカルのみで良い場合。今回の要件「ブラウザ内で保持」に合致）
- キー案
  - `mf_toolpack_large_category_order`
- 値の形式（例）
  - `{"version":1,"updatedAt":"2026-01-11T00:00:00.000Z","order":["1","11","10",...]}`
- 保存形式（確定）
  - `order: string[]`（大項目IDの配列）として保存する。
  - 対象外の `id="0"`（未分類）は `order` に含めない。
- マージ仕様（確定: 未知IDは末尾追加）
  - DOMから取得した `currentIds`（`a.l_c_name[id]`。ただし `"0"` は除外）を基準に、保存済み `order` を正規化して適用する。
    1. `currentIds` に存在しないIDは `order` から除外する（将来の変化に備えたフェイルセーフ）。
    2. `order` に存在しないID（= 未知ID）は、DOM順のまま `order` の末尾へ追加する。
    3. `order` の重複IDは先勝ちで1つに正規化する。
- スコープ（確定）
  - アカウント分離は考慮しない（同一ブラウザ内で共通の並び順を適用する）。
  - 収入/支出で別オーダーは持たない（収入は対応不要の前提）。

### 追記: 並び替え機能の ON/OFF + リセット設計（確定）
- 目的: ユーザーが「拡張による並び替え」を **一時的に無効化** できるようにする（不具合時の逃げ道と再有効化の容易さを両立）。
- 保存場所: 既存の `settings`（`src/data/storage.js` で扱っている設定オブジェクト）内に保持する案を第一候補とする。
  - 理由: オプション画面は `loadSettings()` を基点に UI を構築しており、単独キーより一貫して管理しやすい。
  - 例:
    - `settings.largeCategoryOrder = { version: 1, updatedAt: string, order: string[] }`
    - `settings.largeCategoryOrderEnabled = true`（既定は `true`）
  - リセットは `settings.largeCategoryOrder` を削除（または `null`）にして保存する。
  - ON/OFF は `settings.largeCategoryOrderEnabled` のみを更新し、`order` 自体は保持する。
  - どのストレージ領域（sync/local）に入るかは既存ロジック（`saveSettingsWithFallback`）に従う。

## 実現方法案（UI）
### 方式: ドラッグ&ドロップ（本計画の前提）
- 設定画面（`/profile/rule`）の `ul.nav` を並び替え可能にし、`li.dropdown-submenu`（= 大項目）単位でドラッグ移動できるようにする。
- 実装方針（候補）
  - 既存で読み込まれている可能性がある `jQuery UI sortable` が利用できる場合は、それを優先して使う（追加依存を増やさない）。
  - 利用できない場合は、拡張側に軽量なD&D実装（例: Sortable系）を同梱して適用する（依存追加の可否は別途判断）。
- 干渉回避（必須要件）
  - **ドラッグ専用ハンドル**（例: `≡` アイコン）を `li.dropdown-submenu` 内に追加し、「ハンドルを掴んだ時だけ」ドラッグ開始する。
  - `a.dropdown-toggle`（開閉トリガー）はドラッグ開始対象から除外する（誤操作防止）。
  - サブメニュー内の中項目は既に sortable が存在しうるため、`items` / `handle` / `cancel` を厳密に設定して競合させない。
- 保存タイミング
  - ドロップ完了（並び順が確定）時に、現在の `ul.nav` 並びから `order: string[]` を再構築して保存する。

## 他画面への反映方法案
- 方針: **表示用DOMの並び替えのみ** を行い、各カテゴリの ID/値自体は変更しない（選択結果の保存や送信に影響を与えない）。
- 対象ページ: `/cf` のみ
- 対象DOM（現時点での候補）
  - `ul.dropdown-menu.main_menu.minus`（支出側のメニュー）
- 適用タイミング（確定）
  - カテゴリメニューは「クリックで表示される」前提とする（実装次第でDOM生成/表示切替の差はあり得る）。
  - そのため「メニュー表示トリガー（クリック）」を起点に、表示対象DOMへ並び替えを適用する。
    - 例: クリックイベントでフラグを立て、`MutationObserver` で `ul.dropdown-menu.main_menu.minus` の出現を検知したら1回だけ並び替える。
    - 例: クリックイベント後に `requestAnimationFrame` を複数回使ってDOM生成完了を待ち、見つかったら並び替える（ただし確実性はObserverの方が高い）。

## 既知のリスク / 注意点
- DOM構造・クラス名は MoneyForward 側の改修で変わるため、検出・適用が失敗しても安全にフェイルする必要がある。
- 並び替え対象が「大項目」だけでよいか（中項目・未分類・振替など特殊項目が存在する可能性）。
- 既存イベントハンドラ
  - DOMノードの移動は基本的にイベントを保持するが、初期化順序に依存する処理がある場合は壊れる可能性がある。
- アクセシビリティ
  - キーボード操作は考慮不要（ドラッグ&ドロップ前提）。
  - 最低限、追加するドラッグハンドル等には `aria-label` を付与し、意図しない操作にならないようにする。

## 拡張機能の設定画面（options_page）: ON/OFF + リセット設計（確定）
- 追加場所: 拡張機能の設定画面 `src/options/index.html`（既存のカードUIに新セクションを追加）
- UI 文言（案）
  - セクション見出し: `カテゴリの並び順`
  - 説明: `家計簿（/cf）のカテゴリ選択メニューで使う「大項目」の表示順を、拡張機能側の保存値で並び替えます。`
  - トグル（チェックボックス）: `並び替えを有効にする`
  - ボタン: `大項目の並び順をリセット`
  - 補足: `リセットすると保存済みの並び順データが削除され、MoneyForward 既定の順序で表示されます。`
- トグルの状態
  - 既定は `settings.largeCategoryOrderEnabled = true`
  - OFF の場合は **並び替え処理のみスキップ**（`order` は保持）
  - OFF の場合、設定画面のドラッグ UI も無効化または非表示にする（誤操作防止）
- ボタンの状態
  - `settings.largeCategoryOrder` が未設定なら disabled（リセット対象が無いことを明示）
  - 設定がある場合は enabled
- クリック時の挙動（リセット）
  - `confirm()` 相当の確認（またはダイアログUI）を必須にする
  - OK の場合のみ `settings.largeCategoryOrder` を削除して保存
  - 成功メッセージ（オプション画面の `status` エリアに表示）:
    - `並び順をリセットしました。`
    - `MoneyForward の設定画面（/profile/rule）を再表示して、並び順が戻っていることを確認してください。`
    - `家計簿（/cf）も、次回カテゴリメニューを開くと反映されます。`
  - 失敗時: `リセットに失敗しました。` + エラー要因を短く表示（storage不可など）

## 不明点（要確認事項）
- [x] 「カテゴリ設定画面」の正確な URL は `https://moneyforward.com/profile/rule`
- [x] 設定画面の大項目は `a.dropdown-toggle#<id>`（数値ID）で識別できる
- [x] `/cf` の大項目メニューは `a.l_c_name#<id>`（数値ID）で識別できる
- [x] `/cf` のメニューDOMはクリック時に生成される
- [x] 収入側は対応不要
- [x] 「未分類（id=0）」は並び替え対象外（現状順のまま or 常に末尾に残す）
- [x] 大項目はユーザーが追加/削除できない（固定）

## 追加の受け入れ条件（ON/OFF + リセット）
- 拡張機能の設定画面に「並び替えを有効にする」トグルが表示される。
- トグル OFF の場合、並び替え処理が実行されず、MoneyForward 既定の順序で表示される（`order` は保持）。
- 拡張機能の設定画面に「大項目の並び順をリセット」ボタンが表示される。
- カスタム順が未設定のとき、ボタンは無効状態である。
- リセット後、`/cf` のカテゴリメニュー表示順が MoneyForward 既定に戻る（少なくとも次回メニュー生成時に反映される）。

## 調査の進め方（作業チェックリスト）
- [x] 対象ページ（`/profile/rule`・`/cf`）の HTML を保存して、DOM 断面を固定化する（fixture: `tests/fixtures/mf_profile_rule_full.html`, `tests/fixtures/mf_cf_full.html`）
- [x] 設定画面で大項目を特定できる最小セレクタ候補: `ul.nav > li.dropdown-submenu > a.dropdown-toggle[id]`
- [x] `/cf` で大項目を特定できる最小セレクタ候補: `ul.dropdown-menu.main_menu.minus > li.dropdown-submenu > a.l_c_name[id]`
- [x] `/cf` のカテゴリメニューDOMを特定する（fixture: `tests/fixtures/mf_cf_full.html`）
  - 大項目トリガー: `.btn-group.btn_l_ctg a.v_l_ctg[data-toggle="dropdown"]`（例: `#js-large-category-selected`）
  - 大項目メニュー本体: `ul.dropdown-menu.main_menu.minus`
  - 大項目: `ul.dropdown-menu.main_menu.minus > li.dropdown-submenu > a.l_c_name[id]`
  - 中項目: `li.dropdown-submenu > ul.dropdown-menu.sub_menu#<largeId> a.m_c_name[id]`
  - 開閉はメニューの追加/削除ではなく、基本は表示/非表示の切り替え（サンプルHTML上は状態差分は持たない）
- [x] 「並び替え適用のタイミング」を決める（クリック起点 + DOM出現検知で適用）
- [x] 保存形式（配列）と、未知IDが来たときのマージ仕様（末尾追加）を決める（`order: string[]` + DOM基準で末尾追加）

## 対応計画（段階的）
### Phase 0: 事実確認（最優先）
- 設定画面 URL と DOM を確定し、拡張の `matches` 追加要否を決める。
- `/cf` 等の「セレクター DOM」の形を確定する。

### Phase 1: 設定画面での並び替え UI（最小実装）
- 設定画面（`/profile/rule`）で大項目をドラッグ&ドロップで並び替え可能にする（ハンドル方式で誤操作を抑制）。
- ドロップ完了時に並び替え結果を `settings.largeCategoryOrder` に保存する。

### Phase 2: 他画面での並び替え反映
- 収集した DOM パターンごとに「並び替え関数」を用意し、保存された `order` を適用する。
- 遅延生成の場合は `MutationObserver` かクリックフックで再適用する（過剰監視にならないようデバウンス）。

### Phase 3: テスト / 品質
- 主要 DOM 断面を fixture として追加し、並び替え関数のユニットテスト（もしくは軽量 integration）を用意する。
- `npm exec -- ultracite check` を CI 相当として通す。

## 実装タスクリスト（実装段階）
1. [x] `manifest.json` に `/profile/rule` を `content_scripts.matches` として追加する（設定画面に content script を注入）
1.1. [x] 品質チェック: `npm exec -- ultracite check`
2. [x] `settings.largeCategoryOrder` の型/保存方針を `src/data/storage.js` に反映（ロード/保存のスキーマ拡張）
2.1. [x] 品質チェック: `npm exec -- ultracite check`
3. [x] 設定画面（`/profile/rule`）の D&D 実装
3.1. [x] `ul.nav > li.dropdown-submenu` をドラッグ対象にする
3.2. [x] ドラッグハンドル要素を追加し、クリックによるメニュー開閉と干渉させない
3.3. [x] ドロップ完了時に `order: string[]` を再構築して保存
3.4. [x] 品質チェック: `npm exec -- ultracite check`
4. [x] `/cf` 側の並び替え適用
4.1. [x] `ul.dropdown-menu.main_menu.minus` を対象に `order` を適用
4.2. [x] 未分類 `id=0` は対象外で固定
4.3. [x] クリック起点 + DOM出現検知で一度だけ適用（Observer + デバウンス）
4.4. [x] 品質チェック: `npm exec -- ultracite check`
5. [x] オプション画面に「並び替え ON/OFF」トグルを追加
5.1. [x] 既定値 `settings.largeCategoryOrderEnabled = true` を反映
5.2. [x] OFF の場合は並び替え処理・ドラッグ UI を無効化または非表示
5.3. [x] 品質チェック: `npm exec -- ultracite check`
6. [x] オプション画面に「大項目の並び順をリセット」ボタンを追加
6.1. [x] `settings.largeCategoryOrder` が未設定なら disabled
6.2. [x] 確認ダイアログ後に削除保存 + ステータスメッセージ表示
6.3. [x] 品質チェック: `npm exec -- ultracite check`
7. [x] スタイル追加（ハンドルや並び替え中の視覚フィードバック）
7.1. [x] 品質チェック: `npm exec -- ultracite check`
8. [x] サンプルHTML（fixture）を使った軽量テスト（DOM操作が期待どおりになるか）
8.1. [x] 品質チェック: `npm exec -- ultracite check`

## 受け入れ条件（たたき台）
- 設定画面で大項目の並び順を変更でき、リロード後も保持される。
- `/cf` などカテゴリ選択 UI で表示順が保持された順に並び替わる。
- 並び替えが失敗しても、カテゴリ選択自体が壊れない（フェイルセーフ）。
