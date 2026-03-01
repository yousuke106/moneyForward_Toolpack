/* globals chrome */
import { loadSettings } from "../data/storage.js";
import {
  BADGE_COLORS,
  buildCsvFilename,
  buildCsvRequestUrl,
  HEADER_SELECTORS,
  isDownloaderEnabled,
  isSummaryOutgoAmountCopyEnabled,
  parseMonthFromHeader,
} from "./downloader-utils.js";
import { extractJson } from "./gemini-utils.js";
import {
  buildClipboardTextFromAmounts,
  collectOutgoAmountsForCopy,
} from "./summary-outgo-copy-utils.js";

// GeminiのAPIタイムアウトとUI周りはここで一括管理する。
const TIMEOUT_MS = 60_000;
const DOWNLOAD_MENU_ID = "mf-download-visible-month";
const SUMMARY_OUTGO_COPY_MENU_ID = "mf-copy-summary-outgo-amounts";
const DOWNLOAD_MENU_URL_PATTERNS = [
  "https://moneyforward.com/cf",
  "https://moneyforward.com/cf/",
];
const SUMMARY_OUTGO_COPY_URL_PATTERNS = [
  "https://moneyforward.com/cf/summary*",
];
const BADGE_CLEAR_DELAY = 2800;
let badgeResetHandle = 0;
let downloadContextMenuEnabled = true;
let summaryOutgoCopyContextMenuEnabled = true;

// Geminiに渡す最小限のプロンプトを組み立てる（ラベル値は返させない）。
const buildPrompt = (month, transactions) => {
  const instruction = [
    "You are an assistant that flags potential subscription transactions.",
    "Return JSON with a 'results' array of objects: { id, score } where score is 0-100.",
    "Score higher if the merchant and amount look recurring or fixed.",
    "Only include ids that meet threshold logic; still return score for all given ids.",
  ].join(" ");
  const user = JSON.stringify({ month, transactions });
  return {
    contents: [
      {
        parts: [{ text: `${instruction}\n\nTransactions:\n${user}` }],
      },
    ],
  };
};

// バッジは短時間で自動クリアする運用にして、誤操作を防ぐ。
const setBadge = async (text, color) => {
  if (!chrome?.action) {
    return;
  }
  if (badgeResetHandle) {
    clearTimeout(badgeResetHandle);
    badgeResetHandle = 0;
  }
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  badgeResetHandle = setTimeout(() => {
    chrome.action.setBadgeText({ text: "" }).catch(() => {
      /* ignore */
    });
    badgeResetHandle = 0;
  }, BADGE_CLEAR_DELAY);
};

// 対象タブのヘッダーから「年月」を拾う。複数フレームを横断して探索する。
const extractHeaderFromTab = async (tabId) => {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (selectors) => {
        const elements = [];
        for (const selector of selectors) {
          elements.push(...document.querySelectorAll(selector));
        }
        const candidate = elements.find(
          (element) => element?.textContent?.trim().length
        );
        return candidate ? candidate.textContent : null;
      },
      args: [HEADER_SELECTORS],
    });
    for (const frameResult of results) {
      if (
        frameResult &&
        typeof frameResult.result === "string" &&
        frameResult.result.trim().length
      ) {
        return frameResult.result;
      }
    }
    return null;
  } catch {
    return null;
  }
};

// ページ側のセッションを使うため、タブ内コンテキストでCSVを取得する。
const fetchCsvViaPage = async (tabId, requestUrl) => {
  // Cookie付きのCSV取得はページコンテキストで実行する必要がある。
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: async (args) => {
        const { requestUrlInner } = args;
        try {
          const response = await fetch(requestUrlInner, {
            credentials: "include",
          });
          if (!response.ok) {
            return { status: "error", code: response.status };
          }
          const arrayBuffer = await response.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = "";
          const chunkSize = 0x80_00;
          // data: URL 化のためにバイナリ文字列へ分割変換する。
          for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            const chunk = bytes.subarray(offset, offset + chunkSize);
            binary += String.fromCharCode(...chunk);
          }
          const base64 = btoa(binary);
          const dataUrl = `data:text/csv;base64,${base64}`;
          return { status: "ok", dataUrl };
        } catch (fetchError) {
          return { status: "error", message: String(fetchError) };
        }
      },
      args: [{ requestUrlInner: requestUrl }],
    });
    return result ? result.result : null;
  } catch {
    return null;
  }
};

// CSVの取得→ダウンロード→バッジ表示までをまとめて扱う。
const triggerCsvDownload = async (tabId, parsed) => {
  const requestUrl = buildCsvRequestUrl(parsed);
  const result = await fetchCsvViaPage(tabId, requestUrl);
  if (!result || result.status !== "ok" || !result.dataUrl) {
    await setBadge("NG", BADGE_COLORS.error);
    return;
  }
  const filename = buildCsvFilename(parsed);
  try {
    await chrome.downloads.download({
      url: result.dataUrl,
      // onDeterminingFilename を使わず、拡張由来の保存名をここで明示する。
      filename,
      conflictAction: "uniquify",
      saveAs: true,
    });
    await setBadge("DL", BADGE_COLORS.success);
  } catch {
    await setBadge("NG", BADGE_COLORS.error);
  }
};

const getTabIdFromContext = (info, tab) => {
  const tabId = info.tabId ?? tab?.id;
  return typeof tabId === "number" ? tabId : null;
};

// 収支内訳テーブルから、ラベルと金額文字列のペアを取り出す。
const extractSummaryOutgoRowsFromTab = async (tabId) => {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const table = document.querySelector("#table-outgo");
        if (!table) {
          return { ok: false, reason: "table_not_found", rows: [] };
        }
        const tbodyRows = table.querySelectorAll("tbody tr");
        const rowElements =
          tbodyRows.length > 0
            ? Array.from(tbodyRows)
            : Array.from(table.querySelectorAll("tr")).filter((row) =>
                row.querySelector("td")
              );
        const rows = rowElements.map((row) => {
          const firstCell = row.querySelector("th, td");
          const tdCells = row.querySelectorAll("td");
          const amountCell =
            row.querySelector("td:nth-child(2)") ?? tdCells[1] ?? tdCells[0];
          return {
            labelText: firstCell?.textContent?.trim() ?? "",
            amountText: amountCell?.textContent?.trim() ?? "",
          };
        });
        return { ok: true, rows };
      },
    });
    return result?.result ?? { ok: false, reason: "script_failed", rows: [] };
  } catch {
    return { ok: false, reason: "script_failed", rows: [] };
  }
};

// クリップボード書き込みはページ側で実行し、API失敗時はexecCommandにフォールバックする。
const copyTextInTab = async (tabId, text) => {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (payload) => {
        const value = payload.textToCopy ?? "";
        const fallbackCopy = () => {
          const textarea = document.createElement("textarea");
          textarea.value = value;
          textarea.setAttribute("readonly", "true");
          textarea.style.position = "fixed";
          textarea.style.top = "-9999px";
          textarea.style.left = "-9999px";
          document.body.append(textarea);
          textarea.select();
          const ok = document.execCommand("copy");
          textarea.remove();
          return ok;
        };

        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return { ok: true, method: "clipboard_api" };
          }
        } catch {
          // fallbackへ進む
        }
        return { ok: fallbackCopy(), method: "exec_command" };
      },
      args: [{ textToCopy: text }],
    });
    return Boolean(result?.result?.ok);
  } catch {
    return false;
  }
};

// 収支内訳の支出中分類金額を改行区切りでクリップボードへコピーする。
const triggerSummaryOutgoAmountCopy = async (tabId) => {
  const extracted = await extractSummaryOutgoRowsFromTab(tabId);
  if (!extracted?.ok) {
    await setBadge("NA", BADGE_COLORS.error);
    return;
  }
  const amounts = collectOutgoAmountsForCopy(extracted.rows);
  if (amounts.length === 0) {
    await setBadge("NA", BADGE_COLORS.notice);
    return;
  }
  const text = buildClipboardTextFromAmounts(amounts);
  const copied = await copyTextInTab(tabId, text);
  if (!copied) {
    await setBadge("NG", BADGE_COLORS.error);
    return;
  }
  await setBadge("CP", BADGE_COLORS.success);
};

const handleDownloadMenuClick = async (info, tab) => {
  const tabId = getTabIdFromContext(info, tab);
  if (typeof tabId !== "number") {
    await setBadge("NA", BADGE_COLORS.error);
    return;
  }

  const header = await extractHeaderFromTab(tabId);
  const parsed = parseMonthFromHeader(header);
  if (!parsed) {
    await setBadge("NA", BADGE_COLORS.error);
    return;
  }

  const isoMonth = `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;
  try {
    await chrome.storage.sync.set({ mf_month_year: isoMonth });
  } catch {
    // sync保存に失敗してもダウンロード処理は継続する。
  }
  await triggerCsvDownload(tabId, parsed);
};

// コンテキストメニュー実行時のメインハンドラ。
const handleContextClick = async (info, tab) => {
  if (info.menuItemId === DOWNLOAD_MENU_ID) {
    if (!downloadContextMenuEnabled) {
      return;
    }
    await handleDownloadMenuClick(info, tab);
    return;
  }
  if (info.menuItemId === SUMMARY_OUTGO_COPY_MENU_ID) {
    if (!summaryOutgoCopyContextMenuEnabled) {
      return;
    }
    const tabId = getTabIdFromContext(info, tab);
    if (typeof tabId !== "number") {
      await setBadge("NA", BADGE_COLORS.error);
      return;
    }
    await triggerSummaryOutgoAmountCopy(tabId);
  }
};

// メニュー登録は背景SWが複数起動しても壊れないように冪等化する。
const createContextMenu = ({ id, title, documentUrlPatterns }) =>
  new Promise((resolve) => {
    chrome.contextMenus.create(
      {
        id,
        title,
        contexts: ["page"],
        documentUrlPatterns,
      },
      () => {
        // Ignore duplicate-id errors that can occur when normal/incognito SWs race.
        if (chrome.runtime.lastError) {
          // noop
        }
        resolve();
      }
    );
  });

// 不要なメニューを確実に外す（存在しない場合は無視）。
const removeContextMenu = (menuId) =>
  new Promise((resolve) => {
    chrome.contextMenus.remove(menuId, () => {
      // menu may not exist; ignore errors
      if (chrome.runtime.lastError) {
        // noop
      }
      resolve();
    });
  });

// 複数のトリガーでメニュー再構築が走るため、直列化して重複IDを避ける。
let refreshContextMenusChain = Promise.resolve();

// 設定反映の一連処理を直列化しつつ、メニューのON/OFFを切り替える。
const refreshContextMenus = ({ downloaderEnabled, summaryCopyEnabled }) => {
  refreshContextMenusChain = refreshContextMenusChain
    .catch(() => {
      /* reset on previous failure */
    })
    .then(async () => {
      await removeContextMenu(DOWNLOAD_MENU_ID);
      await removeContextMenu(SUMMARY_OUTGO_COPY_MENU_ID);
      if (downloaderEnabled) {
        await createContextMenu({
          id: DOWNLOAD_MENU_ID,
          title: "表示中の年月の家計簿CSVをダウンロード",
          documentUrlPatterns: DOWNLOAD_MENU_URL_PATTERNS,
        });
      }
      if (summaryCopyEnabled) {
        await createContextMenu({
          id: SUMMARY_OUTGO_COPY_MENU_ID,
          title: "中分類の金額をコピー",
          documentUrlPatterns: SUMMARY_OUTGO_COPY_URL_PATTERNS,
        });
      }
    });
  return refreshContextMenusChain;
};

// ストレージから現在のトグル状態を読み、メニュー表示に反映する。
const syncContextMenuToggles = async () => {
  try {
    const result = await loadSettings();
    downloadContextMenuEnabled = isDownloaderEnabled(result?.settings);
    summaryOutgoCopyContextMenuEnabled = isSummaryOutgoAmountCopyEnabled(
      result?.settings
    );
    await refreshContextMenus({
      downloaderEnabled: downloadContextMenuEnabled,
      summaryCopyEnabled: summaryOutgoCopyContextMenuEnabled,
    });
  } catch {
    downloadContextMenuEnabled = true;
    summaryOutgoCopyContextMenuEnabled = true;
    await refreshContextMenus({
      downloaderEnabled: true,
      summaryCopyEnabled: true,
    });
  }
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "requestGeminiAnalysis") {
    // コンテント側の要求を受け、Gemini APIを背景で実行する。
    (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort("timeout"), TIMEOUT_MS);
      try {
        const { apiKey, model, month, transactions } = message;
        if (!apiKey) {
          throw new Error("APIキーが設定されていません");
        }
        const body = buildPrompt(month, transactions);

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
            // keepalive is ignored in SW fetch but included for safety
            keepalive: true,
          }
        );
        if (!res.ok) {
          throw new Error(`Gemini API error: ${res.status}`);
        }
        const data = await res.json();
        const parsed = extractJson(data);
        sendResponse({ ok: true, data: parsed });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message ?? String(error) });
      } finally {
        clearTimeout(timer);
      }
    })();

    return true;
  }
  return false;
});

// 各種イベントハンドラはここで集約して登録する。
chrome.contextMenus.onClicked.addListener((info, tab) => {
  handleContextClick(info, tab).catch(() => {
    /* ignore */
  });
});

chrome.runtime.onInstalled.addListener(() => {
  syncContextMenuToggles().catch(() => {
    /* ignore */
  });
});

chrome.runtime.onStartup.addListener(() => {
  syncContextMenuToggles().catch(() => {
    /* ignore */
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" || areaName === "local") {
    const updatedSettings = changes.settings?.newValue;
    if (updatedSettings) {
      downloadContextMenuEnabled = isDownloaderEnabled(updatedSettings);
      summaryOutgoCopyContextMenuEnabled =
        isSummaryOutgoAmountCopyEnabled(updatedSettings);
      refreshContextMenus({
        downloaderEnabled: downloadContextMenuEnabled,
        summaryCopyEnabled: summaryOutgoCopyContextMenuEnabled,
      }).catch(() => {
        /* ignore */
      });
    }
  }
});

syncContextMenuToggles().catch(() => {
  /* ignore */
});
