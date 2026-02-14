import {
  generateECDHKeyPair,
  importECDHPublicKey,
} from "./keys";
import { deriveAESKey } from "./hkdf";

const X3DH_INFO = "d3chat-x3dh";

export interface KeyBundle {
  device_id: string;
  identity_key: string;
  signed_pre_key: string;
  signed_pre_key_signature: string;
  one_time_pre_key: string | null;
}

export interface X3DHResult {
  sessionKey: CryptoKey;
  ephemeralPublicKey: CryptoKey;
}

/**
 * X3DH initiator side (Alice → Bob).
 * Computes shared secret from:
 *   DH1: ourIdentityPrivate × recipientSignedPreKey
 *   DH2: ephemeralPrivate × recipientIdentityKey
 *   DH3: ephemeralPrivate × recipientSignedPreKey
 *   DH4 (optional): ephemeralPrivate × recipientOneTimePreKey
 */
export async function performX3DHInitiator(
  ourIdentityKeyPair: CryptoKeyPair,
  recipientBundle: KeyBundle
): Promise<X3DHResult> {
  const ephemeral = await generateECDHKeyPair();

  const recipientIdentityKey = await importECDHPublicKey(
    recipientBundle.identity_key
  );
  const recipientSignedPreKey = await importECDHPublicKey(
    recipientBundle.signed_pre_key
  );

  // DH1: ourIdentity × recipientSignedPreKey
  const dh1 = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientSignedPreKey },
    ourIdentityKeyPair.privateKey,
    256
  );

  // DH2: ephemeral × recipientIdentity
  const dh2 = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientIdentityKey },
    ephemeral.privateKey,
    256
  );

  // DH3: ephemeral × recipientSignedPreKey
  const dh3 = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientSignedPreKey },
    ephemeral.privateKey,
    256
  );

  // Concatenate DH results
  let totalLen = dh1.byteLength + dh2.byteLength + dh3.byteLength;

  let dh4: ArrayBuffer | null = null;
  if (recipientBundle.one_time_pre_key) {
    const recipientOTP = await importECDHPublicKey(
      recipientBundle.one_time_pre_key
    );
    dh4 = await crypto.subtle.deriveBits(
      { name: "ECDH", public: recipientOTP },
      ephemeral.privateKey,
      256
    );
    totalLen += dh4.byteLength;
  }

  const sharedSecret = new Uint8Array(totalLen);
  let offset = 0;
  sharedSecret.set(new Uint8Array(dh1), offset);
  offset += dh1.byteLength;
  sharedSecret.set(new Uint8Array(dh2), offset);
  offset += dh2.byteLength;
  sharedSecret.set(new Uint8Array(dh3), offset);
  offset += dh3.byteLength;
  if (dh4) {
    sharedSecret.set(new Uint8Array(dh4), offset);
  }

  const sessionKey = await deriveAESKey(sharedSecret.buffer, X3DH_INFO);

  return { sessionKey, ephemeralPublicKey: ephemeral.publicKey };
}

/**
 * X3DH responder side (Bob receiving from Alice).
 * Mirror computation:
 *   DH1: ourSignedPreKeyPrivate × initiatorIdentityKey
 *   DH2: ourIdentityPrivate × ephemeralKey
 *   DH3: ourSignedPreKeyPrivate × ephemeralKey
 *   DH4 (optional): ourOneTimePreKeyPrivate × ephemeralKey
 */
export async function performX3DHResponder(
  ourIdentityKeyPair: CryptoKeyPair,
  ourSignedPreKeyPair: CryptoKeyPair,
  initiatorIdentityKey: string,
  ephemeralKeyBase64: string,
  ourOneTimePreKeyPair?: CryptoKeyPair
): Promise<CryptoKey> {
  const initiatorIdentity = await importECDHPublicKey(initiatorIdentityKey);
  const ephemeralKey = await importECDHPublicKey(ephemeralKeyBase64);

  // DH1: ourSignedPreKey × initiatorIdentity
  const dh1 = await crypto.subtle.deriveBits(
    { name: "ECDH", public: initiatorIdentity },
    ourSignedPreKeyPair.privateKey,
    256
  );

  // DH2: ourIdentity × ephemeral
  const dh2 = await crypto.subtle.deriveBits(
    { name: "ECDH", public: ephemeralKey },
    ourIdentityKeyPair.privateKey,
    256
  );

  // DH3: ourSignedPreKey × ephemeral
  const dh3 = await crypto.subtle.deriveBits(
    { name: "ECDH", public: ephemeralKey },
    ourSignedPreKeyPair.privateKey,
    256
  );

  let totalLen = dh1.byteLength + dh2.byteLength + dh3.byteLength;

  let dh4: ArrayBuffer | null = null;
  if (ourOneTimePreKeyPair) {
    dh4 = await crypto.subtle.deriveBits(
      { name: "ECDH", public: ephemeralKey },
      ourOneTimePreKeyPair.privateKey,
      256
    );
    totalLen += dh4.byteLength;
  }

  const sharedSecret = new Uint8Array(totalLen);
  let offset = 0;
  sharedSecret.set(new Uint8Array(dh1), offset);
  offset += dh1.byteLength;
  sharedSecret.set(new Uint8Array(dh2), offset);
  offset += dh2.byteLength;
  sharedSecret.set(new Uint8Array(dh3), offset);
  offset += dh3.byteLength;
  if (dh4) {
    sharedSecret.set(new Uint8Array(dh4), offset);
  }

  return deriveAESKey(sharedSecret.buffer, X3DH_INFO);
}
