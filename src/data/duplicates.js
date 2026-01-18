import { normalizeStoreName } from "./normalize.js";

// 重複判定キー用のプレフィックス。
const DUP_PREFIX = "dup:";

const isEmpty = (value) =>
  value === null || value === undefined || value === "";

// 「日付+店名+金額」が同一の取引を検出するためのキー生成。
export const buildDuplicateKey = ({ date, store, amount }) => {
  if (
    isEmpty(date) ||
    isEmpty(store) ||
    amount === null ||
    amount === undefined
  ) {
    return "";
  }
  const normalizedStore = normalizeStoreName(store);
  if (!normalizedStore) {
    return "";
  }
  return `${DUP_PREFIX}${date}|${normalizedStore}|${amount}`;
};

/**
 * 取引配列を日付+店名+金額でグルーピングし、重複疑いのある取引ID集合を返す。
 * @param {Array<{id:string,date:string,store:string,amount:number}>} transactions
 */
export const groupDuplicates = (transactions) => {
  // 取引をキーでまとめ、2件以上あるものを重複候補として扱う。
  const byKey = new Map();
  for (const tx of transactions ?? []) {
    // 不完全な行は対象外としてスキップする。
    if (!tx?.id) {
      continue;
    }
    const key = buildDuplicateKey({
      date: tx.date,
      store: tx.store,
      amount: tx.amount,
    });
    if (!key) {
      continue;
    }
    const list = byKey.get(key) ?? [];
    list.push(tx.id);
    byKey.set(key, list);
  }

  const duplicateTxIds = new Set();
  for (const [, ids] of byKey) {
    if (ids.length >= 2) {
      for (const id of ids) {
        duplicateTxIds.add(id);
      }
    }
  }

  return { byKey, duplicateTxIds };
};
