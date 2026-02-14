import { describe, it, expect } from "vitest";
import {
  generateECDHKeyPair,
  generateECDSAKeyPair,
  exportPublicKey,
  importECDHPublicKey,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from "./keys";

describe("key generation", () => {
  it("generateECDHKeyPair returns a CryptoKeyPair", async () => {
    const pair = await generateECDHKeyPair();
    expect(pair.publicKey).toBeDefined();
    expect(pair.privateKey).toBeDefined();
    expect(pair.publicKey.algorithm).toMatchObject({ name: "ECDH" });
  });

  it("generateECDSAKeyPair returns a CryptoKeyPair", async () => {
    const pair = await generateECDSAKeyPair();
    expect(pair.publicKey).toBeDefined();
    expect(pair.privateKey).toBeDefined();
    expect(pair.publicKey.algorithm).toMatchObject({ name: "ECDSA" });
  });

  it("ECDSA key can sign and verify", async () => {
    const pair = await generateECDSAKeyPair();
    const data = new TextEncoder().encode("test data");
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      pair.privateKey,
      data
    );
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pair.publicKey,
      signature,
      data
    );
    expect(valid).toBe(true);
  });

  it("exportPublicKey returns base64 string", async () => {
    const pair = await generateECDHKeyPair();
    const exported = await exportPublicKey(pair.publicKey);
    expect(typeof exported).toBe("string");
    expect(() => atob(exported)).not.toThrow();
  });

  it("export/import round-trip for ECDH public key", async () => {
    const pair = await generateECDHKeyPair();
    const exported = await exportPublicKey(pair.publicKey);
    const imported = await importECDHPublicKey(exported);
    expect(imported.algorithm).toMatchObject({ name: "ECDH" });
  });
});

describe("base64 utilities", () => {
  it("arrayBufferToBase64 and base64ToArrayBuffer round-trip", () => {
    const original = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
    const b64 = arrayBufferToBase64(original.buffer);
    const result = new Uint8Array(base64ToArrayBuffer(b64));
    expect(result).toEqual(original);
  });

  it("handles empty buffer", () => {
    const empty = new ArrayBuffer(0);
    const b64 = arrayBufferToBase64(empty);
    const result = base64ToArrayBuffer(b64);
    expect(result.byteLength).toBe(0);
  });
});
