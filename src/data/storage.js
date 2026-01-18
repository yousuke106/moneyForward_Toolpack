import { validateCategoryRules } from "./category-rules.js";

// sync領域の上限に近づいた場合はlocalへフォールバックする。
const SYNC_THRESHOLD_BYTES = 90 * 1024;
const SYNC_TOTAL_LIMIT_BYTES = 100 * 1024;
const SETTINGS_KEY = "settings";

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
  scoreThreshold: 70,
  model: "gemini-2.5-flash",
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

  const normalized = validation.settings;

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
  // syncを優先し、無ければlocalから読む。
  const syncResult = await promisify((cb) =>
    globalThis.chrome.storage.sync.get(SETTINGS_KEY, cb)
  ).catch(() => null);
  if (syncResult?.[SETTINGS_KEY]) {
    return {
      settings: normalizeSettings(syncResult[SETTINGS_KEY]),
      area: "sync",
    };
  }
  const localResult = await promisify((cb) =>
    globalThis.chrome.storage.local.get(SETTINGS_KEY, cb)
  ).catch(() => null);
  if (localResult?.[SETTINGS_KEY]) {
    return {
      settings: normalizeSettings(localResult[SETTINGS_KEY]),
      area: "local",
    };
  }
  return null;
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
