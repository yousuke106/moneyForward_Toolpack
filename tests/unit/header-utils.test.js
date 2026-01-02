import assert from "node:assert";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.parentElement = null;
    this.className = "";
    this.textContent = "";
    this.dataset = {};
  }

  get classList() {
    return {
      add: (cls) => {
        const current = this.className ? this.className.split(" ") : [];
        if (!current.includes(cls)) {
          current.push(cls);
          this.className = current.join(" ");
        }
      },
      remove: (cls) => {
        const current = this.className ? this.className.split(" ") : [];
        this.className = current.filter((c) => c !== cls).join(" ");
      },
      contains: (cls) => {
        const current = this.className ? this.className.split(" ") : [];
        return current.includes(cls);
      }
    };
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }

  insertBefore(newNode, referenceNode) {
    const index = this.children.indexOf(referenceNode);
    if (index === -1) {
      this.append(newNode);
      return;
    }
    newNode.parentElement = this;
    this.children.splice(index, 0, newNode);
  }

  querySelector(selector) {
    if (!selector.startsWith(".")) {
      return null;
    }
    const cls = selector.slice(1);
    return this.children.find((child) =>
      child.className.split(" ").includes(cls)
    ) || null;
  }
}

const createHeadCell = (text, className) => {
  const th = new FakeElement("th");
  if (className) {
    th.className = className;
  }
  th.textContent = text;
  return th;
};

const insertAfterNode = (referenceNode, newNode) => {
  if (!referenceNode?.parentElement) {
    return false;
  }
  referenceNode.parentElement.insertBefore(newNode, referenceNode.nextSibling);
  return true;
};

const ensureHeaderCells = ({
  headRow,
  existingSelector,
  markerKey,
  cells,
  getInsertAfterNode
}) => {
  if (!headRow) {
    return;
  }
  if (existingSelector && headRow.querySelector(existingSelector)) {
    return;
  }
  if (markerKey && headRow.dataset[markerKey] === "1") {
    return;
  }

  const nodes = cells.map(({ text, className }) =>
    createHeadCell(text, className)
  );
  const insertAfter = getInsertAfterNode?.(headRow);
  if (insertAfter) {
    let current = insertAfter;
    for (const node of nodes) {
      insertAfterNode(current, node);
      current = node;
    }
  } else {
    headRow.append(...nodes);
  }

  if (markerKey) {
    headRow.dataset[markerKey] = "1";
  }
};

const countByClass = (element, className) =>
  element.children.filter((child) =>
    child.className.split(" ").includes(className)
  ).length;

export const runHeaderUtilsTests = () => {
  const headRow = new FakeElement("tr");
  const memoHead = new FakeElement("th");
  memoHead.className = "memo";
  headRow.append(memoHead);

  ensureHeaderCells({
    headRow,
    existingSelector: ".mf-sub-label-head",
    cells: [{ text: "サブスク", className: "mf-sub-label-head" }],
    getInsertAfterNode: () => memoHead
  });

  assert.strictEqual(headRow.children.length, 2);
  assert.strictEqual(headRow.children[1].className, "mf-sub-label-head");
  assert.strictEqual(headRow.children[1].textContent, "サブスク");

  ensureHeaderCells({
    headRow,
    existingSelector: ".mf-sub-label-head",
    cells: [{ text: "サブスク", className: "mf-sub-label-head" }],
    getInsertAfterNode: () => memoHead
  });

  assert.strictEqual(countByClass(headRow, "mf-sub-label-head"), 1);

  const headRow2 = new FakeElement("tr");
  ensureHeaderCells({
    headRow: headRow2,
    markerKey: "mfSatHead",
    cells: [
      { text: "満足度", className: "mf-sat-head" },
      { text: "満足度メモ", className: "mf-sat-head" }
    ]
  });

  assert.strictEqual(headRow2.children.length, 2);
  assert.strictEqual(headRow2.dataset.mfSatHead, "1");

  ensureHeaderCells({
    headRow: headRow2,
    markerKey: "mfSatHead",
    cells: [{ text: "追加", className: "mf-sat-head" }]
  });

  assert.strictEqual(headRow2.children.length, 2);
};
