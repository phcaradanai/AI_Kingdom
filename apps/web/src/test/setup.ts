import "@testing-library/jest-dom/vitest";

const storageData = new Map<string, string>();
const testStorage: Storage = {
  get length() { return storageData.size; },
  clear: () => storageData.clear(),
  getItem: (key) => storageData.get(key) ?? null,
  key: (index) => Array.from(storageData.keys())[index] ?? null,
  removeItem: (key) => { storageData.delete(key); },
  setItem: (key, value) => { storageData.set(key, String(value)); },
};

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: testStorage,
});
