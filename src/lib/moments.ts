// Moments on the website: sealing, opening and the list of moments from your rooms (24 hours each).
// The photo and its small thumbnail are sealed with one random key; that key is boxed for every key of every person
// in the picked rooms (their phone key and their browsers), exactly like chat. Comments are sealed with the same key.
// The phone app has the same format in mobile/src/lib/moments.ts — keep them compatible.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import nacl from 'tweetnacl';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { concat, fromBase64, readU32, toBase64, u32 } from './bytes';
import { loadIdentity, randomBytes, type Identity } from './e2e';
import type { Person } from './model';
import { useSpace } from './space';

export type MomentMeta = { v: 1; caption?: string; w: number; h: number; filter: string; at: number;
  /** Stickers drawn over the photo by the viewer (never burned in). */ time?: boolean; mood?: string; watching?: string; dual?: boolean };
export type MomentReaction = { id: string; name: string; emoji: string };
export type MomentWire = { id: string; from: Person; rooms: { code: string; name: string }[]; at: number; expiresAt: number;
  thumbNonce: string; thumb: string; keys: Record<string, { n: string; b: string }>; sd?: string; seen: boolean;
  views?: { id: string; name: string; at: number }[]; reactions: MomentReaction[]; comments: number };
export type Moment = MomentWire & { key: Uint8Array | null; thumbUrl: string | null; caption?: string };
export type MomentComment = { id: string; userId: string; name: string; at: number; text: string | null };
type Sealed = { nonce: string; box: string; thumbNonce: string; thumb: string; keys: Record<string, { n: string; b: string }>; sd: string };

/** Every key that must be able to open a moment for these people (yours included). */
export function recipientKeys(people: Person[], me: Identity, myId: string) {
  const out: { id: string; key: string }[] = [];
  for (const p of people) {
    if (p.key) out.push({ id: p.id, key: p.key });
    for (const d of p.devices || []) out.push({ id: `${p.id}:${d.id}`, key: d.key });
  }
  const mine = `${myId}:${me.deviceId}`;
  if (!out.some(r => r.id === mine)) out.push({ id: mine, key: me.publicKey });
  return out;
}

/** [u32 length][deflated JSON][jpeg] — the photo carries all of `meta`; the thumbnail carries the caption and stickers
 *  too, so lists and home-screen widgets can show them without downloading the photo. */
const packed = (meta: object, jpeg: Uint8Array) => { const head = deflateSync(strToU8(JSON.stringify(meta)), { level: 9 }); return concat(u32(head.length), head, jpeg); };
function unpacked<T>(plain: Uint8Array): { meta: T; jpeg: Uint8Array } {
  const length = readU32(plain);
  return { meta: JSON.parse(strFromU8(inflateSync(plain.subarray(4, 4 + length)))) as T, jpeg: plain.subarray(4 + length) };
}
export type ThumbMeta = Pick<MomentMeta, 'caption' | 'mood' | 'at'>;
export function sealMoment(photo: Uint8Array, thumb: Uint8Array, meta: MomentMeta, people: Person[], me: Identity, myId: string): Sealed {
  const key = randomBytes(32);
  const n1 = randomBytes(24), n2 = randomBytes(24);
  const keys: Sealed['keys'] = {};
  for (const r of recipientKeys(people, me, myId)) {
    const n = randomBytes(24);
    keys[r.id] = { n: toBase64(n), b: toBase64(nacl.box(key, n, fromBase64(r.key), me.secretKey)) };
  }
  const small: ThumbMeta = { caption: meta.caption, mood: meta.mood, at: meta.at };
  return { nonce: toBase64(n1), box: toBase64(nacl.secretbox(packed(meta, photo), n1, key)), thumbNonce: toBase64(n2), thumb: toBase64(nacl.secretbox(packed(small, thumb), n2, key)), keys, sd: me.deviceId };
}
export function openThumb(m: { thumb: string; thumbNonce: string }, key: Uint8Array): { meta: ThumbMeta; jpeg: Uint8Array } | null {
  const plain = nacl.secretbox.open(fromBase64(m.thumb), fromBase64(m.thumbNonce), key);
  try { return plain ? unpacked<ThumbMeta>(plain) : null; } catch { return null; }
}
/** The moment's key, or null when this browser can't open it (shared before this browser had a key). */
export function openKey(m: MomentWire, myId: string, me: Identity): Uint8Array | null {
  const envelope = m.keys[`${myId}:${me.deviceId}`];
  if (!envelope) return null;
  const senderKey = m.sd ? (m.from.id === myId && m.sd === me.deviceId ? me.publicKey : m.from.devices?.find(d => d.id === m.sd)?.key) : m.from.key;
  if (!senderKey) return null;
  return nacl.box.open(fromBase64(envelope.b), fromBase64(envelope.n), fromBase64(senderKey), me.secretKey);
}
export function openPhoto(sealed: { nonce: string; box: string }, key: Uint8Array): { meta: MomentMeta; jpeg: Uint8Array } | null {
  const plain = nacl.secretbox.open(fromBase64(sealed.box), fromBase64(sealed.nonce), key);
  try { return plain ? unpacked<MomentMeta>(plain) : null; } catch { return null; }
}
export function sealText(text: string, key: Uint8Array) { const n = randomBytes(24); return { nonce: toBase64(n), box: toBase64(nacl.secretbox(strToU8(text), n, key)) }; }
export function openText(s: { nonce: string; box: string }, key: Uint8Array) { const p = nacl.secretbox.open(fromBase64(s.box), fromBase64(s.nonce), key); return p ? strFromU8(p) : null; }

const blobUrl = (bytes: Uint8Array) => URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));

/** Your moments and the ones from your rooms, newest first; refreshes every minute and when the tab comes back. */
export function useMoments() {
  const space = useSpace();
  const myId = space.user.id;
  const me = useMemo(() => (myId ? loadIdentity(myId) : null), [myId]);
  const [list, setList] = useState<Moment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const urls = useRef(new Map<string, { url: string; caption?: string }>());
  const refresh = useCallback(async () => {
    if (!me || !myId) return;
    try {
      const r = await space.api<{ moments: MomentWire[] }>('/moments');
      const next = r.moments.map(w => {
        const key = openKey(w, myId, me);
        let thumb = urls.current.get(w.id) || null;
        if (!thumb && key) { const t = openThumb(w, key); if (t) { thumb = { url: blobUrl(t.jpeg), caption: t.meta.caption }; urls.current.set(w.id, thumb); } }
        return { ...w, key, thumbUrl: thumb?.url || null, caption: thumb?.caption };
      });
      for (const [id, t] of urls.current) if (!next.some(m => m.id === id)) { URL.revokeObjectURL(t.url); urls.current.delete(id); }
      setList(next);
    } catch { /* offline: keep what we have */ } finally { setLoaded(true); }
  }, [space.api, me, myId]);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60000);
    const v = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', v);
    window.addEventListener('ourspace:moments', v);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', v); window.removeEventListener('ourspace:moments', v); };
  }, [refresh]);
  useEffect(() => () => { for (const t of urls.current.values()) URL.revokeObjectURL(t.url); urls.current.clear(); }, []);
  const markSeen = useCallback((id: string) => {
    setList(l => l.map(m => (m.id === id ? { ...m, seen: true } : m)));
    void space.api(`/moments/${id}/seen`, {}).catch(() => {});
  }, [space.api]);
  const react = useCallback(async (id: string, emoji: string | null) => {
    setList(l => l.map(m => (m.id === id ? { ...m, reactions: [...m.reactions.filter(r => r.id !== myId), ...(emoji ? [{ id: myId, name: space.user.name, emoji }] : [])] } : m)));
    await space.api(`/moments/${id}/react`, { emoji });
  }, [space.api, myId, space.user.name]);
  const remove = useCallback(async (id: string) => { setList(l => l.filter(m => m.id !== id)); await space.api(`/moments/${id}`, undefined, 'DELETE'); }, [space.api]);
  /** Seals and shares a moment to these rooms. */
  const share = useCallback(async (photo: Uint8Array, thumb: Uint8Array, meta: MomentMeta, codes: string[]) => {
    if (!me) throw new Error('Sign in again to share moments.');
    const { people } = await space.api<{ people: Person[] }>(`/moments/recipients?codes=${encodeURIComponent(codes.join(','))}`);
    if (!people.some(p => p.id !== myId)) throw new Error('Nobody else is in these rooms yet. Invite someone first.');
    if (!people.some(p => p.id !== myId && (p.key || p.devices?.length))) throw new Error('The people in these rooms need to open Our Space once before they can see moments.');
    const sealed = sealMoment(photo, thumb, meta, people, me, myId);
    const made = await space.api<{ id: string }>('/moments', { codes, ...sealed });
    await refresh();
    return made.id;
  }, [space.api, me, myId, refresh]);
  const comments = useCallback(async (m: Moment): Promise<MomentComment[]> => {
    const r = await space.api<{ comments: { id: string; userId: string; name: string; at: number; nonce: string; box: string }[] }>(`/moments/${m.id}/comments`);
    return r.comments.map(c => ({ id: c.id, userId: c.userId, name: c.name, at: c.at, text: m.key ? openText(c, m.key) : null }));
  }, [space.api]);
  const comment = useCallback(async (m: Moment, text: string) => {
    if (!m.key) throw new Error('This browser can’t open this moment.');
    await space.api(`/moments/${m.id}/comments`, sealText(text.trim().slice(0, 1000), m.key));
    setList(l => l.map(x => (x.id === m.id ? { ...x, comments: x.comments + 1 } : x)));
  }, [space.api]);
  const removeComment = useCallback(async (m: Moment, commentId: string) => { await space.api(`/moments/${m.id}/comments/${commentId}`, undefined, 'DELETE'); setList(l => l.map(x => (x.id === m.id ? { ...x, comments: Math.max(0, x.comments - 1) } : x))); }, [space.api]);
  const photo = useCallback(async (m: Moment) => {
    if (!m.key) return null;
    const sealed = await space.api<{ nonce: string; box: string }>(`/moments/${m.id}/photo`);
    const opened = openPhoto(sealed, m.key);
    return opened ? { meta: opened.meta, url: blobUrl(opened.jpeg) } : null;
  }, [space.api]);
  return { list, loaded, myId, refresh, markSeen, react, remove, share, comments, comment, removeComment, photo };
}
export type MomentsApi = ReturnType<typeof useMoments>;
