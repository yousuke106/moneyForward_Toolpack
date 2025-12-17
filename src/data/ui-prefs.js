const UI_PREFS_KEY = "mf_toolpack_ui_prefs";

const DEFAULT_UI_PREFS = {
  // 画面マスキング機能はデフォルトON（設定で機能自体をOFFにできる）
  maskingFeatureEnabled: true,
  // 機能ON時の初期状態。実際のON/OFFは家計簿ページ右上のボタンで切り替える。
  maskingEnabled: true,
};

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

const getSync = async (key) =>
  promisify((cb) => globalThis.chrome.storage.sync.get(key, cb));

const getLocal = async (key) =>
  promisify((cb) => globalThis.chrome.storage.local.get(key, cb));

const setSync = async (value) =>
  promisify((cb) => globalThis.chrome.storage.sync.set(value, cb));

const setLocal = async (value) =>
  promisify((cb) => globalThis.chrome.storage.local.set(value, cb));

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeUiPrefs = (prefs) => ({
  ...DEFAULT_UI_PREFS,
  ...(isPlainObject(prefs) ? prefs : {}),
});

export const loadUiPrefs = async () => {
  if (!hasChromeStorage()) {
    throw new Error("chrome.storage is unavailable in this context");
  }
  const sync = await getSync(UI_PREFS_KEY).catch(() => null);
  const fromSync = sync?.[UI_PREFS_KEY];
  if (isPlainObject(fromSync)) {
    return normalizeUiPrefs(fromSync);
  }

  const local = await getLocal(UI_PREFS_KEY).catch(() => null);
  const fromLocal = local?.[UI_PREFS_KEY];
  if (isPlainObject(fromLocal)) {
    return normalizeUiPrefs(fromLocal);
  }
  return DEFAULT_UI_PREFS;
};

/**
 * UI用の軽量設定をパッチ保存する。
 * - sync を優先しつつ、利用不可/失敗しても local に同内容を保存して継続できるようにする
 * - 将来キーが増えても破壊しないよう、既存値とマージして保存する
 */
export const saveUiPrefsPatch = async (patch) => {
  if (!hasChromeStorage()) {
    throw new Error("chrome.storage is unavailable in this context");
  }
  if (!isPlainObject(patch)) {
    throw new Error("ui_prefs_patch_must_be_object");
  }

  const current = await loadUiPrefs().catch(() => DEFAULT_UI_PREFS);
  const next = normalizeUiPrefs({ ...current, ...patch });
  const payload = { [UI_PREFS_KEY]: next };

  const syncOk = await setSync(payload)
    .then(() => true)
    .catch(() => false);
  await setLocal(payload);

  return { area: syncOk ? "sync" : "local" };
};

export { DEFAULT_UI_PREFS, UI_PREFS_KEY };
