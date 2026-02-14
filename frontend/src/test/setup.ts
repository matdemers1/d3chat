import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

// Mock crypto.subtle for tests that need Web Crypto API
// The jsdom environment doesn't provide a full crypto.subtle implementation
// but Node.js 18+ has it globally, so we just ensure it exists.
if (!globalThis.crypto?.subtle) {
  // Node.js built-in crypto module provides SubtleCrypto
  const { webcrypto } = await import("node:crypto");
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
  });
}

// Mock fetch globally — individual tests can override via vi.fn()
if (!globalThis.fetch) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
  }) as unknown as typeof fetch;
}

// Mock localStorage for tests
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Clear state between tests
beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});
