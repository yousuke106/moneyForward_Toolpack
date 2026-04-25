export const createNativeSortableRegistry = () => {
  const registry = new WeakMap();
  return {
    delete: (nav) => registry.delete(nav),
    get: (nav) => registry.get(nav),
    has: (nav) => registry.has(nav),
    set: (nav, handlers) => registry.set(nav, handlers),
  };
};
