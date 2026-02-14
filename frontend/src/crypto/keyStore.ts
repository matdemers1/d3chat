import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "d3chat-keys";
const DB_VERSION = 2;

const STORES = {
  identityKeys: "identityKeys",
  sessions: "sessions",
  senderKeys: "senderKeys",
  preKeys: "preKeys",
  messageCache: "messageCache",
} as const;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const name of Object.values(STORES)) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name);
          }
        }
      },
    });
  }
  return dbPromise;
}

// Identity Keys — keyed by deviceId
export async function saveIdentityKeyPair(
  deviceId: string,
  keyPair: CryptoKeyPair
) {
  const db = await getDB();
  await db.put(STORES.identityKeys, keyPair, deviceId);
}

export async function getIdentityKeyPair(
  deviceId: string
): Promise<CryptoKeyPair | undefined> {
  const db = await getDB();
  return db.get(STORES.identityKeys, deviceId);
}

// Signing Keys — keyed by "signing:{deviceId}"
export async function saveSigningKeyPair(
  deviceId: string,
  keyPair: CryptoKeyPair
) {
  const db = await getDB();
  await db.put(STORES.identityKeys, keyPair, `signing:${deviceId}`);
}

export async function getSigningKeyPair(
  deviceId: string
): Promise<CryptoKeyPair | undefined> {
  const db = await getDB();
  return db.get(STORES.identityKeys, `signing:${deviceId}`);
}

// Signed Pre-Key — keyed by "spk:{deviceId}"
export async function saveSignedPreKey(
  deviceId: string,
  keyPair: CryptoKeyPair
) {
  const db = await getDB();
  await db.put(STORES.preKeys, keyPair, `spk:${deviceId}`);
}

export async function getSignedPreKey(
  deviceId: string
): Promise<CryptoKeyPair | undefined> {
  const db = await getDB();
  return db.get(STORES.preKeys, `spk:${deviceId}`);
}

// One-Time Pre-Keys — keyed by "otp:{deviceId}:{index}"
export async function saveOneTimePreKeys(
  deviceId: string,
  keys: CryptoKeyPair[]
) {
  const db = await getDB();
  const tx = db.transaction(STORES.preKeys, "readwrite");
  for (let i = 0; i < keys.length; i++) {
    await tx.store.put(keys[i], `otp:${deviceId}:${i}`);
  }
  await tx.done;
}

// Sessions (DM session keys) — keyed by channelId
export async function saveSessionKey(channelId: string, key: CryptoKey) {
  const db = await getDB();
  await db.put(STORES.sessions, key, channelId);
}

export async function getSessionKey(
  channelId: string
): Promise<CryptoKey | undefined> {
  const db = await getDB();
  return db.get(STORES.sessions, channelId);
}

export async function deleteSessionKey(channelId: string) {
  const db = await getDB();
  await db.delete(STORES.sessions, channelId);
}

// Sender Keys — keyed by "{channelId}:{deviceId}"
export interface StoredSenderKey {
  chainKey: ArrayBuffer;
  messageNumber: number;
}

export async function saveSenderKey(
  channelId: string,
  deviceId: string,
  data: StoredSenderKey
) {
  const db = await getDB();
  await db.put(STORES.senderKeys, data, `${channelId}:${deviceId}`);
}

export async function getSenderKey(
  channelId: string,
  deviceId: string
): Promise<StoredSenderKey | undefined> {
  const db = await getDB();
  return db.get(STORES.senderKeys, `${channelId}:${deviceId}`);
}

export async function deleteSenderKey(channelId: string, deviceId: string) {
  const db = await getDB();
  await db.delete(STORES.senderKeys, `${channelId}:${deviceId}`);
}

// Message plaintext cache — keyed by message id
export async function cacheMessagePlaintext(
  messageId: string,
  plaintext: string
) {
  const db = await getDB();
  await db.put(STORES.messageCache, plaintext, messageId);
}

export async function getCachedPlaintext(
  messageId: string
): Promise<string | undefined> {
  const db = await getDB();
  return db.get(STORES.messageCache, messageId);
}

export async function clearAllKeys() {
  const db = await getDB();
  const tx = db.transaction(
    Object.values(STORES),
    "readwrite"
  );
  for (const name of Object.values(STORES)) {
    await tx.objectStore(name).clear();
  }
  await tx.done;
}
