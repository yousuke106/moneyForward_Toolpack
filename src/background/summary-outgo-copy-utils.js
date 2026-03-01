// 収支内訳テーブルの金額抽出に使う正規表現。
const AMOUNT_REGEX = /[-+−]?\d[\d,]*/u;
const LEADING_SIGN_REGEX = /^[-+]/;
const DIGITS_ONLY_REGEX = /^\d+$/u;

// 集計行（合計/小計）はコピー対象から除外する。
const AGGREGATE_LABEL_REGEX = /(合計|小計)/u;

const normalizeMinus = (value) => value.replace(/−/g, "-");

// 金額テキストから符号付き整数文字列を抽出する。
export const parseSignedAmountText = (text) => {
  if (!text) {
    return null;
  }
  const match = normalizeMinus(`${text}`).match(AMOUNT_REGEX);
  if (!match) {
    return null;
  }
  const raw = match[0].replace(/,/g, "");
  const sign = raw.startsWith("-") ? "-" : "";
  const digits = raw.replace(LEADING_SIGN_REGEX, "");
  if (!DIGITS_ONLY_REGEX.test(digits)) {
    return null;
  }
  return `${sign}${digits}`;
};

// 集計行の判定。ラベルが取れない行は安全側で対象に残す。
export const isAggregateRow = (labelText) =>
  Boolean(labelText && AGGREGATE_LABEL_REGEX.test(labelText));

// DOM抽出済みの行データから、コピー用金額リストを組み立てる。
export const collectOutgoAmountsForCopy = (rows = []) => {
  const amounts = [];
  for (const row of rows) {
    const label = row?.labelText?.trim?.() ?? "";
    if (isAggregateRow(label)) {
      continue;
    }
    const parsed = parseSignedAmountText(row?.amountText ?? "");
    if (!parsed) {
      continue;
    }
    amounts.push(parsed);
  }
  return amounts;
};

// クリップボードに書き込む最終文字列へ変換する。
export const buildClipboardTextFromAmounts = (amounts = []) =>
  amounts.join("\n");
