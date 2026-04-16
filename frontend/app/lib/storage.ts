import type { ChatMessage } from "./types";

const DB_NAME = "swarmchat";
const DB_VERSION = 1;
const STORE_MESSAGES = "messages";
const STORE_BLOCKLIST = "blocklist";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const store = db.createObjectStore(STORE_MESSAGES, {
          keyPath: "msgId",
        });
        store.createIndex("byPeer", "peer", { unique: false });
        store.createIndex("byTs", "ts", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_BLOCKLIST)) {
        db.createObjectStore(STORE_BLOCKLIST, { keyPath: "address" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withDB<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDB();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

export function putMessage(msg: ChatMessage): Promise<void> {
  return withDB(
    (db) =>
      new Promise<void>((res, rej) => {
        const tx = db.transaction(STORE_MESSAGES, "readwrite");
        tx.objectStore(STORE_MESSAGES).put(msg);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      }),
  );
}

export function listMessages(): Promise<ChatMessage[]> {
  return withDB(
    (db) =>
      new Promise<ChatMessage[]>((res, rej) => {
        const tx = db.transaction(STORE_MESSAGES, "readonly");
        const req = tx.objectStore(STORE_MESSAGES).getAll();
        req.onsuccess = () => res((req.result as ChatMessage[]) ?? []);
        req.onerror = () => rej(req.error);
      }),
  );
}

export function blockAddress(address: string): Promise<void> {
  return withDB(
    (db) =>
      new Promise<void>((res, rej) => {
        const tx = db.transaction(STORE_BLOCKLIST, "readwrite");
        tx.objectStore(STORE_BLOCKLIST).put({ address });
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      }),
  );
}

export function listBlocked(): Promise<string[]> {
  return withDB(
    (db) =>
      new Promise<string[]>((res, rej) => {
        const tx = db.transaction(STORE_BLOCKLIST, "readonly");
        const req = tx.objectStore(STORE_BLOCKLIST).getAllKeys();
        req.onsuccess = () => res((req.result as string[]) ?? []);
        req.onerror = () => rej(req.error);
      }),
  );
}
