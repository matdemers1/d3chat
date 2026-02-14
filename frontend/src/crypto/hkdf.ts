// HKDF-SHA-256 key derivation

export async function deriveAESKey(
  sharedSecret: BufferSource,
  info: string,
  salt?: BufferSource
): Promise<CryptoKey> {
  const encoder = new TextEncoder();

  // Import the shared secret as HKDF key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(sharedSecret as ArrayBuffer),
    "HKDF",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt ? new Uint8Array(salt as ArrayBuffer) : new Uint8Array(32),
      info: encoder.encode(info),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
