const EMPTY_STATE = {
  month: "",
  resultsByTxId: {},
  highlightedTxIds: [],
};

const sanitizeScore = (score) =>
  typeof score === "number" && Number.isFinite(score) ? score : 0;

const sanitizeResultsByTxId = (resultsByTxId) => {
  const normalized = {};
  for (const [txId, score] of Object.entries(resultsByTxId ?? {})) {
    if (!txId) {
      continue;
    }
    normalized[txId] = sanitizeScore(score);
  }
  return normalized;
};

const GEMINI_ERROR_MESSAGE_MAX_LENGTH = 64;
const GEMINI_TRANSACTION_STRING_MAX_LENGTH = 200;

export const createGeminiAnalysisState = () => ({ ...EMPTY_STATE });

export const shouldClearGeminiHighlight = ({
  geminiEnabled,
  apiKeyConfigured,
}) => !(geminiEnabled && apiKeyConfigured);

export const getGeminiSettingsFingerprint = (settings = {}) =>
  JSON.stringify({
    geminiAnalysisEnabled:
      settings?.featureFlags?.geminiAnalysisEnabled ?? true,
    geminiApiKeyConfigured: settings?.geminiApiKeyConfigured ?? false,
    model: settings?.model ?? "",
    scoreThreshold: settings?.scoreThreshold ?? null,
  });

export const mergeGeminiBatchResults = (state, month, results) => {
  const nextResultsByTxId =
    state?.month === month ? sanitizeResultsByTxId(state?.resultsByTxId) : {};

  for (const item of results ?? []) {
    if (!item?.id) {
      continue;
    }
    nextResultsByTxId[item.id] = sanitizeScore(item.score);
  }

  return {
    month,
    resultsByTxId: nextResultsByTxId,
    highlightedTxIds: Object.keys(nextResultsByTxId),
  };
};

export const getHighlightedTxIds = (state, threshold) => {
  const txIds = new Set();
  for (const [txId, score] of Object.entries(state?.resultsByTxId ?? {})) {
    if (score >= threshold) {
      txIds.add(txId);
    }
  }
  return txIds;
};

const sanitizeTransactionString = (value) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text.slice(0, GEMINI_TRANSACTION_STRING_MAX_LENGTH);
};

const sanitizeTransaction = (transaction) => ({
  id: sanitizeTransactionString(transaction.id),
  date: sanitizeTransactionString(transaction.date),
  store: sanitizeTransactionString(transaction.store),
  amount: transaction.amount,
  category: sanitizeTransactionString(transaction.category),
  subcategory: sanitizeTransactionString(transaction.subcategory),
});

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

export const sanitizeGeminiTransactions = (transactions) =>
  (transactions ?? [])
    .map(sanitizeTransaction)
    .filter(
      (transaction) =>
        isNonEmptyString(transaction?.id) &&
        isNonEmptyString(transaction?.date) &&
        isNonEmptyString(transaction?.store) &&
        typeof transaction?.amount === "number" &&
        Number.isFinite(transaction.amount)
    );

export const buildGeminiPayload = ({ month, model, transactions }) => ({
  type: "requestGeminiAnalysis",
  month,
  model,
  transactions: sanitizeGeminiTransactions(transactions),
});

export const createGeminiRunState = () => ({
  inFlight: false,
  rerunQueued: false,
});

export const reserveGeminiRun = (state, forceRerun = false) => {
  if (state?.inFlight) {
    return {
      state: {
        inFlight: true,
        rerunQueued: Boolean(state.rerunQueued || forceRerun),
      },
      shouldRun: false,
    };
  }
  return {
    state: {
      inFlight: true,
      rerunQueued: false,
    },
    shouldRun: true,
  };
};

export const getGeminiRuntimeErrorMessage = (lastError) => {
  const message = lastError?.message ?? "";
  if (message.includes("message channel closed")) {
    return `background_channel_closed: ${message}`;
  }
  if (message.includes("Extension context invalidated")) {
    return `extension_context_invalidated: ${message}`;
  }
  return message ? `runtime_message_error: ${message}` : "";
};

export const formatGeminiErrorMessage = (message) => {
  const trimmed = typeof message === "string" ? message.trim() : "";
  if (!trimmed) {
    return "Gemini解析に失敗しました";
  }
  const shortened =
    trimmed.length > GEMINI_ERROR_MESSAGE_MAX_LENGTH
      ? `${trimmed.slice(0, GEMINI_ERROR_MESSAGE_MAX_LENGTH)}...`
      : trimmed;
  return `Gemini解析に失敗しました: ${shortened}`;
};

export const shouldSkipGeminiRun = ({
  currentMonth,
  state,
  transactionIds,
}) => {
  if (state?.month !== currentMonth) {
    return false;
  }
  const knownIds = new Set(Object.keys(state?.resultsByTxId ?? {}));
  if (!transactionIds?.length || knownIds.size === 0) {
    return false;
  }
  for (const txId of transactionIds) {
    if (!knownIds.has(txId)) {
      return false;
    }
  }
  return true;
};
