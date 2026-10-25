// The account, rooms and playlists for the signed-in person, talking to the same /api/mobile backend as the phone app.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Account, backendUrl, googleSignOut, loadAccount, saveAccount } from './account';
import { isTransient, jsonRequest } from './request';
import type { Playback, Playlist, Room, Session, Track } from './model';
import type { CallSignal, IceServer, PlanInfo, SearchResult } from './types';
import { FREE_LIMITS } from './types';
import { forgetIdentity, loadIdentity } from './e2e';

type Api = <T>(path: string, body?: unknown, method?: string, signal?: AbortSignal) => Promise<T>;
type QueueAction = 'add' | 'remove' | 'clear' | 'next' | 'move';
type Space = {
  ready: boolean; synced: boolean; signedIn: boolean; waking: boolean; error: string;
  user: Session; rooms: Room[]; playlists: Playlist[]; plan: PlanInfo; needsName: boolean;
  api: Api;
  signInWithGoogle: (credential: string) => Promise<void>;
  signOut: () => Promise<void>; deleteAccount: () => Promise<void>;
  setDisplayName: (name: string) => Promise<void>;
  refresh: () => Promise<void>;
  createRoom: (name: string) => Promise<Room>; renameRoom: (code: string, name: string) => Promise<void>;
  deleteRoom: (code: string) => Promise<'deleted' | 'left'>;
  join: (code: string) => Promise<boolean>;
  joinStatus: (code: string, cursor?: number, signal?: AbortSignal) => Promise<{ status: 'approved' | 'waiting' | 'declined'; cursor: number }>;
  getRoom: (code: string, wait?: boolean, signal?: AbortSignal) => Promise<Room>;
  approve: (code: string, userId: string, approved: boolean) => Promise<void>;
  removeMember: (code: string, userId: string) => Promise<void>;
  play: (code: string, videoId: string, playing: boolean, position: number, context?: Track[]) => Promise<void>;
  queue: (code: string, action: QueueAction, payload?: { videoId?: string; title?: string; id?: string; from?: string; to?: number }) => Promise<void>;
  setVolume: (code: string, volume: number) => Promise<void>;
  searchYouTube: (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
  createPlaylist: (name: string, scope: Playlist['scope'], roomCode?: string) => Promise<Playlist>;
  deletePlaylist: (id: string) => Promise<void>;
  addTrack: (id: string, track: Track) => Promise<void>;
  removeTrack: (id: string, videoId: string) => Promise<void>;
  reorderTracks: (id: string, videoIds: string[]) => Promise<void>;
  iceServers: () => Promise<IceServer[]>;
  callInbox: (after: number, cursor?: number, signal?: AbortSignal) => Promise<{ signals: CallSignal[]; cursor: number }>;
  signalCall: (code: string, to: string, type: CallSignal['type'], payload?: Record<string, unknown>) => Promise<void>;
};
const Context = createContext<Space | null>(null);
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const nobody: Session = { id: '', name: '', token: '' };

export function SpaceProvider({ children }: React.PropsWithChildren) {
  const [account, setAccount] = useState<Account | null>(() => loadAccount());
  const accountRef = useRef(account);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [error, setError] = useState('');
  const [syncedFor, setSyncedFor] = useState<Account | null>(null);
  const [waking, setWaking] = useState(false);
  const [needsName, setNeedsName] = useState(false);
  const [serverPlan, setServerPlan] = useState<PlanInfo | null>(null);
  const roomCursors = useRef(new Map<string, number>());
  const playlistVersions = useRef(new Map<string, number>());
  const refreshing = useRef<Promise<void> | null>(null);
  const pendingPlay = useRef(new Map<string, { playback: Playback; cursor: number; at: number }>());
  const iceCache = useRef<{ account: Account; until: number; servers: IceServer[] } | null>(null);
  const roomsRef = useRef(rooms);
  useEffect(() => { roomsRef.current = rooms; }, [rooms]);
  const use = (next: Account | null) => { accountRef.current = next; setAccount(next); saveAccount(next); };

  async function refreshToken(active: Account) {
    if (!refreshing.current) refreshing.current = (async () => {
      try {
        const r = await jsonRequest<{ accessToken: string }>(active.url + '/api/auth/refresh', { refreshToken: active.refreshToken }, undefined, undefined, undefined, { retry: true, attempts: 2 });
        if (accountRef.current !== active) throw new Error('Account changed. Please retry.');
        active.user = { ...active.user, token: r.accessToken }; saveAccount(active);
      } catch (e) {
        if ((e as { status?: number }).status === 401 && accountRef.current === active) { use(null); setRooms([]); setPlaylists([]); setError('Your session expired. Please sign in again.'); }
        throw e;
      }
    })().finally(() => { refreshing.current = null; });
    await refreshing.current;
  }
  async function request<T>(path: string, body?: unknown, method?: string, signal?: AbortSignal, retry?: boolean, base = '/api/mobile'): Promise<T> {
    const active = accountRef.current;
    if (!active) throw Object.assign(new Error('Sign in first.'), { status: 401 });
    const go = () => jsonRequest<T>(active.url + base + path, body, active.user.token, method, signal, { retry });
    try { return await go(); }
    catch (e) { if ((e as { status?: number }).status !== 401) throw e; await refreshToken(active); return go(); }
  }
  // Screens keep `api` in effect dependencies, so it keeps one identity and always calls the latest request().
  const latest = useRef(request);
  useEffect(() => { latest.current = request; });
  const [api] = useState<Api>(() => (<T,>(path: string, body?: unknown, method?: string, signal?: AbortSignal) => latest.current<T>(path, body, method, signal)) as Api);

  async function loadPlan() { try { setServerPlan(await request<PlanInfo>('/plan')); } catch { /* free limits apply */ } }
  useEffect(() => {
    if (!account) return;
    let alive = true; let fresh = false;
    const cacheKey = `ourspace.cache.v1.${account.user.id}`;
    try { const raw = localStorage.getItem(cacheKey); if (raw) { const c = JSON.parse(raw); setRooms(c.rooms); setPlaylists(c.playlists); setSyncedFor(account); } } catch { /* no cache */ }
    const slow = setTimeout(() => { if (alive && !fresh) setWaking(true); }, 4000);
    Promise.all([request<Room[]>('/rooms'), request<Playlist[]>('/playlists')])
      .then(([r, p]) => { if (!alive) return; fresh = true; setRooms(r); setPlaylists(p); setError(''); try { localStorage.setItem(cacheKey, JSON.stringify({ rooms: r, playlists: p })); } catch { /* full */ } })
      .catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { clearTimeout(slow); if (alive) { setSyncedFor(account); setWaking(false); } });
    void loadPlan();
    // Publish this browser's own chat key (never replaces the phone's key).
    const me = loadIdentity(account.user.id);
    void request('/keys', { publicKey: me.publicKey, deviceId: me.deviceId, label: browserLabel() }, 'PUT').catch(() => {});
    return () => { alive = false; clearTimeout(slow); };
    // Requests read the current account; rerun only when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.user.id]);

  function mergeRoom(incoming: Room) {
    const pending = pendingPlay.current.get(incoming.code);
    const room = pending && Date.now() - pending.at < 6000 && (incoming.updateCursor ?? 0) <= pending.cursor ? { ...incoming, playback: pending.playback } : incoming;
    setRooms(prev => {
      const old = prev.find(r => r.code === room.code);
      if (old?.updateCursor && room.updateCursor && old.updateCursor > room.updateCursor) return prev;
      if (old && JSON.stringify(old) === JSON.stringify(room)) return prev;
      return old ? prev.map(r => r.code === room.code ? room : r) : [room, ...prev];
    });
  }

  const value: Space = {
    ready: true, synced: !account || syncedFor === account, signedIn: !!account, waking, error,
    user: account?.user || nobody, rooms, playlists, needsName, api,
    plan: { plan: serverPlan?.plan || 'free', limits: serverPlan ? serverPlan.limits : FREE_LIMITS, usage: { rooms: rooms.filter(r => r.hostId === account?.user.id).length, personalPlaylists: playlists.filter(p => p.scope === 'personal').length } },
    async signInWithGoogle(credential) {
      const r = await jsonRequest<{ user: { userId: string; displayName: string }; accessToken: string; refreshToken: string }>(backendUrl + '/api/auth/google', { credential, requestId: uid() }, undefined, undefined, undefined, { retry: true, attempts: 2, timeoutMs: 40000 });
      const next: Account = { url: backendUrl, user: { id: String(r.user.userId), name: r.user.displayName, token: r.accessToken }, refreshToken: r.refreshToken };
      try { const me = await jsonRequest<{ firstLogin: boolean }>(backendUrl + '/api/mobile/me', undefined, next.user.token, undefined, undefined, { attempts: 2 }); setNeedsName(!!me.firstLogin); } catch { setNeedsName(false); }
      setRooms([]); setPlaylists([]); setError(''); use(next);
    },
    async signOut() {
      const active = accountRef.current;
      if (active) {
        const me = loadIdentity(active.user.id);
        await request(`/keys/${me.deviceId}`, undefined, 'DELETE').catch(() => {});
        await request('/logout', {}, 'POST', undefined, false, '/api/auth').catch(() => {});
        forgetIdentity(active.user.id);
        try { localStorage.removeItem(`ourspace.cache.v1.${active.user.id}`); } catch { /* ignore */ }
      }
      googleSignOut(); use(null); setRooms([]); setPlaylists([]); setError('');
    },
    async deleteAccount() {
      const active = accountRef.current; if (!active) return;
      await request('/me', { confirm: 'DELETE' }, 'DELETE');
      forgetIdentity(active.user.id); googleSignOut(); use(null); setRooms([]); setPlaylists([]);
    },
    async setDisplayName(name) {
      const clean = name.trim().replace(/\s+/g, ' ');
      if (!clean) throw new Error('Choose a name to show to your people.');
      if (clean.length > 30) throw new Error('Keep your name under 30 characters.');
      await request('/me', { name: clean }, 'PATCH');
      const active = accountRef.current;
      if (active) use({ ...active, user: { ...active.user, name: clean } });
      setRooms(prev => prev.map(r => ({ ...r, members: r.members.map(m => m.id === active?.user.id ? { ...m, name: clean } : m) })));
      setNeedsName(false);
    },
    async refresh() {
      try { const [r, p] = await Promise.all([request<Room[]>('/rooms'), request<Playlist[]>('/playlists')]); setRooms(r); setPlaylists(p); setError(''); }
      catch (e) { setError((e as Error).message); }
    },
    async createRoom(name) {
      if (!name.trim()) throw new Error('Give your room a name.');
      const room = await request<Room>('/rooms', { name: name.trim() });
      mergeRoom(room); void loadPlan(); void request<Playlist[]>('/playlists').then(setPlaylists).catch(() => {});
      return room;
    },
    async renameRoom(code, name) {
      if (!name.trim()) throw new Error('Give your room a name.');
      mergeRoom(await request<Room>(`/rooms/${code}`, { name: name.trim() }, 'PATCH'));
      void request<Playlist[]>('/playlists').then(setPlaylists).catch(() => {});
    },
    async deleteRoom(code) {
      const room = rooms.find(r => r.code === code);
      const r = await request<{ deleted?: boolean; left?: boolean }>(`/rooms/${code}`, undefined, 'DELETE');
      setRooms(prev => prev.filter(x => x.code !== code));
      if (r.deleted) setPlaylists(prev => prev.filter(p => p.roomCode !== code));
      void loadPlan();
      return r.deleted || room?.hostId === account?.user.id ? 'deleted' : 'left';
    },
    async join(code) {
      const clean = code.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(clean)) throw new Error('Enter the six-character room code.');
      const r = await request<{ approved: boolean }>(`/rooms/${clean}/join`, {});
      if (r.approved) mergeRoom(await request<Room>(`/rooms/${clean}`));
      return r.approved;
    },
    joinStatus: (code, cursor, signal) => request(`/rooms/${code}/join-status${cursor === undefined ? '' : `?cursor=${cursor}`}`, undefined, undefined, signal),
    async getRoom(code, wait = false, signal) {
      const active = accountRef.current;
      const key = `${active?.user.id}:${code}`;
      const cursor = roomCursors.current.get(key);
      const room = await request<Room & { playbackOnly?: boolean }>(`/rooms/${code}${wait ? `?wait=1&fast=1${cursor === undefined ? '' : `&cursor=${cursor}`}` : ''}`, undefined, undefined, signal);
      if (accountRef.current !== active || signal?.aborted) return room;
      if (room.updateCursor !== undefined) roomCursors.current.set(key, room.updateCursor);
      if (room.playbackOnly) {
        let patched: Room | undefined;
        setRooms(prev => prev.map(r => r.code === code ? (patched = { ...r, playback: room.playback, updateCursor: room.updateCursor }) : r));
        return patched || room;
      }
      mergeRoom(room);
      if (room.playlistVersion !== undefined && playlistVersions.current.get(key) !== room.playlistVersion) {
        const next = await request<Playlist[]>('/playlists', undefined, undefined, signal);
        if (accountRef.current === active && !signal?.aborted) { setPlaylists(next); playlistVersions.current.set(key, room.playlistVersion); }
      }
      return room;
    },
    async approve(code, userId, approved) {
      try { mergeRoom(await request<Room>(`/rooms/${code}/approve`, { userId, approved })); }
      catch (e) {
        if (!isTransient(e) && (e as { status?: number }).status !== 404) throw e;
        // The response can be lost after the approval commits: reconcile before offering another tap.
        const current = await request<Room>(`/rooms/${code}`); mergeRoom(current);
        if (approved && current.members.some(m => m.id === userId)) return;
        if (!approved && !current.requests.some(p => p.id === userId)) return;
        if (current.requests.some(p => p.id === userId)) { mergeRoom(await request<Room>(`/rooms/${code}/approve`, { userId, approved })); return; }
        throw e;
      }
    },
    async removeMember(code, userId) { mergeRoom(await request<Room>(`/rooms/${code}/members/${userId}`, undefined, 'DELETE')); },
    async play(code, videoId, playing, position, context) {
      const base = roomsRef.current.find(r => r.code === code);
      const optimistic: Playback = { videoId, playing, position, updatedAt: Date.now(), updatedBy: account?.user.id || '', revision: (base?.playback?.revision || 0) + 1 };
      pendingPlay.current.set(code, { playback: optimistic, cursor: base?.updateCursor ?? 0, at: Date.now() });
      setRooms(prev => prev.map(r => r.code === code ? { ...r, playback: optimistic } : r));
      try { mergeRoom(await request<Room>(`/rooms/${code}/playback`, { videoId, playing, position, ...(context ? { queueContext: context.slice(0, 100) } : {}) })); }
      finally { if (pendingPlay.current.get(code)?.playback === optimistic) pendingPlay.current.delete(code); }
    },
    async queue(code, action, payload = {}) { mergeRoom(await request<Room>(`/rooms/${code}/queue`, { action, ...payload })); },
    async setVolume(code, volume) {
      const v = Math.max(0, Math.min(100, Math.round(volume)));
      setRooms(prev => prev.map(r => r.code === code ? { ...r, volume: v } : r));
      mergeRoom(await request<Room>(`/rooms/${code}/volume`, { volume: v }));
    },
    async searchYouTube(query, signal) {
      const region = (Intl.DateTimeFormat().resolvedOptions().locale.split('-')[1] || '').toUpperCase();
      const r = await request<{ results: SearchResult[] }>(`/youtube/search?q=${encodeURIComponent(query.trim())}${/^[A-Z]{2}$/.test(region) ? `&region=${region}` : ''}`, undefined, undefined, signal);
      return r.results;
    },
    async createPlaylist(name, scope, roomCode) {
      if (!name.trim()) throw new Error('Give your playlist a name.');
      const p = await request<Playlist>('/playlists', { name: name.trim(), scope, roomCode });
      setPlaylists(prev => [...prev, p]); void loadPlan(); return p;
    },
    async deletePlaylist(id) { await request(`/playlists/${id}`, undefined, 'DELETE'); setPlaylists(prev => prev.filter(p => p.id !== id)); void loadPlan(); },
    async addTrack(id, track) {
      const list = playlists.find(p => p.id === id);
      if (list?.tracks.some(t => t.videoId === track.videoId)) throw new Error('This video is already saved there.');
      const next = await request<Playlist>(`/playlists/${id}/tracks`, track);
      setPlaylists(prev => prev.map(p => p.id === id ? next : p));
    },
    async removeTrack(id, videoId) { const next = await request<Playlist>(`/playlists/${id}/tracks/${videoId}`, undefined, 'DELETE'); setPlaylists(prev => prev.map(p => p.id === id ? next : p)); },
    async reorderTracks(id, videoIds) {
      const list = playlists.find(p => p.id === id); if (!list) return;
      setPlaylists(prev => prev.map(p => p.id === id ? { ...list, tracks: videoIds.map(v => list.tracks.find(t => t.videoId === v)!).filter(Boolean) } : p));
      try { const next = await request<Playlist>(`/playlists/${id}/order`, { videoIds }, 'PUT'); setPlaylists(prev => prev.map(p => p.id === id ? next : p)); }
      catch (e) { setPlaylists(prev => prev.map(p => p.id === id ? list : p)); throw e; }
    },
    async iceServers() {
      const active = accountRef.current; if (!active) return [{ urls: 'stun:stun.l.google.com:19302' }];
      if (iceCache.current?.account === active && iceCache.current.until > Date.now()) return iceCache.current.servers;
      try {
        const r = await request<{ iceServers: IceServer[] }>('/ice-servers', undefined, undefined, undefined, true, '/api/webrtc');
        iceCache.current = { account: active, until: Date.now() + 6 * 3600e3, servers: r.iceServers }; return r.iceServers;
      } catch { return [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }]; }
    },
    callInbox: (after, cursor, signal) => request(`/calls?after=${after}${cursor === undefined ? '' : `&cursor=${cursor}`}`, undefined, undefined, signal),
    async signalCall(code, to, type, payload = {}) { await request(`/rooms/${code}/call/signal`, { to, type, payload, requestId: uid() }, undefined, undefined, true); },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSpace() { const s = useContext(Context); if (!s) throw new Error('Missing SpaceProvider'); return s; }

function browserLabel() {
  const ua = navigator.userAgent;
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${b} on ${os}` : b;
}
