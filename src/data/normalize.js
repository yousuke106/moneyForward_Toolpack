// 店名の正規化で除去したい絵文字・不可視文字をまとめて除外する。
const EMOJI_REGEX =
  /[\p{Emoji_Presentation}\p{Emoji}\p{Extended_Pictographic}\p{Default_Ignorable_Code_Point}]/gu;
// 金額欄から数値を拾うための緩めの正規表現。
const AMOUNT_REGEX = /[-+−]?\d[\d,]*/u;

// 店名は空白と絵文字を落として比較用の形に整える。
export const normalizeStoreName = (raw) => {
  if (!raw) {
    return "";
  }
  const trimmed = raw.trim();
  const collapsed = trimmed.replace(/\s+/g, " ");
  const cleaned = collapsed.replace(EMOJI_REGEX, "");
  return cleaned;
};

// 取引IDをキー化する際のプレフィックス。
export const buildTxKey = (id) => `tx:${id}`;

// 店名+金額の組み合わせキー（翌月以降の自動適用に使用）。
export const buildStoreAmountKey = (store, amount) => {
  const normalizedStore = normalizeStoreName(store);
  return `sa:${normalizedStore}|${amount}`;
};

// 文字列から金額を抽出して数値化する（返り値は絶対値に統一）。
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
  // 収入/支出どちらも同一基準で比較するため絶対値に揃える。
  return isIncome ? absVal : absVal;
};
