import assert from "node:assert";
import {
  DEFAULT_MODEL,
  MODEL_OPTIONS,
} from "../../src/data/settings-constants.js";

const EXPECTED_MODEL_OPTIONS = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash（推奨・安定）" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview（最新・高速）" },
  { value: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview（最新・高精度）" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro（安定・高精度）" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite（安定・軽量）" },
  { value: "gemma-4-26b-a4b-it", label: "Gemma 4 26B A4B IT（Gemma・軽量）" },
  { value: "gemma-4-31b-it", label: "Gemma 4 31B IT（Gemma・高性能）" },
];

export const runSettingsConstantsTests = () => {
  assert.strictEqual(DEFAULT_MODEL, "gemini-2.5-flash");
  assert.deepStrictEqual(MODEL_OPTIONS, EXPECTED_MODEL_OPTIONS);

  const modelIds = MODEL_OPTIONS.map(({ value }) => value);
  assert.ok(!modelIds.some((value) => value.startsWith("gemini-1.5-")));
  assert.ok(!modelIds.some((value) => value.startsWith("gemini-2.0-")));
  assert.ok(!modelIds.some((value) => value.includes("image")));
  assert.ok(!modelIds.some((value) => value.includes("tts")));
};
