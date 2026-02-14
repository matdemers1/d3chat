import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./aes";

async function makeAESKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

describe("AES-GCM encrypt/decrypt", () => {
  it("round-trip: encrypt then decrypt returns original plaintext", async () => {
    const key = await makeAESKey();
    const plaintext = "Hello, encrypted world!";
    const ciphertext = await encrypt(plaintext, key);
    const decrypted = await decrypt(ciphertext, key);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypts to base64 string", async () => {
    const key = await makeAESKey();
    const ciphertext = await encrypt("test", key);
    // Should be valid base64
    expect(() => atob(ciphertext)).not.toThrow();
  });

  it("ciphertext differs from plaintext", async () => {
    const key = await makeAESKey();
    const ciphertext = await encrypt("secret", key);
    expect(ciphertext).not.toBe("secret");
  });

  it("wrong key fails to decrypt", async () => {
    const key1 = await makeAESKey();
    const key2 = await makeAESKey();
    const ciphertext = await encrypt("secret", key1);
    await expect(decrypt(ciphertext, key2)).rejects.toThrow();
  });

  it("handles empty string", async () => {
    const key = await makeAESKey();
    const ciphertext = await encrypt("", key);
    const decrypted = await decrypt(ciphertext, key);
    expect(decrypted).toBe("");
  });

  it("handles unicode characters", async () => {
    const key = await makeAESKey();
    const plaintext = "🔒 Encrypted: こんにちは";
    const ciphertext = await encrypt(plaintext, key);
    const decrypted = await decrypt(ciphertext, key);
    expect(decrypted).toBe(plaintext);
  });

  it("different encryptions of same plaintext produce different ciphertexts", async () => {
    const key = await makeAESKey();
    const ct1 = await encrypt("same", key);
    const ct2 = await encrypt("same", key);
    expect(ct1).not.toBe(ct2); // Random nonce
  });
});
