import assert from "node:assert";
import { buildDuplicateKey, groupDuplicates } from "../../src/data/duplicates.js";

export const runDuplicateTests = () => {
  const base = {
    date: "2025-11-20",
    store: "ABC Store",
    amount: 2860,
  };

  // key generation
  assert.strictEqual(
    buildDuplicateKey(base),
    "dup:2025-11-20|ABC Store|2860"
  );
  assert.strictEqual(buildDuplicateKey({ ...base, store: "" }), "");
  assert.strictEqual(buildDuplicateKey({ ...base, date: "" }), "");
  assert.strictEqual(buildDuplicateKey({ ...base, amount: null }), "");

  // normalization removes emoji and collapses spaces
  assert.strictEqual(
    buildDuplicateKey({
      ...base,
      store: "  ABC   Store😀 ",
    }),
    "dup:2025-11-20|ABC Store|2860"
  );

  // grouping
  const txs = [
    { id: "1", ...base },
    { id: "2", ...base },
    { id: "3", ...base, amount: 3000 },
    { id: "4", ...base, store: "DEF" },
    { id: "5", ...base, store: "" }, // ignored
  ];
  const { duplicateTxIds, byKey } = groupDuplicates(txs);
  assert.strictEqual(byKey.size, 3); // base key, amount diff, store diff
  assert.strictEqual(duplicateTxIds.size, 2);
  assert.ok(duplicateTxIds.has("1"));
  assert.ok(duplicateTxIds.has("2"));
  assert.ok(!duplicateTxIds.has("3"));
  assert.ok(!duplicateTxIds.has("4"));
  assert.ok(!duplicateTxIds.has("5"));
};
