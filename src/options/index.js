import { loadSettings, saveSettingsWithFallback } from "../data/storage.js";

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

const renderStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b00020" : "#00695c";
};

const toggleCustomModel = (value) => {
  const isCustom = value === CUSTOM_MODEL_VALUE;
  customModelWrapper.classList.toggle("hidden", !isCustom);
};

toggleApiKey?.addEventListener("change", () => {
  apiKeyInput.type = toggleApiKey.checked ? "text" : "password";
});

const clearErrors = () => {
  apiKeyErrorEl.textContent = "";
  thresholdErrorEl.textContent = "";
  customModelError.textContent = "";
};

const validate = () => {
  clearErrors();
  let valid = true;

  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    apiKeyErrorEl.textContent = "APIキーを入力してください。";
    valid = false;
  }

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

  const modelValue = modelSelect.value;
  if (modelValue === CUSTOM_MODEL_VALUE) {
    const customValue = customModelInput.value.trim();
    if (!customValue) {
      customModelError.textContent = "カスタムモデルIDを入力してください。";
      valid = false;
    }
  }

  saveBtn.disabled = !valid;
  const resolvedModel =
    modelValue === CUSTOM_MODEL_VALUE
      ? customModelInput.value.trim()
      : modelValue;
  const geminiEnabled = geminiToggle?.checked ?? true;
  const duplicateEnabled = duplicateToggle?.checked ?? true;
  const downloaderEnabled = downloaderToggle?.checked ?? true;
  return {
    valid,
    apiKey,
    threshold,
    model: resolvedModel,
    geminiEnabled,
    duplicateEnabled,
    downloaderEnabled,
  };
};

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

const buildSettingsSnapshot = (
  geminiEnabled,
  duplicateEnabled,
  downloaderEnabled,
  loadedSettings = {}
) => {
  const apiKeyFallback = loadedSettings.geminiApiKey ?? "";
  const thresholdFallback =
    typeof loadedSettings.scoreThreshold === "number"
      ? loadedSettings.scoreThreshold
      : DEFAULT_THRESHOLD;

  const thresholdRaw = thresholdInput.value;
  const thresholdNumber = Number(thresholdRaw);
  const threshold = Number.isFinite(thresholdNumber)
    ? thresholdNumber
    : thresholdFallback;

  const resolvedModel = resolveModelValue(loadedSettings.model);

  return {
    geminiApiKey: apiKeyInput.value.trim() || apiKeyFallback,
    scoreThreshold: threshold,
    model: resolvedModel,
    featureFlags: {
      geminiAnalysisEnabled: geminiEnabled,
      duplicateCheckEnabled: duplicateEnabled,
      downloaderContextMenuEnabled: downloaderEnabled,
    },
  };
};

const applySettingsToUi = (settings, area) => {
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
  const geminiEnabled = settings.featureFlags?.geminiAnalysisEnabled ?? true;
  const duplicateEnabled = settings.featureFlags?.duplicateCheckEnabled ?? true;
  const downloaderEnabled =
    settings.featureFlags?.downloaderContextMenuEnabled ?? true;
  if (geminiToggle) {
    geminiToggle.checked = geminiEnabled;
  }
  if (duplicateToggle) {
    duplicateToggle.checked = duplicateEnabled;
  }
  if (downloaderToggle) {
    downloaderToggle.checked = downloaderEnabled;
  }
  renderStatus(`ロード元: ${area === "sync" ? "sync" : "local"}`);
};

const load = async () => {
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
    renderStatus("未保存です。設定を入力してください。");
    validate();
    return;
  }
  const { settings, area } = result;
  applySettingsToUi(settings, area);
  validate();
};
const onSave = async () => {
  const {
    valid,
    apiKey,
    threshold,
    model,
    geminiEnabled,
    duplicateEnabled,
    downloaderEnabled,
  } = validate();
  if (!valid) {
    return;
  }

  const settings = {
    geminiApiKey: apiKey,
    scoreThreshold: threshold,
    model,
    featureFlags: {
      geminiAnalysisEnabled: geminiEnabled,
      duplicateCheckEnabled: duplicateEnabled,
      downloaderContextMenuEnabled: downloaderEnabled,
    },
  };
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

saveBtn.addEventListener("click", () => {
  onSave().catch((error) =>
    renderStatus(`保存に失敗しました: ${error.message}`, true)
  );
});

for (const el of [apiKeyInput, thresholdInput, modelSelect, customModelInput]) {
  el.addEventListener("input", validate);
  el.addEventListener("change", validate);
}

if (geminiToggle) {
  geminiToggle.addEventListener("change", () => {
    validate();
    const geminiEnabled = geminiToggle.checked;
    const duplicateEnabled = duplicateToggle?.checked ?? true;
    const downloaderEnabled = downloaderToggle?.checked ?? true;
    saveFeatureToggle(geminiEnabled, duplicateEnabled, downloaderEnabled).catch(
      (error) => renderStatus(`保存に失敗しました: ${error.message}`, true)
    );
  });
}

if (duplicateToggle) {
  duplicateToggle.addEventListener("change", () => {
    validate();
    const geminiEnabled = geminiToggle?.checked ?? true;
    const duplicateEnabled = duplicateToggle.checked;
    const downloaderEnabled = downloaderToggle?.checked ?? true;
    saveFeatureToggle(geminiEnabled, duplicateEnabled, downloaderEnabled).catch(
      (error) => renderStatus(`保存に失敗しました: ${error.message}`, true)
    );
  });
}

if (downloaderToggle) {
  downloaderToggle.addEventListener("change", () => {
    validate();
    const geminiEnabled = geminiToggle?.checked ?? true;
    const duplicateEnabled = duplicateToggle?.checked ?? true;
    const downloaderEnabled = downloaderToggle.checked;
    saveFeatureToggle(geminiEnabled, duplicateEnabled, downloaderEnabled).catch(
      (error) => renderStatus(`保存に失敗しました: ${error.message}`, true)
    );
  });
}

const saveFeatureToggle = async (
  geminiEnabled,
  duplicateEnabled,
  downloaderEnabled
) => {
  const loaded = await loadSettings();
  const snapshot = buildSettingsSnapshot(
    geminiEnabled,
    duplicateEnabled,
    downloaderEnabled,
    loaded?.settings ?? {}
  );
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
