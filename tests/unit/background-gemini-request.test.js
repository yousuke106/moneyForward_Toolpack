import assert from "node:assert";
import {
  getValidatedGeminiRequest,
  isAllowedSenderUrl,
} from "../../src/background/gemini-request.js";

export const runBackgroundGeminiRequestTests = () => {
  assert.strictEqual(
    isAllowedSenderUrl("https://moneyforward.com/cf"),
    true
  );
  assert.strictEqual(
    isAllowedSenderUrl("https://moneyforward.com/cf/summary"),
    true
  );
  assert.strictEqual(
    isAllowedSenderUrl("https://evil.example.com/cf"),
    false
  );

  const valid = getValidatedGeminiRequest(
    {
      type: "requestGeminiAnalysis",
      month: "2026-04",
      model: "gemini-2.5-flash",
      transactions: [
        {
          id: "tx-1",
          date: "2026-04-01",
          store: "Netflix",
          amount: 1200,
          category: "固定費",
          subcategory: "動画",
        },
      ],
    },
    { tab: { url: "https://moneyforward.com/cf" } }
  );

  assert.deepStrictEqual(valid, {
    month: "2026-04",
    model: "gemini-2.5-flash",
    transactions: [
      {
        id: "tx-1",
        date: "2026-04-01",
        store: "Netflix",
        amount: 1200,
        category: "固定費",
        subcategory: "動画",
      },
    ],
  });

  assert.throws(
    () =>
      getValidatedGeminiRequest(
        {
          type: "requestGeminiAnalysis",
          month: "2026-04",
          model: "gemini-2.5-flash",
          transactions: [],
        },
        { tab: { url: "https://evil.example.com/" } }
      ),
    /unauthorized_sender/
  );

  assert.throws(
    () =>
      getValidatedGeminiRequest(
        {
          type: "requestGeminiAnalysis",
          month: "202604",
          model: "gemini-2.5-flash",
          transactions: [],
        },
        { tab: { url: "https://moneyforward.com/cf" } }
      ),
    /invalid_month/
  );

  assert.throws(
    () =>
      getValidatedGeminiRequest(
        {
          type: "requestGeminiAnalysis",
          month: "2026-04",
          model: "gemini-2.5-flash;DROP TABLE",
          transactions: [],
        },
        { tab: { url: "https://moneyforward.com/cf" } }
      ),
    /invalid_model/
  );

  assert.throws(
    () =>
      getValidatedGeminiRequest(
        {
          type: "requestGeminiAnalysis",
          month: "2026-04",
          model: "gemini-2.5-flash",
          transactions: [
            {
              id: "tx-1",
              date: "2026-04-01",
              store: "Netflix",
              amount: 1200,
              category: "固定費",
              subcategory: "動画",
              memo: "should-not-be-here",
            },
          ],
        },
        { tab: { url: "https://moneyforward.com/cf" } }
      ),
    /invalid_transaction/
  );
  assert.throws(
    () =>
      getValidatedGeminiRequest(
        {
          type: "requestGeminiAnalysis",
          month: "2026-04",
          model: "gemini-2.5-flash",
          transactions: [
            {
              id: "tx-1",
              date: "2026-04-01",
              store: "A".repeat(201),
              amount: 1200,
              category: "",
              subcategory: "",
            },
          ],
        },
        { tab: { url: "https://moneyforward.com/cf" } }
      ),
    /invalid_transaction:store_too_long/
  );
};
