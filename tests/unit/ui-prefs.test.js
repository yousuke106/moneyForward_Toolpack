import assert from "node:assert";
import {
  DEFAULT_UI_PREFS,
  UI_PREFS_KEY,
  loadUiPrefs,
  saveUiPrefsPatch,
} from "../../src/data/ui-prefs.js";

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

export const runUiPrefsTests = async () => {
  const store = stubChromeStorage();

  // when no prefs exist, default is returned
  const initial = await loadUiPrefs();
  assert.deepStrictEqual(initial, DEFAULT_UI_PREFS);

  // patch saves to both areas
  const result = await saveUiPrefsPatch({
    maskingFeatureEnabled: false,
  });
  assert.ok(result.area === "sync" || result.area === "local");
  assert.ok(store.sync[UI_PREFS_KEY]);
  assert.ok(store.local[UI_PREFS_KEY]);
  assert.strictEqual(store.local[UI_PREFS_KEY].maskingFeatureEnabled, false);

  // patch merges and preserves unknown keys
  store.sync[UI_PREFS_KEY] = { maskingFeatureEnabled: true, extra: 123 };
  await saveUiPrefsPatch({ maskingFeatureEnabled: false });
  assert.strictEqual(store.local[UI_PREFS_KEY].maskingFeatureEnabled, false);
  assert.strictEqual(store.local[UI_PREFS_KEY].extra, 123);

  // load prefers sync when both exist
  store.sync[UI_PREFS_KEY] = { maskingFeatureEnabled: false };
  store.local[UI_PREFS_KEY] = { maskingFeatureEnabled: true };
  const loaded = await loadUiPrefs();
  assert.strictEqual(loaded.maskingFeatureEnabled, false);

  // backward compat: old saved prefs without maskingFeatureEnabled
  store.sync[UI_PREFS_KEY] = { maskingEnabled: false };
  const loadedLegacy = await loadUiPrefs();
  assert.strictEqual(loadedLegacy.maskingEnabled, false);
  assert.strictEqual(loadedLegacy.maskingFeatureEnabled, true);
};
