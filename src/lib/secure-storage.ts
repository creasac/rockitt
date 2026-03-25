import type { EncryptedSecretPayload } from './provider-settings';

const databaseName = 'rockitt-secure-store';
const storeName = 'crypto';
const providerKeyRecord = 'provider-secrets-key-v1';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to open secure storage database.'));
  });

const readDatabaseValue = async <T>(key: string) => {
  const database = await openDatabase();

  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(key);

    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to read secure storage value.'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Secure storage read failed.'));
  });
};

const writeDatabaseValue = async (key: string, value: CryptoKey) => {
  const database = await openDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value, key);

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Secure storage write failed.'));
  });
};

const bytesToBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const base64ToBytes = (value: string) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

const loadOrCreateEncryptionKey = async () => {
  const existingKey = await readDatabaseValue<CryptoKey>(providerKeyRecord);

  if (existingKey) {
    return existingKey;
  }

  const generatedKey = await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt'],
  );

  await writeDatabaseValue(providerKeyRecord, generatedKey);

  return generatedKey;
};

export const encryptSecret = async (
  plaintext: string,
): Promise<EncryptedSecretPayload> => {
  const encryptionKey = await loadOrCreateEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    encryptionKey,
    encoder.encode(plaintext),
  );

  return {
    version: 1,
    algorithm: 'AES-GCM',
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
};

export const decryptSecret = async (payload: EncryptedSecretPayload) => {
  const encryptionKey = await loadOrCreateEncryptionKey();
  const plaintext = await crypto.subtle.decrypt(
    {
      name: payload.algorithm,
      iv: base64ToBytes(payload.iv),
    },
    encryptionKey,
    base64ToBytes(payload.ciphertext),
  );

  return decoder.decode(plaintext);
};
