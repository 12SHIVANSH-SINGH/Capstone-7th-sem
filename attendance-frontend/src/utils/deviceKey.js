import { signProofMessage } from "../acoustic/proofTransport";

const DATABASE_NAME = "attendance-device-keys";
const STORE_NAME = "keys";
const DEVICE_KEY_ID = "student-device-v1";

const openDatabase = () => new Promise((resolve, reject) => {
  const request = window.indexedDB.open(DATABASE_NAME, 1);

  request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const readKey = async () => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(DEVICE_KEY_ID);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveKey = async (deviceKey) => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(deviceKey, DEVICE_KEY_ID);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getOrCreateDevicePublicKey = async () => {
  if (!window.crypto?.subtle || !window.indexedDB) {
    throw new Error("This browser cannot create a secure attendance device key.");
  }

  const existingKey = await readKey();
  if (existingKey?.publicKeyJwk) return existingKey.publicKeyJwk;

  const keyPair = await window.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"]
  );
  const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
  await saveKey({ privateKey: keyPair.privateKey, publicKeyJwk });

  return publicKeyJwk;
};

/**
 * Sign the exact proof message for this browser's bound device key.
 * The private key never leaves IndexedDB; only the signature is returned.
 */
export const signDeviceMessage = async (message) => {
  const stored = await readKey();
  if (!stored?.privateKey) {
    throw new Error("This browser has no attendance device key. Sign in again.");
  }
  return signProofMessage(stored.privateKey, message);
};
