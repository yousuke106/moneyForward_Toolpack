/* globals chrome */
import { loadSettings } from "../data/storage.js";
import {
  BADGE_COLORS,
  buildCsvFilename,
  buildCsvRequestUrl,
  dequeueNextFilename,
  HEADER_SELECTORS,
  isDownloaderEnabled,
  parseMonthFromHeader,
} from "./downloader-utils.js";

const TIMEOUT_MS = 60_000;
const MENU_ID = "mf-download-visible-month";
const BADGE_CLEAR_DELAY = 2800;
const pendingDownloadNames = [];
let badgeResetHandle = 0;
let downloadContextMenuEnabled = true;

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

const extractJson = (data) => {
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ??
    data?.candidates?.[0]?.output ??
    "";
  if (!text) {
    throw new Error("Empty Gemini response");
  }
  const cleaned = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed.results) {
    throw new Error("Missing results field in Gemini response");
  }
  return parsed;
};

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

const fetchCsvViaPage = async (tabId, requestUrl) => {
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

const triggerCsvDownload = async (tabId, parsed) => {
  const requestUrl = buildCsvRequestUrl(parsed);
  const result = await fetchCsvViaPage(tabId, requestUrl);
  if (!result || result.status !== "ok" || !result.dataUrl) {
    await setBadge("NG", BADGE_COLORS.error);
    return;
  }
  const filename = buildCsvFilename(parsed);
  pendingDownloadNames.push(filename);
  try {
    await chrome.downloads.download({
      url: result.dataUrl,
      saveAs: true,
    });
    await setBadge("DL", BADGE_COLORS.success);
  } catch {
    pendingDownloadNames.pop();
    await setBadge("NG", BADGE_COLORS.error);
  }
};

const handleContextClick = async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !downloadContextMenuEnabled) {
    return;
  }
  const tabId = info.tabId ?? tab?.id;
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
  await chrome.storage.sync.set({ mf_month_year: isoMonth });
  await triggerCsvDownload(tabId, parsed);
};

const createContextMenu = () => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "表示中の年月の家計簿CSVをダウンロード",
    contexts: ["page"],
    documentUrlPatterns: ["https://moneyforward.com/*"],
  });
};

// Serialize menu rebuilds to avoid duplicate-id errors when multiple triggers fire in quick succession.
let refreshContextMenuChain = Promise.resolve();

const refreshContextMenu = (enabled) => {
  refreshContextMenuChain = refreshContextMenuChain
    .catch(() => {
      /* reset on previous failure */
    })
    .then(
      () =>
        new Promise((resolve) => {
          chrome.contextMenus.removeAll(() => {
            if (enabled) {
              createContextMenu();
            }
            resolve();
          });
        })
    );
  return refreshContextMenuChain;
};

const syncDownloaderToggle = async () => {
  try {
    const result = await loadSettings();
    const enabled = isDownloaderEnabled(result?.settings);
    downloadContextMenuEnabled = enabled;
    await refreshContextMenu(enabled);
  } catch {
    downloadContextMenuEnabled = true;
    await refreshContextMenu(true);
  }
};

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  const nextName = dequeueNextFilename(
    pendingDownloadNames,
    item,
    chrome.runtime.id
  );
  suggest(nextName ? { filename: nextName, conflictAction: "uniquify" } : {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "requestGeminiAnalysis") {
    (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort("timeout"), TIMEOUT_MS);
      try {
        const { apiKey, model, month, transactions } = message;
        if (!apiKey) {
          throw new Error("APIキーが設定されていません");
        }
        const body = buildPrompt(month, transactions);

        // debug log
        // eslint-disable-next-line no-console
        console.log("[mf-sub][bg] request gemini", {
          model,
          count: transactions?.length ?? 0,
          month,
        });

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
        // eslint-disable-next-line no-console
        console.log("[mf-sub][bg] response status", res.status);
        if (!res.ok) {
          throw new Error(`Gemini API error: ${res.status}`);
        }
        const data = await res.json();
        const parsed = extractJson(data);
        sendResponse({ ok: true, data: parsed });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("[mf-sub][bg] gemini error", error);
        sendResponse({ ok: false, error: error?.message ?? String(error) });
      } finally {
        clearTimeout(timer);
      }
    })();

    return true;
  }
  return false;
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  handleContextClick(info, tab).catch(() => {
    /* ignore */
  });
});

chrome.runtime.onInstalled.addListener(() => {
  syncDownloaderToggle().catch(() => {
    /* ignore */
  });
});

chrome.runtime.onStartup.addListener(() => {
  syncDownloaderToggle().catch(() => {
    /* ignore */
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" || areaName === "local") {
    const updatedSettings = changes.settings?.newValue;
    if (updatedSettings) {
      const enabled = isDownloaderEnabled(updatedSettings);
      downloadContextMenuEnabled = enabled;
      refreshContextMenu(enabled).catch(() => {
        /* ignore */
      });
    }
  }
});

syncDownloaderToggle().catch(() => {
  /* ignore */
});
