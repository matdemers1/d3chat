import { api } from "@/api/client";
import {
  generateECDHKeyPair,
  generateECDSAKeyPair,
  generateOneTimePreKeys,
  exportPublicKey,
  arrayBufferToBase64,
} from "./keys";
import { sign } from "./signing";
import {
  getIdentityKeyPair,
  saveIdentityKeyPair,
  saveSigningKeyPair,
  saveSignedPreKey,
  saveOneTimePreKeys,
} from "./keyStore";

/**
 * Bootstrap device keys — idempotent.
 * 1. Check IndexedDB for existing identity key pair for this device
 * 2. If none: generate identity key pair, signed pre-key, sign it, generate 20 OTPs
 * 3. Export public keys to base64, POST to /api/v1/keys/upload
 * 4. Save all keys to IndexedDB
 */
export async function bootstrapDeviceKeys(deviceId: string): Promise<void> {
  const existing = await getIdentityKeyPair(deviceId);
  if (existing) {
    return; // Already bootstrapped
  }

  // Generate identity ECDH key pair
  const identityKeyPair = await generateECDHKeyPair();

  // Generate signing key pair (ECDSA) for signing the pre-key
  const signingKeyPair = await generateECDSAKeyPair();

  // Generate signed pre-key (ECDH)
  const signedPreKeyPair = await generateECDHKeyPair();

  // Sign the signed pre-key's public key with our signing key
  const signedPreKeyPublicRaw = await crypto.subtle.exportKey(
    "raw",
    signedPreKeyPair.publicKey
  );
  const signature = await sign(signingKeyPair.privateKey, signedPreKeyPublicRaw);

  // Generate one-time pre-keys
  const otpKeyPairs = await generateOneTimePreKeys(20);

  // Export all public keys
  const identityKeyPublic = await exportPublicKey(identityKeyPair.publicKey);
  const signedPreKeyPublic = await exportPublicKey(signedPreKeyPair.publicKey);
  const signatureBase64 = arrayBufferToBase64(signature);
  const otpPublicKeys = await Promise.all(
    otpKeyPairs.map((kp) => exportPublicKey(kp.publicKey))
  );

  // Upload to server
  await api.post("/keys/upload", {
    device_id: deviceId,
    identity_key: identityKeyPublic,
    signed_pre_key: signedPreKeyPublic,
    signed_pre_key_signature: signatureBase64,
    one_time_pre_keys: otpPublicKeys,
  });

  // Save all keys to IndexedDB
  await saveIdentityKeyPair(deviceId, identityKeyPair);
  await saveSigningKeyPair(deviceId, signingKeyPair);
  await saveSignedPreKey(deviceId, signedPreKeyPair);
  await saveOneTimePreKeys(deviceId, otpKeyPairs);
}

/**
 * Generate and upload additional one-time pre-keys.
 */
export async function replenishOneTimeKeys(deviceId: string): Promise<void> {
  const otpKeyPairs = await generateOneTimePreKeys(20);
  const otpPublicKeys = await Promise.all(
    otpKeyPairs.map((kp) => exportPublicKey(kp.publicKey))
  );

  await api.post("/keys/one-time", {
    device_id: deviceId,
    one_time_pre_keys: otpPublicKeys,
  });

  await saveOneTimePreKeys(deviceId, otpKeyPairs);
}
