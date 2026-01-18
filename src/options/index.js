import {
  buildRuleKey,
  MAX_CATEGORY_RULES,
  normalizeCategory,
} from "../data/category-rules.js";
import { loadSettings, saveSettingsWithFallback } from "../data/storage.js";
import {
  DEFAULT_UI_PREFS,
  loadUiPrefs,
  saveUiPrefsPatch,
} from "../data/ui-prefs.js";

// 画面上の参照要素をまとめて取得しておく。
const apiKeyInput = document.getElementById("apiKey");
const toggleApiKey = document.getElementById("toggleApiKey");
const thresholdInput = document.getElementById("threshold");
const modelSelect = document.getElementById("model");
const customModelWrapper = document.getElementById("customModelWrapper");
const customModelInput = document.getElementById("customModelInput");
const customModelError = document.getElementById("customModelError");
const statusEl = document.getElementById("status");
const saveBtn = document.getElementById("saveBtn");
const apiKeyErrorEl = document.getElementById("apiKeyError");
const thresholdErrorEl = document.getElementById("thresholdError");
const geminiToggle = document.getElementById("geminiToggle");
const duplicateToggle = document.getElementById("duplicateToggle");
const downloaderToggle = document.getElementById("downloaderToggle");
const categoryToggle = document.getElementById("categoryRuleToggle");
const satisfactionToggle = document.getElementById("satisfactionToggle");
const subscriptionLabelToggle = document.getElementById(
  "subscriptionLabelToggle"
);
const maskingToggle = document.getElementById("maskingToggle");
const largeCategoryOrderToggle = document.getElementById(
  "largeCategoryOrderToggle"
);
const largeCategoryOrderResetBtn = document.getElementById(
  "largeCategoryOrderResetBtn"
);
const largeCategoryOrderResetConfirm = document.getElementById(
  "largeCategoryOrderResetConfirm"
);
const largeCategoryOrderResetCancel = document.getElementById(
  "largeCategoryOrderResetCancel"
);
const largeCategoryOrderResetConfirmBtn = document.getElementById(
  "largeCategoryOrderResetConfirmBtn"
);
const categoryTabWhitelist = document.getElementById("categoryTabWhitelist");
const categoryTabBlacklist = document.getElementById("categoryTabBlacklist");
const categoryList = document.getElementById("categoryList");
const categoryLargeInput = document.getElementById("categoryLargeInput");
const categoryMiddleInput = document.getElementById("categoryMiddleInput");
const categoryAddBtn = document.getElementById("categoryAddBtn");
const categoryError = document.getElementById("categoryError");
const categoryExportBtn = document.getElementById("categoryExportBtn");
const categoryImportBtn = document.getElementById("categoryImportBtn");
const categoryImportInput = document.getElementById("categoryImportInput");

// モデル/閾値などの初期値・選択肢はここで集中管理する。
const CUSTOM_MODEL_VALUE = "__custom__";
const DEFAULT_THRESHOLD = 70;
const DEFAULT_MODEL = "gemini-2.5-flash";
const MODEL_OPTIONS = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash（推奨・高速）" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro（高精度）" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite（軽量）" },
  { value: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview（検証向け）" },
  {
    value: "gemini-3-pro-image-preview",
    label: "Gemini 3 Pro Image Preview（画像対応検証）",
  },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash（互換）" },
  {
    value: "gemini-2.0-flash-lite",
    label: "Gemini 2.0 Flash-Lite（互換軽量）",
  },
  {
    value: "gemini-2.0-pro-exp-02-05",
    label: "Gemini 2.0 Pro Experimental（旧検証）",
  },
  { value: "gemini-1.5-pro-latest", label: "Gemini 1.5 Pro（互換用）" },
  { value: "gemini-1.5-flash-latest", label: "Gemini 1.5 Flash（互換用）" },
];

// CSVインポート/エクスポート関連の制約。
const MAX_IMPORT_BYTES = 200 * 1024;
const CSV_HEADER = ["mode", "large", "middle"];
const CSV_NEEDS_QUOTE_REGEX = /[",\n]/;

let categoryRules = { whitelist: [], blacklist: [] };
let currentCategoryTab = "whitelist";

// 画面右上のステータス表示を統一的に更新する。
const renderStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b00020" : "#00695c";
};

// カスタムモデル入力欄の表示/非表示を切り替える。
const toggleCustomModel = (value) => {
  const isCustom = value === CUSTOM_MODEL_VALUE;
  customModelWrapper.classList.toggle("hidden", !isCustom);
};

// APIキーの表示/非表示はtype属性で切り替える。
toggleApiKey?.addEventListener("change", () => {
  apiKeyInput.type = toggleApiKey.checked ? "text" : "password";
});

// バリデーション時の表示は毎回リセットする。
const clearErrors = () => {
  apiKeyErrorEl.textContent = "";
  thresholdErrorEl.textContent = "";
  customModelError.textContent = "";
};

// 保存ボタンの活性/非活性とエラーメッセージをまとめて制御する。
const validate = () => {
  // 入力チェックは即時に行い、保存ボタンの誤操作を防ぐ。
  clearErrors();
  let valid = true;

  // APIキーは空欄不可。保存直前に空欄なら即エラーにする。
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    apiKeyErrorEl.textContent = "APIキーを入力してください。";
    valid = false;
  }

  // 閾値は整数のみ受け付ける（Geminiスコアの仕様に合わせる）。
  const thresholdRaw = thresholdInput.value;
  const threshold = Number(thresholdRaw);
  const isInteger = Number.isInteger(threshold);
  if (
    thresholdRaw === "" ||
    Number.isNaN(threshold) ||
    !isInteger ||
    threshold < 0 ||
    threshold > 100
  ) {
    thresholdErrorEl.textContent = "0〜100の整数を入力してください。";
    valid = false;
  }

  // カスタムモデルは入力必須のため、個別に検証する。
  const modelValue = modelSelect.value;
  if (modelValue === CUSTOM_MODEL_VALUE) {
    const customValue = customModelInput.value.trim();
    if (!customValue) {
      customModelError.textContent = "カスタムモデルIDを入力してください。";
      valid = false;
    }
  }

  // ここでボタン活性を切り替え、状態と整合させる。
  saveBtn.disabled = !valid;
  const resolvedModel =
    modelValue === CUSTOM_MODEL_VALUE
      ? customModelInput.value.trim()
      : modelValue;
  const geminiEnabled = geminiToggle?.checked ?? true;
  const duplicateEnabled = duplicateToggle?.checked ?? true;
  const downloaderEnabled = downloaderToggle?.checked ?? true;
  const categoryEnabled = categoryToggle?.checked ?? true;
  const satisfactionEnabled = satisfactionToggle?.checked ?? true;
  const subscriptionLabelEnabled = subscriptionLabelToggle?.checked ?? true;
  return {
    valid,
    apiKey,
    threshold,
    model: resolvedModel,
    geminiEnabled,
    duplicateEnabled,
    downloaderEnabled,
    categoryEnabled,
    satisfactionEnabled,
    subscriptionLabelEnabled,
  };
};

// UI状態と保存済み設定を踏まえた最終モデルIDを解決する。
const resolveModelValue = (loadedModel) => {
  const modelValue = modelSelect.value;
  if (modelValue === CUSTOM_MODEL_VALUE) {
    const customValue = customModelInput.value.trim();
    if (customValue) {
      return customValue;
    }
    if (loadedModel) {
      return loadedModel;
    }
    return DEFAULT_MODEL;
  }
  return modelValue || loadedModel || DEFAULT_MODEL;
};

// 設定のトグル値をUIに反映する。
const applyFeatureToggles = (settings) => {
  const geminiEnabled = settings.featureFlags?.geminiAnalysisEnabled ?? true;
  const duplicateEnabled = settings.featureFlags?.duplicateCheckEnabled ?? true;
  const downloaderEnabled =
    settings.featureFlags?.downloaderContextMenuEnabled ?? true;
  const categoryEnabled =
    settings.featureFlags?.categoryRuleAlertEnabled ?? true;
  const satisfactionEnabled =
    settings.featureFlags?.satisfactionEnabled ?? true;
  const subscriptionLabelEnabled =
    settings.featureFlags?.subscriptionLabelEnabled ?? true;

  if (geminiToggle) {
    geminiToggle.checked = geminiEnabled;
  }
  if (duplicateToggle) {
    duplicateToggle.checked = duplicateEnabled;
  }
  if (downloaderToggle) {
    downloaderToggle.checked = downloaderEnabled;
  }
  if (categoryToggle) {
    categoryToggle.checked = categoryEnabled;
  }
  if (satisfactionToggle) {
    satisfactionToggle.checked = satisfactionEnabled;
  }
  if (subscriptionLabelToggle) {
    subscriptionLabelToggle.checked = subscriptionLabelEnabled;
  }
  if (largeCategoryOrderToggle) {
    largeCategoryOrderToggle.checked =
      settings.largeCategoryOrderEnabled ?? true;
  }
};

// UI用の軽量設定（画面マスク等）を反映する。
const applyUiPrefs = (prefs) => {
  const maskingFeatureEnabled =
    prefs?.maskingFeatureEnabled ?? DEFAULT_UI_PREFS.maskingFeatureEnabled;
  if (maskingToggle) {
    maskingToggle.checked = maskingFeatureEnabled;
  }
};

// ルール一覧はタブの状態も含めてまとめて更新する。
const applyCategoryRules = (settings) => {
  categoryRules = {
    whitelist: settings.categoryRules?.whitelist ?? [],
    blacklist: settings.categoryRules?.blacklist ?? [],
  };
  renderCategoryTab(currentCategoryTab);
};

// 入力中の値と保存済み設定を合成して保存用スナップショットを作る。
const buildSettingsSnapshot = ({
  geminiEnabled,
  duplicateEnabled,
  downloaderEnabled,
  categoryEnabled,
  satisfactionEnabled,
  subscriptionLabelEnabled,
  largeCategoryOrderEnabled,
  loadedSettings = {},
}) => {
  // 入力欄が空でも、保存済み値があればそれを使う。
  const apiKeyFallback = loadedSettings.geminiApiKey ?? "";
  const thresholdFallback =
    typeof loadedSettings.scoreThreshold === "number"
      ? loadedSettings.scoreThreshold
      : DEFAULT_THRESHOLD;

  // 型変換に失敗しても既存値へフォールバックする。
  const thresholdRaw = thresholdInput.value;
  const thresholdNumber = Number(thresholdRaw);
  const threshold = Number.isFinite(thresholdNumber)
    ? thresholdNumber
    : thresholdFallback;

  const resolvedModel = resolveModelValue(loadedSettings.model);

  // ルールは現在のUI状態を優先する。
  const resolvedCategoryRules = {
    whitelist: categoryRules.whitelist ?? [],
    blacklist: categoryRules.blacklist ?? [],
  };
  const resolvedLargeCategoryOrderEnabled =
    typeof largeCategoryOrderEnabled === "boolean"
      ? largeCategoryOrderEnabled
      : (loadedSettings.largeCategoryOrderEnabled ?? true);

  return {
    geminiApiKey: apiKeyInput.value.trim() || apiKeyFallback,
    scoreThreshold: threshold,
    model: resolvedModel,
    featureFlags: {
      geminiAnalysisEnabled: geminiEnabled,
      duplicateCheckEnabled: duplicateEnabled,
      downloaderContextMenuEnabled: downloaderEnabled,
      categoryRuleAlertEnabled: categoryEnabled,
      satisfactionEnabled,
      subscriptionLabelEnabled,
    },
    categoryRules: resolvedCategoryRules,
    largeCategoryOrder: loadedSettings.largeCategoryOrder ?? null,
    largeCategoryOrderEnabled: resolvedLargeCategoryOrderEnabled,
  };
};

// 並び替えUIの表示状態を設定に合わせる。
const applyLargeCategoryOrderUi = (settings) => {
  if (largeCategoryOrderToggle) {
    largeCategoryOrderToggle.checked =
      settings.largeCategoryOrderEnabled ?? true;
  }
  if (largeCategoryOrderResetBtn) {
    largeCategoryOrderResetBtn.disabled = !settings.largeCategoryOrder;
  }
  if (largeCategoryOrderResetConfirm) {
    largeCategoryOrderResetConfirm.classList.add("hidden");
  }
};

// カテゴリ入力用のエラーメッセージを表示/非表示する。
const setCategoryError = (message) => {
  if (!categoryError) {
    return;
  }
  categoryError.textContent = message;
  categoryError.style.display = message ? "block" : "none";
};

// CSVは依存を増やさず最小実装で解析する（ダブルクォート対応）。
const parseCsv = (text) => {
  // 簡易CSVパーサーで依存を増やさない方針。
  const rows = [];
  let current = [];
  let field = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i += 1) {
    // ダブルクォート内はカンマ/改行をそのまま値として扱う。
    const ch = text[i];
    const next = text[i + 1];
    if (inQuote) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuote = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === ",") {
      current.push(field);
      field = "";
    } else if (ch === "\r") {
      // skip
    } else if (ch === "\n") {
      current.push(field);
      rows.push(current);
      current = [];
      field = "";
    } else {
      field += ch;
    }
  }
  current.push(field);
  rows.push(current);
  return rows;
};

// ExcelなどのBOM付きCSVを吸収するための処理。
const stripBom = (text) =>
  text.charCodeAt(0) === 0xfe_ff ? text.slice(1) : text;

// CSVの1行を正しくエスケープして出力する。
const buildCsvLine = (values) =>
  values
    .map((v) => {
      const safe = `${v ?? ""}`;
      if (CSV_NEEDS_QUOTE_REGEX.test(safe)) {
        return `"${safe.replace(/"/g, '""')}"`;
      }
      return safe;
    })
    .join(",");

// ルール一覧をCSV文字列に変換する。
const buildCategoryCsv = (rules) => {
  const lines = [buildCsvLine(CSV_HEADER)];
  const pushMode = (mode, list = []) => {
    for (const item of list) {
      lines.push(buildCsvLine([mode, item.large ?? "", item.middle ?? ""]));
    }
  };
  pushMode("whitelist", rules.whitelist);
  pushMode("blacklist", rules.blacklist);
  return lines.join("\n");
};

// CSVを取り込み、既存ルールへマージする（重複は上書き）。
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 入力検証とマージを一括で実施
const applyImportedRules = ({ rows }) => {
  // 取り込みは重複上書き、空行は無視の方針で統一。
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("CSVにデータがありません");
  }
  const [header, ...data] = rows;
  if (header.length < 3) {
    throw new Error("ヘッダ行が不正です");
  }
  const normalizedHeader = header.map((h) => h?.trim?.().toLowerCase?.());
  if (
    normalizedHeader[0] !== "mode" ||
    normalizedHeader[1] !== "large" ||
    normalizedHeader[2] !== "middle"
  ) {
    throw new Error("ヘッダは mode,large,middle である必要があります");
  }

  // 既存ルールをMap化して上書きしやすくする。
  const mapWhitelist = new Map(
    (categoryRules.whitelist ?? []).map((item) => [
      buildRuleKey(item),
      { ...item },
    ])
  );
  const mapBlacklist = new Map(
    (categoryRules.blacklist ?? []).map((item) => [
      buildRuleKey(item),
      { ...item },
    ])
  );

  let added = 0;
  let updated = 0;

  for (const row of data) {
    // 空行は飛ばし、必要列が欠けていたら即エラーで中断する。
    if (!row || row.length === 0 || row.every((c) => !(c && `${c}`.trim()))) {
      continue;
    }
    const [modeRaw, largeRaw, middleRaw] = row;
    const mode = modeRaw?.trim?.().toLowerCase?.();
    const largeDisplay = largeRaw?.trim?.() ?? "";
    const middleDisplay = middleRaw?.trim?.() ?? "";
    const large = normalizeCategory(largeDisplay);
    const middle = normalizeCategory(middleDisplay);
    if (!(mode && large && middle)) {
      throw new Error("mode/large/middle のいずれかが空です");
    }
    if (mode !== "whitelist" && mode !== "blacklist") {
      throw new Error(`mode が不正です: ${modeRaw}`);
    }
    const key = buildRuleKey({ large, middle });
    const targetMap = mode === "whitelist" ? mapWhitelist : mapBlacklist;
    if (targetMap.has(key)) {
      updated += 1;
    } else {
      added += 1;
    }
    targetMap.set(key, { large: largeDisplay, middle: middleDisplay });
  }

  // Mapから配列に戻してUI/保存形式に揃える。
  const mergedWhitelist = [...mapWhitelist.values()];
  const mergedBlacklist = [...mapBlacklist.values()];
  const totalCount = mergedWhitelist.length + mergedBlacklist.length;
  if (totalCount > MAX_CATEGORY_RULES) {
    throw new Error(
      `ルール数が上限 (${MAX_CATEGORY_RULES} 件) を超えました: ${totalCount} 件`
    );
  }

  categoryRules = { whitelist: mergedWhitelist, blacklist: mergedBlacklist };
  renderCategoryList();
  return { added, updated, total: totalCount };
};
// タブ切り替え時に表示対象を更新する。
const renderCategoryTab = (tab) => {
  currentCategoryTab = tab;
  const isWhitelist = tab === "whitelist";
  categoryTabWhitelist?.classList.toggle("is-active", isWhitelist);
  categoryTabBlacklist?.classList.toggle("is-active", !isWhitelist);
  renderCategoryList();
};

// 現在のタブに応じたルール一覧を描画する。
const renderCategoryList = () => {
  if (!categoryList) {
    return;
  }
  categoryList.innerHTML = "";
  const list = categoryRules[currentCategoryTab] ?? [];
  if (!list.length) {
    const empty = document.createElement("li");
    empty.className = "category-list__empty";
    empty.textContent = "ルールはまだありません";
    categoryList.append(empty);
    return;
  }
  list.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "category-list__item";
    const label = document.createElement("span");
    label.textContent = `${item.large} - ${item.middle}`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ghost danger";
    btn.textContent = "削除";
    btn.addEventListener("click", async () => {
      categoryRules[currentCategoryTab].splice(index, 1);
      renderCategoryList();
      try {
        await persistCategoryRules();
      } catch (error) {
        renderStatus(`ルール保存に失敗しました: ${error.message}`, true);
      }
    });
    li.append(label, btn);
    categoryList.append(li);
  });
};

// カテゴリルールの保存は個別トグルと同様に即時反映する。
const persistCategoryRules = async () => {
  // ルール保存はトグル保存と同様に即時反映する。
  const loaded = await loadSettings();
  const baseSettings = loaded?.settings ?? {
    geminiApiKey: apiKeyInput.value.trim(),
    scoreThreshold: Number.isFinite(Number(thresholdInput.value))
      ? Number(thresholdInput.value)
      : DEFAULT_THRESHOLD,
    model: resolveModelValue(),
    featureFlags: {
      geminiAnalysisEnabled: geminiToggle?.checked ?? true,
      duplicateCheckEnabled: duplicateToggle?.checked ?? true,
      downloaderContextMenuEnabled: downloaderToggle?.checked ?? true,
      categoryRuleAlertEnabled: categoryToggle?.checked ?? true,
      satisfactionEnabled: satisfactionToggle?.checked ?? true,
      subscriptionLabelEnabled: subscriptionLabelToggle?.checked ?? true,
    },
  };
  const snapshot = {
    ...baseSettings,
    categoryRules: {
      whitelist: categoryRules.whitelist ?? [],
      blacklist: categoryRules.blacklist ?? [],
    },
  };
  const result = await saveSettingsWithFallback(snapshot);
  const areaLabel = result.area === "sync" ? "sync" : "local";
  let reason = "";
  if (result.reason === "sync_threshold") {
    reason = "（sync容量超過のためローカル保存）";
  } else if (result.reason === "sync_error") {
    reason = "（sync書き込みエラーのためローカル保存）";
  }
  renderStatus(`ルールを保存しました: ${areaLabel}${reason}`);
};

// ルール追加は正規化→重複判定→保存までを一括で行う。
const addCategoryRule = async () => {
  setCategoryError("");
  const largeRaw = categoryLargeInput?.value ?? "";
  const middleRaw = categoryMiddleInput?.value ?? "";
  const largeDisplay = largeRaw.trim();
  const middleDisplay = middleRaw.trim();
  const large = normalizeCategory(largeDisplay);
  const middle = normalizeCategory(middleDisplay);
  if (!(large && middle)) {
    setCategoryError("大項目と中項目を入力してください。");
    return;
  }
  const key = buildRuleKey({ large, middle });
  const list = categoryRules[currentCategoryTab] ?? [];
  const isDuplicate = list.some((item) => buildRuleKey(item) === key);
  if (isDuplicate) {
    setCategoryError("既に登録されています。");
    return;
  }
  const totalCount =
    (categoryRules.whitelist?.length ?? 0) +
    (categoryRules.blacklist?.length ?? 0);
  if (totalCount >= MAX_CATEGORY_RULES) {
    setCategoryError(`登録できるルールは最大 ${MAX_CATEGORY_RULES} 件です。`);
    return;
  }
  list.push({ large: largeDisplay, middle: middleDisplay });
  categoryRules[currentCategoryTab] = list;
  renderCategoryList();
  try {
    await persistCategoryRules();
  } catch (error) {
    renderStatus(`ルール保存に失敗しました: ${error.message}`, true);
  }
};

// ブラウザ標準のダウンロードでCSVをエクスポートする。
const exportCategoryRules = () => {
  // URL.createObjectURLは必ずrevokeしてメモリリークを防ぐ。
  try {
    const csv = buildCategoryCsv(categoryRules);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "category_rules.csv";
    a.click();
    URL.revokeObjectURL(url);
    renderStatus("ルールをエクスポートしました");
  } catch (error) {
    renderStatus(`エクスポートに失敗しました: ${error.message}`, true);
  }
};

// CSVインポートの読み込み/検証/保存をひとつのPromiseで扱う。
const handleImportFile = (file) =>
  new Promise((resolve, reject) => {
    // ファイル選択やサイズ制限はここでチェックして早期に返す。
    if (!file) {
      reject(new Error("ファイルが選択されていません"));
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      reject(
        new Error("ファイルサイズが大きすぎます（200KB以下にしてください）")
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = stripBom(reader.result ?? "");
        const rows = parseCsv(text);
        const result = applyImportedRules({ rows });
        persistCategoryRules()
          .then(() => {
            renderStatus(
              `インポート完了: 追加 ${result.added} 件 / 上書き ${result.updated} 件（合計 ${result.total} 件）`
            );
            resolve();
          })
          .catch((error) => {
            renderStatus(`保存に失敗しました: ${error.message}`, true);
            reject(error);
          });
      } catch (error) {
        renderStatus(`インポートに失敗しました: ${error.message}`, true);
        reject(error);
      }
    };
    reader.onerror = () =>
      reject(new Error("ファイルの読み込みに失敗しました"));
    reader.readAsText(file, "utf-8");
  });

// 保存済み設定をUIに反映する（モデル選択は存在可否で分岐）。
const applySettingsToUi = (settings, area) => {
  // 既存設定に無いモデルはカスタム扱いに切り替える。
  if (settings.geminiApiKey) {
    apiKeyInput.value = settings.geminiApiKey;
  }
  if (typeof settings.scoreThreshold === "number") {
    thresholdInput.value = settings.scoreThreshold;
  }
  if (settings.model) {
    const exists = [...modelSelect.options].some(
      (opt) => opt.value === settings.model
    );
    if (exists) {
      modelSelect.value = settings.model;
      toggleCustomModel(settings.model);
    } else {
      modelSelect.value = CUSTOM_MODEL_VALUE;
      toggleCustomModel(CUSTOM_MODEL_VALUE);
      customModelInput.value = settings.model;
    }
  }
  applyFeatureToggles(settings);
  applyCategoryRules(settings);
  applyLargeCategoryOrderUi(settings);
  renderStatus(`ロード元: ${area === "sync" ? "sync" : "local"}`);
};

// 初期ロードはUI設定→保存設定の順で読み込み、画面状態を整える。
const load = async () => {
  // UI設定→拡張設定の順で読み込むと表示が安定する。
  const prefs = await loadUiPrefs().catch(() => DEFAULT_UI_PREFS);
  applyUiPrefs(prefs);

  const result = await loadSettings();
  if (!result) {
    modelSelect.value = "gemini-2.5-flash";
    if (geminiToggle) {
      geminiToggle.checked = true;
    }
    if (duplicateToggle) {
      duplicateToggle.checked = true;
    }
    if (downloaderToggle) {
      downloaderToggle.checked = true;
    }
    if (categoryToggle) {
      categoryToggle.checked = true;
    }
    if (satisfactionToggle) {
      satisfactionToggle.checked = true;
    }
    if (subscriptionLabelToggle) {
      subscriptionLabelToggle.checked = true;
    }
    if (largeCategoryOrderToggle) {
      largeCategoryOrderToggle.checked = true;
    }
    if (largeCategoryOrderResetBtn) {
      largeCategoryOrderResetBtn.disabled = true;
    }
    if (largeCategoryOrderResetConfirm) {
      largeCategoryOrderResetConfirm.classList.add("hidden");
    }
    renderCategoryTab(currentCategoryTab);
    renderStatus("未保存です。設定を入力してください。");
    validate();
    return;
  }
  const { settings, area } = result;
  applySettingsToUi(settings, area);
  validate();
};
// 保存ボタンはAPIキー/閾値/モデルだけを明示保存する。
const onSave = async () => {
  const {
    valid,
    geminiEnabled,
    duplicateEnabled,
    downloaderEnabled,
    categoryEnabled,
    satisfactionEnabled,
    subscriptionLabelEnabled,
  } = validate();
  if (!valid) {
    return;
  }
  const loaded = await loadSettings();
  const settings = buildSettingsSnapshot({
    geminiEnabled,
    duplicateEnabled,
    downloaderEnabled,
    categoryEnabled,
    satisfactionEnabled,
    subscriptionLabelEnabled,
    largeCategoryOrderEnabled: largeCategoryOrderToggle?.checked ?? true,
    loadedSettings: loaded?.settings ?? {},
  });
  const result = await saveSettingsWithFallback(settings);
  const areaLabel = result.area === "sync" ? "sync" : "local";
  let reason = "";
  if (result.reason === "sync_threshold") {
    reason = "（sync容量超過のためローカル保存）";
  } else if (result.reason === "sync_error") {
    reason = "（sync書き込みエラーのためローカル保存）";
  }
  renderStatus(`保存しました: ${areaLabel}${reason}`);
};

// 以降はUIイベントの配線（設定変更は即時保存）。
saveBtn.addEventListener("click", () => {
  onSave().catch((error) =>
    renderStatus(`保存に失敗しました: ${error.message}`, true)
  );
});

for (const el of [apiKeyInput, thresholdInput, modelSelect, customModelInput]) {
  el.addEventListener("input", validate);
  el.addEventListener("change", validate);
}

categoryTabWhitelist?.addEventListener("click", () => {
  renderCategoryTab("whitelist");
});

categoryTabBlacklist?.addEventListener("click", () => {
  renderCategoryTab("blacklist");
});

categoryAddBtn?.addEventListener("click", () => {
  addCategoryRule();
});

categoryLargeInput?.addEventListener("input", () => setCategoryError(""));
categoryMiddleInput?.addEventListener("input", () => setCategoryError(""));

categoryExportBtn?.addEventListener("click", () => exportCategoryRules());

categoryImportBtn?.addEventListener("click", () => {
  if (categoryImportInput) {
    categoryImportInput.value = "";
    categoryImportInput.click();
  }
});

categoryImportInput?.addEventListener("change", (event) => {
  const file = event.target?.files?.[0];
  handleImportFile(file).catch(() => {
    // already reported in handleImportFile
  });
});

if (geminiToggle) {
  geminiToggle.addEventListener("change", () => {
    validate();
    saveFeatureToggle({
      geminiEnabled: geminiToggle.checked,
      duplicateEnabled: duplicateToggle?.checked ?? true,
      downloaderEnabled: downloaderToggle?.checked ?? true,
      categoryEnabled: categoryToggle?.checked ?? true,
      satisfactionEnabled: satisfactionToggle?.checked ?? true,
      subscriptionLabelEnabled: subscriptionLabelToggle?.checked ?? true,
      largeCategoryOrderEnabled: largeCategoryOrderToggle?.checked ?? true,
    }).catch((error) =>
      renderStatus(`保存に失敗しました: ${error.message}`, true)
    );
  });
}

if (maskingToggle) {
  maskingToggle.addEventListener("change", () => {
    saveUiPrefsPatch({ maskingFeatureEnabled: maskingToggle.checked }).then(
      () => renderStatus("画面マスキング設定を保存しました。"),
      (error) => renderStatus(`保存に失敗しました: ${error.message}`, true)
    );
  });
}

if (duplicateToggle) {
  duplicateToggle.addEventListener("change", () => {
    validate();
    saveFeatureToggle({
      geminiEnabled: geminiToggle?.checked ?? true,
      duplicateEnabled: duplicateToggle.checked,
      downloaderEnabled: downloaderToggle?.checked ?? true,
      categoryEnabled: categoryToggle?.checked ?? true,
      satisfactionEnabled: satisfactionToggle?.checked ?? true,
      subscriptionLabelEnabled: subscriptionLabelToggle?.checked ?? true,
      largeCategoryOrderEnabled: largeCategoryOrderToggle?.checked ?? true,
    }).catch((error) =>
      renderStatus(`保存に失敗しました: ${error.message}`, true)
    );
  });
}

if (downloaderToggle) {
  downloaderToggle.addEventListener("change", () => {
    validate();
    saveFeatureToggle({
      geminiEnabled: geminiToggle?.checked ?? true,
      duplicateEnabled: duplicateToggle?.checked ?? true,
      downloaderEnabled: downloaderToggle.checked,
      categoryEnabled: categoryToggle?.checked ?? true,
      satisfactionEnabled: satisfactionToggle?.checked ?? true,
      subscriptionLabelEnabled: subscriptionLabelToggle?.checked ?? true,
      largeCategoryOrderEnabled: largeCategoryOrderToggle?.checked ?? true,
    }).catch((error) =>
      renderStatus(`保存に失敗しました: ${error.message}`, true)
    );
  });
}

if (categoryToggle) {
  categoryToggle.addEventListener("change", () => {
    validate();
    saveFeatureToggle({
      geminiEnabled: geminiToggle?.checked ?? true,
      duplicateEnabled: duplicateToggle?.checked ?? true,
      downloaderEnabled: downloaderToggle?.checked ?? true,
      categoryEnabled: categoryToggle.checked,
      satisfactionEnabled: satisfactionToggle?.checked ?? true,
      subscriptionLabelEnabled: subscriptionLabelToggle?.checked ?? true,
      largeCategoryOrderEnabled: largeCategoryOrderToggle?.checked ?? true,
    }).catch((error) =>
      renderStatus(`保存に失敗しました: ${error.message}`, true)
    );
  });
}

if (satisfactionToggle) {
  satisfactionToggle.addEventListener("change", () => {
    validate();
    saveFeatureToggle({
      geminiEnabled: geminiToggle?.checked ?? true,
      duplicateEnabled: duplicateToggle?.checked ?? true,
      downloaderEnabled: downloaderToggle?.checked ?? true,
      categoryEnabled: categoryToggle?.checked ?? true,
      satisfactionEnabled: satisfactionToggle.checked,
      subscriptionLabelEnabled: subscriptionLabelToggle?.checked ?? true,
      largeCategoryOrderEnabled: largeCategoryOrderToggle?.checked ?? true,
    }).catch((error) =>
      renderStatus(`保存に失敗しました: ${error.message}`, true)
    );
  });
}

if (subscriptionLabelToggle) {
  subscriptionLabelToggle.addEventListener("change", () => {
    validate();
    saveFeatureToggle({
      geminiEnabled: geminiToggle?.checked ?? true,
      duplicateEnabled: duplicateToggle?.checked ?? true,
      downloaderEnabled: downloaderToggle?.checked ?? true,
      categoryEnabled: categoryToggle?.checked ?? true,
      satisfactionEnabled: satisfactionToggle?.checked ?? true,
      subscriptionLabelEnabled: subscriptionLabelToggle.checked,
      largeCategoryOrderEnabled: largeCategoryOrderToggle?.checked ?? true,
    }).catch((error) =>
      renderStatus(`保存に失敗しました: ${error.message}`, true)
    );
  });
}

if (largeCategoryOrderToggle) {
  largeCategoryOrderToggle.addEventListener("change", () => {
    saveFeatureToggle({
      geminiEnabled: geminiToggle?.checked ?? true,
      duplicateEnabled: duplicateToggle?.checked ?? true,
      downloaderEnabled: downloaderToggle?.checked ?? true,
      categoryEnabled: categoryToggle?.checked ?? true,
      satisfactionEnabled: satisfactionToggle?.checked ?? true,
      subscriptionLabelEnabled: subscriptionLabelToggle?.checked ?? true,
      largeCategoryOrderEnabled: largeCategoryOrderToggle.checked,
    }).catch((error) =>
      renderStatus(`保存に失敗しました: ${error.message}`, true)
    );
  });
}

const runLargeCategoryOrderReset = async () => {
  try {
    const loaded = await loadSettings();
    const snapshot = buildSettingsSnapshot({
      geminiEnabled: geminiToggle?.checked ?? true,
      duplicateEnabled: duplicateToggle?.checked ?? true,
      downloaderEnabled: downloaderToggle?.checked ?? true,
      categoryEnabled: categoryToggle?.checked ?? true,
      satisfactionEnabled: satisfactionToggle?.checked ?? true,
      subscriptionLabelEnabled: subscriptionLabelToggle?.checked ?? true,
      largeCategoryOrderEnabled: largeCategoryOrderToggle?.checked ?? true,
      loadedSettings: {
        ...(loaded?.settings ?? {}),
        largeCategoryOrder: null,
      },
    });
    const result = await saveSettingsWithFallback(snapshot);
    const areaLabel = result.area === "sync" ? "sync" : "local";
    let reason = "";
    if (result.reason === "sync_threshold") {
      reason = "（sync容量超過のためローカル保存）";
    } else if (result.reason === "sync_error") {
      reason = "（sync書き込みエラーのためローカル保存）";
    }
    if (largeCategoryOrderResetBtn) {
      largeCategoryOrderResetBtn.disabled = true;
    }
    if (largeCategoryOrderResetConfirm) {
      largeCategoryOrderResetConfirm.classList.add("hidden");
    }
    renderStatus(`並び順をリセットしました: ${areaLabel}${reason}`);
  } catch (error) {
    renderStatus(`リセットに失敗しました: ${error.message}`, true);
  }
};

if (largeCategoryOrderResetBtn) {
  largeCategoryOrderResetBtn.addEventListener("click", () => {
    largeCategoryOrderResetConfirm?.classList.toggle("hidden");
  });
}

if (largeCategoryOrderResetCancel) {
  largeCategoryOrderResetCancel.addEventListener("click", () => {
    largeCategoryOrderResetConfirm?.classList.add("hidden");
  });
}

if (largeCategoryOrderResetConfirmBtn) {
  largeCategoryOrderResetConfirmBtn.addEventListener("click", () => {
    runLargeCategoryOrderReset();
  });
}

const saveFeatureToggle = async ({
  geminiEnabled,
  duplicateEnabled,
  downloaderEnabled,
  categoryEnabled,
  satisfactionEnabled,
  subscriptionLabelEnabled,
  largeCategoryOrderEnabled,
}) => {
  const loaded = await loadSettings();
  const snapshot = buildSettingsSnapshot({
    geminiEnabled,
    duplicateEnabled,
    downloaderEnabled,
    categoryEnabled,
    satisfactionEnabled,
    subscriptionLabelEnabled,
    largeCategoryOrderEnabled,
    loadedSettings: loaded?.settings ?? {},
  });
  const result = await saveSettingsWithFallback(snapshot);
  const areaLabel = result.area === "sync" ? "sync" : "local";
  let reason = "";
  if (result.reason === "sync_threshold") {
    reason = "（sync容量超過のためローカル保存）";
  } else if (result.reason === "sync_error") {
    reason = "（sync書き込みエラーのためローカル保存）";
  }
  renderStatus(`保存しました: ${areaLabel}${reason}`);
};

// 初期表示は非表示状態
if (toggleApiKey) {
  toggleApiKey.checked = false;
  apiKeyInput.type = "password";
}

const populateModels = () => {
  modelSelect.innerHTML = "";
  const customOption = document.createElement("option");
  customOption.value = CUSTOM_MODEL_VALUE;
  customOption.textContent = "カスタム（任意のモデルIDを入力）";
  modelSelect.append(customOption);
  for (const { value, label } of MODEL_OPTIONS) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    modelSelect.append(option);
  }
  if (!modelSelect.value) {
    modelSelect.value = "gemini-2.5-flash";
  }
};

populateModels();

modelSelect.addEventListener("change", () => {
  toggleCustomModel(modelSelect.value);
  validate();
});
load().catch((error) =>
  renderStatus(`設定読み込みに失敗しました: ${error.message}`, true)
);
