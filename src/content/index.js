/* globals chrome */

// 金額文字列から数値を抜き出すための正規表現。
const AMOUNT_REGEX = /[-+−]?\d[\d,]*/u;
// data-table-sortable-value から日付を取り出すための正規表現。
const SORTABLE_DATE_REGEX = /\d{4}[/-]\d{2}[/-]\d{2}/;

// マイナス表記の先頭判定に使う（支出判定）。
const NEGATIVE_HEAD_REGEX = /^[-−]/u;

(() => {
  // ラベル選択肢はUIで使う表示文言に揃えて管理する。
  const LABELS = [
    { value: "", text: "未設定" },
    { value: "using", text: "利用中" },
    { value: "rarely", text: "ほぼ未使用" },
    { value: "cancel", text: "解約予定" },
  ];

  // 満足度は固定候補なので配列で定義しておく。
  const SATISFACTION_OPTIONS = [
    { value: "", text: "未選択" },
    { value: "top1", text: "Top1" },
    { value: "top2", text: "Top2" },
    { value: "top3", text: "Top3" },
    { value: "worst1", text: "Worst1" },
    { value: "worst2", text: "Worst2" },
    { value: "worst3", text: "Worst3" },
  ];

  // DOM挿入時に参照するクラス/セレクタはここでまとめる。
  const selectClass = "mf-sub-select";
  const labelInjectedFlag = "mfSubLabelInjected";
  const memoSelectorPrimary = "td.memo.form-switch-td";
  const memoSelectorFallback = '[data-title="メモ"]';
  const labelCellClass = "mf-sub-label-cell";
  const labelHeadClass = "mf-sub-label-head";
  const satisfactionHeadClass = "mf-sat-head";
  const satisfactionCellClass = "mf-sat-cell";
  const SELECTORS = {
    transactionRow: "tr.transaction_list",
    tableHeadRow: "#cf-detail-table thead tr",
    tableBodyPrimary: "#cf-detail-table tbody.list_body",
    tableBodyFallback: "#cf-detail-table tbody",
    memoHeadPrimary: "th.memo",
    memoHeadFallback: 'th[data-title="メモ"]',
    categoryLarge: ".v_l_ctg",
    categoryMiddle: ".v_m_ctg",
  };
  // セッション内のフラグ操作を小さく包んで可読性を上げる。
  const getSessionFlag = (key) => sessionStorage.getItem(key);

  // devビルド/セッションフラグで詳細ログを出せるようにする。
  const isDev =
    getSessionFlag("mf_subs_debug") === "true" ||
    (globalThis.chrome?.runtime?.getManifest?.()?.version_name ?? "").includes(
      "dev"
    );
  const MANUAL_HIGHLIGHT_CLASS = "mf-sub-highlight-manual";
  const GEMINI_HIGHLIGHT_CLASS = "mf-sub-highlight-gemini";
  const DUPLICATE_CLASS = "mf-sub-duplicate";
  const CATEGORY_ALERT_ROW_CLASS = "mf-sub-category-alert-row";
  const CATEGORY_ALERT_CELL_CLASS = "mf-sub-category-alert-cell";
  const UI_PREFS_KEY = "mf_toolpack_ui_prefs";
  const DEFAULT_UI_PREFS = {
    maskingFeatureEnabled: true,
    maskingEnabled: true,
  };
  // 画面共有/スクショ対策として、内容/金額をCSSのblurでマスクする。
  const LARGE_CATEGORY_ORDER_VERSION = 1;
  const LARGE_CATEGORY_SORTING_KEY = "largeCategoryOrder";
  const LARGE_CATEGORY_SORTING_ENABLED_KEY = "largeCategoryOrderEnabled";
  const LARGE_CATEGORY_NAV_SELECTOR = "ul.nav";
  const LARGE_CATEGORY_ITEM_SELECTOR = "li.dropdown-submenu";
  const LARGE_CATEGORY_ANCHOR_SELECTOR = "a.dropdown-toggle[id]";
  const LARGE_CATEGORY_HANDLE_CLASS = "mf-lc-dnd-handle";
  const LARGE_CATEGORY_DRAGGING_CLASS = "mf-lc-dnd-dragging";
  const LARGE_CATEGORY_PLACEHOLDER_CLASS = "mf-lc-dnd-placeholder";
  const LARGE_CATEGORY_SORTABLE_FLAG = "mfLargeCategorySortable";
  const LARGE_CATEGORY_ITEM_CLASS = "mf-lc-dnd-item";
  const LARGE_CATEGORY_SORTING_ACTIVE_CLASS = "mf-lc-dnd-active";
  const LARGE_CATEGORY_EXCLUDED_IDS = new Set(["0"]);
  const CF_LARGE_CATEGORY_TRIGGER_SELECTOR =
    '.btn-group.btn_l_ctg a.v_l_ctg[data-toggle="dropdown"]';
  const CF_LARGE_CATEGORY_MENU_SELECTOR = "ul.dropdown-menu.main_menu.minus";
  const CF_LARGE_CATEGORY_ITEM_SELECTOR = "li.dropdown-submenu";
  const CF_LARGE_CATEGORY_ANCHOR_SELECTOR = "a.l_c_name[id]";
  const CF_LARGE_CATEGORY_SORTED_KEY = "mfLargeCategoryMenuSorted";
  const CF_LARGE_CATEGORY_MENU_PENDING_CLASS = "mf-lc-menu-pending";
  const MASKING_ROOT_CLASS = "mf-tp-mask-on";
  const MASKING_TARGET_CLASS = "mf-tp-mask-target";
  const MASKING_TOGGLE_ID = "mf-tp-mask-toggle";
  const SAVE_ERROR_TOAST_ID = "mf-tp-save-error";
  const SAVE_ERROR_TOAST_DURATION_MS = 4000;
  const SAVE_ERROR_THROTTLE_MS = 3000;
  const DEFAULT_THRESHOLD = 70;
  const DEFAULT_MODEL = "gemini-2.5-flash";
  const GEMINI_ERROR_MESSAGE_MAX_LENGTH = 64;
  const GEMINI_TRANSACTION_STRING_MAX_LENGTH = 200;
  const SYNC_THRESHOLD_BYTES = 90 * 1024;
  const SYNC_TOTAL_LIMIT_BYTES = 100 * 1024;
  const SETTINGS_UPDATED_AT_KEY = "updatedAt";
  const GEMINI_API_KEY_STORAGE_KEY = "geminiApiKey";
  // Gemini対象外とする固定ワードは業務要件ベースで明示的に除外する。
  const EXCLUDE_KEYWORDS = ["振替", "投資積立", "住宅ローン", "固定費"];
  // 設定値は頻繁に参照するためメモリにキャッシュする。
  let cachedSettings = null;
  let cachedSettingsPromise = null;
  let cachedUiPrefs = null;
  let cachedUiPrefsPromise = null;
  let saveErrorToastTimer = 0;
  let lastSaveErrorAt = 0;
  let geminiAnalysisState = {
    month: "",
    resultsByTxId: {},
  };
  let geminiRunState = {
    inFlight: false,
    rerunQueued: false,
  };
  let lastGeminiSettingsFingerprint = "";
  const nativeSortableRegistry = new WeakMap();
  const log = (...args) => {
    if (getSessionFlag("mf_subs_debug") === "true" || isDev) {
      // eslint-disable-next-line no-console
      console.log("[mf-sub]", ...args);
    }
  };
  const logError = (...args) => {
    // eslint-disable-next-line no-console
    console.warn("[mf-sub]", ...args);
  };

  // 保存失敗時は控えめな通知を表示し、ユーザーに気づけるようにする。
  const showSaveErrorToast = (message = "保存に失敗しました") => {
    const now = Date.now();
    if (now - lastSaveErrorAt < SAVE_ERROR_THROTTLE_MS) {
      return;
    }
    lastSaveErrorAt = now;
    const existing = document.getElementById(SAVE_ERROR_TOAST_ID);
    const toast = existing ?? document.createElement("div");
    toast.id = SAVE_ERROR_TOAST_ID;
    toast.className = "mf-tp-toast mf-tp-toast--error";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.textContent = message;
    if (!existing) {
      document.body.append(toast);
    }
    if (saveErrorToastTimer) {
      clearTimeout(saveErrorToastTimer);
    }
    saveErrorToastTimer = setTimeout(() => {
      toast.remove();
      saveErrorToastTimer = 0;
    }, SAVE_ERROR_TOAST_DURATION_MS);
  };

  // 店名は空白・絵文字を除去して比較用に正規化する。
  const normalizeStoreName = (raw) => {
    // 店名比較は表記揺れが多いので空白と絵文字を落として安定化する。
    if (!raw) {
      return "";
    }
    const trimmed = raw.trim();
    const collapsed = trimmed.replace(/\s+/g, " ");
    const cleaned = collapsed.replace(
      /[\p{Emoji_Presentation}\p{Emoji}\p{Extended_Pictographic}\p{Default_Ignorable_Code_Point}]/gu,
      ""
    );
    return cleaned;
  };

  // 保存キーは用途ごとにプレフィックスを付けて衝突を避ける。
  const buildTxKey = (id) => `tx:${id}`;
  const buildStoreAmountKey = (store, amount) =>
    `sa:${normalizeStoreName(store)}|${amount}`;
  const buildStoreDateKey = ({ store, amount, date }) => {
    // 日付まで含めるキーは満足度復元用（同額でも日付違いを分ける）。
    if (!(store && amount !== null && amount !== undefined && date)) {
      return "";
    }
    const normalizedStore = normalizeStoreName(store);
    if (!normalizedStore) {
      return "";
    }
    return `sd:${normalizedStore}|${amount}|${date}`;
  };
  // カテゴリ名は全角/半角や空白の揺れを吸収して比較する。
  const normalizeCategory = (text) => {
    if (!text) {
      return "";
    }
    const trimmed = text.trim();
    if (!trimmed) {
      return "";
    }
    const collapsed = trimmed.replace(/\s+/gu, " ");
    const nk = collapsed.normalize("NFKC");
    const withoutSpaces = nk.replace(/\s+/gu, "");
    return withoutSpaces;
  };
  // 大項目+中項目の組み合わせを比較キーにする。
  const buildCategoryRuleKey = ({ category, subcategory }) => {
    const large = normalizeCategory(category);
    const middle = normalizeCategory(subcategory);
    if (!(large && middle)) {
      return "";
    }
    return `${large}|${middle}`;
  };
  // ルールの検索効率を上げるため Set に変換して保持する。
  const buildCategoryRuleSets = (categoryRules = {}) => {
    // Set化しておくと行ごとの判定が O(1) で済む。
    const whitelist = new Set();
    const blacklist = new Set();
    const { whitelist: wl = [], blacklist: bl = [] } = categoryRules;
    for (const item of wl) {
      const key = buildCategoryRuleKey({
        category: item?.large,
        subcategory: item?.middle,
      });
      if (key) {
        whitelist.add(key);
      }
    }
    for (const item of bl) {
      const key = buildCategoryRuleKey({
        category: item?.large,
        subcategory: item?.middle,
      });
      if (key) {
        blacklist.add(key);
      }
    }
    return { whitelist, blacklist };
  };

  // ルール違反の有無と理由を返す（違反なしは null）。
  const evaluateCategoryRule = ({ category, subcategory }, sets) => {
    // whitelist がある場合は「含まれない」ことを違反とみなす。
    const key = buildCategoryRuleKey({ category, subcategory });
    if (!key) {
      return null;
    }
    const whitelistSize = sets?.whitelist?.size ?? 0;
    const hasWhitelist = whitelistSize > 0;
    const whitelistHit = sets?.whitelist?.has(key) ?? false;
    const blacklistHit = sets?.blacklist?.has(key) ?? false;

    if (hasWhitelist) {
      if (whitelistHit) {
        return null;
      }
      return { violation: "whitelist_miss", key };
    }

    if (blacklistHit) {
      return { violation: "blacklist_hit", key };
    }

    return null;
  };
  // 日付+店名+金額をキーに重複候補を検出する。
  const buildDuplicateKey = ({ date, store, amount }) => {
    if (!(date && store) || amount === null || amount === undefined) {
      return "";
    }
    const normalizedStore = normalizeStoreName(store);
    if (!normalizedStore) {
      return "";
    }
    return `dup:${date}|${normalizedStore}|${amount}`;
  };

  // 金額セルの文字列から数値を取り出す（絶対値で扱う）。
  const parseAmount = (text) => {
    // 画面上の表記は符号や区切りが揺れるため、最小限の正規化で数値化する。
    if (!text) {
      return null;
    }
    const match = text.match(AMOUNT_REGEX);
    if (!match) {
      return null;
    }
    const numeric = Number(match[0].replace(/,/g, "").replace("−", "-"));
    if (Number.isNaN(numeric)) {
      return null;
    }
    return Math.abs(numeric);
  };

  // テーブルのdata属性から取引日(YYYY-MM-DD)を抽出する。
  const parseDate = (row) => {
    // data-table-sortable-value は安定した日付表記なのでここを優先する。
    const sortable = row
      .querySelector("td.date")
      ?.getAttribute("data-table-sortable-value");
    if (!sortable) {
      return "";
    }
    // 先頭に含まれる日付文字列を抜き出して正規化する。
    const match = sortable.match(SORTABLE_DATE_REGEX);
    if (!match) {
      return "";
    }
    return match[0].replace(/\//g, "-");
  };

  // chrome.storage が無効な環境でも落ちないように安全に読む。
  const safeStorageGet = (area, keys, fallback) =>
    new Promise((resolve) => {
      // コンテキストによってはstorageが使えないため即座にフォールバックする。
      const store = chrome?.storage?.[area];
      if (!(chrome?.runtime?.id && store)) {
        resolve(fallback);
        return;
      }
      try {
        store.get(keys, (data) => resolve(data ?? fallback));
      } catch (_error) {
        resolve(fallback);
      }
    });

  // 失敗時もアプリ全体は継続させるため、結果のみ返して通知判断は呼び出し側に委ねる。
  const safeStorageSet = (area, payload) =>
    new Promise((resolve) => {
      // 書き込み失敗が致命的にならない用途向け。
      const store = chrome?.storage?.[area];
      if (!(chrome?.runtime?.id && store)) {
        resolve({ ok: false, reason: "unavailable" });
        return;
      }
      try {
        store.set(payload, () => {
          const error = chrome?.runtime?.lastError;
          if (error) {
            resolve({ ok: false, reason: "runtime_error", error });
            return;
          }
          resolve({ ok: true });
        });
      } catch (error) {
        resolve({ ok: false, reason: "exception", error });
      }
    });

  // settings保存では失敗を検知したいので例外を返す版を用意する。
  const setStorageWithError = (area, payload) =>
    new Promise((resolve, reject) => {
      const store = chrome?.storage?.[area];
      if (!(chrome?.runtime?.id && store)) {
        reject(new Error("chrome.storage is unavailable in this context"));
        return;
      }
      try {
        store.set(payload, () => {
          const error = chrome?.runtime?.lastError;
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });

  // sync保存の容量判定に使う。
  const getSyncBytesInUse = () =>
    new Promise((resolve, reject) => {
      const store = chrome?.storage?.sync;
      if (!(chrome?.runtime?.id && store?.getBytesInUse)) {
        resolve(0);
        return;
      }
      try {
        store.getBytesInUse(null, (bytes) => {
          const error = chrome?.runtime?.lastError;
          if (error) {
            reject(error);
            return;
          }
          resolve(bytes ?? 0);
        });
      } catch (error) {
        reject(error);
      }
    });

  // UI軽量設定はsync優先で読み、無ければlocalへフォールバックする。
  const loadUiPrefs = async () => {
    if (cachedUiPrefs) {
      return cachedUiPrefs;
    }
    if (cachedUiPrefsPromise) {
      return cachedUiPrefsPromise;
    }
    cachedUiPrefsPromise = (async () => {
      const syncRes = await safeStorageGet("sync", UI_PREFS_KEY, {
        [UI_PREFS_KEY]: DEFAULT_UI_PREFS,
      });
      const syncPrefs = syncRes?.[UI_PREFS_KEY];
      if (syncPrefs && typeof syncPrefs === "object") {
        return { ...DEFAULT_UI_PREFS, ...syncPrefs };
      }
      const localRes = await safeStorageGet("local", UI_PREFS_KEY, {
        [UI_PREFS_KEY]: DEFAULT_UI_PREFS,
      });
      const localPrefs = localRes?.[UI_PREFS_KEY];
      if (localPrefs && typeof localPrefs === "object") {
        return { ...DEFAULT_UI_PREFS, ...localPrefs };
      }
      return DEFAULT_UI_PREFS;
    })();
    try {
      cachedUiPrefs = await cachedUiPrefsPromise;
      return cachedUiPrefs;
    } finally {
      cachedUiPrefsPromise = null;
    }
  };

  // UI設定はパッチをマージして保存し、sync/local両方に書く。
  const saveUiPrefs = async (patch) => {
    // 将来キーが増えても破壊しないよう、既存値とマージして保存する
    const current = await loadUiPrefs();
    const next = { ...current, ...(patch ?? {}) };
    const payload = { [UI_PREFS_KEY]: next };
    // sync が使えない/失敗する環境でも継続できるよう、local にも同内容を保存する
    const syncResult = await safeStorageSet("sync", payload);
    const localResult = await safeStorageSet("local", payload);
    if (!(syncResult.ok || localResult.ok)) {
      showSaveErrorToast();
    }
    cachedUiPrefs = next;
  };

  // ラベル保存はlocalのみで扱う（軽量&確実）。
  const loadLabels = () =>
    safeStorageGet(
      "local",
      { labelsByTxId: {}, labelsByStoreAmount: {} },
      {
        labelsByTxId: {},
        labelsByStoreAmount: {},
      }
    );

  // 取引IDと店名+金額の両方へ同時に保存する。
  const saveLabel = async ({ txKey, storeAmountKey, label }) => {
    // ラベルは「取引ID」と「店名+金額」双方へ保存し、自動適用に使う。
    const { labelsByTxId, labelsByStoreAmount } = await loadLabels();
    if (label) {
      labelsByTxId[txKey] = label;
      labelsByStoreAmount[storeAmountKey] = label;
    } else {
      delete labelsByTxId[txKey];
      delete labelsByStoreAmount[storeAmountKey];
    }
    const result = await safeStorageSet("local", {
      labelsByTxId,
      labelsByStoreAmount,
    });
    if (!result.ok) {
      showSaveErrorToast();
    }
  };

  // 満足度は取引IDと店名+日付の2系統で保存する。
  const loadSatisfaction = () =>
    safeStorageGet(
      "local",
      { satisfactionByTxId: {}, satisfactionByStoreDate: {} },
      { satisfactionByTxId: {}, satisfactionByStoreDate: {} }
    );

  // 入力が空なら削除し、入力がある場合のみ保存する。
  const saveSatisfaction = async ({ txKey, sdKey, rank, note }) => {
    // 空の入力は保存しないことでストレージを肥大化させない。
    const maps = await loadSatisfaction();
    const trimmedNote = note?.trim?.() ?? "";
    const payload =
      Boolean(rank) || Boolean(trimmedNote)
        ? { rank: rank || null, note: trimmedNote }
        : null;
    const upsert = (map, key) => {
      if (!key) {
        return;
      }
      if (payload) {
        map[key] = payload;
      } else {
        delete map[key];
      }
    };
    upsert(maps.satisfactionByTxId, txKey);
    upsert(maps.satisfactionByStoreDate, sdKey);
    const result = await safeStorageSet("local", maps);
    if (!result.ok) {
      showSaveErrorToast();
    }
  };

  // DOMから取引に紐づく情報を取り出す小さなヘルパー群。
  const findTxId = (row) =>
    row.querySelector('input[name="user_asset_act[id]"]')?.value ?? "";

  const getIsIncome = (row) =>
    row.querySelector('input[name="user_asset_act[is_income]"]')?.value === "1";

  const getIsTarget = (row) =>
    row.querySelector('input[name="user_asset_act[is_target]"]')?.value === "1";

  const findStoreCell = (row) =>
    row.querySelector('td[data-title="内容"]') ??
    row.querySelector("td.content") ??
    row.cells?.[2];

  const findAmountCell = (row) =>
    row.querySelector('td[data-title*="金額"]') ??
    row.querySelector("td.number.amount") ??
    row.cells?.[3];

  const extractStore = (row) => {
    const cell = findStoreCell(row);
    return cell?.textContent?.trim() ?? "";
  };

  const extractAmount = (row) => {
    const cell = findAmountCell(row);
    const text =
      cell?.querySelector(".offset")?.textContent ?? cell?.textContent ?? "";
    return parseAmount(text);
  };

  const getTransactionRows = () =>
    document.querySelectorAll(SELECTORS.transactionRow);

  // マスク対象の付け外しをまとめて扱う。
  const addMaskClass = (element) =>
    element?.classList?.add?.(MASKING_TARGET_CLASS);

  const addMaskToAll = (elements) => {
    // NodeListはfor...ofが安全なので統一する。
    for (const el of elements) {
      addMaskClass(el);
    }
  };

  const removeMaskClass = (element) =>
    element?.classList?.remove?.(MASKING_TARGET_CLASS);

  const removeMaskFromAll = (elements) => {
    for (const el of elements) {
      removeMaskClass(el);
    }
  };

  // マスク状態は設定読み込み後に上書きされる。
  let maskingFeatureEnabled = DEFAULT_UI_PREFS.maskingFeatureEnabled;
  let maskingEnabled = DEFAULT_UI_PREFS.maskingEnabled;
  let maskingPrefsLoaded = false;
  let maskingPrefsLoading = false;

  const clearMaskTargets = () => {
    const current = document.querySelectorAll(`.${MASKING_TARGET_CLASS}`);
    removeMaskFromAll(current);
  };

  // 金額が表示される画面を幅広くカバーするためのルール集。
  const MASK_RULES = [
    // `/cf` 家計簿 / `/cf/summary` 上部の月次収支テーブル
    {
      mode: "indexed",
      selector: "#monthly_total_table_kakeibo tbody tr.js-monthly_total td",
      indexes: [0, 2, 4],
    },
    {
      mode: "indexed",
      selector: "#monthly_total_table tbody tr.js-monthly_total td",
      indexes: [0, 2, 4],
    },
    // `/cf` カレンダー・`/cf/summary` 内訳・`/cf/monthly` 内訳・`/spending_targets/edit` 先月実績
    // `/analysis/monthly_reports` サマリ・`/` ホーム各種・`/accounts` 一覧などの金額表示
    {
      mode: "all",
      selectors: [
        "#calendar .fc-event-title .plus-color, #calendar .fc-event-title .minus-color",
        "#table-outgo tbody tr td:nth-child(2)",
        "#monthly-detail-content #monthly_list td.number",
        "table.table-bordered td.last_month",
        ".monthly-report-sum-head-block-item.amount, .monthly-report-sum-balance-item-amount",
        ".accounts-list .amount .number",
        "#monthly_total_table_home tr.js-monthly_total td",
        "#cf-latest .recent-transactions-amount",
        ".total-assets .heading-radius-box, p.number.heading-radius-box",
        ".total-assets .fluctuation-list tbody tr td:nth-child(3)",
        ".total-assets .breakdown-list tbody tr td:nth-child(2)",
        ".total-assets .highcharts-data-labels text, .total-assets .highcharts-axis-labels text, .total-assets .highcharts-tooltip text",
        ".highcharts-yaxis-labels text",
      ],
    },
    // `/cf/summary` 支出セクションの合計、`/` ホーム上部合計
    {
      mode: "first",
      selectors: ["#cache-flow .heading-radius-box", ".heading-radius-box"],
    },
    // `/analysis/monthly_reports` 収入/支出内訳・資産推移、`/bs` バランスシート関連（円表記のみ）
    {
      mode: "yen",
      selectors: [
        ".monthly-report-detail-table-cell.right",
        ".monthly-report-graph-container .highcharts-axis-labels text, .monthly-report-graph-container .highcharts-tooltip text",
        'section[id^="portfolio_det_"] h1.heading-small',
        'section[id^="portfolio_det_"] td.number',
        ".balance-sheet .heading-radius-box-asset, .balance-sheet .heading-radius-box-liability, .balance-sheet .heading-radius-box-net",
        ".balance-sheet .total-assets .heading-radius-box",
        ".balance-sheet table.table-bordered tbody td",
      ],
    },
  ];

  const applyIndexedMaskRule = (rule) => {
    // 固定位置だけをマスクしたいケース用。
    const cells = document.querySelectorAll(rule.selector);
    for (const idx of rule.indexes ?? []) {
      addMaskClass(cells[idx]);
    }
  };

  const applyFirstMaskRule = (rule) => {
    for (const selector of rule.selectors ?? []) {
      addMaskClass(document.querySelector(selector));
    }
  };

  const applyYenMaskRule = (rule) => {
    // 円表記だけを拾うことで過剰なマスクを避ける。
    for (const selector of rule.selectors ?? []) {
      const targets = document.querySelectorAll(selector);
      for (const target of targets) {
        maskIfContainsYen(target);
      }
    }
  };

  const applyAllMaskRule = (rule) => {
    // セレクタ一致要素をまとめてマスク対象にする。
    for (const selector of rule.selectors ?? []) {
      addMaskToAll(document.querySelectorAll(selector));
    }
  };

  // ルール定義に応じてDOMを走査し、マスク対象を付与する。
  const applyMaskRules = () => {
    for (const rule of MASK_RULES) {
      if (rule.mode === "indexed") {
        applyIndexedMaskRule(rule);
      } else if (rule.mode === "first") {
        applyFirstMaskRule(rule);
      } else if (rule.mode === "yen") {
        applyYenMaskRule(rule);
      } else {
        applyAllMaskRule(rule);
      }
    }
  };

  // 家計簿明細の「内容」「金額」セルを優先的にマスク対象にする。
  const markTransactionTableTargets = () => {
    // 明細テーブル: 「内容」「金額（円）」セルをマスク対象にする
    const rows = getTransactionRows();
    for (const row of rows) {
      const storeCell = findStoreCell(row);
      const amountCell = findAmountCell(row);
      addMaskClass(storeCell);
      addMaskClass(amountCell);
    }
  };

  const applyBalanceSheetPortfolioMask = () => {
    // 先月実績などの別列を避け、資産金額だけに限定する。
    // `/bs` 資産構成: 「先月実績」ではなく資産金額（2列目）だけをマスク対象にする
    const portfolioLinks = document.querySelectorAll(
      'table.table-bordered tbody tr th a[href^="/bs/portfolio#"]'
    );
    for (const link of portfolioLinks) {
      const row = link.closest("tr");
      const amountCell = row?.querySelector("td:nth-child(2)");
      addMaskClass(amountCell);
    }
  };

  const maskIfContainsYen = (element) => {
    // 通貨表記の有無で判定し、誤マスクを抑える。
    if (!element) {
      return;
    }
    const text = element.textContent ?? "";
    if (text.includes("円") || text.includes("¥") || text.includes("￥")) {
      addMaskClass(element);
    }
  };

  // markBalanceSheetDetailTargets はルール化により不要

  const applyBalanceSheetHistoryMask = () => {
    // 履歴テーブルだけを対象にして無関係な表を避ける。
    // `/bs` 資産推移: 金額（円）が入るセルだけをマスク対象にする
    const historyTables = document.querySelectorAll("table.table-bordered");
    for (const table of historyTables) {
      const rows = table.querySelectorAll("tbody tr");
      if (rows.length === 0) {
        continue;
      }
      const hasHistoryLink = table.querySelector(
        'a[href^="/bs/history/list/"]'
      );
      if (!hasHistoryLink) {
        continue;
      }
      const amountCells = table.querySelectorAll("tbody tr td");
      for (const cell of amountCells) {
        maskIfContainsYen(cell);
      }
    }
  };

  const applyBalanceSheetLiabilityMask = () => {
    // 負債関連は画面構造が複数あるため個別に処理する。
    // `/bs` 負債構成: 金額（円）が入るセルだけをマスク対象にする
    const liabilityRoot = document.querySelector("#bs-liability");
    if (liabilityRoot) {
      const summaryTotal = liabilityRoot.querySelector(".heading-radius-box");
      maskIfContainsYen(summaryTotal);

      const summaryAmountCells = liabilityRoot.querySelectorAll(
        "table.table-bordered tbody tr td:nth-child(2)"
      );
      for (const cell of summaryAmountCells) {
        maskIfContainsYen(cell);
      }
    }

    // `/bs/liability` 負債詳細: 残高（円）のセルだけをマスク対象にする
    const liabilityDetailCells = document.querySelectorAll(
      "#liability_det table.table-det tbody td.number"
    );
    for (const cell of liabilityDetailCells) {
      maskIfContainsYen(cell);
    }
  };

  const applyAccountsAssetMask = () => {
    // 列位置で特定して、同じクラス名の他列を誤マスクしない。
    // `/accounts` 資産一覧: 「資産」列のみをマスク対象にする
    // NOTE: `.number` クラスが他列にも使われる可能性があるため、列位置で特定する
    const accountsTable = document.querySelector("#account-table");
    const assetHeader = accountsTable?.querySelector("th.asset");
    const headerRow = assetHeader?.closest("tr");
    const assetIndex = headerRow
      ? Array.from(headerRow.children).indexOf(assetHeader)
      : -1;
    if (accountsTable && assetIndex >= 0) {
      const accountRows = accountsTable.querySelectorAll("tbody tr");
      for (const row of accountRows) {
        const cells = row.querySelectorAll("td");
        addMaskClass(cells[assetIndex]);
      }
    }
  };

  // 通常ルールで拾えないページは個別対応する。
  const applyMaskSpecialCases = () => {
    applyBalanceSheetPortfolioMask();
    applyBalanceSheetHistoryMask();
    applyBalanceSheetLiabilityMask();
    applyAccountsAssetMask();
  };

  // 既存マスクをクリアした上で全対象を再マーキングする。
  const markMaskTargets = () => {
    clearMaskTargets();
    markTransactionTableTargets();
    applyMaskRules();
    applyMaskSpecialCases();
  };

  // マスク切り替えボタンの見た目とアクセシビリティを更新する。
  const updateMaskToggleUi = () => {
    const button = document.getElementById(MASKING_TOGGLE_ID);
    if (!button) {
      return;
    }
    button.setAttribute("aria-pressed", maskingEnabled ? "true" : "false");
    button.textContent = maskingEnabled ? "マスク: ON" : "マスク: OFF";
    button.title = "内容/金額（円）をぼかして表示します（クリックで切替）";
  };

  // ルートclassでCSSを切り替えつつ、対象セルを再スキャンする。
  const applyMasking = () => {
    document.documentElement.classList.toggle(
      MASKING_ROOT_CLASS,
      maskingEnabled
    );
    markMaskTargets();
    updateMaskToggleUi();
  };

  // 機能自体が無効のときはUIもマスクも完全に取り除く。
  const disableMaskingFeature = () => {
    // 機能OFF時はボタンを出さず、画面を必ず非マスク状態に戻す（スクショ対策機能そのものを停止）
    const button = document.getElementById(MASKING_TOGGLE_ID);
    button?.remove();
    document.documentElement.classList.remove(MASKING_ROOT_CLASS);

    const currentTargets = document.querySelectorAll(
      `.${MASKING_TARGET_CLASS}`
    );
    removeMaskFromAll(currentTargets);
  };

  // ボタンは重複生成しないようにガードする。
  const ensureMaskToggleButton = () => {
    // ページに一つだけボタンを置き、重複追加を防ぐ。
    if (!maskingFeatureEnabled) {
      return;
    }
    if (document.getElementById(MASKING_TOGGLE_ID)) {
      return;
    }
    if (!document.body) {
      return;
    }
    const button = document.createElement("button");
    button.id = MASKING_TOGGLE_ID;
    button.type = "button";
    button.className = "mf-tp-mask-toggle";
    button.setAttribute("aria-label", "画面マスク切り替え");
    button.addEventListener("click", async () => {
      maskingEnabled = !maskingEnabled;
      applyMasking();
      // ユーザー操作の結果を永続化（再訪でもON/OFFを維持）
      await saveUiPrefs({ maskingEnabled });
    });
    document.body.append(button);
    updateMaskToggleUi();
  };

  // 設定読込→ボタン生成→マスク適用の順で初期化する。
  const initializeMasking = async () => {
    if (maskingPrefsLoaded || maskingPrefsLoading) {
      return;
    }
    maskingPrefsLoading = true;
    const prefs = await loadUiPrefs();
    maskingFeatureEnabled = Boolean(
      prefs?.maskingFeatureEnabled ?? DEFAULT_UI_PREFS.maskingFeatureEnabled
    );
    maskingEnabled = Boolean(
      prefs?.maskingEnabled ?? DEFAULT_UI_PREFS.maskingEnabled
    );

    maskingPrefsLoaded = true;
    maskingPrefsLoading = false;

    if (!maskingFeatureEnabled) {
      disableMaskingFeature();
      return;
    }
    ensureMaskToggleButton();
    applyMasking();
  };

  // 支出判定はマイナス記号の有無で行う（表示表現に合わせる）。
  const isNegativeAmount = (row) => {
    const cell = findAmountCell(row);
    const text =
      cell?.querySelector(".offset")?.textContent ?? cell?.textContent ?? "";
    const trimmed = text?.trim() ?? "";
    return NEGATIVE_HEAD_REGEX.test(trimmed);
  };

  const getMemoCell = (row) =>
    row.querySelector(memoSelectorPrimary) ??
    row.querySelector(memoSelectorFallback);

  const getHeadRow = () => document.querySelector(SELECTORS.tableHeadRow);

  // ヘッダーセルは共通処理で生成し、挿入位置は後で指定する。
  const createHeadCell = (text, className) => {
    const th = document.createElement("th");
    if (className) {
      th.className = className;
    }
    th.textContent = text;
    return th;
  };

  const insertAfterNode = (referenceNode, newNode) => {
    if (!referenceNode?.parentElement) {
      return false;
    }
    referenceNode.parentElement.insertBefore(
      newNode,
      referenceNode.nextSibling
    );
    return true;
  };

  // すでに存在する場合は挿入しないようガードする。
  const ensureHeaderCells = ({
    headRow,
    existingSelector,
    markerKey,
    cells,
    getInsertAfterNode,
  }) => {
    if (!headRow) {
      return;
    }
    if (existingSelector && headRow.querySelector(existingSelector)) {
      return;
    }
    if (markerKey && headRow.dataset[markerKey] === "1") {
      return;
    }

    const nodes = cells.map(({ text, className }) =>
      createHeadCell(text, className)
    );
    const insertAfter = getInsertAfterNode?.(headRow);
    if (insertAfter) {
      let current = insertAfter;
      for (const node of nodes) {
        insertAfterNode(current, node);
        current = node;
      }
    } else {
      headRow.append(...nodes);
    }

    if (markerKey) {
      headRow.dataset[markerKey] = "1";
    }
  };

  // サブスク列のヘッダーをメモ列の直後に挿入する。
  const ensureLabelHeader = () => {
    const headRow = getHeadRow();
    ensureHeaderCells({
      headRow,
      existingSelector: `.${labelHeadClass}`,
      cells: [{ text: "サブスク", className: labelHeadClass }],
      getInsertAfterNode: (row) =>
        row.querySelector(SELECTORS.memoHeadPrimary) ??
        row.querySelector(SELECTORS.memoHeadFallback),
    });
  };

  // 既存セルがあれば再利用し、無ければメモ列の直後に生成する。
  const getOrCreateLabelCell = (row) => {
    const memoCell = getMemoCell(row);
    if (!memoCell) {
      return null;
    }
    const next = memoCell.nextElementSibling;
    if (next?.classList?.contains(labelCellClass)) {
      return next;
    }
    const td = document.createElement("td");
    td.className = labelCellClass;
    memoCell.parentElement.insertBefore(td, memoCell.nextSibling);
    return td;
  };

  // 機能OFF時は追加UIをすべて取り除く。
  const removeLabelUi = () => {
    const head = document.querySelector(`th.${labelHeadClass}`);
    head?.remove();
    const rows = getTransactionRows();
    for (const row of rows) {
      const cell = row.querySelector(`td.${labelCellClass}`);
      cell?.remove();
      row.dataset[labelInjectedFlag] = "";
      row.classList.remove(MANUAL_HIGHLIGHT_CLASS);
    }
  };

  // ラベル変更時はハイライトも同期させる。
  const setSelectValue = (row, label) => {
    const select = row.querySelector(`select.${selectClass}`);
    if (!select) {
      return;
    }
    select.value = label ?? "";
    if (label) {
      row.classList.add(MANUAL_HIGHLIGHT_CLASS);
    } else {
      row.classList.remove(MANUAL_HIGHLIGHT_CLASS);
    }
  };

  // select要素を挿入し、クリックイベントの伝播を止めて元の行操作と干渉しないようにする。
  const injectSelect = (row, onChange) => {
    // 行クリック等の既存イベントと干渉しないよう伝播を抑制する。
    const labelCell = getOrCreateLabelCell(row);
    if (!labelCell) {
      return;
    }
    if (
      labelCell.dataset[labelInjectedFlag] === "1" &&
      labelCell.querySelector(`.${selectClass}`)
    ) {
      return;
    }

    const stop = (event) => {
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };

    const select = document.createElement("select");
    select.className = selectClass;
    select.setAttribute("aria-label", "サブスク利用状態");

    for (const { value, text } of LABELS) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    }

    select.addEventListener("change", () => onChange(select.value, row));
    for (const type of ["click", "mousedown", "mouseup", "touchstart"]) {
      select.addEventListener(type, stop);
    }

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.gap = "6px";
    wrapper.style.alignItems = "center";

    wrapper.append(select);
    wrapper.addEventListener("click", stop);
    labelCell.append(wrapper);
    labelCell.dataset[labelInjectedFlag] = "1";
  };

  // 満足度列は2列セットで追加する。
  const ensureSatisfactionHeader = () => {
    const headRow = getHeadRow();
    ensureHeaderCells({
      headRow,
      markerKey: "mfSatHead",
      cells: [
        { text: "満足度", className: satisfactionHeadClass },
        { text: "満足度メモ", className: satisfactionHeadClass },
      ],
    });
  };

  // 既存の満足度UIを丸ごと削除する。
  const removeSatisfactionUi = () => {
    const headRow = getHeadRow();
    if (headRow && headRow.dataset.mfSatHead === "1") {
      headRow.dataset.mfSatHead = "";
      const heads = headRow.querySelectorAll(`.${satisfactionHeadClass}`);
      for (const th of heads) {
        th.remove();
      }
    }
    const rows = getTransactionRows();
    for (const row of rows) {
      if (row.dataset.mfSatInjected === "1") {
        row.dataset.mfSatInjected = "";
        const cells = row.querySelectorAll(`.${satisfactionCellClass}`);
        for (const cell of cells) {
          cell.remove();
        }
      }
    }
  };

  // 満足度のセレクト/メモ入力を行末に追加する。
  const injectSatisfactionCells = (row, satisfactionMaps, onChange) => {
    // 同じ行に二重で挿入しないようフラグでガードする。
    if (row.dataset.mfSatInjected === "1") {
      return;
    }
    const txId = findTxId(row);
    const amount = extractAmount(row);
    const store = extractStore(row);
    const date = parseDate(row);
    const sdKey = buildStoreDateKey({ store, amount, date });
    const txKey = txId ? buildTxKey(txId) : "";
    const saved =
      satisfactionMaps?.satisfactionByTxId?.[txKey] ??
      (sdKey ? satisfactionMaps?.satisfactionByStoreDate?.[sdKey] : {}) ??
      {};

    const stop = (event) => {
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };

    const tdRank = document.createElement("td");
    tdRank.className = satisfactionCellClass;
    const select = document.createElement("select");
    select.className = "mf-sat-select";
    select.setAttribute("aria-label", "満足度");
    for (const opt of SATISFACTION_OPTIONS) {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.text;
      select.append(option);
    }
    select.value = saved.rank ?? "";
    select.addEventListener("change", () =>
      onChange({ txKey, sdKey, select, input: null })
    );
    select.addEventListener("click", stop);
    select.addEventListener("mousedown", stop);
    select.addEventListener("mouseup", stop);
    select.addEventListener("touchstart", stop);
    tdRank.append(select);

    const tdNote = document.createElement("td");
    tdNote.className = satisfactionCellClass;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "mf-sat-note";
    input.maxLength = 120;
    input.setAttribute("aria-label", "満足度メモ");
    input.value = saved.note ?? "";
    const handleInput = () => onChange({ txKey, sdKey, select, input });
    input.addEventListener("change", handleInput);
    input.addEventListener("blur", handleInput);
    input.addEventListener("click", stop);
    input.addEventListener("mousedown", stop);
    input.addEventListener("mouseup", stop);
    input.addEventListener("touchstart", stop);
    tdNote.append(input);

    row.append(tdRank, tdNote);
    row.dataset.mfSatInjected = "1";
  };

  // サブスクラベル列の生成と初期値の反映を行う。
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 初期化処理を一括で行うため許容
  const init = async () => {
    // 機能OFF時はUIを即撤去して余計なDOM操作を避ける。
    const settings = await loadSettings();
    const labelEnabled =
      settings?.featureFlags?.subscriptionLabelEnabled ?? true;
    if (!labelEnabled) {
      removeLabelUi();
      return;
    }
    ensureLabelHeader();
    const rows = getTransactionRows();
    let missingMemo = 0;
    const { labelsByTxId, labelsByStoreAmount } = await loadLabels();

    const handleChange = async (newLabel, row) => {
      const txId = findTxId(row);
      const amount = extractAmount(row);
      const store = extractStore(row);
      if (!txId || amount === null || amount === undefined) {
        return;
      }
      const txKey = buildTxKey(txId);
      const saKey = buildStoreAmountKey(store, amount);
      await saveLabel({ txKey, storeAmountKey: saKey, label: newLabel });
      setSelectValue(row, newLabel);
    };

    for (const row of rows) {
      // メモ列がない行はスキップして処理を継続する。
      const memoCell = getMemoCell(row);
      if (!memoCell) {
        missingMemo += 1;
        continue;
      }
      injectSelect(row, handleChange);

      const txId = findTxId(row);
      const amount = extractAmount(row);
      const store = extractStore(row);
      const txKey = txId ? buildTxKey(txId) : "";
      const saKey =
        store && amount !== null && amount !== undefined
          ? buildStoreAmountKey(store, amount)
          : null;
      const label =
        labelsByTxId[txKey] ?? (saKey ? labelsByStoreAmount[saKey] : "");
      if (label) {
        setSelectValue(row, label);
      }
    }

    if (missingMemo > 0) {
      log("memo cell not found", { missingMemo });
    }
  };

  // 満足度UIの初期化と保存値の反映。
  const runSatisfaction = async () => {
    // 機能OFF時はUI撤去のみで早期リターンする。
    const settings = await loadSettings();
    const enabled = settings?.featureFlags?.satisfactionEnabled ?? true;
    if (!enabled) {
      removeSatisfactionUi();
      return;
    }
    ensureSatisfactionHeader();
    const { satisfactionByTxId, satisfactionByStoreDate } =
      await loadSatisfaction();
    const rows = getTransactionRows();
    const handleChange = async ({ txKey, sdKey, select, input }) => {
      const rank = select?.value ?? "";
      const note = input?.value ?? "";
      if (!(txKey || sdKey)) {
        return;
      }
      await saveSatisfaction({ txKey, sdKey, rank, note });
    };
    for (const row of rows) {
      // 保存済みデータを読み出しながらUIを挿入する。
      injectSatisfactionCells(
        row,
        { satisfactionByTxId, satisfactionByStoreDate },
        handleChange
      );
    }
  };

  // DOM更新が多いので requestAnimationFrame でまとめて初期化する。
  const scheduleInit = (() => {
    // DOM更新が連続するため、フレーム単位でまとめて処理する。
    let pending = false;
    return () => {
      if (pending) {
        return;
      }
      pending = true;
      requestAnimationFrame(async () => {
        try {
          await initializeMasking();
          await init();
          if (maskingPrefsLoaded && maskingFeatureEnabled) {
            // 月移動やフィルタでDOMが差し替わっても、マスク対象を再マーキングする
            ensureMaskToggleButton();
            applyMasking();
          }
        } finally {
          pending = false;
        }
      });
    };
  })();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleInit);
  } else {
    scheduleInit();
  }

  // 明細テーブルのDOM更新を監視して再描画タイミングに追随する。
  const listBody =
    document.querySelector(SELECTORS.tableBodyPrimary) ??
    document.querySelector(SELECTORS.tableBodyFallback) ??
    document.body;
  const observer = new MutationObserver(scheduleInit);
  observer.observe(listBody, { childList: true, subtree: true });

  // Gemini 解析
  // 保存時刻は number / ISO 文字列の両方を受け付ける。
  const parseSettingsUpdatedAt = (settings) => {
    const raw = settings?.[SETTINGS_UPDATED_AT_KEY];
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return raw;
    }
    if (typeof raw === "string" && raw.trim()) {
      const parsed = Date.parse(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return 0;
  };

  // sync/local の両方に設定がある場合は新しい方を採用する。
  const pickLatestCachedSettings = ({ syncSettings, localSettings }) => {
    if (syncSettings && !localSettings) {
      return syncSettings;
    }
    if (localSettings && !syncSettings) {
      return localSettings;
    }
    if (!(syncSettings && localSettings)) {
      return null;
    }

    const syncUpdatedAt = parseSettingsUpdatedAt(syncSettings);
    const localUpdatedAt = parseSettingsUpdatedAt(localSettings);
    if (syncUpdatedAt !== localUpdatedAt) {
      return localUpdatedAt > syncUpdatedAt ? localSettings : syncSettings;
    }
    // タイムスタンプ同値（旧形式含む）は local を優先する。
    return localSettings;
  };

  // 設定は頻繁に読むためキャッシュし、同時実行を抑制する。
  const loadSettings = async () => {
    // 連続読み込みはPromiseを共有し、二重取得を避ける。
    if (cachedSettings) {
      return cachedSettings;
    }
    if (cachedSettingsPromise) {
      return cachedSettingsPromise;
    }
    cachedSettingsPromise = (async () => {
      const [syncRes, localRes] = await Promise.all([
        safeStorageGet("sync", "settings", {}),
        safeStorageGet("local", "settings", {}),
      ]);
      const merged = pickLatestCachedSettings({
        syncSettings: syncRes?.settings ?? null,
        localSettings: localRes?.settings ?? null,
      });
      return merged ?? { featureFlags: {}, geminiApiKeyConfigured: false };
    })();
    try {
      cachedSettings = await cachedSettingsPromise;
      return cachedSettings;
    } finally {
      cachedSettingsPromise = null;
    }
  };

  // options画面と同じ保存先判定（sync容量チェック）で設定を保存する。
  // options画面と同じ容量判定ロジックで保存先を決める。
  const saveSettingsWithFallback = async (nextSettings) => {
    const localApiKeyResult = await safeStorageGet(
      "local",
      GEMINI_API_KEY_STORAGE_KEY,
      {}
    );
    const geminiApiKey =
      typeof nextSettings?.geminiApiKey === "string"
        ? nextSettings.geminiApiKey
        : (localApiKeyResult?.[GEMINI_API_KEY_STORAGE_KEY] ?? "");
    await setStorageWithError("local", {
      [GEMINI_API_KEY_STORAGE_KEY]: geminiApiKey,
    });

    const withUpdatedAt = {
      ...nextSettings,
      geminiApiKeyConfigured:
        typeof nextSettings?.geminiApiKeyConfigured === "boolean"
          ? nextSettings.geminiApiKeyConfigured
          : geminiApiKey.length > 0,
      // APIキーはlocal専用に保存し、syncへは載せない。
      geminiApiKey: "",
      [SETTINGS_UPDATED_AT_KEY]: Date.now(),
    };
    // sync容量が厳しい場合はlocalに逃がして保存失敗を防ぐ。
    const bytes = await getSyncBytesInUse().catch(() => SYNC_TOTAL_LIMIT_BYTES);
    if (bytes >= SYNC_THRESHOLD_BYTES) {
      await setStorageWithError("local", { settings: withUpdatedAt });
      return { area: "local", reason: "sync_threshold" };
    }
    try {
      await setStorageWithError("sync", { settings: withUpdatedAt });
      return { area: "sync" };
    } catch (error) {
      await setStorageWithError("local", { settings: withUpdatedAt });
      return { area: "local", reason: "sync_error", error };
    }
  };

  // ページ種別によって有効な機能が異なるため、判定をまとめる。
  const isProfileRulePage = () => location.pathname === "/profile/rule";
  const isCfPage = () => location.pathname.startsWith("/cf");

  // カテゴリ並び替えはDOM構造が変わっても動くように抽象化する。
  const getLargeCategoryItems = (nav) =>
    Array.from(nav?.children ?? []).filter((child) =>
      child?.matches?.(LARGE_CATEGORY_ITEM_SELECTOR)
    );

  const getLargeCategoryIds = (nav) => {
    const ids = [];
    for (const item of getLargeCategoryItems(nav)) {
      const id = item
        .querySelector(LARGE_CATEGORY_ANCHOR_SELECTOR)
        ?.getAttribute("id")
        ?.trim();
      if (id && !LARGE_CATEGORY_EXCLUDED_IDS.has(id)) {
        ids.push(id);
      }
    }
    return ids;
  };

  // 保存済みの並びと現在のDOM差分を突き合わせて正規化する。
  const normalizeLargeCategoryOrder = (currentIds, savedOrder = []) => {
    // 保存済みの順序に存在しないIDは落として今のDOMに合わせる。
    const currentSet = new Set(currentIds);
    const seen = new Set();
    const normalized = [];
    for (const id of savedOrder) {
      if (!currentSet.has(id) || seen.has(id)) {
        continue;
      }
      seen.add(id);
      normalized.push(id);
    }
    for (const id of currentIds) {
      if (!seen.has(id)) {
        seen.add(id);
        normalized.push(id);
      }
    }
    return normalized;
  };

  const isSameOrder = (left, right) => {
    if (left.length !== right.length) {
      return false;
    }
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) {
        return false;
      }
    }
    return true;
  };

  // DOMを入れ替えて見た目の順序を更新する。
  const applyLargeCategoryOrder = (nav, orderedIds) => {
    // DocumentFragmentで再配置し、余計な再描画を抑える。
    const orderSet = new Set(orderedIds);
    const items = getLargeCategoryItems(nav);
    const byId = new Map();
    const rest = [];
    for (const item of items) {
      const id = item
        .querySelector(LARGE_CATEGORY_ANCHOR_SELECTOR)
        ?.getAttribute("id")
        ?.trim();
      if (id && orderSet.has(id)) {
        byId.set(id, item);
      } else {
        rest.push(item);
      }
    }
    const fragment = document.createDocumentFragment();
    for (const id of orderedIds) {
      const item = byId.get(id);
      if (item) {
        fragment.appendChild(item);
      }
    }
    for (const item of rest) {
      fragment.appendChild(item);
    }
    nav.appendChild(fragment);
  };

  // 並び替え操作用のハンドルを追加する。
  const ensureLargeCategoryHandles = (nav, _enableNativeDrag) => {
    for (const item of getLargeCategoryItems(nav)) {
      if (item.querySelector(`.${LARGE_CATEGORY_HANDLE_CLASS}`)) {
        continue;
      }
      item.classList.add(LARGE_CATEGORY_ITEM_CLASS);
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = LARGE_CATEGORY_HANDLE_CLASS;
      handle.textContent = "≡";
      handle.setAttribute("aria-label", "並び替えハンドル");
      handle.setAttribute("title", "ドラッグして並び替え");
      handle.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      const anchor = item.querySelector(LARGE_CATEGORY_ANCHOR_SELECTOR);
      if (anchor?.parentNode) {
        anchor.parentNode.insertBefore(handle, anchor);
      } else {
        item.insertBefore(handle, item.firstChild);
      }
    }
  };

  const removeLargeCategoryHandles = (nav) => {
    const handles = nav.querySelectorAll(`.${LARGE_CATEGORY_HANDLE_CLASS}`);
    for (const handle of handles) {
      handle.remove();
    }
    const items = nav.querySelectorAll(`.${LARGE_CATEGORY_ITEM_CLASS}`);
    for (const item of items) {
      item.classList.remove(LARGE_CATEGORY_ITEM_CLASS);
    }
  };

  // UIで確定した並び順を設定に保存する。
  const persistLargeCategoryOrderFromNav = async (nav) => {
    const order = getLargeCategoryIds(nav);
    if (!order.length) {
      return { order: [] };
    }
    try {
      const settings = await loadSettings();
      const nextSettings = {
        ...settings,
        [LARGE_CATEGORY_SORTING_KEY]: {
          version: LARGE_CATEGORY_ORDER_VERSION,
          updatedAt: new Date().toISOString(),
          order,
        },
      };
      await saveSettingsWithFallback(nextSettings);
      cachedSettings = nextSettings;
    } catch (error) {
      log("large category order save failed", error);
    }
    return { order };
  };

  // 既存の jQuery UI を使える場合はそれを優先し、無ければネイティブ D&D に切り替える。
  // jQuery UIが使える環境では既存機能を活用する。
  const enableJquerySortable = (nav) => {
    const $ = globalThis.jQuery;
    if (typeof $?.fn?.sortable !== "function") {
      return false;
    }
    if (nav.dataset[LARGE_CATEGORY_SORTABLE_FLAG] === "jquery") {
      try {
        $(nav).sortable("enable");
      } catch (_error) {
        // ignore
      }
      return true;
    }
    nav.dataset[LARGE_CATEGORY_SORTABLE_FLAG] = "jquery";
    $(nav).sortable({
      items: `> ${LARGE_CATEGORY_ITEM_SELECTOR}`,
      handle: `.${LARGE_CATEGORY_HANDLE_CLASS}`,
      placeholder: LARGE_CATEGORY_PLACEHOLDER_CLASS,
      axis: "y",
      tolerance: "pointer",
      start: (_event, ui) => {
        nav.classList.add(LARGE_CATEGORY_SORTING_ACTIVE_CLASS);
        ui.item?.addClass?.(LARGE_CATEGORY_DRAGGING_CLASS);
      },
      stop: async (_event, ui) => {
        ui.item?.removeClass?.(LARGE_CATEGORY_DRAGGING_CLASS);
        nav.classList.remove(LARGE_CATEGORY_SORTING_ACTIVE_CLASS);
        await persistLargeCategoryOrderFromNav(nav);
      },
    });
    return true;
  };

  // jQueryが無い環境向けの最低限のドラッグ&ドロップ。
  const enableNativeSortable = (nav) => {
    // PointerEventsで最低限のD&D体験を提供する。
    if (
      nav.dataset[LARGE_CATEGORY_SORTABLE_FLAG] === "native" &&
      nativeSortableRegistry.has(nav)
    ) {
      return;
    }
    nav.dataset[LARGE_CATEGORY_SORTABLE_FLAG] = "native";
    let draggingItem = null;
    let pointerId = null;

    const cleanupDragging = () => {
      if (!draggingItem) {
        return;
      }
      draggingItem.classList.remove(LARGE_CATEGORY_DRAGGING_CLASS);
      nav.classList.remove(LARGE_CATEGORY_SORTING_ACTIVE_CLASS);
      draggingItem = null;
      pointerId = null;
    };

    const stopDragging = async () => {
      if (!draggingItem) {
        return;
      }
      const { order } = await persistLargeCategoryOrderFromNav(nav);
      if (order.length) {
        applyLargeCategoryOrder(nav, order);
      }
      cleanupDragging();
    };

    const onPointerMove = (event) => {
      // ドラッグ中は下半分に入ったら後ろへ挿入する。
      if (!draggingItem || event.pointerId !== pointerId) {
        return;
      }
      event.preventDefault();
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest?.(LARGE_CATEGORY_ITEM_SELECTOR);
      if (!target || target === draggingItem || !nav.contains(target)) {
        return;
      }
      const rect = target.getBoundingClientRect();
      const insertAfter = event.clientY > rect.top + rect.height / 2;
      nav.insertBefore(draggingItem, insertAfter ? target.nextSibling : target);
    };

    const onPointerUp = async () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
      await stopDragging();
    };

    const onPointerDown = (event) => {
      const handle = event.target?.closest?.(`.${LARGE_CATEGORY_HANDLE_CLASS}`);
      if (!handle) {
        return;
      }
      const item = handle.closest(LARGE_CATEGORY_ITEM_SELECTOR);
      if (!item) {
        return;
      }
      event.preventDefault();
      draggingItem = item;
      pointerId = event.pointerId;
      nav.classList.add(LARGE_CATEGORY_SORTING_ACTIVE_CLASS);
      item.classList.add(LARGE_CATEGORY_DRAGGING_CLASS);
      nav.setPointerCapture?.(event.pointerId);
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
      document.addEventListener("pointercancel", onPointerUp);
    };

    nav.addEventListener("pointerdown", onPointerDown);
    nativeSortableRegistry.set(nav, {
      cleanupDragging,
      onPointerDown,
      onPointerMove,
      onPointerUp,
    });
  };

  // 機能OFF時はDOMとイベントを両方撤去する。
  const disableLargeCategorySorting = (nav) => {
    if (nav.dataset[LARGE_CATEGORY_SORTABLE_FLAG] === "jquery") {
      const $ = globalThis.jQuery;
      try {
        $?.(nav)?.sortable?.("destroy");
      } catch (_error) {
        // ignore
      }
    }
    const nativeHandlers = nativeSortableRegistry.get(nav);
    if (nativeHandlers) {
      nav.removeEventListener("pointerdown", nativeHandlers.onPointerDown);
      document.removeEventListener("pointermove", nativeHandlers.onPointerMove);
      document.removeEventListener("pointerup", nativeHandlers.onPointerUp);
      document.removeEventListener("pointercancel", nativeHandlers.onPointerUp);
      nativeHandlers.cleanupDragging();
      nativeSortableRegistry.delete(nav);
    }
    nav.dataset[LARGE_CATEGORY_SORTABLE_FLAG] = "";
    removeLargeCategoryHandles(nav);
  };

  // プロフィールのルール画面でのみ並び替え機能を初期化する。
  const initializeLargeCategorySorting = async () => {
    // 並び替えは保存済み順序があるときだけ再適用する。
    if (!isProfileRulePage()) {
      return;
    }
    const nav = document.querySelector(LARGE_CATEGORY_NAV_SELECTOR);
    if (!nav) {
      return;
    }
    if (nav.classList.contains(LARGE_CATEGORY_SORTING_ACTIVE_CLASS)) {
      return;
    }
    const settings = await loadSettings();
    const enabled = settings?.[LARGE_CATEGORY_SORTING_ENABLED_KEY] ?? true;
    if (!enabled) {
      disableLargeCategorySorting(nav);
      return;
    }
    const currentIds = getLargeCategoryIds(nav);
    if (!currentIds.length) {
      return;
    }
    const savedOrder = settings?.[LARGE_CATEGORY_SORTING_KEY]?.order ?? [];
    const normalized = normalizeLargeCategoryOrder(currentIds, savedOrder);
    if (savedOrder.length > 0 && !isSameOrder(currentIds, normalized)) {
      applyLargeCategoryOrder(nav, normalized);
    }
    const usingJquery = enableJquerySortable(nav);
    ensureLargeCategoryHandles(nav, !usingJquery);
    if (!usingJquery) {
      enableNativeSortable(nav);
    }
  };

  // /cf のカテゴリメニュー用に別DOM構造を扱う。
  const getCfLargeCategoryItems = (menu) =>
    Array.from(menu?.children ?? []).filter((child) =>
      child?.matches?.(CF_LARGE_CATEGORY_ITEM_SELECTOR)
    );

  const getCfLargeCategoryIds = (menu) => {
    const ids = [];
    for (const item of getCfLargeCategoryItems(menu)) {
      const id = item
        .querySelector(CF_LARGE_CATEGORY_ANCHOR_SELECTOR)
        ?.getAttribute("id")
        ?.trim();
      if (id && !LARGE_CATEGORY_EXCLUDED_IDS.has(id)) {
        ids.push(id);
      }
    }
    return ids;
  };

  // /cfのカテゴリメニューで並び順を反映する。
  const applyCfLargeCategoryOrder = (menu, orderedIds) => {
    const orderSet = new Set(orderedIds);
    const items = getCfLargeCategoryItems(menu);
    const byId = new Map();
    const rest = [];
    for (const item of items) {
      const id = item
        .querySelector(CF_LARGE_CATEGORY_ANCHOR_SELECTOR)
        ?.getAttribute("id")
        ?.trim();
      if (id && orderSet.has(id)) {
        byId.set(id, item);
      } else {
        rest.push(item);
      }
    }
    const fragment = document.createDocumentFragment();
    for (const id of orderedIds) {
      const item = byId.get(id);
      if (item) {
        fragment.appendChild(item);
      }
    }
    for (const item of rest) {
      fragment.appendChild(item);
    }
    menu.appendChild(fragment);
  };

  // /cf画面のメニューは描画遅延があるため、再実行に耐える形で初期化する。
  const initializeCfLargeCategoryOrdering = async () => {
    // メニューが描画されるまで待ちつつ、同じ順序なら再適用しない。
    if (!isCfPage()) {
      return;
    }
    const menu = document.querySelector(CF_LARGE_CATEGORY_MENU_SELECTOR);
    if (!menu) {
      document.documentElement.classList.remove(
        CF_LARGE_CATEGORY_MENU_PENDING_CLASS
      );
      return;
    }
    const settings = await loadSettings();
    const enabled = settings?.[LARGE_CATEGORY_SORTING_ENABLED_KEY] ?? true;
    if (!enabled) {
      document.documentElement.classList.remove(
        CF_LARGE_CATEGORY_MENU_PENDING_CLASS
      );
      return;
    }
    const currentIds = getCfLargeCategoryIds(menu);
    if (!currentIds.length) {
      document.documentElement.classList.remove(
        CF_LARGE_CATEGORY_MENU_PENDING_CLASS
      );
      return;
    }
    const savedOrder = settings?.[LARGE_CATEGORY_SORTING_KEY]?.order ?? [];
    if (!savedOrder.length) {
      document.documentElement.classList.remove(
        CF_LARGE_CATEGORY_MENU_PENDING_CLASS
      );
      return;
    }
    const normalized = normalizeLargeCategoryOrder(currentIds, savedOrder);
    const nextKey = normalized.join(",");
    if (menu.dataset[CF_LARGE_CATEGORY_SORTED_KEY] === nextKey) {
      document.documentElement.classList.remove(
        CF_LARGE_CATEGORY_MENU_PENDING_CLASS
      );
      return;
    }
    applyCfLargeCategoryOrder(menu, normalized);
    menu.dataset[CF_LARGE_CATEGORY_SORTED_KEY] = nextKey;
    document.documentElement.classList.remove(
      CF_LARGE_CATEGORY_MENU_PENDING_CLASS
    );
  };

  const resetGeminiAnalysisState = () => {
    geminiAnalysisState = {
      month: "",
      resultsByTxId: {},
    };
  };

  const getGeminiSettingsFingerprint = (settings = {}) =>
    JSON.stringify({
      geminiAnalysisEnabled:
        settings?.featureFlags?.geminiAnalysisEnabled ?? true,
      geminiApiKeyConfigured: settings?.geminiApiKeyConfigured ?? false,
      model: settings?.model ?? "",
      scoreThreshold: settings?.scoreThreshold ?? null,
    });

  const mergeGeminiBatchResults = (month, results) => {
    const nextResultsByTxId =
      geminiAnalysisState.month === month
        ? { ...geminiAnalysisState.resultsByTxId }
        : {};

    for (const item of results ?? []) {
      if (!item?.id) {
        continue;
      }
      nextResultsByTxId[item.id] =
        typeof item.score === "number" && Number.isFinite(item.score)
          ? item.score
          : 0;
    }

    geminiAnalysisState = {
      month,
      resultsByTxId: nextResultsByTxId,
    };
  };

  const isNonEmptyString = (value) =>
    typeof value === "string" && value.trim().length > 0;

  const sanitizeGeminiTransactionString = (value) => {
    const text = typeof value === "string" ? value.trim() : "";
    return text.slice(0, GEMINI_TRANSACTION_STRING_MAX_LENGTH);
  };

  const sanitizeGeminiTransaction = (transaction) => ({
    id: sanitizeGeminiTransactionString(transaction.id),
    date: sanitizeGeminiTransactionString(transaction.date),
    store: sanitizeGeminiTransactionString(transaction.store),
    amount: transaction.amount,
    category: sanitizeGeminiTransactionString(transaction.category),
    subcategory: sanitizeGeminiTransactionString(transaction.subcategory),
  });

  const sanitizeGeminiTransactions = (transactions) =>
    (transactions ?? [])
      .map(sanitizeGeminiTransaction)
      .filter(
        (transaction) =>
          isNonEmptyString(transaction?.id) &&
          isNonEmptyString(transaction?.date) &&
          isNonEmptyString(transaction?.store) &&
          typeof transaction?.amount === "number" &&
          Number.isFinite(transaction.amount)
      );

  const buildGeminiPayload = ({ month, model, transactions }) => ({
    type: "requestGeminiAnalysis",
    month,
    model,
    transactions: sanitizeGeminiTransactions(transactions),
  });

  const getGeminiRuntimeErrorMessage = (lastError) => {
    const message = lastError?.message ?? "";
    if (message.includes("message channel closed")) {
      return `background_channel_closed: ${message}`;
    }
    if (message.includes("Extension context invalidated")) {
      return `extension_context_invalidated: ${message}`;
    }
    return message ? `runtime_message_error: ${message}` : "";
  };

  const formatGeminiErrorMessage = (message) => {
    const trimmed = typeof message === "string" ? message.trim() : "";
    if (!trimmed) {
      return "Gemini解析に失敗しました";
    }
    const shortened =
      trimmed.length > GEMINI_ERROR_MESSAGE_MAX_LENGTH
        ? `${trimmed.slice(0, GEMINI_ERROR_MESSAGE_MAX_LENGTH)}...`
        : trimmed;
    return `Gemini解析に失敗しました: ${shortened}`;
  };

  // Gemini解析の実行済み判定に使う月を取得する。
  const _getViewMonth = () => {
    const rows = getTransactionRows();
    for (const row of rows) {
      const parsed = parseDate(row);
      if (parsed?.length >= 7) {
        return parsed.slice(0, 7);
      }
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  };

  const shouldSkipGeminiRun = (month, transactionIds) => {
    if (geminiAnalysisState.month !== month) {
      return false;
    }
    const knownTxIds = new Set(Object.keys(geminiAnalysisState.resultsByTxId));
    if (!transactionIds.length || knownTxIds.size === 0) {
      return false;
    }
    for (const txId of transactionIds) {
      if (!knownTxIds.has(txId)) {
        return false;
      }
    }
    return true;
  };

  // 進捗オーバーレイの要素IDは一箇所で管理する。
  const overlayIds = {
    overlay: "mf-sub-overlay",
    indicator: "mf-sub-indicator",
  };

  // オーバーレイは確実にDOMから除去し、スクロールを戻す。
  const removeOverlayById = () => {
    const overlay = document.getElementById(overlayIds.overlay);
    if (overlay) {
      overlay.remove();
    }
    document.documentElement.style.overflow = "";
  };

  // Gemini解析中の進捗表示を画面全体に出す。
  const showProgressOverlay = (totalBatches) => {
    // 解析中はスクロールを止め、ユーザーに進行中であることを示す。
    removeOverlayById();
    document.documentElement.style.overflow = "hidden";
    const overlay = document.createElement("div");
    overlay.id = overlayIds.overlay;
    overlay.className = "mf-sub-overlay";

    const card = document.createElement("div");
    card.id = overlayIds.indicator;
    card.className = "mf-sub-indicator";
    card.setAttribute("aria-live", "polite");

    const statusRow = document.createElement("div");
    statusRow.className = "mf-sub-indicator__row";
    const status = document.createElement("div");
    status.className = "mf-sub-indicator__status";
    status.textContent = "Gemini解析中…";
    const spinner = document.createElement("div");
    spinner.className = "mf-sub-indicator__spinner";
    statusRow.append(status, spinner);

    const sub = document.createElement("div");
    sub.className = "mf-sub-indicator__sub";
    sub.textContent = `バッチ 0/${totalBatches}`;

    const bar = document.createElement("div");
    bar.className = "mf-sub-indicator__bar";
    const fill = document.createElement("div");
    fill.className = "mf-sub-indicator__bar-fill";
    bar.append(fill);

    card.append(statusRow, bar, sub);
    overlay.append(card);
    document.body.append(overlay);

    return () => removeOverlayById();
  };

  // 進捗UIの文言とバーを更新する。
  const updateProgressOverlay = (current, total, remainingCount, opts = {}) => {
    // 失敗時はエラーメッセージで上書きする。
    const card = document.getElementById(overlayIds.indicator);
    if (!card) {
      return;
    }

    const sub = card.querySelector(".mf-sub-indicator__sub");
    const fill = card.querySelector(".mf-sub-indicator__bar-fill");
    const status = card.querySelector(".mf-sub-indicator__status");

    if (sub) {
      sub.textContent = getProgressText(current, total, remainingCount, opts);
    }

    if (fill) {
      fill.style.width = `${getProgressPercent(current, total)}%`;
    }

    if (status) {
      applyStatusIndicators(card, status, opts);
    }

    if (opts.errorMessage && sub) {
      sub.textContent = opts.errorMessage;
    }
  };

  // サブテキストは完了/進行中でメッセージを切り替える。
  const getProgressText = (current, total, remainingCount, opts) => {
    if (opts.done) {
      return "結果を反映しました";
    }
    const safeRemaining = Math.max(remainingCount, 0);
    return `バッチ ${current}/${total}（残り ${safeRemaining} 件）`;
  };

  // バッチ進捗を0-100%に丸める。
  const getProgressPercent = (current, total) => {
    const ratio = current / total;
    return Math.min(100, Math.round(ratio * 100));
  };

  // 成功/失敗に応じてクラスを切り替える。
  const applyStatusIndicators = (card, statusEl, opts) => {
    const isDone = Boolean(opts.done);
    const isError = Boolean(opts.error);
    statusEl.textContent = isDone ? "Gemini解析完了" : "Gemini解析中…";
    card.classList.toggle("mf-sub-indicator--success", isDone);
    card.classList.toggle("mf-sub-indicator--error", isError);
  };

  // 取引行からGemini解析に必要な情報を抽出する。
  const extractTransactionFields = (row) => {
    const txId = findTxId(row);
    const amount = extractAmount(row);
    return {
      txId,
      amount,
      store: extractStore(row),
      date: parseDate(row),
      isIncome: getIsIncome(row),
      isTarget: getIsTarget(row),
      category:
        row.querySelector(SELECTORS.categoryLarge)?.textContent?.trim() ?? "",
      subcategory:
        row.querySelector(SELECTORS.categoryMiddle)?.textContent?.trim() ?? "",
    };
  };

  // 解析対象外（収入/振替など）は除外する。
  const shouldIncludeTransaction = ({
    txId,
    amount,
    store,
    date,
    isIncome,
    isTarget,
    isNegative,
    category,
    subcategory,
  }) => {
    const isValidAmount = amount !== null && amount !== undefined;
    if (!(txId && date && store && isValidAmount)) {
      return false;
    }
    if (!isTarget || isIncome || !isNegative) {
      return false;
    }
    const labelText = `${category}${subcategory}` || "";
    const excluded = EXCLUDE_KEYWORDS.some((kw) => labelText.includes(kw));
    return !excluded;
  };

  // 解析対象の取引だけを配列化する。
  const collectTransactions = () => {
    // DOMから抽出→条件フィルタまでを1回で行う。
    const rows = getTransactionRows();
    const txList = [];
    for (const row of rows) {
      const fields = extractTransactionFields(row);
      if (
        !shouldIncludeTransaction({
          ...fields,
          isNegative: isNegativeAmount(row),
        })
      ) {
        continue;
      }
      txList.push({
        id: fields.txId,
        date: fields.date,
        store: fields.store,
        amount: fields.amount,
        category: fields.category,
        subcategory: fields.subcategory,
      });
    }
    return txList;
  };

  // 重複候補をキーでまとめ、対象ID集合を返す。
  const groupDuplicates = (transactions) => {
    const byKey = new Map();
    const list =
      transactions?.map((tx) => ({
        ...tx,
        key: tx?.id
          ? buildDuplicateKey({
              date: tx.date,
              store: tx.store,
              amount: tx.amount,
            })
          : "",
      })) ?? [];

    for (const tx of list) {
      if (!(tx.id && tx.key)) {
        continue;
      }
      const ids = byKey.get(tx.key);
      if (ids) {
        ids.push(tx.id);
      } else {
        byKey.set(tx.key, [tx.id]);
      }
    }

    const duplicateTxIds = new Set(
      [...byKey.values()].flatMap((ids) => (ids.length >= 2 ? ids : []))
    );
    return { byKey, duplicateTxIds };
  };

  // 重複表示をリセットする。
  const clearDuplicateHighlight = () => {
    const rows = getTransactionRows();
    for (const row of rows) {
      row.classList.remove(DUPLICATE_CLASS);
      if (row.title === "同日・同内容・同額の取引が複数あります") {
        row.removeAttribute("title");
      }
    }
  };

  // 重複候補の行だけを強調表示する。
  const applyDuplicateHighlight = (duplicateTxIds) => {
    const rows = getTransactionRows();
    for (const row of rows) {
      const txId = findTxId(row);
      if (txId && duplicateTxIds.has(txId)) {
        row.classList.add(DUPLICATE_CLASS);
        row.title = "同日・同内容・同額の取引が複数あります";
      } else {
        row.classList.remove(DUPLICATE_CLASS);
        if (row.title === "同日・同内容・同額の取引が複数あります") {
          row.removeAttribute("title");
        }
      }
    }
  };

  // カテゴリ警告の表示を解除する。
  const clearCategoryAlert = (row) => {
    row.classList.remove(CATEGORY_ALERT_ROW_CLASS);
    const categoryCell = row.querySelector(SELECTORS.categoryLarge);
    const subcategoryCell = row.querySelector(SELECTORS.categoryMiddle);
    for (const cell of [categoryCell, subcategoryCell]) {
      cell?.classList.remove(CATEGORY_ALERT_CELL_CLASS);
    }
    if (row.title?.startsWith("カテゴリ組み合わせ")) {
      row.removeAttribute("title");
    }
  };

  const shouldCheckCategory = (row) =>
    getIsTarget(row) && !getIsIncome(row) && isNegativeAmount(row);

  const getCategoryTexts = (row) => {
    const category =
      row.querySelector(SELECTORS.categoryLarge)?.textContent?.trim() ?? "";
    const subcategory =
      row.querySelector(SELECTORS.categoryMiddle)?.textContent?.trim() ?? "";
    return { category, subcategory };
  };

  // ルール違反の理由をtitleで伝える。
  const setCategoryAlert = (row, violation) => {
    row.classList.add(CATEGORY_ALERT_ROW_CLASS);
    const categoryCell = row.querySelector(SELECTORS.categoryLarge);
    const subcategoryCell = row.querySelector(SELECTORS.categoryMiddle);
    categoryCell?.classList.add(CATEGORY_ALERT_CELL_CLASS);
    subcategoryCell?.classList.add(CATEGORY_ALERT_CELL_CLASS);
    const reasonText =
      violation?.violation === "whitelist_miss"
        ? "カテゴリ組み合わせがホワイトリストに登録されていません"
        : "カテゴリ組み合わせがブラックリストに登録されています";
    row.title = reasonText;
  };

  // 全行にルール違反チェックを適用する。
  const applyCategoryAlert = (sets) => {
    const rows = getTransactionRows();
    for (const row of rows) {
      if (!shouldCheckCategory(row)) {
        clearCategoryAlert(row);
        continue;
      }

      const { category, subcategory } = getCategoryTexts(row);
      const isUnclassified =
        !(category && subcategory) || category === "未分類";
      const violation = isUnclassified
        ? null
        : evaluateCategoryRule({ category, subcategory }, sets);
      if (!violation) {
        clearCategoryAlert(row);
        continue;
      }
      setCategoryAlert(row, violation);
    }
  };

  // Geminiスコアが閾値以上の行をハイライトする。
  const getGeminiHighlightedTxIds = (threshold) => {
    const highlightedTxIds = new Set();
    for (const [txId, score] of Object.entries(
      geminiAnalysisState.resultsByTxId ?? {}
    )) {
      if (typeof score === "number" && score >= threshold) {
        highlightedTxIds.add(txId);
      }
    }
    return highlightedTxIds;
  };

  const applyGeminiHighlight = (threshold) => {
    const rows = getTransactionRows();
    const highlightedTxIds = getGeminiHighlightedTxIds(threshold);
    for (const row of rows) {
      const txId = findTxId(row);
      if (txId && highlightedTxIds.has(txId)) {
        row.classList.add(GEMINI_HIGHLIGHT_CLASS);
      } else {
        row.classList.remove(GEMINI_HIGHLIGHT_CLASS);
      }
    }
  };

  // 重複チェックは設定に応じて実行/停止する。
  const runDuplicateCheck = async () => {
    const settings = await loadSettings();
    const enabled = settings.featureFlags?.duplicateCheckEnabled ?? true;
    if (!enabled) {
      clearDuplicateHighlight();
      return;
    }
    const transactions = collectTransactions().filter(
      (tx) => tx.store && tx.date
    );
    if (transactions.length === 0) {
      clearDuplicateHighlight();
      return;
    }
    const { duplicateTxIds } = groupDuplicates(transactions);
    if (duplicateTxIds.size === 0) {
      clearDuplicateHighlight();
      return;
    }
    applyDuplicateHighlight(duplicateTxIds);
  };

  // カテゴリルール警告はルールが空なら全解除する。
  const runCategoryRuleAlert = async () => {
    const settings = await loadSettings();
    const enabled = settings.featureFlags?.categoryRuleAlertEnabled ?? true;
    if (!enabled) {
      const rows = getTransactionRows();
      for (const row of rows) {
        clearCategoryAlert(row);
      }
      return;
    }
    const sets = buildCategoryRuleSets(settings.categoryRules ?? {});
    if (
      (sets.whitelist?.size ?? 0) === 0 &&
      (sets.blacklist?.size ?? 0) === 0
    ) {
      const rows = getTransactionRows();
      for (const row of rows) {
        clearCategoryAlert(row);
      }
      return;
    }
    applyCategoryAlert(sets);
  };

  // Gemini解析は月単位で1回だけ実行し、結果をハイライトに反映する。
  const runGeminiAnalysis = async () => {
    // 設定不備や二重実行はここで早期に弾く。
    const settings = await loadSettings();
    const threshold = settings.scoreThreshold ?? DEFAULT_THRESHOLD;
    const model = settings.model ?? DEFAULT_MODEL;
    const geminiEnabled = settings.featureFlags?.geminiAnalysisEnabled ?? true;
    const apiKeyConfigured = settings.geminiApiKeyConfigured ?? true;
    lastGeminiSettingsFingerprint = getGeminiSettingsFingerprint(settings);

    if (!geminiEnabled) {
      log("skip: gemini disabled by settings");
      resetGeminiAnalysisState();
      applyGeminiHighlight(threshold);
      return;
    }
    if (!apiKeyConfigured) {
      log("skip: apiKey missing");
      resetGeminiAnalysisState();
      applyGeminiHighlight(threshold);
      return;
    }

    const transactions = collectTransactions();
    if (transactions.length === 0) {
      log("skip: no transactions");
      return;
    }
    const month =
      transactions[0]?.date?.slice(0, 7) ??
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

    if (
      shouldSkipGeminiRun(
        month,
        transactions.map((transaction) => transaction.id)
      )
    ) {
      // 同月・同一取引集合なら既存結果を再適用する。
      log("skip: cached results hit", month);
      applyGeminiHighlight(threshold);
      return;
    }
    resetGeminiAnalysisState();

    const batchSize = 15;
    const batches = buildBatches(transactions, batchSize);

    const removeOverlay = showProgressOverlay(batches.length);
    const batchResult = await processGeminiBatches({
      batches,
      batchSize,
      threshold,
      month,
      model,
      transactions,
      onProgress: updateProgressOverlay,
      onError: (idx, errorMessage) => {
        logError("gemini batch error", { batch: idx, error: errorMessage });
        setTimeout(() => removeOverlay(), 2000);
      },
    });

    if (batchResult === "error") {
      return;
    }

    updateProgressOverlay(batches.length, batches.length, 0, { done: true });
    setTimeout(() => removeOverlay(), 1200);
  };

  const runQueuedGeminiIfNeeded = () => {
    if (!geminiRunState.rerunQueued) {
      return;
    }
    geminiRunState = {
      inFlight: false,
      rerunQueued: false,
    };
    resetGeminiAnalysisState();
    setTimeout(() => {
      runGemini({ forceRerun: true }).catch((error) => {
        log("queued gemini rerun failed", error?.message ?? String(error));
      });
    }, 0);
  };

  const runGemini = async ({ forceRerun = false } = {}) => {
    if (geminiRunState.inFlight) {
      geminiRunState = {
        inFlight: true,
        rerunQueued: Boolean(geminiRunState.rerunQueued || forceRerun),
      };
      log("skip: gemini already running", {
        rerunQueued: geminiRunState.rerunQueued,
      });
      return;
    }

    geminiRunState = {
      inFlight: true,
      rerunQueued: false,
    };
    try {
      await runGeminiAnalysis();
    } finally {
      geminiRunState.inFlight = false;
      runQueuedGeminiIfNeeded();
    }
  };

  // API制限を考慮して取引をバッチ分割する。
  const buildBatches = (items, size) => {
    if (size <= 0) {
      return [items];
    }
    return Array.from({ length: Math.ceil(items.length / size) }, (_v, idx) =>
      items.slice(idx * size, (idx + 1) * size)
    );
  };

  // background側へバッチ解析を依頼する。
  const sendGeminiBatch = (payload) =>
    new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error("batch timeout"));
        }
      }, 65_000);
      chrome.runtime.sendMessage(payload, (response) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        const runtimeError = getGeminiRuntimeErrorMessage(
          chrome.runtime?.lastError
        );
        if (runtimeError) {
          reject(new Error(runtimeError));
          return;
        }
        if (response?.ok && response.data?.results) {
          resolve(response.data.results);
        } else {
          reject(new Error(response?.error ?? "unknown"));
        }
      });
    });

  // バッチごとに進捗を更新しながらGemini解析を実行する。
  const processGeminiBatches = async ({
    batches,
    batchSize,
    threshold,
    month,
    model,
    transactions,
    onProgress,
    onError,
  }) => {
    for (let i = 0; i < batches.length; i += 1) {
      // UIは逐次更新し、ユーザーが待ち時間を把握できるようにする。
      onProgress?.(
        i + 1,
        batches.length,
        transactions.length - (i + 1) * batchSize
      );
      const payload = buildGeminiPayload({
        month,
        model,
        transactions: batches[i],
      });
      // eslint-disable-next-line no-await-in-loop
      const result = await sendGeminiBatch(payload).catch((error) => error);
      if (result instanceof Error) {
        // 1件でも失敗したら中断してユーザーに知らせる。
        onProgress?.(i + 1, batches.length, 0, {
          error: true,
          errorMessage: formatGeminiErrorMessage(result.message),
        });
        onError?.(i + 1, result.message);
        return "error";
      }
      log("gemini ok batch", i + 1, result.length);
      mergeGeminiBatchResults(month, result);
      applyGeminiHighlight(threshold);
    }
    return "ok";
  };

  // 初回実行 & DOM変化時に実行をデバウンスする共通ヘルパー
  // DOM差し替えが多いページなのでデバウンスで負荷を抑える。
  const createDebouncedRunner = (fn, delayMs = 200) => {
    let pending = null;
    return () => {
      if (pending) {
        return;
      }
      pending = setTimeout(() => {
        pending = null;
        fn();
      }, delayMs);
    };
  };

  const scheduleLargeCategorySorting = createDebouncedRunner(
    () => initializeLargeCategorySorting(),
    120
  );
  const scheduleCfLargeCategoryOrdering = createDebouncedRunner(
    () => initializeCfLargeCategoryOrdering(),
    120
  );

  const scheduleRunGemini = createDebouncedRunner(runGemini);
  const scheduleDuplicateCheck = createDebouncedRunner(runDuplicateCheck);
  const scheduleCategoryCheck = createDebouncedRunner(runCategoryRuleAlert);
  const scheduleSatisfaction = createDebouncedRunner(runSatisfaction);

  // 初期ロード時に主要機能を順に実行する。
  scheduleInit();
  scheduleSatisfaction();
  scheduleRunGemini();
  scheduleDuplicateCheck();
  scheduleCategoryCheck();

  // プロフィール画面: 並び替えUIの監視。
  if (isProfileRulePage()) {
    scheduleLargeCategorySorting();
    const largeCategoryObserver = new MutationObserver(() =>
      scheduleLargeCategorySorting()
    );
    largeCategoryObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // /cf画面: カテゴリメニューの描画遅延に追随する。
  if (isCfPage()) {
    scheduleCfLargeCategoryOrdering();
    document.addEventListener("click", (event) => {
      const trigger = event.target?.closest?.(
        CF_LARGE_CATEGORY_TRIGGER_SELECTOR
      );
      if (!trigger) {
        return;
      }
      document.documentElement.classList.add(
        CF_LARGE_CATEGORY_MENU_PENDING_CLASS
      );
      scheduleCfLargeCategoryOrdering();
    });
    const cfMenuObserver = new MutationObserver(() =>
      scheduleCfLargeCategoryOrdering()
    );
    cfMenuObserver.observe(document.body, { childList: true, subtree: true });
  }

  // 各機能は独立した監視で必要時に再実行する。
  const geminiObserver = new MutationObserver(() => scheduleRunGemini());
  geminiObserver.observe(listBody, { childList: true, subtree: true });

  const duplicateObserver = new MutationObserver(() =>
    scheduleDuplicateCheck()
  );
  duplicateObserver.observe(listBody, { childList: true, subtree: true });

  const categoryObserver = new MutationObserver(() => scheduleCategoryCheck());
  categoryObserver.observe(listBody, { childList: true, subtree: true });

  const satisfactionObserver = new MutationObserver(() =>
    scheduleSatisfaction()
  );
  satisfactionObserver.observe(listBody, { childList: true, subtree: true });

  // 設定はsync/localどちらの変更でも再読み込みする。
  const isSettingsArea = (area) => area === "sync" || area === "local";

  // 設定が変わったらキャッシュを捨て、必要な再描画を行う。
  const handleSettingsChange = (oldSettings, newSettings) => {
    cachedSettings = null;
    cachedSettingsPromise = null;
    scheduleDuplicateCheck();
    scheduleCategoryCheck();
    if (isProfileRulePage()) {
      scheduleLargeCategorySorting();
    }
    if (isCfPage()) {
      scheduleCfLargeCategoryOrdering();
    }

    const previousFingerprint =
      oldSettings && typeof oldSettings === "object"
        ? getGeminiSettingsFingerprint(oldSettings)
        : lastGeminiSettingsFingerprint;
    const nextFingerprint =
      newSettings && typeof newSettings === "object"
        ? getGeminiSettingsFingerprint(newSettings)
        : "";
    if (previousFingerprint !== nextFingerprint) {
      resetGeminiAnalysisState();
      log("settings changed; gemini cache cleared");
      scheduleRunGemini();
    }
  };

  // UI設定が変わったらマスク状態を即時反映する。
  const handleUiPrefsChange = (next) => {
    cachedUiPrefs = null;
    cachedUiPrefsPromise = null;
    const nextFeatureEnabled = next?.maskingFeatureEnabled;
    const nextMaskingEnabled = next?.maskingEnabled;

    if (typeof nextFeatureEnabled === "boolean") {
      maskingFeatureEnabled = nextFeatureEnabled;
    }
    if (typeof nextMaskingEnabled === "boolean") {
      maskingEnabled = nextMaskingEnabled;
    }
    maskingPrefsLoaded = true;
    if (next && typeof next === "object") {
      cachedUiPrefs = { ...DEFAULT_UI_PREFS, ...next };
    }

    if (!maskingFeatureEnabled) {
      disableMaskingFeature();
      return;
    }
    ensureMaskToggleButton();
    applyMasking();
  };

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (!isSettingsArea(area)) {
        return;
      }
      if (changes.settings) {
        handleSettingsChange(
          changes.settings.oldValue ?? null,
          changes.settings.newValue ?? null
        );
      }

      const nextUiPrefs = changes[UI_PREFS_KEY]?.newValue;
      if (nextUiPrefs) {
        handleUiPrefsChange(nextUiPrefs);
      }
    });
  } catch (_e) {
    // コンテキスト無効化時は無視
  }

  try {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "mf_subs_rerun_gemini") {
        resetGeminiAnalysisState();
        runGemini({ forceRerun: true }).catch((error) => {
          log("manual gemini rerun failed", error?.message ?? String(error));
        });
        sendResponse?.({ ok: true });
        return false;
      }
      return false;
    });
  } catch (_e) {
    // コンテキスト無効化時は無視
  }
})();
