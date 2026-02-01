// Gemini応答のJSON抽出を安全に行うユーティリティ。

// Markdownコードフェンスを除去して解析対象を整える。
const stripCodeFence = (text) => text.replace(/```(?:json)?/gu, "").trim();

const createScannerState = () => ({
  depth: 0,
  start: -1,
  inString: false,
  escaped: false,
});

const consumeEscape = (state, char) => {
  if (state.escaped) {
    state.escaped = false;
    return true;
  }
  if (char === "\\") {
    state.escaped = true;
    return true;
  }
  return false;
};

const consumeStringToggle = (state, char) => {
  if (char === '"') {
    state.inString = !state.inString;
    return true;
  }
  return false;
};

const consumeOpenBrace = (state, char, index) => {
  if (char !== "{" || state.inString) {
    return false;
  }
  if (state.depth === 0) {
    state.start = index;
  }
  state.depth += 1;
  return true;
};

const consumeCloseBrace = (state, char, index, text) => {
  if (char !== "}" || state.inString || state.depth <= 0) {
    return null;
  }
  state.depth -= 1;
  if (state.depth === 0 && state.start >= 0) {
    return text.slice(state.start, index + 1);
  }
  return null;
};

// 文字列内のJSONオブジェクトを探索し、パースに成功したものを返す。
const parseFirstJsonObject = (text) => {
  const state = createScannerState();

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (consumeEscape(state, char)) {
      continue;
    }
    if (consumeStringToggle(state, char)) {
      continue;
    }
    if (state.inString) {
      continue;
    }
    if (consumeOpenBrace(state, char, i)) {
      continue;
    }
    const candidate = consumeCloseBrace(state, char, i, text);
    if (candidate) {
      try {
        return JSON.parse(candidate);
      } catch {
        // 解析失敗時は次の候補探索へ進む。
      }
    }
  }
  return null;
};

// Geminiの応答はフォーマット揺れがあるため、文字列→JSONを安全に抽出する。
export const extractJson = (data) => {
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ??
    data?.candidates?.[0]?.output ??
    "";
  if (!text) {
    throw new Error("Empty Gemini response");
  }

  const cleaned = stripCodeFence(text);
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed?.results) {
      throw new Error("Missing results field in Gemini response");
    }
    return parsed;
  } catch {
    const parsed = parseFirstJsonObject(cleaned);
    if (!parsed?.results) {
      throw new Error("Missing results field in Gemini response");
    }
    return parsed;
  }
};
