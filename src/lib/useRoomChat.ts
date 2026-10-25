import { useCallback, useEffect, useRef, useState } from 'react';
import { deflateSync, inflateSync } from 'fflate';
import { useSpace } from './space';
import type { Room } from './model';
import { ChatMeta, Identity, Sealed, loadIdentity, open, pack, recipientsFor, seal, unpack } from './e2e';
import { ChatFile, ChatItem, ChatState, loadChat, readFile, removeFile, saveChat, saveFile } from './chatStore';
import { CHAT_IMPORTED } from './linkHistory';

export const MAX_ATTACHMENT = 16_000_000;
const PART = 1_000_000;
const COMPRESSED = /^(image|video|audio)\/|zip|compressed|x-7z|rar|gzip|jpeg|png|webp|heic|mp4/;
type Incoming = { id: number; from: string; name: string; at: number; payload: Sealed };

/** Private room chat: end-to-end encrypted, history kept only in this browser. */
export function useRoomChat(room: Room | undefined) {
  const space = useSpace();
  const userId = space.user.id;
  const code = room?.code || '';
  const [state, setState] = useState<ChatState>({ cursor: 0, items: [] });
  const [loaded, setLoaded] = useState(false);
  const ref = useRef(state);
  const me = useRef<Identity | null>(null);
  const syncing = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const roomRef = useRef(room);
  useEffect(() => { roomRef.current = room; }, [room]);
  const commit = useCallback((next: ChatState) => {
    ref.current = next; setState(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveChat(userId, code, next).catch(() => {}); }, 250);
  }, [userId, code]);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    me.current = loadIdentity(userId);
    void loadChat(userId, code).then(saved => { if (alive) { ref.current = saved; setState(saved); setLoaded(true); } });
    // History copied from the phone: reload it (keeping anything still being sent here).
    const imported = (e: Event) => {
      if (!(e as CustomEvent<string[]>).detail?.includes(code)) return;
      void loadChat(userId, code).then(saved => {
        if (!alive) return;
        const pending = ref.current.items.filter(i => i.pending || i.failed);
        const next = { ...saved, cursor: Math.max(saved.cursor, ref.current.cursor), items: [...saved.items, ...pending.filter(p => !saved.items.some(i => i.id === p.id))].sort((a, b) => a.at - b.at) };
        ref.current = next; setState(next);
      });
    };
    window.addEventListener(CHAT_IMPORTED, imported);
    return () => { alive = false; clearTimeout(saveTimer.current); window.removeEventListener(CHAT_IMPORTED, imported); };
  }, [userId, code]);

  const remoteCursor = room?.e2eCursor || 0;
  const [unreadable, setUnreadable] = useState(0);
  useEffect(() => {
    if (!loaded || !me.current || remoteCursor <= ref.current.cursor || syncing.current) return;
    syncing.current = true;
    void (async () => {
      try {
        let more = true;
        while (more) {
          const page = await space.api<{ messages: Incoming[]; more: boolean }>(`/rooms/${code}/e2e?after=${ref.current.cursor}&limit=20`);
          const added: ChatItem[] = []; let skipped = 0;
          for (const m of page.messages) {
            if (ref.current.items.some(i => i.id === String(m.id))) continue;
            const sender = roomRef.current?.members.find(p => p.id === m.from);
            const plain = open(m.payload, m.from, sender, userId, me.current!);
            if (!plain) { if (m.payload.keys && !m.payload.keys[`${userId}:${me.current!.deviceId}`]) skipped++; continue; }
            const { meta, data } = unpack(plain);
            if (meta.t === 'part') {
              if (m.from === userId && m.payload.sd === me.current!.deviceId) continue;
              const fid = String(meta.fid || ''); if (!fid || typeof meta.i !== 'number') continue;
              const key = await saveFile(userId, code, `part-${fid}-${meta.i}`, data.slice(), 'application/octet-stream');
              const parts = { ...(ref.current.parts || {}) }; const entry = parts[fid] || { keys: [], at: Date.now() };
              const keys = [...entry.keys]; keys[meta.i] = key; parts[fid] = { keys, at: entry.at };
              ref.current = { ...ref.current, parts };
              continue;
            }
            const item: ChatItem = { id: String(m.id), from: m.from, name: m.name || sender?.name || '', at: meta.at || m.at, kind: meta.t, text: meta.text };
            if (meta.t !== 'text') {
              let body: Uint8Array = data;
              if (meta.fid && meta.parts) {
                const entry = ref.current.parts?.[meta.fid];
                if (!entry || entry.keys.filter(Boolean).length < meta.parts) continue;
                const pieces = await Promise.all(entry.keys.slice(0, meta.parts).map(async k => new Uint8Array(await (await readFile(k))!.arrayBuffer())));
                body = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of pieces) { body.set(p, o); o += p.length; }
                const parts = { ...(ref.current.parts || {}) }; delete parts[meta.fid]; ref.current = { ...ref.current, parts };
                void Promise.all(entry.keys.map(removeFile));
              }
              const bytes = meta.z ? inflateSync(body) : body.slice();
              const mime = meta.mime || 'application/octet-stream';
              item.file = { key: await saveFile(userId, code, item.id, bytes, mime), name: meta.name || 'file', mime, size: bytes.length, w: meta.w, h: meta.h };
            }
            added.push(item);
          }
          if (skipped) setUnreadable(n => n + skipped);
          const cursor = page.messages.length ? page.messages[page.messages.length - 1].id : ref.current.cursor;
          commit({ ...ref.current, cursor: Math.max(cursor, ref.current.cursor), items: [...ref.current.items, ...added].sort((a, b) => a.at - b.at) });
          more = page.more && page.messages.length > 0;
        }
      } catch { /* retried on the next room update */ }
      finally { syncing.current = false; }
    })();
  }, [loaded, remoteCursor, space, code, userId, commit]);

  const waitingForKeys = (room?.members || []).filter(p => !p.key && !p.devices?.length && p.id !== userId).map(p => p.name);

  async function deliver(meta: ChatMeta, data: Uint8Array | undefined, file?: ChatFile, onProgress?: (done: number, total: number) => void) {
    const local: ChatItem = { id: `local-${meta.at}`, from: userId, name: space.user.name, at: meta.at, kind: meta.t as ChatItem['kind'], text: meta.text, file, pending: true };
    commit({ ...ref.current, items: [...ref.current.items, local] });
    try {
      const id = me.current || (me.current = loadIdentity(userId));
      const to = recipientsFor(roomRef.current?.members || [], id, userId);
      let head = meta; let body = data;
      if (data && data.length > PART) {
        const fid = `${userId}-${meta.at}`; const parts = Math.ceil(data.length / PART);
        for (let i = 0; i < parts; i++) {
          await space.api(`/rooms/${code}/e2e`, { ...seal(pack({ t: 'part', fid, i, at: meta.at }, data.subarray(i * PART, (i + 1) * PART)), to, id), hint: 'part' }, 'POST');
          onProgress?.(i + 1, parts + 1);
        }
        head = { ...meta, fid, parts }; body = undefined;
      }
      const sent = await space.api<{ id: number }>(`/rooms/${code}/e2e`, { ...seal(pack(head, body), to, id), hint: meta.t === 'image' ? 'photo' : meta.t === 'file' ? 'file' : 'message' }, 'POST');
      commit({ ...ref.current, items: ref.current.items.map(i => i.id === local.id ? { ...i, id: String(sent.id), pending: false } : i) });
    } catch (e) {
      commit({ ...ref.current, items: ref.current.items.map(i => i.id === local.id ? { ...i, pending: false, failed: true } : i) });
      throw e;
    }
  }
  async function sendText(text: string) { const t = text.trim(); if (t) await deliver({ t: 'text', text: t, at: Date.now() }, undefined); }
  async function sendFile(file: File, onProgress?: (done: number, total: number) => void) {
    const image = /^image\/(jpeg|png|webp|gif)$/.test(file.type);
    let blob: Blob = file; let w: number | undefined; let h: number | undefined; let mime = file.type || 'application/octet-stream'; let name = file.name;
    if (image && file.type !== 'image/gif') { const r = await shrinkImage(file); blob = r.blob; w = r.w; h = r.h; mime = 'image/jpeg'; name = name.replace(/\.\w+$/, '') + '.jpg'; }
    const raw = new Uint8Array(await blob.arrayBuffer());
    const squeeze = !image && !COMPRESSED.test(mime);
    const data = squeeze ? deflateSync(raw, { level: 9 }) : raw;
    if (data.length > MAX_ATTACHMENT) throw new Error(`That file is too large. Private chat sends files up to ${MAX_ATTACHMENT / 1e6} MB.`);
    const at = Date.now();
    const key = await saveFile(userId, code, `out-${at}`, raw, mime);
    await deliver({ t: image ? 'image' : 'file', name, mime, size: raw.length, w, h, at, ...(squeeze ? { z: 1 } : {}) }, data, { key, name, mime, size: raw.length, w, h }, onProgress);
  }
  function dismiss(id: string) { commit({ ...ref.current, items: ref.current.items.filter(i => i.id !== id) }); }
  return { items: state.items, loaded, sendText, sendFile, waitingForKeys, dismiss, unreadable };
}

/** Photos are resized to 1280 px JPEG like the phone app (keeps sealed messages small). */
async function shrinkImage(file: File): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Could not read that photo.')), 'image/jpeg', 0.72));
  return { blob, w, h };
}
