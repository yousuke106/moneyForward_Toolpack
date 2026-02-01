import assert from "node:assert";
import { extractJson } from "../../src/background/gemini-utils.js";

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
};
