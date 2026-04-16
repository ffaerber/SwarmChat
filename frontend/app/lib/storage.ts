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

export async function putMessage(msg: ChatMessage): Promise<void> {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    tx.objectStore(STORE_MESSAGES).put(msg);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function listMessages(): Promise<ChatMessage[]> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE_MESSAGES, "readonly");
    const req = tx.objectStore(STORE_MESSAGES).getAll();
    req.onsuccess = () => res((req.result as ChatMessage[]) ?? []);
    req.onerror = () => rej(req.error);
  });
}

export async function blockAddress(address: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE_BLOCKLIST, "readwrite");
    tx.objectStore(STORE_BLOCKLIST).put({ address });
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function listBlocked(): Promise<string[]> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE_BLOCKLIST, "readonly");
    const req = tx.objectStore(STORE_BLOCKLIST).getAllKeys();
    req.onsuccess = () => res((req.result as string[]) ?? []);
    req.onerror = () => rej(req.error);
  });
}
