import assert from "node:assert";
import {
  extractJson,
  formatGeminiApiError,
  validateGeminiResults,
} from "../../src/background/gemini-utils.js";

export const runGeminiUtilsTests = () => {
  const base = {
    candidates: [
      {
        content: {
          parts: []
        }
      }
    ]
  };

  const plain = {
    ...base,
    candidates: [
      {
        content: {
          parts: [
            {
              text: "{\"results\":[{\"id\":\"1\",\"score\":70}]}"
            }
          ]
        }
      }
    ]
  };
  assert.deepStrictEqual(extractJson(plain), {
    results: [{ id: "1", score: 70 }]
  });

  const fenced = {
    ...base,
    candidates: [
      {
        content: {
          parts: [
            {
              text:
                "Here is the result:\n```json\n{\"results\":[{\"id\":\"2\",\"score\":80}]}\n```"
            }
          ]
        }
      }
    ]
  };
  assert.deepStrictEqual(extractJson(fenced), {
    results: [{ id: "2", score: 80 }]
  });

  const withNoise = {
    ...base,
    candidates: [
      {
        content: {
          parts: [
            {
              text:
                "Result below. {\"results\":[{\"id\":\"3\",\"score\":90}]}\nThanks!"
            }
          ]
        }
      }
    ]
  };
  assert.deepStrictEqual(extractJson(withNoise), {
    results: [{ id: "3", score: 90 }]
  });

  const missing = {
    ...base,
    candidates: [
      {
        content: {
          parts: [{ text: "{\"foo\":1}" }]
        }
      }
    ]
  };
  assert.throws(() => extractJson(missing), /Missing results field/);

  const apiError = formatGeminiApiError({
    status: 500,
    statusText: "Internal Server Error",
    model: "gemini-2.5-flash",
    transactionCount: 12,
    bodyText: '{"error":{"message":"structured output schema rejected"}}',
  });
  assert.match(apiError, /Gemini API error: 500 Internal Server Error/u);
  assert.match(apiError, /model=gemini-2\.5-flash/u);
  assert.match(apiError, /transactions=12/u);
  assert.match(apiError, /structured output schema rejected/u);

  const transactions = [
    { id: "tx-1" },
    { id: "tx-2" },
  ];
  assert.deepStrictEqual(
    validateGeminiResults(
      {
        results: [
          { id: "tx-1", score: 80 },
          { id: "tx-2", score: 20 },
        ],
      },
      transactions
    ),
    {
      results: [
        { id: "tx-1", score: 80 },
        { id: "tx-2", score: 20 },
      ],
    }
  );
  assert.throws(
    () => validateGeminiResults({ results: [{ id: "tx-1", score: 80 }] }, transactions),
    /invalid_gemma_response:missing_result/
  );
  assert.throws(
    () =>
      validateGeminiResults(
        { results: [{ id: "tx-1", score: 101 }, { id: "tx-2", score: 20 }] },
        transactions
      ),
    /invalid_gemma_response:invalid_score/
  );
};
