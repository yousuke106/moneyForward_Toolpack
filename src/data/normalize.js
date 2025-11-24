const EMOJI_REGEX =
  /[\p{Emoji_Presentation}\p{Emoji}\p{Extended_Pictographic}\p{Default_Ignorable_Code_Point}]/gu;
const AMOUNT_REGEX = /[-+−]?\d[\d,]*/u;

export const normalizeStoreName = (raw) => {
  if (!raw) {
    return "";
  }
  const trimmed = raw.trim();
  const collapsed = trimmed.replace(/\s+/g, " ");
  const cleaned = collapsed.replace(EMOJI_REGEX, "");
  return cleaned;
};

export const buildTxKey = (id) => `tx:${id}`;

export const buildStoreAmountKey = (store, amount) => {
  const normalizedStore = normalizeStoreName(store);
  return `sa:${normalizedStore}|${amount}`;
};

export const parseAmount = (text, isIncome) => {
  if (!text) {
    return null;
  }
  const match = text.match(AMOUNT_REGEX);
  if (!match) {
    return null;
  }
  const numeric = Number(match[0].replace(/,/g, "").replace("−", "-"));
  if (Number.isNaN(numeric)) {
    return null;
  }
  const absVal = Math.abs(numeric);
  return isIncome ? absVal : absVal;
};
