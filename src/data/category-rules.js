// ルール総数の上限。sync容量やUI操作性を考慮して控えめに設定。
const MAX_CATEGORY_RULES = 200;

// 表記ゆれを吸収して比較キーを安定化する。
const normalizeCategory = (text) => {
  if (!text) {
    return "";
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  const collapsed = trimmed.replace(/\s+/gu, " ");
  const nk = collapsed.normalize("NFKC");
  const withoutSpaces = nk.replace(/\s+/gu, "");
  return withoutSpaces;
};

// 大項目+中項目の組を正規化して比較キーにする。
const buildRuleKey = (rule) => {
  const large = normalizeCategory(rule?.large ?? "");
  const middle = normalizeCategory(rule?.middle ?? "");
  if (!(large && middle)) {
    return "";
  }
  return `${large}|${middle}`;
};

// 検索しやすいようにSet化したホワイト/ブラックリストを作る。
const buildRuleSets = (categoryRules = {}) => {
  const whitelist = new Set();
  const blacklist = new Set();
  const { whitelist: wl = [], blacklist: bl = [] } = categoryRules;

  for (const item of wl) {
    const key = buildRuleKey(item);
    if (key) {
      whitelist.add(key);
    }
  }

  for (const item of bl) {
    const key = buildRuleKey(item);
    if (key) {
      blacklist.add(key);
    }
  }

  return { whitelist, blacklist };
};

// ルールに照らした結果（違反種別）を返す。違反なしは null。
const evaluateCategoryRule = (params, sets) => {
  const key = buildRuleKey(params);
  if (!key) {
    return null;
  }

  const whitelistSize = sets?.whitelist?.size ?? 0;
  const hasWhitelist = whitelistSize > 0;
  const whitelistHit = sets?.whitelist?.has(key) ?? false;
  const blacklistHit = sets?.blacklist?.has(key) ?? false;

  if (hasWhitelist) {
    if (whitelistHit) {
      return null;
    }
    return { violation: "whitelist_miss", key };
  }

  if (blacklistHit) {
    return { violation: "blacklist_hit", key };
  }

  return null;
};

// インポートや保存前のバリデーションをまとめて行う。
const validateCategoryRules = (categoryRules = {}) => {
  // 形式チェックと上限、重複の3点をここで検証する。
  const errors = [];
  const { whitelist = [], blacklist = [] } = categoryRules;

  const totalCount =
    (Array.isArray(whitelist) ? whitelist.length : 0) +
    (Array.isArray(blacklist) ? blacklist.length : 0);

  if (!Array.isArray(whitelist)) {
    errors.push("invalid_whitelist_type");
  }
  if (!Array.isArray(blacklist)) {
    errors.push("invalid_blacklist_type");
  }

  if (totalCount > MAX_CATEGORY_RULES) {
    // 上限超過は保存を拒否する。
    errors.push("too_many_rules");
  }

  const checkList = (list, kind) => {
    // 空行や重複はユーザー体験上問題になるためエラー化する。
    const seen = new Set();
    for (const item of list) {
      const key = buildRuleKey(item);
      if (!key) {
        errors.push(`${kind}_empty_entry`);
        continue;
      }
      if (seen.has(key)) {
        errors.push(`${kind}_duplicate_entry`);
        continue;
      }
      seen.add(key);
    }
  };

  if (Array.isArray(whitelist)) {
    checkList(whitelist, "whitelist");
  }
  if (Array.isArray(blacklist)) {
    checkList(blacklist, "blacklist");
  }

  return { ok: errors.length === 0, errors };
};

export {
  MAX_CATEGORY_RULES,
  normalizeCategory,
  buildRuleKey,
  buildRuleSets,
  evaluateCategoryRule,
  validateCategoryRules,
};
