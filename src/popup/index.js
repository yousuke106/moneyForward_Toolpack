import { loadSettings } from "../data/storage.js";

const openOptionsBtn = document.getElementById("openOptions");
const rerunBtn = document.getElementById("rerunGemini");
const geminiStatus = document.getElementById("geminiStatus");

const applyToggleState = (enabled) => {
  if (!rerunBtn) {
    return;
  }
  rerunBtn.disabled = !enabled;
  if (enabled) {
    rerunBtn.removeAttribute("title");
    rerunBtn.setAttribute("aria-disabled", "false");
    if (geminiStatus) {
      geminiStatus.textContent = "Gemini ON";
      geminiStatus.classList.remove("is-off");
    }
  } else {
    rerunBtn.title = "Gemini解析は無効化されています";
    rerunBtn.setAttribute("aria-disabled", "true");
    if (geminiStatus) {
      geminiStatus.textContent = "Gemini OFF";
      geminiStatus.classList.add("is-off");
    }
  }
};

const syncToggleFromSettings = async () => {
  try {
    const result = await loadSettings();
    const enabled =
      result?.settings?.featureFlags?.geminiAnalysisEnabled ?? true;
    applyToggleState(enabled);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[mf-sub][popup] failed to load settings", error);
    applyToggleState(true);
  }
};

openOptionsBtn?.addEventListener("click", () => {
  const runtime = globalThis.chrome?.runtime;
  if (runtime?.openOptionsPage) {
    runtime.openOptionsPage();
  } else if (runtime) {
    window.open(runtime.getURL("src/options/index.html"));
  }
});

rerunBtn?.addEventListener("click", () => {
  if (rerunBtn.disabled) {
    return;
  }
  chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs?.[0]?.id;
    if (tabId !== undefined) {
      chrome.tabs.sendMessage(tabId, { type: "mf_subs_rerun_gemini" });
      window.close();
    }
  });
});

chrome.storage?.onChanged?.addListener((changes) => {
  if (changes.settings?.newValue || changes.settings?.oldValue) {
    syncToggleFromSettings();
  }
});

syncToggleFromSettings();
