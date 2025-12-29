const HEADER_MONTH_REGEX = /(\d{4})\D+(\d{1,2})/;
const CSV_DATA_URL_PREFIX = "data:text/csv";
export const HEADER_SELECTORS = ["span.fc-header-title", ".fc-header-title"];
export const BADGE_COLORS = {
  success: "#10b981",
  error: "#dc2626",
  notice: "#f97316",
};

const padMonth = (value) => String(value).padStart(2, "0");

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

export const buildCsvRequestUrl = ({ year, month }) =>
  `https://moneyforward.com/cf/csv?from=${year}%2F${padMonth(month)}%2F01&month=${month}&year=${year}`;

export const buildCsvFilename = ({ year, month }) =>
  `moneyforward_${year}${padMonth(month)}.csv`;

export const dequeueNextFilename = (pendingNames, item, extensionId) => {
  // Some downloads (notably data URLs) may not populate byExtensionId reliably.
  const isExtensionDownload = item?.byExtensionId === extensionId;
  const isCsvDataUrl =
    typeof item?.url === "string" && item.url.startsWith(CSV_DATA_URL_PREFIX);
  if ((isExtensionDownload || isCsvDataUrl) && pendingNames.length) {
    return pendingNames.shift();
  }
  return null;
};

export const isDownloaderEnabled = (settings) =>
  settings?.featureFlags?.downloaderContextMenuEnabled ?? true;
