const RESPONSE_JSON_SCHEMA = {
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
};

const buildInstruction = () =>
  [
    "Classify MoneyForward transactions for subscription-likelihood.",
    "Return exactly one result for every input transaction id.",
    "Use only the supplied transaction fields.",
    "Do not infer user identity, account details, or payment sources.",
    "Score 90-100 for very likely recurring subscriptions or fixed costs.",
    "Score 70-89 for likely recurring subscriptions or fixed costs.",
    "Score 40-69 when the subscription likelihood is uncertain.",
    "Score 0-39 for likely one-off spending, transfers, investments, income, refunds, taxes, or loan payments.",
    "Input JSON follows.",
  ].join("\n");

const buildGemmaInstruction = () =>
  [
    "You are a JSON API for MoneyForward subscription-likelihood classification.",
    'Return ONLY a valid JSON object with shape {"results":[{"id":"tx-1","score":95}]}.',
    "Do not write markdown, code fences, explanations, bullets, comments, or analysis.",
    "Return exactly one result for every input transaction id.",
    "Use only the supplied transaction fields.",
    "Do not infer user identity, account details, or payment sources.",
    "Score must be an integer from 0 to 100.",
    "Score 90-100 for very likely recurring subscriptions or fixed costs.",
    "Score 70-89 for likely recurring subscriptions or fixed costs.",
    "Score 40-69 when the subscription likelihood is uncertain.",
    "Score 0-39 for likely one-off spending, transfers, investments, income, refunds, taxes, or loan payments.",
    "Input JSON follows.",
  ].join("\n");

// Geminiの構造化出力を使い、応答形状をAPI側でも固定する。
export const buildGeminiPromptBody = (month, transactions) => ({
  contents: [
    {
      parts: [
        {
          text: `${buildInstruction()}\n${JSON.stringify({
            month,
            transactions,
          })}`,
        },
      ],
    },
  ],
  generationConfig: {
    responseMimeType: "application/json",
    responseJsonSchema: RESPONSE_JSON_SCHEMA,
  },
});

// Gemma 4は構造化出力が不安定なため、通常生成としてJSONのみを強く指示する。
export const buildGemmaPromptBody = (month, transactions) => ({
  contents: [
    {
      parts: [
        {
          text: `${buildGemmaInstruction()}\n${JSON.stringify({
            month,
            transactions,
          })}`,
        },
      ],
    },
  ],
});
