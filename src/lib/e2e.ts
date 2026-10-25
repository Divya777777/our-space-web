// End-to-end encrypted room chat, compatible with the phone app.
// Each browser has its own NaCl box key pair (a "device" key). Messages are packed + compressed, sealed once with
// a fresh random key (secretbox), and that key is boxed for every key of every member: `userId` for a member's
// phone key and `userId:deviceId` for each of their browsers. `sd` says which of the sender's keys sealed it.
import nacl from 'tweetnacl';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { concat, fromBase64, readU32, toBase64, u32 } from './bytes';
import type { Person } from './model';

nacl.setPRNG((x, n) => { const b = new Uint8Array(n); crypto.getRandomValues(b); x.set(b); });
export const randomBytes = (n: number) => nacl.randomBytes(n);

export type Identity = { publicKey: string; secretKey: Uint8Array; deviceId: string };
const safe = (v: string) => v.replace(/[^\w.-]/g, '_');
function stored(name: string, make: () => string) {
  let value: string | null = null;
  try { value = localStorage.getItem(name); } catch { /* blocked storage */ }
  if (!value) { value = make(); try { localStorage.setItem(name, value); } catch { /* kept for this tab only */ } }
  return value;
}
/** This browser's key pair for this account (created once). */
export function loadIdentity(userId: string): Identity {
  const secret = stored(`ourspace.e2e.identity.${safe(userId)}`, () => toBase64(nacl.box.keyPair().secretKey));
  const deviceId = stored(`ourspace.e2e.device.${safe(userId)}`, () => 'web-' + toBase64(randomBytes(9)).replace(/[+/=]/g, '').slice(0, 12));
  const pair = nacl.box.keyPair.fromSecretKey(fromBase64(secret));
  return { publicKey: toBase64(pair.publicKey), secretKey: pair.secretKey, deviceId };
}
export function forgetIdentity(userId: string) {
  try { localStorage.removeItem(`ourspace.e2e.identity.${safe(userId)}`); localStorage.removeItem(`ourspace.e2e.device.${safe(userId)}`); } catch { /* ignore */ }
}

export type ChatMeta = { t: 'text' | 'image' | 'file' | 'part'; text?: string; name?: string; mime?: string; size?: number; w?: number; h?: number; at: number; z?: number; fid?: string; i?: number; parts?: number };
export type Sealed = { nonce: string; box: string; keys: Record<string, { n: string; b: string }>; sd?: string };

export function pack(meta: ChatMeta, data?: Uint8Array) {
  const head = deflateSync(strToU8(JSON.stringify(meta)), { level: 9 });
  return concat(u32(head.length), head, data || new Uint8Array(0));
}
export function unpack(bytes: Uint8Array): { meta: ChatMeta; data: Uint8Array } {
  const length = readU32(bytes);
  const meta = JSON.parse(strFromU8(inflateSync(bytes.subarray(4, 4 + length)))) as ChatMeta;
  return { meta, data: bytes.subarray(4 + length) };
}
/** Every key that should be able to open a message in this room. */
export function recipientsFor(members: Person[], me: Identity, myId: string) {
  const out: { id: string; key: string }[] = [];
  for (const m of members) {
    if (m.key) out.push({ id: m.id, key: m.key });
    for (const d of m.devices || []) out.push({ id: `${m.id}:${d.id}`, key: d.key });
  }
  const mine = `${myId}:${me.deviceId}`;
  if (!out.some(r => r.id === mine)) out.push({ id: mine, key: me.publicKey });
  return out;
}
export function seal(plain: Uint8Array, recipients: { id: string; key: string }[], me: Identity): Sealed {
  const messageKey = randomBytes(32);
  const nonce = randomBytes(24);
  const box = nacl.secretbox(plain, nonce, messageKey);
  const keys: Sealed['keys'] = {};
  for (const r of recipients) {
    const n = randomBytes(24);
    keys[r.id] = { n: toBase64(n), b: toBase64(nacl.box(messageKey, n, fromBase64(r.key), me.secretKey)) };
  }
  return { nonce: toBase64(nonce), box: toBase64(box), keys, sd: me.deviceId };
}
/** Null when this browser has no key for the message (sent before it joined, or from an older phone build). */
export function open(sealed: Sealed, from: string, sender: Person | undefined, myId: string, me: Identity): Uint8Array | null {
  const envelope = sealed.keys?.[`${myId}:${me.deviceId}`];
  if (!envelope) return null;
  const senderKey = sealed.sd
    ? (from === myId && sealed.sd === me.deviceId ? me.publicKey : sender?.devices?.find(d => d.id === sealed.sd)?.key)
    : sender?.key;
  if (!senderKey) return null;
  const messageKey = nacl.box.open(fromBase64(envelope.b), fromBase64(envelope.n), fromBase64(senderKey), me.secretKey);
  if (!messageKey) return null;
  return nacl.secretbox.open(fromBase64(sealed.box), fromBase64(sealed.nonce), messageKey);
}
/** Local at-rest sealing for chat history kept in this browser. */
export function sealLocal(plain: Uint8Array, key: Uint8Array) { const n = randomBytes(24); return concat(n, nacl.secretbox(deflateSync(plain, { level: 6 }), n, key)); }
export function openLocal(bytes: Uint8Array, key: Uint8Array) { const out = nacl.secretbox.open(bytes.subarray(24), bytes.subarray(0, 24), key); return out ? inflateSync(out) : null; }
export function localKey(userId: string) { return fromBase64(stored(`ourspace.e2e.local.${safe(userId)}`, () => toBase64(randomBytes(32)))); }
