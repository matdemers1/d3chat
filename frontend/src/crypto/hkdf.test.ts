import { describe, it, expect } from "vitest";
import { deriveAESKey } from "./hkdf";

describe("HKDF key derivation", () => {
  it("derives an AES-GCM key from shared secret", async () => {
    const sharedSecret = crypto.getRandomValues(new Uint8Array(32));
    const key = await deriveAESKey(sharedSecret, "test-info");
    expect(key.type).toBe("secret");
    expect(key.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
  });

  it("same inputs produce same key", async () => {
    const secret = new Uint8Array(32).fill(0x42);
    const key1 = await deriveAESKey(secret, "info");
    const key2 = await deriveAESKey(secret, "info");

    // Since the keys are non-extractable, test that they both encrypt/decrypt the same
    const data = new TextEncoder().encode("test");
    const iv = new Uint8Array(12);

    const ct1 = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key1, data);
    const pt2 = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key2, ct1);
    expect(new TextDecoder().decode(pt2)).toBe("test");
  });

  it("different info produces different key", async () => {
    const secret = new Uint8Array(32).fill(0x42);
    const key1 = await deriveAESKey(secret, "info-a");
    const key2 = await deriveAESKey(secret, "info-b");

    const data = new TextEncoder().encode("test");
    const iv = new Uint8Array(12);
    const ct1 = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key1, data);
    // Decrypting with key2 should fail
    await expect(
      crypto.subtle.decrypt({ name: "AES-GCM", iv }, key2, ct1)
    ).rejects.toThrow();
  });

  it("accepts optional salt", async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const key = await deriveAESKey(secret, "info", salt);
    expect(key.type).toBe("secret");
  });
});
