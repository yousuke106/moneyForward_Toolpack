import { loadSettings } from "../data/storage.js";

// Popup内の主要要素は先に参照しておき、以降の処理をシンプルにする。
const openOptionsBtn = document.getElementById("openOptions");
const rerunBtn = document.getElementById("rerunGemini");
const geminiStatus = document.getElementById("geminiStatus");

// Geminiの有効/無効に合わせてボタンとラベルの見え方を揃える。
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

// 設定の読み込みに失敗してもUIは安全側（有効）で表示する。
const syncToggleFromSettings = async () => {
  try {
    const result = await loadSettings();
    const enabled =
      result?.settings?.featureFlags?.geminiAnalysisEnabled ?? true;
    applyToggleState(enabled);
  } catch (_error) {
    applyToggleState(true);
  }
};

// 設定画面への遷移はブラウザ機能を優先し、無い場合はURLで開く。
openOptionsBtn?.addEventListener("click", () => {
  const runtime = globalThis.chrome?.runtime;
  if (runtime?.openOptionsPage) {
    runtime.openOptionsPage();
  } else if (runtime) {
    window.open(runtime.getURL("src/options/index.html"));
  }
});

// 再解析ボタンはアクティブタブへメッセージを送って実行する。
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

// 設定の変更を検知してポップアップ表示を最新化する。
chrome.storage?.onChanged?.addListener((changes) => {
  if (changes.settings?.newValue || changes.settings?.oldValue) {
    syncToggleFromSettings();
  }
});

syncToggleFromSettings();
