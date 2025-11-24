document.getElementById("openOptions")?.addEventListener("click", () => {
  const runtime = globalThis.chrome?.runtime;
  if (runtime?.openOptionsPage) {
    runtime.openOptionsPage();
  } else if (runtime) {
    window.open(runtime.getURL("src/options/index.html"));
  }
});

document.getElementById("rerunGemini")?.addEventListener("click", () => {
  chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs?.[0]?.id;
    if (tabId !== undefined) {
      chrome.tabs.sendMessage(tabId, { type: "mf_subs_rerun_gemini" });
      window.close();
    }
  });
});
