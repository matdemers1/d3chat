import { arrayBufferToBase64, base64ToArrayBuffer } from "./keys";

// Wire format: version(1 byte) || nonce(12 bytes) || ciphertext || tag(16 bytes)
// All base64-encoded for transport

const PROTOCOL_VERSION_BYTE = 0x02;
const NONCE_LENGTH = 12;

export async function encrypt(
  plaintext: string,
  key: CryptoKey
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    data
  );

  // Assemble wire format: version || nonce || ciphertext+tag
  const result = new Uint8Array(1 + NONCE_LENGTH + ciphertext.byteLength);
  result[0] = PROTOCOL_VERSION_BYTE;
  result.set(nonce, 1);
  result.set(new Uint8Array(ciphertext), 1 + NONCE_LENGTH);

  return arrayBufferToBase64(result.buffer);
}

export async function decrypt(
  encoded: string,
  key: CryptoKey
): Promise<string> {
  const data = new Uint8Array(base64ToArrayBuffer(encoded));

  const version = data[0];
  if (version !== PROTOCOL_VERSION_BYTE) {
    throw new Error(`Unknown protocol version: ${version}`);
  }

  const nonce = data.slice(1, 1 + NONCE_LENGTH);
  const ciphertext = data.slice(1 + NONCE_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}
