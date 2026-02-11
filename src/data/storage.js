import { validateCategoryRules } from "./category-rules.js";
import {
  DEFAULT_MODEL,
  DEFAULT_THRESHOLD,
  SYNC_THRESHOLD_BYTES,
  SYNC_TOTAL_LIMIT_BYTES,
} from "./settings-constants.js";

const SETTINGS_KEY = "settings";
const UPDATED_AT_KEY = "updatedAt";
const GEMINI_API_KEY_STORAGE_KEY = "geminiApiKey";

// 機能トグルは安全側（有効）をデフォルトにする。
const DEFAULT_FEATURE_FLAGS = {
  geminiAnalysisEnabled: true,
  duplicateCheckEnabled: true,
  downloaderContextMenuEnabled: true,
  categoryRuleAlertEnabled: true,
  satisfactionEnabled: true,
  subscriptionLabelEnabled: true,
};

// ルール未登録時のデフォルト形状。
const DEFAULT_CATEGORY_RULES = {
  whitelist: [],
  blacklist: [],
};

// 初期設定はUIの初期表示とも同期させる。
const DEFAULT_SETTINGS = {
  geminiApiKey: "",
  scoreThreshold: DEFAULT_THRESHOLD,
  model: DEFAULT_MODEL,
  featureFlags: DEFAULT_FEATURE_FLAGS,
  categoryRules: DEFAULT_CATEGORY_RULES,
  // Keep saved order while allowing users to temporarily disable sorting.
  largeCategoryOrder: null,
  largeCategoryOrderEnabled: true,
};

// chrome.storage が利用できる環境かを早期に判定する。
const hasChromeStorage = () =>
  typeof globalThis.chrome !== "undefined" &&
  globalThis.chrome?.storage?.sync &&
  globalThis.chrome?.storage?.local;

// 不足キーを埋め、内部で常に扱いやすい形に揃える。
const normalizeSettings = (settings = {}) => {
  const featureFlags = {
    ...DEFAULT_FEATURE_FLAGS,
    ...(settings.featureFlags ?? {}),
  };
  const categoryRules = {
    ...DEFAULT_CATEGORY_RULES,
    ...(settings.categoryRules ?? {}),
  };

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    featureFlags,
    categoryRules,
  };
};

// 保存時刻は number / ISO 文字列の両方を受け付ける。
const parseUpdatedAt = (settings) => {
  const raw = settings?.[UPDATED_AT_KEY];
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
const pickLatestSettings = ({ syncSettings, localSettings }) => {
  if (syncSettings && !localSettings) {
    return { settings: syncSettings, area: "sync" };
  }
  if (localSettings && !syncSettings) {
    return { settings: localSettings, area: "local" };
  }
  if (!(syncSettings && localSettings)) {
    return null;
  }

  const syncUpdatedAt = parseUpdatedAt(syncSettings);
  const localUpdatedAt = parseUpdatedAt(localSettings);
  if (syncUpdatedAt !== localUpdatedAt) {
    return localUpdatedAt > syncUpdatedAt
      ? { settings: localSettings, area: "local" }
      : { settings: syncSettings, area: "sync" };
  }

  // タイムスタンプ同値（旧形式含む）は local を優先し、フォールバック保存を尊重する。
  return { settings: localSettings, area: "local" };
};

// ルールの検証を含め、保存前に不正値を弾く。
const validateSettings = (settings = {}) => {
  const normalized = normalizeSettings(settings);
  const { categoryRules } = normalized;
  const validation = validateCategoryRules(categoryRules);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }
  return { ok: true, settings: normalized };
};

// chrome.storageのコールバックAPIをPromise化する共通ヘルパー。
const promisify = (fn) =>
  new Promise((resolve, reject) => {
    try {
      fn((result) => {
        const error = globalThis.chrome?.runtime?.lastError;
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    } catch (error) {
      reject(error);
    }
  });

// sync領域の使用量を取得し、保存先の判断材料にする。
const getBytesInUse = () => {
  if (!hasChromeStorage()) {
    return 0;
  }
  return promisify((cb) =>
    globalThis.chrome.storage.sync.getBytesInUse(null, cb)
  );
};

// sync/localの保存処理は同じ形で呼べるように揃える。
const setSync = async (settings) =>
  promisify((cb) =>
    globalThis.chrome.storage.sync.set({ [SETTINGS_KEY]: settings }, cb)
  );

const setLocal = async (settings) =>
  promisify((cb) =>
    globalThis.chrome.storage.local.set({ [SETTINGS_KEY]: settings }, cb)
  );

const setLocalGeminiApiKey = async (geminiApiKey) =>
  promisify((cb) =>
    globalThis.chrome.storage.local.set(
      { [GEMINI_API_KEY_STORAGE_KEY]: geminiApiKey },
      cb
    )
  );

// 保存先の容量・失敗に応じてsync→localへ自動フォールバックする。
export const saveSettingsWithFallback = async (settings) => {
  if (!hasChromeStorage()) {
    throw new Error("chrome.storage is unavailable in this context");
  }

  // 保存前に正規化/検証を行い、壊れた設定を永続化しない。
  const validation = validateSettings(settings);
  if (!validation.ok) {
    const message = `invalid_settings:${validation.errors.join(",")}`;
    throw new Error(message);
  }

  const geminiApiKey = validation.settings.geminiApiKey ?? "";
  await setLocalGeminiApiKey(geminiApiKey);

  const normalized = {
    ...validation.settings,
    // APIキーはlocal専用に保存し、syncへは載せない。
    geminiApiKey: "",
    [UPDATED_AT_KEY]: Date.now(),
  };

  const bytes = await getBytesInUse().catch(() => SYNC_TOTAL_LIMIT_BYTES);
  if (bytes >= SYNC_THRESHOLD_BYTES) {
    await setLocal(normalized);
    return { area: "local", reason: "sync_threshold" };
  }

  try {
    await setSync(normalized);
    return { area: "sync" };
  } catch (error) {
    await setLocal(normalized);
    return { area: "local", reason: "sync_error", error };
  }
};

// sync優先で読み込み、無ければlocalへフォールバックする。
export const loadSettings = async () => {
  if (!hasChromeStorage()) {
    return null;
  }
  const [syncResult, localResult, apiKeyResult] = await Promise.all([
    promisify((cb) =>
      globalThis.chrome.storage.sync.get(SETTINGS_KEY, cb)
    ).catch(() => null),
    promisify((cb) =>
      globalThis.chrome.storage.local.get(SETTINGS_KEY, cb)
    ).catch(() => null),
    promisify((cb) =>
      globalThis.chrome.storage.local.get(GEMINI_API_KEY_STORAGE_KEY, cb)
    ).catch(() => null),
  ]);

  const picked = pickLatestSettings({
    syncSettings: syncResult?.[SETTINGS_KEY] ?? null,
    localSettings: localResult?.[SETTINGS_KEY] ?? null,
  });
  if (!picked) {
    return null;
  }
  const normalized = normalizeSettings(picked.settings);
  const localApiKey = apiKeyResult?.[GEMINI_API_KEY_STORAGE_KEY];
  return {
    settings: {
      ...normalized,
      geminiApiKey:
        typeof localApiKey === "string"
          ? localApiKey
          : (normalized.geminiApiKey ?? ""),
    },
    area: picked.area,
  };
};

/**
 * APIキーを必要なタイミングでのみ取り出し、コールバックに渡して即座に破棄するヘルパー。
 * コールバックの戻り値をそのまま返す。キーはこの関数内のスコープを抜けた時点で参照が途切れる。
 */
// APIキーは必要なときだけ渡し、利用後は参照を切る。
export const withApiKey = async (fn) => {
  // APIキーはコールバック実行に必要な範囲だけ露出させる。
  const loaded = await loadSettings();
  const key = loaded?.settings?.geminiApiKey ?? null;
  const result = await fn(key);
  return result;
};

// ローカル保存のキーは一箇所で定義して扱いを統一する。
const LOCAL_KEYS = {
  byTx: "labelsByTxId",
  byStoreAmount: "labelsByStoreAmount",
};

// ラベル保存はlocal固定（ユーザーごとの環境差異を避ける）。
const getLocal = async (key) =>
  promisify((cb) => globalThis.chrome.storage.local.get(key, cb)).then(
    (res) => res?.[key] ?? {}
  );

const setLocalBulk = async (key, value) =>
  promisify((cb) => globalThis.chrome.storage.local.set({ [key]: value }, cb));

// 取引ID/店名+金額の両方のマップを一度に取得する。
export const loadLabels = async () => {
  if (!hasChromeStorage()) {
    return { labelsByTxId: {}, labelsByStoreAmount: {} };
  }
  const [labelsByTxId, labelsByStoreAmount] = await Promise.all([
    getLocal(LOCAL_KEYS.byTx),
    getLocal(LOCAL_KEYS.byStoreAmount),
  ]);
  return { labelsByTxId, labelsByStoreAmount };
};

// ラベル変更時は両キーを同時に更新して整合性を保つ。
export const saveLabel = async ({ txKey, storeAmountKey, label }) => {
  if (!hasChromeStorage()) {
    return;
  }
  const { labelsByTxId, labelsByStoreAmount } = await loadLabels();

  if (label) {
    labelsByTxId[txKey] = label;
    labelsByStoreAmount[storeAmountKey] = label;
  } else {
    delete labelsByTxId[txKey];
    delete labelsByStoreAmount[storeAmountKey];
  }

  await Promise.all([
    setLocalBulk(LOCAL_KEYS.byTx, labelsByTxId),
    setLocalBulk(LOCAL_KEYS.byStoreAmount, labelsByStoreAmount),
  ]);
};

export { normalizeSettings, validateSettings };
