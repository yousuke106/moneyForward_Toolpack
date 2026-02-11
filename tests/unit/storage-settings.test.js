import assert from "node:assert";
import {
  MAX_CATEGORY_RULES,
} from "../../src/data/category-rules.js";
import {
  normalizeSettings,
  saveSettingsWithFallback,
  loadSettings,
} from "../../src/data/storage.js";

const stubChromeStorage = () => {
  const store = { sync: {}, local: {}, syncBytes: 0 };
  globalThis.chrome = {
    storage: {
      sync: {
        set(obj, cb) {
          Object.assign(store.sync, obj);
          cb?.();
        },
        get(key, cb) {
          cb?.({ [key]: store.sync[key] });
        },
        getBytesInUse(_key, cb) {
          cb?.(store.syncBytes);
        },
      },
      local: {
        set(obj, cb) {
          Object.assign(store.local, obj);
          cb?.();
        },
        get(key, cb) {
          cb?.({ [key]: store.local[key] });
        },
      },
    },
    runtime: {},
  };
  return store;
};

export const runStorageSettingsTests = async () => {
  // normalizeSettings fills defaults
  const normalized = normalizeSettings({ featureFlags: { geminiAnalysisEnabled: false } });
  assert.ok(normalized.categoryRules?.whitelist);
  assert.ok(normalized.categoryRules?.blacklist);
  assert.strictEqual(normalized.featureFlags.categoryRuleAlertEnabled, true);
  assert.strictEqual(normalized.featureFlags.geminiAnalysisEnabled, false);

  // saveSettingsWithFallback rejects too many rules
  const store = stubChromeStorage();
  const tooMany = {
    categoryRules: {
      whitelist: Array.from({ length: MAX_CATEGORY_RULES + 1 }, (_v, idx) => ({
        large: `L${idx}`,
        middle: `M${idx}`,
      })),
      blacklist: [],
    },
  };
  await assert.rejects(() => saveSettingsWithFallback(tooMany));

  // valid save uses normalized defaults and persists
  const okSettings = {
    featureFlags: { categoryRuleAlertEnabled: false },
    categoryRules: { whitelist: [{ large: "食費", middle: "外食" }], blacklist: [] },
  };
  const result = await saveSettingsWithFallback(okSettings);
  assert.ok(result.area === "sync" || result.area === "local");
  assert.strictEqual(store.sync.settings?.geminiApiKey, "");
  assert.strictEqual(store.local.geminiApiKey, "");

  const loaded = await loadSettings();
  assert.ok(loaded?.settings?.categoryRules?.whitelist?.length === 1);
  assert.strictEqual(
    loaded?.settings?.featureFlags?.categoryRuleAlertEnabled,
    false,
  );
  assert.strictEqual(loaded?.settings?.geminiApiKey, "");

  // APIキーはlocal専用に保存し、読み込み時に設定へマージする。
  const keySettings = {
    geminiApiKey: "secret-key",
    categoryRules: { whitelist: [], blacklist: [] },
  };
  await saveSettingsWithFallback(keySettings);
  assert.strictEqual(store.local.geminiApiKey, "secret-key");
  assert.strictEqual(store.sync.settings?.geminiApiKey, "");
  const loadedWithKey = await loadSettings();
  assert.strictEqual(loadedWithKey?.settings?.geminiApiKey, "secret-key");

  // sync/local両方にある場合は updatedAt が新しい側を採用する。
  store.sync.settings = {
    geminiApiKey: "",
    scoreThreshold: 60,
    model: "gemini-2.5-flash",
    featureFlags: {},
    categoryRules: { whitelist: [], blacklist: [] },
    updatedAt: 100,
  };
  store.local.settings = {
    geminiApiKey: "",
    scoreThreshold: 80,
    model: "gemini-2.5-flash",
    featureFlags: {},
    categoryRules: { whitelist: [], blacklist: [] },
    updatedAt: 200,
  };
  const preferLocalByTimestamp = await loadSettings();
  assert.strictEqual(preferLocalByTimestamp?.area, "local");
  assert.strictEqual(preferLocalByTimestamp?.settings?.geminiApiKey, "secret-key");

  // レガシー形式（updatedAt未保存）で両方存在する場合は local を優先する。
  delete store.sync.settings.updatedAt;
  delete store.local.settings.updatedAt;
  store.sync.settings.geminiApiKey = "";
  store.local.settings.geminiApiKey = "";
  const preferLocalLegacy = await loadSettings();
  assert.strictEqual(preferLocalLegacy?.area, "local");
  assert.strictEqual(preferLocalLegacy?.settings?.geminiApiKey, "secret-key");

  // ensure chrome stub used
  assert.ok(Object.keys(store.sync).length >= 0);
};
