// カレンダーヘッダーの表示（YYYY〜MM）から年月を抜き出すための正規表現。
const HEADER_MONTH_REGEX = /(\d{4})\D+(\d{1,2})/;
// 月表示ヘッダーの候補。MoneyForward側のDOM差分に備えて複数指定する。
export const HEADER_SELECTORS = ["span.fc-header-title", ".fc-header-title"];
// バッジに使う色はここで統一して管理する。
export const BADGE_COLORS = {
  success: "#10b981",
  error: "#dc2626",
  notice: "#f97316",
};

const padMonth = (value) => String(value).padStart(2, "0");

// ヘッダ文字列から年月を抽出し、取れない場合は null を返す。
export const parseMonthFromHeader = (raw) => {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim();
  const match = normalized.match(HEADER_MONTH_REGEX);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!(Number.isFinite(year) && Number.isFinite(month))) {
    return null;
  }
  if (month < 1 || month > 12) {
    return null;
  }
  return { year, month };
};

// MoneyForwardのCSVダウンロードURLを年月から組み立てる。
export const buildCsvRequestUrl = ({ year, month }) =>
  `https://moneyforward.com/cf/csv?from=${year}%2F${padMonth(month)}%2F01&month=${month}&year=${year}`;

// ダウンロードファイル名は年月が一目で分かる形に固定する。
export const buildCsvFilename = ({ year, month }) =>
  `moneyforward_${year}${padMonth(month)}.csv`;

// 追加機能は安全側で有効に倒す（設定が無い/壊れている場合も動くようにする）。
export const isDownloaderEnabled = (settings) =>
  settings?.featureFlags?.downloaderContextMenuEnabled ?? true;

// 収支内訳の金額コピー機能は安全側（有効）を既定とする。
export const isSummaryOutgoAmountCopyEnabled = (settings) =>
  settings?.featureFlags?.summaryOutgoAmountCopyEnabled ?? true;
