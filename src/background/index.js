/* globals chrome */

const TIMEOUT_MS = 60_000;

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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "requestGeminiAnalysis") {
    return false;
  }

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

  return true; // async sendResponse
});
