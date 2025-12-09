import assert from "node:assert";
import {
  MAX_CATEGORY_RULES,
  normalizeCategory,
  buildRuleKey,
  buildRuleSets,
  evaluateCategoryRule,
  validateCategoryRules,
} from "../../src/data/category-rules.js";

export const runCategoryRuleTests = () => {
  // normalizeCategory
  assert.strictEqual(normalizeCategory("  食 費　"), "食費");
  assert.strictEqual(normalizeCategory("Ａ Ｂ"), "AB");
  assert.strictEqual(normalizeCategory(""), "");

  // buildRuleKey
  assert.strictEqual(buildRuleKey({ large: "食費", middle: "外食" }), "食費|外食");
  assert.strictEqual(buildRuleKey({ large: "  食 費 ", middle: " 外 食 " }), "食費|外食");
  assert.strictEqual(buildRuleKey({ large: "", middle: "外食" }), "");

  // buildRuleSets
  const sets = buildRuleSets({
    whitelist: [{ large: "食費", middle: "外食" }],
    blacklist: [{ large: "食費", middle: "家賃" }],
  });
  assert.ok(sets.whitelist.has("食費|外食"));
  assert.ok(sets.blacklist.has("食費|家賃"));

  // evaluateCategoryRule - whitelist優先
  assert.strictEqual(
    evaluateCategoryRule({ large: "食費", middle: "外食" }, sets),
    null,
  );
  const miss = evaluateCategoryRule({ large: "交通", middle: "ガソリン" }, sets);
  assert.deepStrictEqual(miss, { violation: "whitelist_miss", key: "交通|ガソリン" });

  const both = buildRuleSets({
    whitelist: [{ large: "食費", middle: "外食" }],
    blacklist: [{ large: "食費", middle: "外食" }],
  });
  assert.strictEqual(
    evaluateCategoryRule({ large: "食費", middle: "外食" }, both),
    null,
  );

  const blackOnly = buildRuleSets({
    whitelist: [],
    blacklist: [{ large: "食費", middle: "家賃" }],
  });
  assert.deepStrictEqual(
    evaluateCategoryRule({ large: "食費", middle: "家賃" }, blackOnly),
    { violation: "blacklist_hit", key: "食費|家賃" },
  );

  // validateCategoryRules
  const ok = validateCategoryRules({
    whitelist: [{ large: "食費", middle: "外食" }],
    blacklist: [{ large: "食費", middle: "家賃" }],
  });
  assert.ok(ok.ok);

  const tooMany = validateCategoryRules({
    whitelist: Array.from({ length: MAX_CATEGORY_RULES + 1 }).map((_, idx) => ({
      large: `L${idx}`,
      middle: `M${idx}`,
    })),
    blacklist: [],
  });
  assert.ok(tooMany.errors.includes("too_many_rules"));

  const dup = validateCategoryRules({
    whitelist: [
      { large: "食費", middle: "外食" },
      { large: "食費", middle: "外食" },
    ],
  });
  assert.ok(dup.errors.includes("whitelist_duplicate_entry"));

  const empty = validateCategoryRules({
    whitelist: [{ large: "", middle: "外食" }],
  });
  assert.ok(empty.errors.includes("whitelist_empty_entry"));

  const invalidType = validateCategoryRules({ whitelist: "invalid" });
  assert.ok(invalidType.errors.includes("invalid_whitelist_type"));
};

