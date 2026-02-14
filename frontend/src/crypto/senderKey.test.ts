import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateSenderKey, ratchetChainKey } from "./senderKey";
import { base64ToArrayBuffer } from "./keys";

// Mock keyStore and api (needed by encrypt/decrypt functions)
vi.mock("./keyStore", () => ({
  getSenderKey: vi.fn(),
  saveSenderKey: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  api: { get: vi.fn() },
}));

describe("senderKey", () => {
  it("generateSenderKey returns base64 strings", async () => {
    const { senderKeyPublic, chainKey } = await generateSenderKey();
    expect(() => atob(senderKeyPublic)).not.toThrow();
    expect(() => atob(chainKey)).not.toThrow();
  });

  it("generateSenderKey produces unique keys", async () => {
    const k1 = await generateSenderKey();
    const k2 = await generateSenderKey();
    expect(k1.chainKey).not.toBe(k2.chainKey);
  });

  it("ratchetChainKey produces a CryptoKey and nextChainKey", async () => {
    const { chainKey } = await generateSenderKey();
    const chainKeyBuf = base64ToArrayBuffer(chainKey);
    const { messageKey, nextChainKey } = await ratchetChainKey(chainKeyBuf);

    expect(messageKey).toBeDefined();
    expect(messageKey.type).toBe("secret");
    expect(nextChainKey).toBeDefined();
    expect(nextChainKey.byteLength).toBe(32);
  });

  it("ratchet is deterministic for same input", async () => {
    const { chainKey } = await generateSenderKey();
    const buf = base64ToArrayBuffer(chainKey);

    const r1 = await ratchetChainKey(buf);
    const r2 = await ratchetChainKey(buf);

    // Same input → same nextChainKey
    const bytes1 = new Uint8Array(r1.nextChainKey);
    const bytes2 = new Uint8Array(r2.nextChainKey);
    expect(bytes1).toEqual(bytes2);
  });

  it("successive ratchets produce different keys", async () => {
    const { chainKey } = await generateSenderKey();
    const buf = base64ToArrayBuffer(chainKey);

    const r1 = await ratchetChainKey(buf);
    const r2 = await ratchetChainKey(r1.nextChainKey);

    const bytes1 = new Uint8Array(r1.nextChainKey);
    const bytes2 = new Uint8Array(r2.nextChainKey);
    expect(bytes1).not.toEqual(bytes2);
  });
});
