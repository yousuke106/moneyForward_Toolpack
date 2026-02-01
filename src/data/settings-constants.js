// 設定値のデフォルトや容量しきい値など、複数箇所で使う定数を集約する。

// sync領域の上限に近づいた場合はlocalへフォールバックする。
export const SYNC_THRESHOLD_BYTES = 90 * 1024;
export const SYNC_TOTAL_LIMIT_BYTES = 100 * 1024;

// 設定画面とcontentで共有するデフォルト値。
export const DEFAULT_THRESHOLD = 70;
export const DEFAULT_MODEL = "gemini-2.5-flash";
