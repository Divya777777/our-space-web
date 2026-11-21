// Chat history lives only in this browser (IndexedDB): one sealed record per room, attachments as blobs beside it.
import { strFromU8, strToU8 } from 'fflate';
import { localKey, openLocal, sealLocal } from './e2e';

export type ChatFile = { key: string; name: string; mime: string; size: number; w?: number; h?: number };
export type ChatItem = { id: string; from: string; name: string; at: number; kind: 'text' | 'image' | 'file'; /** Private message: who it was sent to. */ to?: string[]; text?: string; file?: ChatFile; pending?: boolean; failed?: boolean;
  edited?: boolean; /** Deleted for everyone by the sender. */ deleted?: boolean; /** userId -> emoji */ reactions?: Record<string, string>; re?: { id: string; name: string; text: string } };
export type ChatState = { acks?: number[]; cursor: number; items: ChatItem[]; parts?: Record<string, { keys: string[]; at: number }>; /** Messages deleted on this device only (they stay for everyone else). */ hidden?: string[] };

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('ourspace-chat', 1);
    req.onupgradeneeded = () => { const d = req.result; d.createObjectStore('history'); d.createObjectStore('files'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}
function run<T>(store: 'history' | 'files', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(d => new Promise<T>((resolve, reject) => {
    const tx = d.transaction(store, mode); const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result as T);
    tx.onabort = () => reject(tx.error || new Error('Local storage write failed'));
    tx.onerror = () => reject(tx.error);
    req.onerror = () => reject(req.error);
  }));
}
const roomKey = (userId: string, code: string) => `${userId}/${code}`;

export async function loadChat(userId: string, code: string): Promise<ChatState> {
  try {
    const sealed = await run<Uint8Array | undefined>('history', 'readonly', s => s.get(roomKey(userId, code)));
    if (!sealed) return { cursor: 0, items: [] };
    const plain = openLocal(new Uint8Array(sealed), localKey(userId));
    return plain ? JSON.parse(strFromU8(plain)) : { cursor: 0, items: [] };
  } catch { return { cursor: 0, items: [] }; }
}
const writes = new Map<string, Promise<void>>();
export function saveChat(userId: string, code: string, state: ChatState): Promise<void> {
  const key = `${userId}/${code}`;
  const operation = (writes.get(key) || Promise.resolve()).catch(() => {}).then(() => writeChat(userId, code, state));
  writes.set(key, operation);
  return operation.finally(() => { if (writes.get(key) === operation) writes.delete(key); });
}
async function writeChat(userId: string, code: string, state: ChatState) {
  const body = { acks: state.acks || [], hidden: state.hidden || [], cursor: state.cursor, items: state.items.map(i => i.pending ? { ...i, pending: false, failed: true } : i), ...(state.parts && Object.keys(state.parts).length ? { parts: state.parts } : {}) };
  const sealed = sealLocal(strToU8(JSON.stringify(body)), localKey(userId));
  await run('history', 'readwrite', s => s.put(sealed, roomKey(userId, code)));
}
export async function saveFile(userId: string, code: string, id: string, data: Uint8Array | Blob, mime: string) {
  const key = `${roomKey(userId, code)}/${id}`;
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  await run('files', 'readwrite', s => s.put(blob, key));
  return key;
}
export async function readFile(key: string): Promise<Blob | null> {
  try { return (await run<Blob | undefined>('files', 'readonly', s => s.get(key))) || null; } catch { return null; }
}
export async function removeFile(key: string) { try { await run('files', 'readwrite', s => s.delete(key)); } catch { /* already gone */ } }

const urls = new Map<string, string>();
/** An object URL for a stored attachment (cached for the session). */
export async function fileUrl(key: string) {
  const hit = urls.get(key); if (hit) return hit;
  const blob = await readFile(key); if (!blob) return '';
  const url = URL.createObjectURL(blob); urls.set(key, url); return url;
}
