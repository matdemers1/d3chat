import { api } from "@/api/client";
import { encrypt as aesEncrypt, decrypt as aesDecrypt } from "./aes";
import { getSessionKey, saveSessionKey, getIdentityKeyPair, getSignedPreKey, saveSenderKey, getSenderKey } from "./keyStore";
import { performX3DHInitiator, performX3DHResponder } from "./x3dh";
import {
  encryptWithSenderKey,
  decryptWithSenderKey,
  generateSenderKey,
} from "./senderKey";
import { base64ToArrayBuffer, exportPublicKey } from "./keys";
import type { SenderKeyData, KeyBundle as KeyBundleType } from "@/types";

interface X3DHSetupData {
  initiator_identity_key: string;
  ephemeral_public_key: string;
  used_one_time_key: boolean;
}

/**
 * Encrypt content for a channel, dispatching to X3DH (DM) or sender key (group).
 */
export async function encryptForChannel(
  channelId: string,
  encryptionType: string,
  plaintext: string,
  deviceId: string
): Promise<string> {
  console.log(`[encrypt] encryptForChannel: channel=${channelId}, type=${encryptionType}, deviceId=${deviceId}`);
  if (encryptionType === "x3dh") {
    return encryptForDM(channelId, plaintext, deviceId);
  }
  return encryptForGroup(channelId, plaintext, deviceId);
}

/**
 * Decrypt content from a channel, dispatching to correct decryption path.
 */
export async function decryptFromChannel(
  channelId: string,
  encryptionType: string,
  ciphertext: string,
  senderDeviceId: string | null,
): Promise<string> {
  console.log(`[encrypt] decryptFromChannel: channel=${channelId}, type=${encryptionType}, senderDevice=${senderDeviceId}, ciphertext_len=${ciphertext?.length}`);
  if (encryptionType === "x3dh") {
    return decryptFromDM(channelId, ciphertext);
  }
  if (!senderDeviceId) {
    throw new Error("sender_device_id required for group decryption");
  }
  return decryptWithSenderKey(
    ciphertext,
    channelId,
    senderDeviceId,
  );
}

// --- DM Encryption (X3DH session key) ---

async function encryptForDM(
  channelId: string,
  plaintext: string,
  deviceId: string
): Promise<string> {
  let sessionKey = await getSessionKey(channelId);
  console.log(`[encrypt] encryptForDM: channel=${channelId}, hasSessionKey=${!!sessionKey}`);

  if (!sessionKey) {
    // Need to establish X3DH session
    console.log("[encrypt] No session key, establishing X3DH as initiator...");
    sessionKey = await establishDMSession(channelId, deviceId);
  }

  return aesEncrypt(plaintext, sessionKey);
}

async function decryptFromDM(
  channelId: string,
  ciphertext: string
): Promise<string> {
  let sessionKey = await getSessionKey(channelId);
  console.log(`[encrypt] decryptFromDM: channel=${channelId}, hasSessionKey=${!!sessionKey}`);

  if (!sessionKey) {
    // We're the responder — try to establish the session from X3DH setup data
    const deviceId = localStorage.getItem("device_id");
    console.log(`[encrypt] No session key, establishing X3DH as responder... deviceId=${deviceId}`);
    if (!deviceId) {
      throw new Error("No device ID. Cannot establish DM session.");
    }
    sessionKey = await establishDMSessionAsResponder(channelId, deviceId);
    console.log("[encrypt] Responder session established successfully");
  }

  return aesDecrypt(ciphertext, sessionKey);
}

async function establishDMSession(
  channelId: string,
  deviceId: string
): Promise<CryptoKey> {
  console.log(`[encrypt] establishDMSession (initiator): channel=${channelId}, device=${deviceId}`);

  // Get the other user's info from channel members
  const members = await api.get<
    Array<{ user_id: string; username: string; role: string }>
  >(`/channels/${channelId}/members`);

  // Find the other user (not us)
  const currentUserId = localStorage.getItem("user_id");
  const otherMember = members.find((m) => m.user_id !== currentUserId);
  if (!otherMember) {
    throw new Error("Cannot find other DM participant");
  }
  console.log(`[encrypt] Other DM member: userId=${otherMember.user_id}, username=${otherMember.username}`);

  // Fetch their key bundles
  const bundles = await api.get<KeyBundleType[]>(
    `/keys/${otherMember.user_id}/bundles`
  );
  console.log(`[encrypt] Fetched ${bundles.length} key bundle(s) for recipient`);
  if (!bundles.length) {
    throw new Error("Recipient has no key bundles");
  }

  const bundle = bundles[0]!;
  // Strip OTP — we can't relay which OTP private key the responder should use,
  // so skip DH4 to ensure both sides compute the same shared secret.
  bundle.one_time_pre_key = null;

  const identityKeyPair = await getIdentityKeyPair(deviceId);
  if (!identityKeyPair) {
    throw new Error("No identity key pair. Bootstrap keys first.");
  }
  console.log("[encrypt] Have identity key pair, performing X3DH initiator...");

  const { sessionKey, ephemeralPublicKey } = await performX3DHInitiator(
    identityKeyPair,
    bundle
  );
  console.log("[encrypt] X3DH initiator complete, storing setup data...");

  // Export and store X3DH setup data so the responder can derive the same key
  const identityPub = await exportPublicKey(identityKeyPair.publicKey);
  const ephemeralPub = await exportPublicKey(ephemeralPublicKey);
  await api.post(`/keys/channels/${channelId}/x3dh-setup`, {
    initiator_identity_key: identityPub,
    ephemeral_public_key: ephemeralPub,
    used_one_time_key: false,
  });
  console.log("[encrypt] X3DH setup data stored on server");

  await saveSessionKey(channelId, sessionKey);
  console.log("[encrypt] Session key saved to IndexedDB");
  return sessionKey;
}

/**
 * Establish DM session as the responder (recipient).
 * Fetches the initiator's X3DH setup data and performs the mirror computation.
 */
async function establishDMSessionAsResponder(
  channelId: string,
  deviceId: string
): Promise<CryptoKey> {
  console.log(`[encrypt] establishDMSessionAsResponder: channel=${channelId}, device=${deviceId}`);

  // Fetch the X3DH setup data stored by the initiator
  const setup = await api.get<X3DHSetupData>(
    `/keys/channels/${channelId}/x3dh-setup`
  );
  console.log(`[encrypt] Fetched X3DH setup: initiator_identity_key=${setup.initiator_identity_key?.slice(0, 20)}..., ephemeral=${setup.ephemeral_public_key?.slice(0, 20)}...`);

  const identityKeyPair = await getIdentityKeyPair(deviceId);
  if (!identityKeyPair) {
    throw new Error("No identity key pair. Bootstrap keys first.");
  }
  console.log("[encrypt] Have identity key pair");

  const signedPreKeyPair = await getSignedPreKey(deviceId);
  if (!signedPreKeyPair) {
    throw new Error("No signed pre-key. Bootstrap keys first.");
  }
  console.log("[encrypt] Have signed pre-key pair, performing X3DH responder...");

  const sessionKey = await performX3DHResponder(
    identityKeyPair,
    signedPreKeyPair,
    setup.initiator_identity_key,
    setup.ephemeral_public_key,
    undefined // OTP support can be added later
  );
  console.log("[encrypt] X3DH responder complete");

  await saveSessionKey(channelId, sessionKey);
  console.log("[encrypt] Session key saved to IndexedDB");
  return sessionKey;
}

// --- Group Encryption (Sender Keys) ---

async function encryptForGroup(
  channelId: string,
  plaintext: string,
  deviceId: string
): Promise<string> {
  // Ensure we have distributed a sender key for this channel
  await ensureSenderKeyDistributed(channelId, deviceId);

  const { ciphertext } = await encryptWithSenderKey(
    plaintext,
    channelId,
    deviceId
  );
  return ciphertext;
}

/**
 * Ensure our sender key is distributed for this channel.
 * If not yet distributed, generate and upload one.
 */
async function ensureSenderKeyDistributed(
  channelId: string,
  deviceId: string
): Promise<void> {
  const existing = await getSenderKey(channelId, deviceId);
  if (existing) return;

  const { senderKeyPublic, chainKey } = await generateSenderKey();

  // Upload to server
  await api.post(`/keys/channels/${channelId}/sender-keys`, {
    device_id: deviceId,
    sender_key_public: senderKeyPublic,
    chain_key: chainKey,
  });

  // Save locally
  await saveSenderKey(channelId, deviceId, {
    chainKey: base64ToArrayBuffer(chainKey),
    messageNumber: 0,
  });
}

/**
 * Fetch and store sender keys for a channel from the server.
 * Only stores keys we don't already have locally (to preserve ratchet state).
 */
export async function fetchAndStoreSenderKeys(
  channelId: string
): Promise<void> {
  const keys = await api.get<SenderKeyData[]>(
    `/keys/channels/${channelId}/sender-keys`
  );
  for (const key of keys) {
    // Don't overwrite locally ratcheted keys
    const existing = await getSenderKey(channelId, key.device_id);
    if (!existing) {
      await saveSenderKey(channelId, key.device_id, {
        chainKey: base64ToArrayBuffer(key.chain_key),
        messageNumber: key.message_number,
      });
    }
  }
}
