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

  const selectClass = "mf-sub-select";
  const injectedFlag = "mfSubInjected";
  const memoSelectorPrimary = "td.memo.form-switch-td";
  const memoSelectorFallback = '[data-title="メモ"]';
  const isDev =
    sessionStorage.getItem("mf_subs_debug") === "true" ||
    (globalThis.chrome?.runtime?.getManifest?.()?.version_name ?? "").includes(
      "dev"
    );
  const HIGHLIGHT_CLASS = "mf-sub-highlight";
  const DUPLICATE_CLASS = "mf-sub-duplicate";
  const SESSION_FLAG_PREFIX = "mf_subs_checked_";
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

  const loadLabels = () =>
    new Promise((resolve) => {
      if (!chrome?.storage?.local) {
        resolve({ labelsByTxId: {}, labelsByStoreAmount: {} });
        return;
      }
      chrome.storage.local.get(
        { labelsByTxId: {}, labelsByStoreAmount: {} },
        (data) => resolve(data)
      );
    });

  const saveLabel = async ({ txKey, storeAmountKey, label }) => {
    const { labelsByTxId, labelsByStoreAmount } = await loadLabels();
    if (label) {
      labelsByTxId[txKey] = label;
      labelsByStoreAmount[storeAmountKey] = label;
    } else {
      delete labelsByTxId[txKey];
      delete labelsByStoreAmount[storeAmountKey];
    }
    await new Promise((resolve) => {
      if (!chrome?.storage?.local) {
        resolve();
        return;
      }
      chrome.storage.local.set(
        {
          labelsByTxId,
          labelsByStoreAmount,
        },
        resolve
      );
    });
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

  const isNegativeAmount = (row) => {
    const cell = findAmountCell(row);
    const text =
      cell?.querySelector(".offset")?.textContent ?? cell?.textContent ?? "";
    const trimmed = text?.trim() ?? "";
    return NEGATIVE_HEAD_REGEX.test(trimmed);
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
    const memoCell =
      row.querySelector(memoSelectorPrimary) ??
      row.querySelector(memoSelectorFallback);
    if (!memoCell) {
      return;
    }
    if (
      memoCell.dataset[injectedFlag] === "1" &&
      memoCell.querySelector(`.${selectClass}`)
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
    memoCell.append(wrapper);
    memoCell.dataset[injectedFlag] = "1";
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 初期化処理を一括で行うため許容
  const init = async () => {
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
      const memoCell =
        row.querySelector(memoSelectorPrimary) ??
        row.querySelector(memoSelectorFallback);
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

  const scheduleInit = (() => {
    let pending = false;
    return () => {
      if (pending) {
        return;
      }
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        init();
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
  const loadSettings = () =>
    new Promise((resolve) => {
      if (!chrome?.storage) {
        resolve({});
        return;
      }
      chrome.storage.sync.get("settings", (res) => {
        const syncSettings = res?.settings;
        if (syncSettings) {
          resolve(syncSettings);
          return;
        }
        chrome.storage.local.get("settings", (localRes) => {
          resolve(localRes?.settings ?? {});
        });
      });
    });

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

  scheduleInit();
  scheduleRunGemini();
  scheduleDuplicateCheck();

  const geminiObserver = new MutationObserver(() => scheduleRunGemini());
  geminiObserver.observe(listBody, { childList: true, subtree: true });

  const duplicateObserver = new MutationObserver(() =>
    scheduleDuplicateCheck()
  );
  duplicateObserver.observe(listBody, { childList: true, subtree: true });

  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area === "sync" || area === "local") && changes.settings) {
      clearSessionFlags();
      log("settings changed; session flag cleared (no auto-run)");
      scheduleDuplicateCheck();
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "mf_subs_rerun_gemini") {
      clearSessionFlags();
      runGemini();
    }
  });
})();
