// P-256 ECDH key pair generation and import/export utilities

export async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"]
  );
}

export async function generateECDSAKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"]
  );
}

export async function generateOneTimePreKeys(
  count: number
): Promise<CryptoKeyPair[]> {
  const keys: CryptoKeyPair[] = [];
  for (let i = 0; i < count; i++) {
    keys.push(await generateECDHKeyPair());
  }
  return keys;
}

// Export public key to base64 (raw format for P-256 = 65 bytes uncompressed)
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return arrayBufferToBase64(raw);
}

// Import public key from base64
export async function importECDHPublicKey(
  base64: string
): Promise<CryptoKey> {
  const raw = new Uint8Array(base64ToArrayBuffer(base64));
  return crypto.subtle.importKey(
    "raw",
    raw.buffer as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
}

export async function importECDSAPublicKey(
  base64: string
): Promise<CryptoKey> {
  const raw = new Uint8Array(base64ToArrayBuffer(base64));
  return crypto.subtle.importKey(
    "raw",
    raw.buffer as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"]
  );
}

// For X3DH we need ECDH private keys to be exportable during deriveBits
// but we store them as non-extractable. We need a special export for
// the signed pre-key public which uses ECDSA for signing.
export async function exportPublicKeyFromPair(
  keyPair: CryptoKeyPair
): Promise<string> {
  return exportPublicKey(keyPair.publicKey);
}

// Utility conversions
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
