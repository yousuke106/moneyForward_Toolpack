const ALLOWED_URL_PREFIX = "https://moneyforward.com/";
const MONTH_PATTERN = /^\d{4}-\d{2}$/u;
const MODEL_PATTERN = /^[a-z0-9][a-z0-9-._]{0,63}$/iu;
const MAX_TRANSACTIONS_PER_REQUEST = 50;
const MAX_STRING_LENGTH = 200;

const TRANSACTION_KEYS = [
  "id",
  "date",
  "store",
  "amount",
  "category",
  "subcategory",
];

const getStringValidationError = (value, field, { required }) => {
  if (typeof value !== "string") {
    return `${field}_not_string`;
  }
  if (required && value.length === 0) {
    return `${field}_empty`;
  }
  if (value.length > MAX_STRING_LENGTH) {
    return `${field}_too_long`;
  }
  return "";
};

export const isAllowedSenderUrl = (url) =>
  typeof url === "string" && url.startsWith(ALLOWED_URL_PREFIX);

const getInvalidTransactionReason = (transaction) => {
  if (
    !transaction ||
    typeof transaction !== "object" ||
    Array.isArray(transaction)
  ) {
    return "not_object";
  }
  const keys = Object.keys(transaction).sort();
  const expectedKeys = [...TRANSACTION_KEYS].sort();
  if (keys.length !== expectedKeys.length) {
    return "invalid_keys";
  }
  for (const key of expectedKeys) {
    if (!keys.includes(key)) {
      return "invalid_keys";
    }
  }
  const stringError =
    getStringValidationError(transaction.id, "id", { required: true }) ||
    getStringValidationError(transaction.date, "date", { required: true }) ||
    getStringValidationError(transaction.store, "store", { required: true }) ||
    getStringValidationError(transaction.category, "category", {
      required: false,
    }) ||
    getStringValidationError(transaction.subcategory, "subcategory", {
      required: false,
    });
  if (stringError) {
    return stringError;
  }
  if (
    typeof transaction.amount !== "number" ||
    !Number.isFinite(transaction.amount)
  ) {
    return "amount_invalid";
  }
  return "";
};

export const getValidatedGeminiRequest = (message, sender) => {
  if (!isAllowedSenderUrl(sender?.tab?.url)) {
    throw new Error("unauthorized_sender");
  }
  if (!MONTH_PATTERN.test(message?.month ?? "")) {
    throw new Error("invalid_month");
  }
  if (!MODEL_PATTERN.test(message?.model ?? "")) {
    throw new Error("invalid_model");
  }
  if (!Array.isArray(message?.transactions)) {
    throw new Error("invalid_transactions");
  }
  if (message.transactions.length > MAX_TRANSACTIONS_PER_REQUEST) {
    throw new Error("too_many_transactions");
  }
  for (const transaction of message.transactions) {
    const invalidReason = getInvalidTransactionReason(transaction);
    if (invalidReason) {
      throw new Error(`invalid_transaction:${invalidReason}`);
    }
  }
  return {
    month: message.month,
    model: message.model,
    transactions: message.transactions,
  };
};
