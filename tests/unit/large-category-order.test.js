import assert from "node:assert";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const EXCLUDED_IDS = new Set(["0"]);

const getFixturePath = (filename) => {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "fixtures", filename);
};

const loadFixtureDocument = (filename) => {
  const html = fs.readFileSync(getFixturePath(filename), "utf-8");
  const dom = new JSDOM(html);
  return dom.window.document;
};

const getIds = (container, itemSelector, anchorSelector) => {
  const ids = [];
  const items = container?.querySelectorAll?.(itemSelector) ?? [];
  for (const item of items) {
    const id = item
      .querySelector(anchorSelector)
      ?.getAttribute("id")
      ?.trim();
    if (id && !EXCLUDED_IDS.has(id)) {
      ids.push(id);
    }
  }
  return ids;
};

const normalizeLargeCategoryOrder = (currentIds, savedOrder = []) => {
  const currentSet = new Set(currentIds);
  const seen = new Set();
  const normalized = [];
  for (const id of savedOrder) {
    if (!currentSet.has(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push(id);
  }
  for (const id of currentIds) {
    if (!seen.has(id)) {
      seen.add(id);
      normalized.push(id);
    }
  }
  return normalized;
};

const applyOrder = (container, orderedIds, itemSelector, anchorSelector) => {
  const orderSet = new Set(orderedIds);
  const items = container?.querySelectorAll?.(itemSelector) ?? [];
  const byId = new Map();
  const rest = [];
  for (const item of items) {
    const id = item
      .querySelector(anchorSelector)
      ?.getAttribute("id")
      ?.trim();
    if (id && orderSet.has(id)) {
      byId.set(id, item);
    } else {
      rest.push(item);
    }
  }
  const fragment = container.ownerDocument.createDocumentFragment();
  for (const id of orderedIds) {
    const item = byId.get(id);
    if (item) {
      fragment.appendChild(item);
    }
  }
  for (const item of rest) {
    fragment.appendChild(item);
  }
  container.appendChild(fragment);
};

export const runLargeCategoryOrderTests = () => {
  // normalize merges unknown IDs and removes duplicates
  const normalized = normalizeLargeCategoryOrder(
    ["a", "b", "c", "d"],
    ["d", "b", "b", "x"]
  );
  assert.deepStrictEqual(normalized, ["d", "b", "a", "c"]);

  // profile/rule sorting
  const profileDoc = loadFixtureDocument("mf_profile_rule_full.html");
  const profileNav = profileDoc.querySelector("ul.nav");
  assert.ok(profileNav);
  const profileIds = getIds(
    profileNav,
    "li.dropdown-submenu",
    "a.dropdown-toggle[id]"
  );
  const desiredProfile = normalizeLargeCategoryOrder(
    profileIds,
    [...profileIds].reverse()
  );
  applyOrder(
    profileNav,
    desiredProfile,
    "li.dropdown-submenu",
    "a.dropdown-toggle[id]"
  );
  const profileAfter = getIds(
    profileNav,
    "li.dropdown-submenu",
    "a.dropdown-toggle[id]"
  );
  assert.deepStrictEqual(profileAfter, desiredProfile);

  // /cf menu sorting
  const cfDoc = loadFixtureDocument("mf_cf_full.html");
  const cfMenu = cfDoc.querySelector("ul.dropdown-menu.main_menu.minus");
  assert.ok(cfMenu);
  const cfIds = getIds(
    cfMenu,
    "li.dropdown-submenu",
    "a.l_c_name[id]"
  );
  const desiredCf = normalizeLargeCategoryOrder(cfIds, cfIds.slice(1));
  applyOrder(
    cfMenu,
    desiredCf,
    "li.dropdown-submenu",
    "a.l_c_name[id]"
  );
  const cfAfter = getIds(
    cfMenu,
    "li.dropdown-submenu",
    "a.l_c_name[id]"
  );
  assert.deepStrictEqual(cfAfter, desiredCf);
};
