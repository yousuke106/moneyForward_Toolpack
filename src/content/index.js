/* globals chrome */

const AMOUNT_REGEX = /[-+−]?\d[\d,]*/u;

const NEGATIVE_HEAD_REGEX = /^[-−]/u;

(() => {
  const LABELS = [
    { value: "", text: "未設定" },
    { value: "using", text: "利用中" },
    { value: "rarely", text: "ほぼ未使用" },
    { value: "cancel", text: "解約予定" },
  ];

  const SATISFACTION_OPTIONS = [
    { value: "", text: "未選択" },
    { value: "top1", text: "Top1" },
    { value: "top2", text: "Top2" },
    { value: "top3", text: "Top3" },
    { value: "worst1", text: "Worst1" },
    { value: "worst2", text: "Worst2" },
    { value: "worst3", text: "Worst3" },
  ];

  const selectClass = "mf-sub-select";
  const labelInjectedFlag = "mfSubLabelInjected";
  const memoSelectorPrimary = "td.memo.form-switch-td";
  const memoSelectorFallback = '[data-title="メモ"]';
  const labelCellClass = "mf-sub-label-cell";
  const labelHeadClass = "mf-sub-label-head";
  const satisfactionHeadClass = "mf-sat-head";
  const satisfactionCellClass = "mf-sat-cell";
  const isDev =
    sessionStorage.getItem("mf_subs_debug") === "true" ||
    (globalThis.chrome?.runtime?.getManifest?.()?.version_name ?? "").includes(
      "dev"
    );
  const HIGHLIGHT_CLASS = "mf-sub-highlight";
  const DUPLICATE_CLASS = "mf-sub-duplicate";
  const CATEGORY_ALERT_ROW_CLASS = "mf-sub-category-alert-row";
  const CATEGORY_ALERT_CELL_CLASS = "mf-sub-category-alert-cell";
  const SESSION_FLAG_PREFIX = "mf_subs_checked_";
  // 画面共有/スクショ対策として、内容/金額をCSSのblurでマスクする（DOM改変を最小化して壊れにくくする）
  const UI_PREFS_KEY = "mf_toolpack_ui_prefs";
  const DEFAULT_UI_PREFS = {
    maskingFeatureEnabled: true,
    maskingEnabled: true,
  };
  const MASKING_ROOT_CLASS = "mf-tp-mask-on";
  const MASKING_TARGET_CLASS = "mf-tp-mask-target";
  const MASKING_TOGGLE_ID = "mf-tp-mask-toggle";
  const DEFAULT_THRESHOLD = 70;
  const DEFAULT_MODEL = "gemini-2.5-flash";
  const EXCLUDE_KEYWORDS = ["振替", "投資積立", "住宅ローン", "固定費"];
  const log = (...args) => {
    if (sessionStorage.getItem("mf_subs_debug") === "true" || isDev) {
      // eslint-disable-next-line no-console
      console.log("[mf-sub]", ...args);
    }
  };

  const normalizeStoreName = (raw) => {
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

  const buildTxKey = (id) => `tx:${id}`;
  const buildStoreAmountKey = (store, amount) =>
    `sa:${normalizeStoreName(store)}|${amount}`;
  const buildStoreDateKey = ({ store, amount, date }) => {
    if (!(store && amount !== null && amount !== undefined && date)) {
      return "";
    }
    const normalizedStore = normalizeStoreName(store);
    if (!normalizedStore) {
      return "";
    }
    return `sd:${normalizedStore}|${amount}|${date}`;
  };
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
  const buildCategoryRuleKey = ({ category, subcategory }) => {
    const large = normalizeCategory(category);
    const middle = normalizeCategory(subcategory);
    if (!(large && middle)) {
      return "";
    }
    return `${large}|${middle}`;
  };
  const buildCategoryRuleSets = (categoryRules = {}) => {
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

  const evaluateCategoryRule = ({ category, subcategory }, sets) => {
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

  const parseAmount = (text) => {
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

  const parseDate = (row) => {
    const sortable = row
      .querySelector("td.date")
      ?.getAttribute("data-table-sortable-value");
    if (sortable?.includes("-")) {
      const [ymd] = sortable.split("-");
      return ymd.replace(/\//g, "-");
    }
    return "";
  };

  const safeStorageGet = (area, keys, fallback) =>
    new Promise((resolve) => {
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

  const safeStorageSet = (area, payload) =>
    new Promise((resolve) => {
      const store = chrome?.storage?.[area];
      if (!(chrome?.runtime?.id && store)) {
        resolve();
        return;
      }
      try {
        store.set(payload, resolve);
      } catch (_error) {
        resolve();
      }
    });

  const loadUiPrefs = async () => {
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
  };

  const saveUiPrefs = async (patch) => {
    // 将来キーが増えても破壊しないよう、既存値とマージして保存する
    const current = await loadUiPrefs();
    const next = { ...current, ...(patch ?? {}) };
    const payload = { [UI_PREFS_KEY]: next };
    // sync が使えない/失敗する環境でも継続できるよう、local にも同内容を保存する
    await safeStorageSet("sync", payload);
    await safeStorageSet("local", payload);
  };

  const loadLabels = () =>
    safeStorageGet(
      "local",
      { labelsByTxId: {}, labelsByStoreAmount: {} },
      {
        labelsByTxId: {},
        labelsByStoreAmount: {},
      }
    );

  const saveLabel = async ({ txKey, storeAmountKey, label }) => {
    const { labelsByTxId, labelsByStoreAmount } = await loadLabels();
    if (label) {
      labelsByTxId[txKey] = label;
      labelsByStoreAmount[storeAmountKey] = label;
    } else {
      delete labelsByTxId[txKey];
      delete labelsByStoreAmount[storeAmountKey];
    }
    await safeStorageSet("local", {
      labelsByTxId,
      labelsByStoreAmount,
    });
  };

  const loadSatisfaction = () =>
    safeStorageGet(
      "local",
      { satisfactionByTxId: {}, satisfactionByStoreDate: {} },
      { satisfactionByTxId: {}, satisfactionByStoreDate: {} }
    );

  const saveSatisfaction = async ({ txKey, sdKey, rank, note }) => {
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
    await safeStorageSet("local", maps);
  };

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

  let maskingFeatureEnabled = DEFAULT_UI_PREFS.maskingFeatureEnabled;
  let maskingEnabled = DEFAULT_UI_PREFS.maskingEnabled;
  let maskingPrefsLoaded = false;
  let maskingPrefsLoading = false;

  const clearMaskTargets = () => {
    const current = document.querySelectorAll(`.${MASKING_TARGET_CLASS}`);
    for (const el of current) {
      el.classList.remove(MASKING_TARGET_CLASS);
    }
  };

  const markTransactionTableTargets = () => {
    // 明細テーブル: 「内容」「金額（円）」セルをマスク対象にする
    const rows = document.querySelectorAll("tr.transaction_list");
    for (const row of rows) {
      const storeCell = findStoreCell(row);
      const amountCell = findAmountCell(row);
      storeCell?.classList?.add?.(MASKING_TARGET_CLASS);
      amountCell?.classList?.add?.(MASKING_TARGET_CLASS);
    }
  };

  const markMonthlyTotalsTargets = () => {
    // 上部の月次収支: 当月収入 / 当月支出 / 当月収支（合計値）をマスク対象にする
    // `/cf` 家計簿: `#monthly_total_table_kakeibo`
    // `/cf/summary`: `#monthly_total_table`
    const monthlyTotalTableIds = [
      "monthly_total_table_kakeibo",
      "monthly_total_table",
    ];
    const targetIndexes = [0, 2, 4];
    for (const tableId of monthlyTotalTableIds) {
      const cells = document.querySelectorAll(
        `#${tableId} tbody tr.js-monthly_total td`
      );
      for (const idx of targetIndexes) {
        cells[idx]?.classList?.add?.(MASKING_TARGET_CLASS);
      }
    }
  };

  const markCalendarAmountTargets = () => {
    // カレンダー（月表示）内の金額（+ / -）をマスク対象にする
    // FullCalendar のイベント表示は `.fc-event-title` 配下に plus/minus の span が描画される
    const calendarAmounts = document.querySelectorAll(
      "#calendar .fc-event-title .plus-color, #calendar .fc-event-title .minus-color"
    );
    for (const el of calendarAmounts) {
      el.classList.add(MASKING_TARGET_CLASS);
    }
  };

  const markCashflowSummaryTargets = () => {
    // `/cf/summary` 支出セクション: 合計（例: `.heading-radius-box`）の金額をマスク対象にする
    const cashflowOutTotal = document.querySelector(
      "#cache-flow .heading-radius-box"
    );
    cashflowOutTotal?.classList?.add?.(MASKING_TARGET_CLASS);

    // `/cf/summary` 支出内訳テーブル: 「金額」列（2列目）をマスク対象にする
    // NOTE: 3列目（割合）も `.number` のため、列位置で特定する
    const cashflowOutAmounts = document.querySelectorAll(
      "#table-outgo tbody tr td:nth-child(2)"
    );
    for (const td of cashflowOutAmounts) {
      td.classList.add(MASKING_TARGET_CLASS);
    }
  };

  const markAccountsAssetTargets = () => {
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
        cells[assetIndex]?.classList?.add?.(MASKING_TARGET_CLASS);
      }
    }
  };

  const markHomePageTargets = () => {
    // `/` ホーム: 上部合計の金額をマスク対象にする
    const totalAmount = document.querySelector(".heading-radius-box");
    totalAmount?.classList?.add?.(MASKING_TARGET_CLASS);

    // `/` ホーム: 口座一覧の金額（`.accounts-list .amount .number`）をマスク対象にする
    const accountAmounts = document.querySelectorAll(
      ".accounts-list .amount .number"
    );
    for (const amount of accountAmounts) {
      amount.classList.add(MASKING_TARGET_CLASS);
    }

    // `/` ホーム: 当月収入/支出/収支の金額セルをマスク対象にする
    const monthlyTotals = document.querySelectorAll(
      "#monthly_total_table_home tr.js-monthly_total td"
    );
    for (const cell of monthlyTotals) {
      cell.classList.add(MASKING_TARGET_CLASS);
    }

    // `/` ホーム: 総資産セクションの金額をマスク対象にする
    // DOM差分に備えて、セクション内と単独表示の両方を拾う
    const totalAssetsAmounts = document.querySelectorAll(
      ".total-assets .heading-radius-box, p.number.heading-radius-box"
    );
    for (const amount of totalAssetsAmounts) {
      amount.classList.add(MASKING_TARGET_CLASS);
    }

    // `/` ホーム: 増減テーブルの金額（3列目）をマスク対象にする
    const fluctuationAmounts = document.querySelectorAll(
      ".total-assets .fluctuation-list tbody tr td:nth-child(3)"
    );
    for (const amount of fluctuationAmounts) {
      amount.classList.add(MASKING_TARGET_CLASS);
    }

    // `/` ホーム: 内訳テーブルの金額（2列目）をマスク対象にする
    const breakdownAmounts = document.querySelectorAll(
      ".total-assets .breakdown-list tbody tr td:nth-child(2)"
    );
    for (const amount of breakdownAmounts) {
      amount.classList.add(MASKING_TARGET_CLASS);
    }

    // `/` ホーム: 総資産グラフの数値ラベルをマスク対象にする（Highcharts）
    const chartLabels = document.querySelectorAll(
      ".total-assets .highcharts-data-labels text, .total-assets .highcharts-axis-labels text, .total-assets .highcharts-tooltip text"
    );
    for (const label of chartLabels) {
      label.classList.add(MASKING_TARGET_CLASS);
    }

    // `/` ホーム: 資産の時系列推移グラフの縦軸ラベルをマスク対象にする
    const assetTimeSeriesYAxisLabels = document.querySelectorAll(
      ".highcharts-yaxis-labels text"
    );
    for (const label of assetTimeSeriesYAxisLabels) {
      label.classList.add(MASKING_TARGET_CLASS);
    }
  };

  const markMaskTargets = () => {
    clearMaskTargets();
    markTransactionTableTargets();
    markMonthlyTotalsTargets();
    markCalendarAmountTargets();
    markCashflowSummaryTargets();
    markAccountsAssetTargets();
    markHomePageTargets();
  };

  const updateMaskToggleUi = () => {
    const button = document.getElementById(MASKING_TOGGLE_ID);
    if (!button) {
      return;
    }
    button.setAttribute("aria-pressed", maskingEnabled ? "true" : "false");
    button.textContent = maskingEnabled ? "マスク: ON" : "マスク: OFF";
    button.title = "内容/金額（円）をぼかして表示します（クリックで切替）";
  };

  const applyMasking = () => {
    document.documentElement.classList.toggle(
      MASKING_ROOT_CLASS,
      maskingEnabled
    );
    markMaskTargets();
    updateMaskToggleUi();
  };

  const disableMaskingFeature = () => {
    // 機能OFF時はボタンを出さず、画面を必ず非マスク状態に戻す（スクショ対策機能そのものを停止）
    const button = document.getElementById(MASKING_TOGGLE_ID);
    button?.remove();
    document.documentElement.classList.remove(MASKING_ROOT_CLASS);

    const currentTargets = document.querySelectorAll(
      `.${MASKING_TARGET_CLASS}`
    );
    for (const el of currentTargets) {
      el.classList.remove(MASKING_TARGET_CLASS);
    }
  };

  const ensureMaskToggleButton = () => {
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

  const ensureLabelHeader = () => {
    const headRow = document.querySelector("#cf-detail-table thead tr");
    if (!headRow) {
      return;
    }
    if (headRow.querySelector(`.${labelHeadClass}`)) {
      return;
    }
    const memoHead =
      headRow.querySelector("th.memo") ??
      headRow.querySelector('th[data-title="メモ"]');
    const th = document.createElement("th");
    th.className = labelHeadClass;
    th.textContent = "サブスク";
    if (memoHead?.parentElement) {
      memoHead.parentElement.insertBefore(th, memoHead.nextSibling);
    } else {
      headRow.append(th);
    }
  };

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

  const removeLabelUi = () => {
    const head = document.querySelector(`th.${labelHeadClass}`);
    head?.remove();
    const rows = document.querySelectorAll("tr.transaction_list");
    for (const row of rows) {
      const cell = row.querySelector(`td.${labelCellClass}`);
      cell?.remove();
      row.dataset[labelInjectedFlag] = "";
    }
  };

  const setSelectValue = (row, label) => {
    const select = row.querySelector(`select.${selectClass}`);
    if (!select) {
      return;
    }
    select.value = label ?? "";
    if (label) {
      row.classList.add(HIGHLIGHT_CLASS);
    } else {
      row.classList.remove(HIGHLIGHT_CLASS);
    }
  };

  const injectSelect = (row, onChange) => {
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

  const ensureSatisfactionHeader = () => {
    const headRow = document.querySelector("#cf-detail-table thead tr");
    if (!headRow || headRow.dataset.mfSatHead === "1") {
      return;
    }
    const thRank = document.createElement("th");
    thRank.className = satisfactionHeadClass;
    thRank.textContent = "満足度";
    const thNote = document.createElement("th");
    thNote.className = satisfactionHeadClass;
    thNote.textContent = "満足度メモ";
    headRow.append(thRank, thNote);
    headRow.dataset.mfSatHead = "1";
  };

  const removeSatisfactionUi = () => {
    const headRow = document.querySelector("#cf-detail-table thead tr");
    if (headRow && headRow.dataset.mfSatHead === "1") {
      headRow.dataset.mfSatHead = "";
      const heads = headRow.querySelectorAll(`.${satisfactionHeadClass}`);
      for (const th of heads) {
        th.remove();
      }
    }
    const rows = document.querySelectorAll("tr.transaction_list");
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

  const injectSatisfactionCells = (row, satisfactionMaps, onChange) => {
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

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 初期化処理を一括で行うため許容
  const init = async () => {
    const settings = await loadSettings();
    const labelEnabled =
      settings?.featureFlags?.subscriptionLabelEnabled ?? true;
    if (!labelEnabled) {
      removeLabelUi();
      return;
    }
    ensureLabelHeader();
    const rows = document.querySelectorAll("tr.transaction_list");
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

    if (isDev && missingMemo > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[mf-sub] memo cell not found in ${missingMemo} row(s)`);
    }
  };

  const runSatisfaction = async () => {
    const settings = await loadSettings();
    const enabled = settings?.featureFlags?.satisfactionEnabled ?? true;
    if (!enabled) {
      removeSatisfactionUi();
      return;
    }
    ensureSatisfactionHeader();
    const { satisfactionByTxId, satisfactionByStoreDate } =
      await loadSatisfaction();
    const rows = document.querySelectorAll("tr.transaction_list");
    const handleChange = async ({ txKey, sdKey, select, input }) => {
      const rank = select?.value ?? "";
      const note = input?.value ?? "";
      if (!(txKey || sdKey)) {
        return;
      }
      await saveSatisfaction({ txKey, sdKey, rank, note });
    };
    for (const row of rows) {
      injectSatisfactionCells(
        row,
        { satisfactionByTxId, satisfactionByStoreDate },
        handleChange
      );
    }
  };

  const scheduleInit = (() => {
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

  const listBody =
    document.querySelector("#cf-detail-table tbody.list_body") ??
    document.querySelector("#cf-detail-table tbody") ??
    document.body;
  const observer = new MutationObserver(scheduleInit);
  observer.observe(listBody, { childList: true, subtree: true });

  // Gemini 解析
  const loadSettings = async () => {
    const syncRes = await safeStorageGet("sync", "settings", {});
    if (syncRes?.settings) {
      return syncRes.settings;
    }
    const localRes = await safeStorageGet("local", "settings", {});
    return localRes?.settings ?? {};
  };

  const _getViewMonth = () => {
    const rows = document.querySelectorAll("tr.transaction_list");
    for (const row of rows) {
      const parsed = parseDate(row);
      if (parsed?.length >= 7) {
        return parsed.slice(0, 7);
      }
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  };

  const isMonthProcessed = (month) =>
    sessionStorage.getItem(`${SESSION_FLAG_PREFIX}${month}`) === "true";

  const markMonthProcessed = (month) => {
    sessionStorage.setItem(`${SESSION_FLAG_PREFIX}${month}`, "true");
  };

  const clearSessionFlags = () => {
    const targets = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(SESSION_FLAG_PREFIX)) {
        targets.push(k);
      }
    }
    for (const k of targets) {
      sessionStorage.removeItem(k);
    }
  };

  const overlayIds = {
    overlay: "mf-sub-overlay",
    indicator: "mf-sub-indicator",
  };

  const removeOverlayById = () => {
    const overlay = document.getElementById(overlayIds.overlay);
    if (overlay) {
      overlay.remove();
    }
    document.documentElement.style.overflow = "";
  };

  const showProgressOverlay = (totalBatches) => {
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

  const updateProgressOverlay = (current, total, remainingCount, opts = {}) => {
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

  const getProgressText = (current, total, remainingCount, opts) => {
    if (opts.done) {
      return "結果を反映しました";
    }
    const safeRemaining = Math.max(remainingCount, 0);
    return `バッチ ${current}/${total}（残り ${safeRemaining} 件）`;
  };

  const getProgressPercent = (current, total) => {
    const ratio = current / total;
    return Math.min(100, Math.round(ratio * 100));
  };

  const applyStatusIndicators = (card, statusEl, opts) => {
    const isDone = Boolean(opts.done);
    const isError = Boolean(opts.error);
    statusEl.textContent = isDone ? "Gemini解析完了" : "Gemini解析中…";
    card.classList.toggle("mf-sub-indicator--success", isDone);
    card.classList.toggle("mf-sub-indicator--error", isError);
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: DOM収集処理を一括で実行するため許容
  const collectTransactions = () => {
    const rows = document.querySelectorAll("tr.transaction_list");
    const txList = [];
    for (const row of rows) {
      const txId = findTxId(row);
      const amount = extractAmount(row);
      const store = extractStore(row);
      const date = parseDate(row);
      const isIncome = getIsIncome(row);
      const isTarget = getIsTarget(row);
      const category = row.querySelector(".v_l_ctg")?.textContent?.trim() ?? "";
      const subcategory =
        row.querySelector(".v_m_ctg")?.textContent?.trim() ?? "";
      const memo =
        row.querySelector("td.memo .noform span")?.textContent?.trim() ?? "";
      const paymentSource =
        row.querySelector("td.note")?.textContent?.trim() ?? "";
      const labelText = `${category}${subcategory}` || "";
      const excluded = EXCLUDE_KEYWORDS.some((kw) => labelText.includes(kw));
      if (!txId || amount === null || amount === undefined) {
        continue;
      }
      if (!isTarget) {
        continue;
      }
      if (isIncome) {
        continue;
      }
      if (!isNegativeAmount(row)) {
        continue;
      }
      if (excluded) {
        continue;
      }
      txList.push({
        id: txId,
        date,
        store,
        amount,
        category,
        subcategory,
        memo,
        payment_source: paymentSource,
      });
    }
    return txList;
  };

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

  const clearDuplicateHighlight = () => {
    const rows = document.querySelectorAll("tr.transaction_list");
    for (const row of rows) {
      row.classList.remove(DUPLICATE_CLASS);
      if (row.title === "同日・同内容・同額の取引が複数あります") {
        row.removeAttribute("title");
      }
    }
  };

  const applyDuplicateHighlight = (duplicateTxIds) => {
    const rows = document.querySelectorAll("tr.transaction_list");
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

  const clearCategoryAlert = (row) => {
    row.classList.remove(CATEGORY_ALERT_ROW_CLASS);
    const categoryCell = row.querySelector(".v_l_ctg");
    const subcategoryCell = row.querySelector(".v_m_ctg");
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
    const category = row.querySelector(".v_l_ctg")?.textContent?.trim() ?? "";
    const subcategory =
      row.querySelector(".v_m_ctg")?.textContent?.trim() ?? "";
    return { category, subcategory };
  };

  const setCategoryAlert = (row, violation) => {
    row.classList.add(CATEGORY_ALERT_ROW_CLASS);
    const categoryCell = row.querySelector(".v_l_ctg");
    const subcategoryCell = row.querySelector(".v_m_ctg");
    categoryCell?.classList.add(CATEGORY_ALERT_CELL_CLASS);
    subcategoryCell?.classList.add(CATEGORY_ALERT_CELL_CLASS);
    const reasonText =
      violation?.violation === "whitelist_miss"
        ? "カテゴリ組み合わせがホワイトリストに登録されていません"
        : "カテゴリ組み合わせがブラックリストに登録されています";
    row.title = reasonText;
  };

  const applyCategoryAlert = (sets) => {
    const rows = document.querySelectorAll("tr.transaction_list");
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

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ハイライト処理を一括で実行するため許容
  const applyGeminiHighlight = (results, threshold) => {
    const rows = document.querySelectorAll("tr.transaction_list");
    const scoreMap = new Map();
    if (Array.isArray(results)) {
      for (const item of results) {
        if (!item?.id) {
          continue;
        }
        scoreMap.set(item.id, item.score ?? 0);
      }
    }
    for (const row of rows) {
      const txId = findTxId(row);
      const score = scoreMap.get(txId);
      if (typeof score === "number" && score >= threshold) {
        row.classList.add(HIGHLIGHT_CLASS);
      }
    }
  };

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

  const runCategoryRuleAlert = async () => {
    const settings = await loadSettings();
    const enabled = settings.featureFlags?.categoryRuleAlertEnabled ?? true;
    if (!enabled) {
      const rows = document.querySelectorAll("tr.transaction_list");
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
      const rows = document.querySelectorAll("tr.transaction_list");
      for (const row of rows) {
        clearCategoryAlert(row);
      }
      return;
    }
    applyCategoryAlert(sets);
  };

  const runGemini = async () => {
    const settings = await loadSettings();
    const apiKey = settings.geminiApiKey;
    const threshold = settings.scoreThreshold ?? DEFAULT_THRESHOLD;
    const model = settings.model ?? DEFAULT_MODEL;
    const geminiEnabled = settings.featureFlags?.geminiAnalysisEnabled ?? true;

    if (!geminiEnabled) {
      log("skip: gemini disabled by settings");
      return;
    }
    if (!apiKey) {
      log("skip: apiKey missing");
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

    if (isMonthProcessed(month)) {
      log("skip: session flag hit", month);
      return;
    }

    const batchSize = 15;
    const batches = buildBatches(transactions, batchSize);

    const removeOverlay = showProgressOverlay(batches.length);
    const batchResult = await processGeminiBatches({
      batches,
      batchSize,
      threshold,
      month,
      apiKey,
      model,
      transactions,
      onProgress: updateProgressOverlay,
      onError: (idx, errorMessage) => {
        log("gemini batch error", idx, errorMessage);
        setTimeout(() => removeOverlay(), 2000);
      },
    });

    if (batchResult === "error") {
      return;
    }

    updateProgressOverlay(batches.length, batches.length, 0, { done: true });
    markMonthProcessed(month);
    setTimeout(() => removeOverlay(), 1200);
  };

  const buildBatches = (items, size) => {
    if (size <= 0) {
      return [items];
    }
    return Array.from({ length: Math.ceil(items.length / size) }, (_v, idx) =>
      items.slice(idx * size, (idx + 1) * size)
    );
  };

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
        if (response?.ok && response.data?.results) {
          resolve(response.data.results);
        } else {
          reject(new Error(response?.error ?? "unknown"));
        }
      });
    });

  const processGeminiBatches = async ({
    batches,
    batchSize,
    threshold,
    month,
    apiKey,
    model,
    transactions,
    onProgress,
    onError,
  }) => {
    for (let i = 0; i < batches.length; i += 1) {
      onProgress?.(
        i + 1,
        batches.length,
        transactions.length - (i + 1) * batchSize
      );
      const payload = {
        type: "requestGeminiAnalysis",
        apiKey,
        model,
        month,
        transactions: batches[i],
      };
      // eslint-disable-next-line no-await-in-loop
      const result = await sendGeminiBatch(payload).catch((error) => error);
      if (result instanceof Error) {
        onProgress?.(i + 1, batches.length, 0, {
          error: true,
          errorMessage: "Gemini解析に失敗しました",
        });
        onError?.(i + 1, result.message);
        return "error";
      }
      log("gemini ok batch", i + 1, result.length);
      applyGeminiHighlight(result, threshold);
    }
    return "ok";
  };

  // 初回実行 & DOM変化時に実行をデバウンス
  const scheduleRunGemini = (() => {
    let pending = null;
    return () => {
      if (pending) {
        return;
      }
      pending = setTimeout(() => {
        pending = null;
        runGemini();
      }, 200);
    };
  })();

  const scheduleDuplicateCheck = (() => {
    let pending = null;
    return () => {
      if (pending) {
        return;
      }
      pending = setTimeout(() => {
        pending = null;
        runDuplicateCheck();
      }, 200);
    };
  })();

  const scheduleCategoryCheck = (() => {
    let pending = null;
    return () => {
      if (pending) {
        return;
      }
      pending = setTimeout(() => {
        pending = null;
        runCategoryRuleAlert();
      }, 200);
    };
  })();

  const scheduleSatisfaction = (() => {
    let pending = null;
    return () => {
      if (pending) {
        return;
      }
      pending = setTimeout(() => {
        pending = null;
        runSatisfaction();
      }, 200);
    };
  })();

  scheduleInit();
  scheduleSatisfaction();
  scheduleRunGemini();
  scheduleDuplicateCheck();
  scheduleCategoryCheck();

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

  const isSettingsArea = (area) => area === "sync" || area === "local";

  const handleSettingsChange = () => {
    clearSessionFlags();
    log("settings changed; session flag cleared (no auto-run)");
    scheduleDuplicateCheck();
    scheduleCategoryCheck();
  };

  const handleUiPrefsChange = (next) => {
    const nextFeatureEnabled = next?.maskingFeatureEnabled;
    const nextMaskingEnabled = next?.maskingEnabled;

    if (typeof nextFeatureEnabled === "boolean") {
      maskingFeatureEnabled = nextFeatureEnabled;
    }
    if (typeof nextMaskingEnabled === "boolean") {
      maskingEnabled = nextMaskingEnabled;
    }
    maskingPrefsLoaded = true;

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
        handleSettingsChange();
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
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "mf_subs_rerun_gemini") {
        clearSessionFlags();
        runGemini();
      }
    });
  } catch (_e) {
    // コンテキスト無効化時は無視
  }
})();
