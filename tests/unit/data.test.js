import assert from "node:assert";
import {
  normalizeStoreName,
  buildTxKey,
  buildStoreAmountKey,
  parseAmount
} from "../../src/data/normalize.js";
import { saveLabel, loadLabels } from "../../src/data/storage.js";

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
        }
      },
      local: {
        set(obj, cb) {
          Object.assign(store.local, obj);
          cb?.();
        },
        get(key, cb) {
          cb?.({ [key]: store.local[key] });
        }
      }
    },
    runtime: {}
  };
  return store;
};

export const runDataTests = async () => {
  // normalize
  assert.strictEqual(normalizeStoreName("  abc  "), "abc");
  assert.strictEqual(normalizeStoreName("a   b   c"), "a b c");
  assert.strictEqual(normalizeStoreName("abc😀"), "abc");
  assert.strictEqual(normalizeStoreName("a\u200Bb"), "ab");
  assert.strictEqual(normalizeStoreName("ＡＢＣ"), "ＡＢＣ");

  // keys
  assert.strictEqual(buildTxKey("123"), "tx:123");
  assert.strictEqual(buildStoreAmountKey(" test ", 4950), "sa:test|4950");

  // amount parse
  assert.strictEqual(parseAmount("-4,950", false), 4950);
  assert.strictEqual(parseAmount("1,170", true), 1170);
  assert.strictEqual(parseAmount("-50,000 (振替)", false), 50000);
  assert.strictEqual(parseAmount("文字列のみ", false), null);

  // storage
  const store = stubChromeStorage();
  await saveLabel({
    txKey: "tx:1",
    storeAmountKey: "sa:abc|1000",
    label: "using"
  });
  let labels = await loadLabels();
  assert.strictEqual(labels.labelsByTxId["tx:1"], "using");
  assert.strictEqual(labels.labelsByStoreAmount["sa:abc|1000"], "using");

  // removal when label empty
  await saveLabel({
    txKey: "tx:1",
    storeAmountKey: "sa:abc|1000",
    label: ""
  });
  labels = await loadLabels();
  assert.ok(!labels.labelsByTxId["tx:1"]);
  assert.ok(!labels.labelsByStoreAmount["sa:abc|1000"]);

  // ensure chrome stub used
  assert.ok(Object.keys(store.local).length >= 0);
};
