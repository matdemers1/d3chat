import { describe, it, expect, beforeEach } from "vitest";
import {
  saveIdentityKeyPair,
  getIdentityKeyPair,
  saveSenderKey,
  getSenderKey,
  deleteSenderKey,
  cacheMessagePlaintext,
  getCachedPlaintext,
  saveSessionKey,
  getSessionKey,
  deleteSessionKey,
  clearAllKeys,
} from "./keyStore";

describe("keyStore (IndexedDB via fake-indexeddb)", () => {
  beforeEach(async () => {
    await clearAllKeys();
  });

  it("save and get identity key pair", async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"]
    );
    await saveIdentityKeyPair("device-1", keyPair);
    const retrieved = await getIdentityKeyPair("device-1");
    expect(retrieved).toBeDefined();
    expect(retrieved!.publicKey).toBeDefined();
  });

  it("returns undefined for missing identity key", async () => {
    const result = await getIdentityKeyPair("nonexistent");
    expect(result).toBeUndefined();
  });

  it("save and get sender key", async () => {
    const chainKey = crypto.getRandomValues(new Uint8Array(32)).buffer;
    await saveSenderKey("ch1", "dev1", { chainKey, messageNumber: 5 });

    const stored = await getSenderKey("ch1", "dev1");
    expect(stored).toBeDefined();
    expect(stored!.messageNumber).toBe(5);
    expect(stored!.chainKey.byteLength).toBe(32);
  });

  it("delete sender key", async () => {
    const chainKey = crypto.getRandomValues(new Uint8Array(32)).buffer;
    await saveSenderKey("ch1", "dev1", { chainKey, messageNumber: 0 });
    await deleteSenderKey("ch1", "dev1");
    const result = await getSenderKey("ch1", "dev1");
    expect(result).toBeUndefined();
  });

  it("cache and get message plaintext", async () => {
    await cacheMessagePlaintext("msg-1", "Hello world");
    const cached = await getCachedPlaintext("msg-1");
    expect(cached).toBe("Hello world");
  });

  it("returns undefined for uncached message", async () => {
    const result = await getCachedPlaintext("not-cached");
    expect(result).toBeUndefined();
  });

  it("save and get session key", async () => {
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    await saveSessionKey("ch1", key);
    const retrieved = await getSessionKey("ch1");
    expect(retrieved).toBeDefined();
    expect(retrieved!.type).toBe("secret");
  });

  it("delete session key", async () => {
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    await saveSessionKey("ch1", key);
    await deleteSessionKey("ch1");
    const result = await getSessionKey("ch1");
    expect(result).toBeUndefined();
  });

  it("clearAllKeys removes everything", async () => {
    await cacheMessagePlaintext("m1", "text");
    const chainKey = crypto.getRandomValues(new Uint8Array(32)).buffer;
    await saveSenderKey("ch1", "d1", { chainKey, messageNumber: 0 });

    await clearAllKeys();

    expect(await getCachedPlaintext("m1")).toBeUndefined();
    expect(await getSenderKey("ch1", "d1")).toBeUndefined();
  });
});
