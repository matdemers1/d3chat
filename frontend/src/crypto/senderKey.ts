import { arrayBufferToBase64, base64ToArrayBuffer } from "./keys";
import { encrypt as aesEncrypt, decrypt as aesDecrypt } from "./aes";
import {
  getSenderKey,
  saveSenderKey,
} from "./keyStore";
import { api } from "@/api/client";
import type { SenderKeyData } from "@/types";

/**
 * Generate a new sender key for a channel.
 * Returns the public representation for distribution + the private chain key.
 */
export async function generateSenderKey(): Promise<{
  senderKeyPublic: string;
  chainKey: string;
}> {
  // Generate a random 32-byte chain key
  const chainKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  // Generate a random "public" identifier for this sender key
  const publicBytes = crypto.getRandomValues(new Uint8Array(32));

  return {
    senderKeyPublic: arrayBufferToBase64(publicBytes.buffer),
    chainKey: arrayBufferToBase64(chainKeyBytes.buffer),
  };
}

/**
 * Ratchet the chain key forward using HMAC-SHA-256.
 * Returns { messageKey (AES-GCM CryptoKey), nextChainKey }.
 */
export async function ratchetChainKey(chainKey: ArrayBuffer): Promise<{
  messageKey: CryptoKey;
  nextChainKey: ArrayBuffer;
}> {
  // Import chain key as HMAC key
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    chainKey as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // Derive message key: HMAC(chainKey, 0x01)
  const messageKeyBytes = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    new Uint8Array([0x01])
  );

  // Derive next chain key: HMAC(chainKey, 0x02)
  const nextChainKey = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    new Uint8Array([0x02])
  );

  // Import message key as AES-GCM
  const messageKey = await crypto.subtle.importKey(
    "raw",
    messageKeyBytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  return { messageKey, nextChainKey };
}

/**
 * Encrypt a message for a group channel using sender keys.
 * Ratchets the local chain key and updates IndexedDB.
 * The message number is embedded in the ciphertext as a prefix: "msgNum:ciphertext"
 */
export async function encryptWithSenderKey(
  plaintext: string,
  channelId: string,
  deviceId: string
): Promise<{ ciphertext: string; messageNumber: number }> {
  const stored = await getSenderKey(channelId, deviceId);
  if (!stored) {
    throw new Error("No sender key found for this channel. Distribute first.");
  }

  const { messageKey, nextChainKey } = await ratchetChainKey(stored.chainKey);
  const messageNumber = stored.messageNumber + 1;

  // Update stored key
  await saveSenderKey(channelId, deviceId, {
    chainKey: nextChainKey,
    messageNumber,
  });

  const innerCiphertext = await aesEncrypt(plaintext, messageKey);
  // Embed message number so the receiver knows which ratchet step to use
  const ciphertext = `${messageNumber}:${innerCiphertext}`;
  return { ciphertext, messageNumber };
}

/**
 * Decrypt a message from a group channel using the sender's key.
 * The message number is embedded in the ciphertext as "msgNum:ciphertext".
 * Ratchets the sender's chain key forward to the correct message number.
 */
export async function decryptWithSenderKey(
  ciphertext: string,
  channelId: string,
  senderDeviceId: string,
  _targetMessageNumber?: number
): Promise<string> {
  // Extract embedded message number from ciphertext
  const colonIdx = ciphertext.indexOf(":");
  if (colonIdx === -1) {
    throw new Error("Invalid sender key ciphertext format (no message number)");
  }
  const targetMessageNumber = parseInt(ciphertext.substring(0, colonIdx), 10);
  const innerCiphertext = ciphertext.substring(colonIdx + 1);

  if (isNaN(targetMessageNumber) || targetMessageNumber < 1) {
    throw new Error(`Invalid message number in ciphertext: ${ciphertext.substring(0, colonIdx)}`);
  }

  let stored = await getSenderKey(channelId, senderDeviceId);
  if (!stored) {
    // Try fetching sender keys from the server
    console.log(`[senderKey] No local key for ${senderDeviceId}, fetching from server...`);
    const keys = await api.get<SenderKeyData[]>(
      `/keys/channels/${channelId}/sender-keys`
    );
    for (const key of keys) {
      const existing = await getSenderKey(channelId, key.device_id);
      if (!existing) {
        await saveSenderKey(channelId, key.device_id, {
          chainKey: base64ToArrayBuffer(key.chain_key),
          messageNumber: key.message_number,
        });
      }
    }
    stored = await getSenderKey(channelId, senderDeviceId);
    if (!stored) {
      throw new Error(`No sender key found for device ${senderDeviceId}`);
    }
  }

  // If we're already past this message number, we can't decrypt (ratchet is one-way).
  // This typically happens with our own messages — the encrypt already ratcheted
  // the chain key past this point. The plaintext cache should cover this case.
  if (stored.messageNumber >= targetMessageNumber) {
    throw new Error(
      `Already ratcheted past message ${targetMessageNumber} (at ${stored.messageNumber}). ` +
      `This is expected for own messages — plaintext should be cached.`
    );
  }

  // Ratchet forward to the target message number
  let currentChainKey = stored.chainKey;
  let currentNumber = stored.messageNumber;
  let messageKey: CryptoKey | null = null;

  while (currentNumber < targetMessageNumber) {
    const result = await ratchetChainKey(currentChainKey);
    currentNumber++;
    currentChainKey = result.nextChainKey;
    if (currentNumber === targetMessageNumber) {
      messageKey = result.messageKey;
    }
  }

  if (!messageKey) {
    throw new Error(
      `Cannot ratchet to message ${targetMessageNumber} (currently at ${stored.messageNumber})`
    );
  }

  // Update stored key to latest ratchet state
  await saveSenderKey(channelId, senderDeviceId, {
    chainKey: currentChainKey,
    messageNumber: currentNumber,
  });

  return aesDecrypt(innerCiphertext, messageKey);
}
