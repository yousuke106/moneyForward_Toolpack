import assert from "node:assert";
import { buildGeminiPromptBody } from "../../src/background/gemini-prompt.js";

export const runGeminiPromptTests = () => {
  const transactions = [
    {
      id: "tx-1",
      date: "2026-04-01",
      store: "Netflix",
      amount: 1490,
      category: "固定費",
      subcategory: "動画",
    },
  ];
  const body = buildGeminiPromptBody("2026-04", transactions);
  const promptText = body.contents?.[0]?.parts?.[0]?.text ?? "";

  assert.strictEqual(body.generationConfig?.responseMimeType, "application/json");
  assert.deepStrictEqual(body.generationConfig?.responseJsonSchema, {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            score: { type: "integer", minimum: 0, maximum: 100 },
          },
          required: ["id", "score"],
          additionalProperties: false,
        },
      },
    },
    required: ["results"],
    additionalProperties: false,
  });
  assert.match(
    promptText,
    /Return exactly one result for every input transaction id\./u
  );
  assert.ok(!promptText.includes("Only include ids that meet threshold logic"));
  assert.ok(!promptText.includes("threshold logic"));
  assert.ok(promptText.includes(JSON.stringify({ month: "2026-04", transactions })));
};
