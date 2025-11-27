import { normalizeStoreName } from "./normalize.js";

const DUP_PREFIX = "dup:";

const isEmpty = (value) =>
  value === null || value === undefined || value === "";

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
  const byKey = new Map();
  for (const tx of transactions ?? []) {
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
