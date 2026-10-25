// Copy chat history from the phone to this browser (same account), end to end encrypted.
// 1. This browser makes a one-time key pair and shows its public key in a QR code (ourspace://link?id=…&k=…).
// 2. The phone scans it, packs its history (messages + photos/files) and encrypts it to that key.
// 3. The server relays the encrypted pieces for at most 10 minutes; this browser decrypts and merges them.
// Archive format (shared with the phone app): [u32 manifest length][deflated JSON manifest][attachment bytes].
import nacl from 'tweetnacl';
import { inflateSync, strFromU8 } from 'fflate';
import { fromBase64, readU32, toBase64 } from './bytes';
import { ChatItem, loadChat, saveChat, saveFile } from './chatStore';

type Api = <T>(path: string, body?: unknown, method?: string, signal?: AbortSignal) => Promise<T>;
export type ArchiveItem = Omit<ChatItem, 'file' | 'pending' | 'failed'> & { file?: { name: string; mime: string; size: number; w?: number; h?: number; off: number; len: number } };
export type Manifest = { v: 1; user: string; rooms: { code: string; cursor: number; items: ArchiveItem[] }[]; skipped?: number };
export type LinkState =
  | { step: 'starting' } | { step: 'waiting'; qr: string; expiresAt: number } | { step: 'sending'; phone: string; received: number; parts: number }
  | { step: 'importing' } | { step: 'done'; messages: number; rooms: number; skipped: number } | { step: 'error'; message: string };
export const CHAT_IMPORTED = 'ourspace:chat-imported';

/** Runs one transfer and reports progress; returns a cancel function. */
export function startLink(api: Api, userId: string, report: (s: LinkState) => void): () => void {
  const pair = nacl.box.keyPair();
  const pub = toBase64(pair.publicKey);
  const abort = new AbortController();
  let id = ''; let stopped = false;
  const stop = () => { stopped = true; abort.abort(); if (id) void api(`/link/${id}`, undefined, 'DELETE').catch(() => {}); };
  void (async () => {
    try {
      report({ step: 'starting' });
      const link = await api<{ id: string; expiresAt: number }>('/link', { pub }, 'POST', abort.signal);
      id = link.id;
      report({ step: 'waiting', qr: `ourspace://link?id=${link.id}&k=${encodeURIComponent(pub)}`, expiresAt: link.expiresAt });
      let s = { status: 'waiting', received: 0, parts: 0, phone: '' };
      while (!stopped && s.status !== 'ready') {
        await new Promise(r => setTimeout(r, 1500));
        if (stopped) return;
        s = await api(`/link/${id}`, undefined, undefined, abort.signal);
        if (s.status === 'sending') report({ step: 'sending', phone: s.phone, received: s.received, parts: s.parts });
      }
      if (stopped) return;
      report({ step: 'importing' });
      const meta = await api<{ parts: number; nonce: string; key: { n: string; b: string }; from: string }>(`/link/${id}/meta`, undefined, undefined, abort.signal);
      const pieces: Uint8Array[] = [];
      for (let i = 0; i < meta.parts; i++) pieces.push(fromBase64((await api<{ data: string }>(`/link/${id}/part/${i}`, undefined, undefined, abort.signal)).data));
      const cipher = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of pieces) { cipher.set(p, o); o += p.length; }
      const messageKey = nacl.box.open(fromBase64(meta.key.b), fromBase64(meta.key.n), fromBase64(meta.from), pair.secretKey);
      const plain = messageKey && nacl.secretbox.open(cipher, fromBase64(meta.nonce), messageKey);
      if (!plain) throw new Error('The chats couldn’t be unlocked. Show a new QR code and scan it again.');
      const result = await importArchive(plain, userId);
      void api(`/link/${id}`, undefined, 'DELETE').catch(() => {}); id = '';
      window.dispatchEvent(new CustomEvent(CHAT_IMPORTED, { detail: result.codes }));
      report({ step: 'done', messages: result.messages, rooms: result.codes.length, skipped: result.skipped });
    } catch (e) {
      if (stopped) return;
      const status = (e as { status?: number }).status;
      report({ step: 'error', message: status === 404 ? 'The QR code expired. Show a new one.' : (e as Error).message || 'Something went wrong. Try again.' });
    }
  })();
  return stop;
}

/** Merges the phone's history into this browser's history, room by room (messages are matched by their server id). */
export async function importArchive(bytes: Uint8Array, userId: string) {
  const length = readU32(bytes);
  const manifest = JSON.parse(strFromU8(inflateSync(bytes.subarray(4, 4 + length)))) as Manifest;
  if (manifest.v !== 1) throw new Error('Update Our Space on your phone, then try again.');
  if (manifest.user !== userId) throw new Error('That phone is signed in to a different account.');
  const blob = bytes.subarray(4 + length);
  let messages = 0; const codes: string[] = [];
  for (const room of manifest.rooms) {
    const state = await loadChat(userId, room.code);
    const have = new Set(state.items.map(i => i.id));
    const added: ChatItem[] = [];
    for (const item of room.items) {
      if (have.has(item.id)) continue;
      const { file, ...rest } = item;
      const next: ChatItem = { ...rest };
      if (file) {
        const key = await saveFile(userId, room.code, item.id, blob.slice(file.off, file.off + file.len), file.mime || 'application/octet-stream');
        next.file = { key, name: file.name, mime: file.mime, size: file.size, w: file.w, h: file.h };
      }
      added.push(next);
    }
    if (!added.length && room.cursor <= state.cursor) continue;
    messages += added.length; codes.push(room.code);
    await saveChat(userId, room.code, { ...state, cursor: Math.max(state.cursor, room.cursor), items: [...state.items, ...added].sort((a, b) => a.at - b.at) });
  }
  return { messages, codes, skipped: manifest.skipped || 0 };
}
export { toBase64 };
