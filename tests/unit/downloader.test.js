import assert from "node:assert";
import {
  buildCsvFilename,
  buildCsvRequestUrl,
  dequeueNextFilename,
  isDownloaderEnabled,
  parseMonthFromHeader,
} from "../../src/background/downloader-utils.js";

export const runDownloaderTests = () => {
  // parseMonthFromHeader
  assert.deepStrictEqual(parseMonthFromHeader("2025年11月"), {
    year: 2025,
    month: 11,
  });
  assert.deepStrictEqual(parseMonthFromHeader("  2024 / 3 "), {
    year: 2024,
    month: 3,
  });
  assert.strictEqual(parseMonthFromHeader("March 2024"), null);
  assert.strictEqual(parseMonthFromHeader("2024年13月"), null);

  // URL builder
  assert.strictEqual(
    buildCsvRequestUrl({ year: 2025, month: 11 }),
    "https://moneyforward.com/cf/csv?from=2025%2F11%2F01&month=11&year=2025"
  );

  // filename builder
  assert.strictEqual(
    buildCsvFilename({ year: 2025, month: 3 }),
    "moneyforward_202503.csv"
  );

  // queue dequeue
  const queue = ["a.csv", "b.csv"];
  const item = { byExtensionId: "ext-1" };
  const next = dequeueNextFilename(queue, item, "ext-1");
  assert.strictEqual(next, "a.csv");
  assert.deepStrictEqual(queue, ["b.csv"]);

  const noMatch = dequeueNextFilename(queue, { byExtensionId: "other" }, "ext-1");
  assert.strictEqual(noMatch, null);
  assert.deepStrictEqual(queue, ["b.csv"]);

  // toggle default/false
  assert.strictEqual(isDownloaderEnabled(undefined), true);
  assert.strictEqual(
    isDownloaderEnabled({ featureFlags: { downloaderContextMenuEnabled: false } }),
    false
  );
};
