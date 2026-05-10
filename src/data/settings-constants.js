// 設定値のデフォルトや容量しきい値など、複数箇所で使う定数を集約する。

// sync領域の上限に近づいた場合はlocalへフォールバックする。
export const SYNC_THRESHOLD_BYTES = 90 * 1024;
export const SYNC_TOTAL_LIMIT_BYTES = 100 * 1024;

// 設定画面とcontentで共有するデフォルト値。
export const DEFAULT_THRESHOLD = 70;
export const DEFAULT_MODEL = "gemini-2.5-flash";
export const EXPERIMENTAL_MODEL_IDS = new Set([
  "gemma-4-26b-a4b-it",
  "gemma-4-31b-it",
]);

export const isExperimentalModel = (model) => EXPERIMENTAL_MODEL_IDS.has(model);

export const MODEL_OPTIONS = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash（推奨・安定）" },
  {
    value: "gemini-3-flash-preview",
    label: "Gemini 3 Flash Preview（最新・高速）",
  },
  {
    value: "gemini-3-pro-preview",
    label: "Gemini 3 Pro Preview（最新・高精度）",
  },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro（安定・高精度）" },
  {
    value: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite（安定・軽量）",
  },
  {
    value: "gemma-4-26b-a4b-it",
    label: "Gemma 4 26B A4B IT（実験的・不安定）",
  },
  {
    value: "gemma-4-31b-it",
    label: "Gemma 4 31B IT（実験的・不安定）",
  },
];
