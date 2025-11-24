const SYNC_THRESHOLD_BYTES = 90 * 1024;
const SYNC_TOTAL_LIMIT_BYTES = 100 * 1024;
const SETTINGS_KEY = "settings";

const hasChromeStorage = () =>
  typeof globalThis.chrome !== "undefined" &&
  globalThis.chrome?.storage?.sync &&
  globalThis.chrome?.storage?.local;

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

const getBytesInUse = () => {
  if (!hasChromeStorage()) {
    return 0;
  }
  return promisify((cb) =>
    globalThis.chrome.storage.sync.getBytesInUse(null, cb)
  );
};

const setSync = async (settings) =>
  promisify((cb) =>
    globalThis.chrome.storage.sync.set({ [SETTINGS_KEY]: settings }, cb)
  );

const setLocal = async (settings) =>
  promisify((cb) =>
    globalThis.chrome.storage.local.set({ [SETTINGS_KEY]: settings }, cb)
  );

export const saveSettingsWithFallback = async (settings) => {
  if (!hasChromeStorage()) {
    throw new Error("chrome.storage is unavailable in this context");
  }

  const bytes = await getBytesInUse().catch(() => SYNC_TOTAL_LIMIT_BYTES);
  if (bytes >= SYNC_THRESHOLD_BYTES) {
    await setLocal(settings);
    return { area: "local", reason: "sync_threshold" };
  }

  try {
    await setSync(settings);
    return { area: "sync" };
  } catch (error) {
    await setLocal(settings);
    return { area: "local", reason: "sync_error", error };
  }
};

export const loadSettings = async () => {
  if (!hasChromeStorage()) {
    return null;
  }
  const syncResult = await promisify((cb) =>
    globalThis.chrome.storage.sync.get(SETTINGS_KEY, cb)
  ).catch(() => null);
  if (syncResult?.[SETTINGS_KEY]) {
    return { settings: syncResult[SETTINGS_KEY], area: "sync" };
  }
  const localResult = await promisify((cb) =>
    globalThis.chrome.storage.local.get(SETTINGS_KEY, cb)
  ).catch(() => null);
  if (localResult?.[SETTINGS_KEY]) {
    return { settings: localResult[SETTINGS_KEY], area: "local" };
  }
  return null;
};

/**
 * APIキーを必要なタイミングでのみ取り出し、コールバックに渡して即座に破棄するヘルパー。
 * コールバックの戻り値をそのまま返す。キーはこの関数内のスコープを抜けた時点で参照が途切れる。
 */
export const withApiKey = async (fn) => {
  const loaded = await loadSettings();
  const key = loaded?.settings?.geminiApiKey ?? null;
  const result = await fn(key);
  return result;
};

const LOCAL_KEYS = {
  byTx: "labelsByTxId",
  byStoreAmount: "labelsByStoreAmount",
};

const getLocal = async (key) =>
  promisify((cb) => globalThis.chrome.storage.local.get(key, cb)).then(
    (res) => res?.[key] ?? {}
  );

const setLocalBulk = async (key, value) =>
  promisify((cb) => globalThis.chrome.storage.local.set({ [key]: value }, cb));

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
