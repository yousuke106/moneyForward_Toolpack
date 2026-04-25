import assert from "node:assert";
import {
  buildGeminiPayload,
  createGeminiAnalysisState,
  createGeminiRunState,
  formatGeminiErrorMessage,
  getGeminiRuntimeErrorMessage,
  getGeminiSettingsFingerprint,
  getHighlightedTxIds,
  mergeGeminiBatchResults,
  reserveGeminiRun,
  sanitizeGeminiTransactions,
  shouldClearGeminiHighlight,
  shouldSkipGeminiRun,
} from "../../src/content/gemini-analysis.js";

export const runGeminiAnalysisTests = () => {
  const state = createGeminiAnalysisState();
  assert.deepStrictEqual(state, {
    month: "",
    resultsByTxId: {},
    highlightedTxIds: [],
  });

  const firstMerge = mergeGeminiBatchResults(
    createGeminiAnalysisState(),
    "2026-04",
    [{ id: "tx-1", score: 85 }]
  );
  assert.deepStrictEqual(firstMerge.highlightedTxIds, ["tx-1"]);

  const secondMerge = mergeGeminiBatchResults(firstMerge, "2026-04", [
    { id: "tx-2", score: 90 },
    { id: "tx-3", score: 40 },
  ]);
  assert.deepStrictEqual(secondMerge.highlightedTxIds, ["tx-1", "tx-2", "tx-3"]);
  assert.deepStrictEqual(secondMerge.resultsByTxId, {
    "tx-1": 85,
    "tx-2": 90,
    "tx-3": 40,
  });

  const resetMerge = mergeGeminiBatchResults(secondMerge, "2026-05", [
    { id: "tx-4", score: 75 },
  ]);
  assert.deepStrictEqual(resetMerge.highlightedTxIds, ["tx-4"]);
  assert.deepStrictEqual(resetMerge.resultsByTxId, {
    "tx-4": 75,
  });

  const highlighted = getHighlightedTxIds(secondMerge, 70);
  assert.deepStrictEqual(highlighted, new Set(["tx-1", "tx-2"]));

  const payload = buildGeminiPayload({
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
        memo: "secret memo",
        payment_source: "Visa **** 1111",
      },
    ],
  });
  assert.deepStrictEqual(payload, {
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
  });

  assert.deepStrictEqual(
    sanitizeGeminiTransactions([
      {
        id: "tx-valid",
        date: "2026-04-01",
        store: "Netflix",
        amount: 1200,
        category: "固定費",
        subcategory: "動画",
      },
      {
        id: "tx-no-date",
        date: "",
        store: "Spotify",
        amount: 980,
        category: "",
        subcategory: "",
      },
      {
        id: "tx-no-store",
        date: "2026-04-02",
        store: "",
        amount: 500,
        category: "",
        subcategory: "",
      },
    ]),
    [
      {
        id: "tx-valid",
        date: "2026-04-01",
        store: "Netflix",
        amount: 1200,
        category: "固定費",
        subcategory: "動画",
      },
    ]
  );
  assert.deepStrictEqual(
    sanitizeGeminiTransactions([
      {
        id: " tx-long ",
        date: " 2026-04-03 ",
        store: "A".repeat(205),
        amount: 1500,
        category: "B".repeat(205),
      },
    ]),
    [
      {
        id: "tx-long",
        date: "2026-04-03",
        store: "A".repeat(200),
        amount: 1500,
        category: "B".repeat(200),
        subcategory: "",
      },
    ]
  );

  assert.deepStrictEqual(
    buildGeminiPayload({
      month: "2026-04",
      model: "gemini-2.5-flash",
      transactions: [
        {
          id: "tx-valid",
          date: "2026-04-01",
          store: "Netflix",
          amount: 1200,
          category: "",
          subcategory: "",
        },
        {
          id: "tx-no-store",
          date: "2026-04-02",
          store: "",
          amount: 500,
          category: "",
          subcategory: "",
        },
      ],
    }).transactions,
    [
      {
        id: "tx-valid",
        date: "2026-04-01",
        store: "Netflix",
        amount: 1200,
        category: "",
        subcategory: "",
      },
    ]
  );

  const runState = createGeminiRunState();
  assert.deepStrictEqual(reserveGeminiRun(runState, false), {
    state: { inFlight: true, rerunQueued: false },
    shouldRun: true,
  });
  assert.deepStrictEqual(reserveGeminiRun({ inFlight: true }, false), {
    state: { inFlight: true, rerunQueued: false },
    shouldRun: false,
  });
  assert.deepStrictEqual(reserveGeminiRun({ inFlight: true }, true), {
    state: { inFlight: true, rerunQueued: true },
    shouldRun: false,
  });

  assert.strictEqual(
    getGeminiRuntimeErrorMessage({
      message:
        "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received",
    }),
    "background_channel_closed: A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received"
  );
  assert.strictEqual(
    formatGeminiErrorMessage("Gemini API error: 429"),
    "Gemini解析に失敗しました: Gemini API error: 429"
  );
  assert.strictEqual(
    formatGeminiErrorMessage(
      "Gemini API error: 500 with a long upstream response body that should not be shown in full"
    ),
    "Gemini解析に失敗しました: Gemini API error: 500 with a long upstream response body that sh..."
  );
  assert.strictEqual(
    formatGeminiErrorMessage(""),
    "Gemini解析に失敗しました"
  );

  assert.strictEqual(
    shouldSkipGeminiRun({
      currentMonth: "2026-04",
      state: secondMerge,
      transactionIds: ["tx-1", "tx-2", "tx-3"],
    }),
    true
  );
  assert.strictEqual(
    shouldSkipGeminiRun({
      currentMonth: "2026-04",
      state: secondMerge,
      transactionIds: ["tx-1", "tx-2", "tx-3", "tx-4"],
    }),
    false
  );
  assert.strictEqual(
    shouldSkipGeminiRun({
      currentMonth: "2026-05",
      state: secondMerge,
      transactionIds: ["tx-1"],
    }),
    false
  );

  assert.strictEqual(
    shouldClearGeminiHighlight({
      geminiEnabled: false,
      apiKeyConfigured: true,
    }),
    true
  );
  assert.strictEqual(
    shouldClearGeminiHighlight({
      geminiEnabled: true,
      apiKeyConfigured: false,
    }),
    true
  );
  assert.strictEqual(
    shouldClearGeminiHighlight({
      geminiEnabled: true,
      apiKeyConfigured: true,
    }),
    false
  );

  const previousFingerprint = getGeminiSettingsFingerprint({
    featureFlags: {
      geminiAnalysisEnabled: true,
      duplicateCheckEnabled: true,
    },
    geminiApiKeyConfigured: true,
    scoreThreshold: 70,
    model: "gemini-2.5-flash",
  });
  const sameFingerprint = getGeminiSettingsFingerprint({
    featureFlags: {
      geminiAnalysisEnabled: true,
      duplicateCheckEnabled: false,
    },
    geminiApiKeyConfigured: true,
    scoreThreshold: 70,
    model: "gemini-2.5-flash",
  });
  assert.strictEqual(previousFingerprint, sameFingerprint);

  const changedFingerprint = getGeminiSettingsFingerprint({
    featureFlags: {
      geminiAnalysisEnabled: true,
    },
    geminiApiKeyConfigured: false,
    scoreThreshold: 70,
    model: "gemini-2.5-flash",
  });
  assert.notStrictEqual(previousFingerprint, changedFingerprint);
};
