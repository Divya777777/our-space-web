// Apple Music on the web (MusicKit on the Web, v3). Each person plays music with their own Apple Music subscription;
// Our Space only keeps everyone on the same song and second (same rules as YouTube). Non-subscribers hear previews.
// Songs in rooms are "am:<catalogue id>"; YouTube videos keep their 11-character ids.
import { useSyncExternalStore } from 'react';

type Api = <T>(path: string, body?: unknown, method?: string) => Promise<T>;
export type AppleSong = { videoId: string; title: string; artist: string; album?: string; durationSeconds?: number; art: string; explicit?: boolean; url?: string };
export const isApple = (id: string | undefined | null): id is string => typeof id === 'string' && id.startsWith('am:');
export const appleCatalogId = (id: string) => id.replace(/^am:/, '');

/** Minimal MusicKit v3 surface we use (the library has no published types). */
export type MusicKitInstance = {
  isAuthorized: boolean; storefrontId?: string; storefrontCountryCode?: string;
  authorize(): Promise<string>; unauthorize(): Promise<void>;
  setQueue(o: { song: string; startPlaying?: boolean; startTime?: number }): Promise<unknown>;
  play(): Promise<void>; pause(): void; seekToTime(s: number): Promise<void>;
  currentPlaybackTime: number; currentPlaybackDuration: number; playbackState: number; volume: number; isPlaying: boolean;
  nowPlayingItem?: { id: string; attributes?: { name?: string } } | null; previewOnly?: boolean;
  addEventListener(n: string, f: (e: { state?: number }) => void): void; removeEventListener(n: string, f: (e: { state?: number }) => void): void;
};
type MK = { configure(o: Record<string, unknown>): Promise<MusicKitInstance>; getInstance(): MusicKitInstance; PlaybackStates: Record<string, number> };
declare global { interface Window { MusicKit?: MK } }

// ---- state shared by every screen (connect once, works in every room)
type State = { server: 'unknown' | 'on' | 'off'; loading: boolean; connected: boolean; error: string };
let state: State = { server: 'unknown', loading: false, connected: false, error: '' };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
export function useAppleMusic() { return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => state); }

let kit: Promise<MusicKitInstance> | null = null;
let instance: MusicKitInstance | null = null;
export const musicKit = () => instance;
/** Loads Apple's MusicKit script and configures it with the developer token our server signs. */
export function loadMusicKit(api: Api): Promise<MusicKitInstance> {
  if (kit) return kit;
  set({ loading: true, error: '' });
  kit = (async () => {
    const status = await api<{ enabled: boolean }>('/music/apple/status');
    if (!status.enabled) { set({ server: 'off' }); throw new Error('Apple Music isn’t switched on for this server yet.'); }
    set({ server: 'on' });
    const [{ token }] = await Promise.all([api<{ token: string }>('/music/apple/token'), new Promise<void>((resolve, reject) => {
      if (window.MusicKit) return resolve();
      document.addEventListener('musickitloaded', () => resolve(), { once: true });
      const s = document.createElement('script'); s.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js'; s.async = true; s.dataset.webComponents = '';
      s.onerror = () => reject(new Error('Apple Music didn’t load. Check your connection and try again.')); document.head.appendChild(s);
    })]);
    const mk = await window.MusicKit!.configure({ developerToken: token, app: { name: 'Our Space', build: '1.0.0' } });
    instance = mk; set({ connected: mk.isAuthorized });
    return mk;
  })();
  kit.catch(e => { kit = null; set({ error: (e as Error).message }); }).finally(() => set({ loading: false }));
  return kit;
}
/** "Connect Apple Music": Apple's own sign-in window (must come from a click). */
export async function connectAppleMusic(api: Api) {
  const mk = await loadMusicKit(api);
  try { await mk.authorize(); set({ connected: mk.isAuthorized, error: '' }); }
  catch { set({ error: 'Apple Music sign-in was closed. Try again when you’re ready.' }); }
  return mk.isAuthorized;
}
export async function disconnectAppleMusic() { try { await instance?.unauthorize(); } catch { /* already out */ } set({ connected: false }); }
export const storefront = () => (instance?.storefrontCountryCode || instance?.storefrontId || '').toLowerCase().slice(0, 2);

// ---- song details (cover, artist) for queues and playlists, cached for the session
const songs = new Map<string, AppleSong>();
const songListeners = new Set<() => void>();
let songVersion = 0;
export function rememberSongs(list: AppleSong[]) { let changed = false; for (const s of list) if (s?.videoId && !songs.has(s.videoId)) { songs.set(s.videoId, s); changed = true; } if (changed) { songVersion++; songListeners.forEach(fn => fn()); } }
export const appleSong = (id: string) => songs.get(id);
export function useAppleSongs() { return useSyncExternalStore(fn => { songListeners.add(fn); return () => songListeners.delete(fn); }, () => songVersion); }
const wanted = new Set<string>();
let lookupTimer: ReturnType<typeof setTimeout> | undefined;
/** Asks the server (in one batch) for details of songs we haven't seen yet. */
export function lookupSongs(api: Api, ids: string[]) {
  for (const id of ids) if (isApple(id) && !songs.has(id)) wanted.add(id);
  if (!wanted.size || lookupTimer) return;
  lookupTimer = setTimeout(async () => {
    lookupTimer = undefined; const batch = [...wanted].slice(0, 100); batch.forEach(id => wanted.delete(id));
    try { const sf = storefront(); rememberSongs((await api<{ songs: AppleSong[] }>(`/music/apple/songs?ids=${batch.join(',')}${sf ? `&storefront=${sf}` : ''}`)).songs); } catch { /* covers fall back to a music note */ }
  }, 60);
}
export async function searchAppleMusic(api: Api, q: string) {
  const sf = storefront();
  const r = await api<{ results: AppleSong[] }>(`/music/apple/search?q=${encodeURIComponent(q.trim())}${sf ? `&storefront=${sf}` : ''}`);
  rememberSongs(r.results); return r.results;
}
/** A music note on the room colours, for songs whose cover hasn't arrived yet. */
export const NOTE_ART = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fa5c7c"/><stop offset="1" stop-color="#a98bff"/></linearGradient></defs><rect width="64" height="64" rx="12" fill="url(#g)"/><path d="M40 16v24.5a6 6 0 1 1-4-5.6V24l-12 3v17.5a6 6 0 1 1-4-5.6V22z" fill="#fff"/></svg>')}`;
