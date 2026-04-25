import assert from "node:assert";
import { createNativeSortableRegistry } from "../../src/content/native-sortable-registry.js";

export const runNativeSortableRegistryTests = () => {
  const registry = createNativeSortableRegistry();
  const nav = {};
  const first = () => {};
  const second = () => {};

  assert.strictEqual(registry.has(nav), false);
  registry.set(nav, { onPointerDown: first });
  assert.strictEqual(registry.has(nav), true);
  assert.strictEqual(registry.get(nav)?.onPointerDown, first);

  registry.set(nav, { onPointerDown: second });
  assert.strictEqual(registry.get(nav)?.onPointerDown, second);

  registry.delete(nav);
  assert.strictEqual(registry.has(nav), false);
  assert.strictEqual(registry.get(nav), undefined);
};
