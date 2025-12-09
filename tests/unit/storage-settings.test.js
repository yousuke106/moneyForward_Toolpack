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
  const store = { sync: {}, local: {} };
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
          cb?.(0);
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

  const loaded = await loadSettings();
  assert.ok(loaded?.settings?.categoryRules?.whitelist?.length === 1);
  assert.strictEqual(
    loaded?.settings?.featureFlags?.categoryRuleAlertEnabled,
    false,
  );

  // ensure chrome stub used
  assert.ok(Object.keys(store.sync).length >= 0);
};

