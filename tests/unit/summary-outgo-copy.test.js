import assert from "node:assert";
import {
  buildClipboardTextFromAmounts,
  collectOutgoAmountsForCopy,
  isAggregateRow,
  parseSignedAmountText,
} from "../../src/background/summary-outgo-copy-utils.js";

export const runSummaryOutgoCopyTests = () => {
  assert.strictEqual(parseSignedAmountText("-5,000"), "-5000");
  assert.strictEqual(parseSignedAmountText("−1,234"), "-1234");
  assert.strictEqual(parseSignedAmountText("+890"), "890");
  assert.strictEqual(parseSignedAmountText("12,345円"), "12345");
  assert.strictEqual(parseSignedAmountText("abc"), null);

  assert.strictEqual(isAggregateRow("合計"), true);
  assert.strictEqual(isAggregateRow("小計"), true);
  assert.strictEqual(isAggregateRow("食費"), false);

  const amounts = collectOutgoAmountsForCopy([
    { labelText: "食費", amountText: "-3,000" },
    { labelText: "小計", amountText: "-3,000" },
    { labelText: "通信費", amountText: "−5,120円" },
    { labelText: "その他", amountText: "" },
  ]);
  assert.deepStrictEqual(amounts, ["-3000", "-5120"]);

  assert.strictEqual(buildClipboardTextFromAmounts(amounts), "-3000\n-5120");
  assert.strictEqual(buildClipboardTextFromAmounts([]), "");
};
