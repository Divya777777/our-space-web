// Netflix / Prime Video watch party. Each person watches on the real site in their own browser with their own
// subscription; the Our Space extension reports and controls that player, and this page keeps everyone at the same
// moment by talking over the call's data channel (peer to peer). Nothing about what you watch goes to our server.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PartyMessage } from '../components/Call';

export type Service = 'netflix' | 'prime' | 'appletv' | 'hotstar' | 'disney' | 'max' | 'crunchyroll' | 'sonyliv' | 'zee5';
/** Our own tile marks (letters on the service's colour), never the services' logos. `since`: the extension version
 *  that first supports it (older installs are asked to update). */
export const SERVICES: Record<Service, { name: string; color: string; glow: string; mark: string; from: string; to: string; since: string }> = {
  netflix: { name: 'Netflix', color: '#E50914', glow: 'rgba(229,9,20,.45)', mark: 'N', from: '#FF3B45', to: '#B1060F', since: '0.1.0' },
  prime: { name: 'Prime Video', color: '#1FA2FF', glow: 'rgba(31,162,255,.45)', mark: 'PV', from: '#48B8FF', to: '#0B6BC2', since: '0.1.0' },
  appletv: { name: 'Apple TV+', color: '#A7B0C0', glow: 'rgba(167,176,192,.4)', mark: 'tv+', from: '#5A6170', to: '#1C1E24', since: '0.4.0' },
  hotstar: { name: 'JioHotstar', color: '#1F80E0', glow: 'rgba(31,128,224,.45)', mark: 'JH', from: '#3A8DFF', to: '#6B2BD9', since: '0.4.0' },
  disney: { name: 'Disney+', color: '#2F6BFF', glow: 'rgba(47,107,255,.45)', mark: 'D+', from: '#3E7BFF', to: '#0B1F6B', since: '0.4.0' },
  max: { name: 'HBO Max', color: '#7A4DFF', glow: 'rgba(122,77,255,.45)', mark: 'HBO', from: '#8B5CFF', to: '#2A1272', since: '0.4.0' },
  crunchyroll: { name: 'Crunchyroll', color: '#F47521', glow: 'rgba(244,117,33,.45)', mark: 'CR', from: '#FF9548', to: '#C2510A', since: '0.4.0' },
  sonyliv: { name: 'Sony LIV', color: '#E8B04B', glow: 'rgba(232,176,75,.4)', mark: 'SL', from: '#F2C063', to: '#7A5410', since: '0.4.0' },
  zee5: { name: 'ZEE5', color: '#9B4DDB', glow: 'rgba(155,77,219,.45)', mark: 'Z5', from: '#B467F0', to: '#4B1680', since: '0.4.0' },
};
// Where you are, roughly: only "India or not", read from this computer's time zone (nothing is looked up or sent).
const inIndia = (() => { try { return /^Asia\/(Kolkata|Calcutta)$/.test(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { return false; } })();
/** Services that clearly aren't offered where you are ('no'), or might not be ('maybe'), with a short reason. */
export function availability(svc: Service): { ok: 'yes' | 'maybe' | 'no'; note: string } {
  if (svc === 'hotstar' && !inIndia) return { ok: 'no', note: 'JioHotstar is only available in India.' };
  if (svc === 'disney' && inIndia) return { ok: 'no', note: 'In India, Disney+ shows are on JioHotstar.' };
  if (svc === 'max' && inIndia) return { ok: 'no', note: 'HBO Max isn’t available in India. HBO shows are on JioHotstar.' };
  if ((svc === 'sonyliv' || svc === 'zee5') && !inIndia) return { ok: 'maybe', note: `${SERVICES[svc].name} is mainly for India and may not be available where you are.` };
  if (svc === 'max' || svc === 'disney') return { ok: 'maybe', note: `${SERVICES[svc].name} isn’t available in every country.` };
  return { ok: 'yes', note: '' };
}
/** The four shown first in a room; the rest sit behind "More". */
export const FEATURED: Service[] = ['netflix', 'prime', 'hotstar', 'appletv'];
const num = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0).reduce((a, n) => a * 1000 + n, 0);
/** True when the installed extension is too old for this service. */
export const needsUpdate = (svc: Service, installed: string) => !!installed && num(installed) < num(SERVICES[svc].since);
export type PlayerState = { service: Service; id: string; url: string; title: string; t: number; paused: boolean; ready: boolean; duration: number };
type ExtMsg = { type: string } & Record<string, unknown>;

// ---------- Extension bridge (the extension's script on this site relays to it) ----------
const listeners = new Set<(m: ExtMsg) => void>();
let version = typeof document !== 'undefined' ? document.documentElement.dataset.ourspaceExt || '' : '';
const subs = new Set<() => void>();
if (typeof window !== 'undefined') window.addEventListener('message', e => {
  if (e.source !== window || e.origin !== location.origin || !e.data || e.data.src !== 'ourspace-ext') return;
  const { src: _src, ...msg } = e.data as ExtMsg & { src: string };
  if (msg.type === 'hello' && typeof msg.version === 'string' && msg.version !== version) { version = msg.version; subs.forEach(f => f()); }
  listeners.forEach(fn => fn(msg));
});
export const extension = {
  get version() { return version || document.documentElement.dataset.ourspaceExt || ''; },
  send(msg: ExtMsg) { window.postMessage({ src: 'ourspace-app', ...msg }, location.origin); },
  on(fn: (m: ExtMsg) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  ping() {
    window.postMessage({ src: 'ourspace-app', type: 'ping' }, location.origin);
    // Straight to the extension (answers right after it's added, even before this page's own script is in).
    const rt = (window as unknown as { chrome?: { runtime?: { sendMessage?: (id: string, m: unknown, cb: (r?: { version?: string }) => void) => void; lastError?: unknown } } }).chrome?.runtime;
    if (!rt?.sendMessage) return;
    for (const id of EXTENSION_IDS) {
      try { rt.sendMessage(id, { type: 'ping' }, r => { void rt.lastError; if (r?.version && r.version !== version) { version = r.version; document.documentElement.dataset.ourspaceExt = r.version; subs.forEach(f => f()); } }); } catch { /* not installed */ }
    }
  },
};
if (typeof window !== 'undefined') setTimeout(() => extension.ping(), 0);
export function useExtension() {
  return useSyncExternalStore(fn => { subs.add(fn); return () => { subs.delete(fn); }; }, () => version || document.documentElement.dataset.ourspaceExt || '');
}
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
/** Firefox on a computer gets its own build of the extension (addons.mozilla.org). */
export const isFirefox = /Firefox\//.test(ua) && !/Mobile|Android/i.test(ua);
/** Extensions work in Chrome, Edge, Brave, Opera and Firefox on a computer. */
export const browserSupported = isFirefox || (/Chrome\/|Chromium\//.test(ua) && !/Mobile|Android/i.test(ua));
const env = import.meta.env as Record<string, string | undefined>;
/** The store page for this browser (empty until that listing is live). */
export const EXTENSION_URL = (isFirefox ? env.VITE_FIREFOX_EXTENSION_URL : env.VITE_EXTENSION_URL) || '';
/** The test download for this browser (until the store listing is live). */
export const TEST_ZIP = isFirefox ? 'ourspace-extension-firefox.zip' : 'ourspace-extension.zip';
/** The store version's ID (once published) and the test version's fixed ID (from the key in extension/manifest.json). */
const EXTENSION_IDS = [(import.meta.env as Record<string, string | undefined>).VITE_EXTENSION_ID, 'bodhgadmdeebjmklhkgjlmcjlnnibino'].filter(Boolean) as string[];
/** Test version (before the store): start the download from the click. */
export function downloadTestVersion() {
  const a = document.createElement('a'); a.href = `${import.meta.env.BASE_URL}${TEST_ZIP}`; a.download = TEST_ZIP;
  document.body.appendChild(a); a.click(); a.remove();
}
/** The store window we opened for the one-time install (closed again once the extension is detected). */
let storeWindow: Window | null = null;
/** Open the extension's store page in a small window on top. Call it straight from the click, so the browser allows it. */
export function openStore() {
  if (!EXTENSION_URL) return false;
  const w = 520, h = 680, left = Math.max(0, (window.screenX || 0) + (window.outerWidth - w) / 2), top = Math.max(0, (window.screenY || 0) + 60);
  storeWindow = window.open(EXTENSION_URL, 'ourspace-store', `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
  return !!storeWindow;
}
export function closeStore() { try { storeWindow?.close(); } catch { /* already closed */ } storeWindow = null; }

// ---------- Sync over the call ----------
export type PartyStatus = 'idle' | 'opening' | 'choosing' | 'waiting' | 'syncing' | 'synced';
type Peer = { name: string; id: string; ready: boolean; t: number; paused: boolean; at: number };
export type Party = {
  service: Service | null; status: PartyStatus; host: boolean; title: string; local: PlayerState | null;
  peers: { id: string; name: string; ready: boolean; sameTitle: boolean }[]; invite: { service: Service; from: string; fromName: string } | null; note: string;
};
type Call = { sendParty: (m: PartyMessage) => number; onParty: (fn: (m: PartyMessage, from: { id: string; name: string }) => void) => () => void; liveWith: number };
const LATENCY = 0.12; // seconds, one way, over the data channel (applied when following a playing player)
const msg = (kind: string, body: Record<string, unknown> = {}): PartyMessage => ({ w: 'party', kind, ...body });

export function useWatchParty(call: Call, meName: string) {
  const [service, setService] = useState<Service | null>(null);
  const [status, setStatus] = useState<PartyStatus>('idle');
  const [host, setHost] = useState(false);
  const [local, setLocal] = useState<PlayerState | null>(null);
  const [peers, setPeers] = useState<Record<string, Peer>>({});
  const [invite, setInvite] = useState<Party['invite']>(null);
  const [note, setNote] = useState('');
  const [sessionId, setSessionId] = useState('');
  const lastReady = useRef({ key: '', at: 0 });
  /** Last play / pause / seek by anyone: heartbeats wait a moment after it (the players' reports lag ~1 s). */
  const lastAction = useRef(0);
  const st = useRef({ service, status, host, local, peers, sessionId });
  st.current = { service, status, host, local, peers, sessionId };
  const send = useCallback((m: PartyMessage) => call.sendParty(m), [call]);
  const overlay = (text: string, tone = 'info', ms = 0) => extension.send({ type: 'overlay', text, tone, ms });
  const cmd = (action: 'play' | 'pause' | 'seek', t?: number) => extension.send({ type: 'cmd', action, t });
  const firstNames = (list: Peer[]) => list.map(p => p.name.split(' ')[0]).join(' & ') || 'them';

  // Start (or join) a party on this service: open the site through the extension.
  const start = useCallback((svc: Service, asHost: boolean, url?: string) => {
    setService(svc); setHost(asHost); setStatus(url ? 'waiting' : 'choosing'); setInvite(null); setNote('');
    extension.send({ type: 'open', service: svc, url });
    if (asHost) send(msg('invite', { service: svc, name: meName }));
    else send(msg('joined', { service: svc, name: meName }));
  }, [send, meName]);
  const end = useCallback((tell = true) => {
    if (tell) send(msg('end'));
    extension.send({ type: 'end' });
    setService(null); setStatus('idle'); setHost(false); setSessionId(''); setPeers({}); setNote('');
  }, [send]);
  const resync = useCallback(() => {
    const s = st.current; if (!s.local) return;
    send(msg('state', { playing: !s.local.paused, t: s.local.t, id: s.local.id, force: true }));
    overlay('Synced again', 'ok', 2500);
  }, [send]);
  const resyncRef = useRef(resync); resyncRef.current = resync;
  const togglePlay = useCallback(() => {
    const s = st.current; if (!s.local) return;
    const playing = s.local.paused;
    lastAction.current = Date.now();
    cmd(playing ? 'play' : 'pause', s.local.t);
    send(msg('state', { playing, t: s.local.t, id: s.local.id }));
  }, [send]);

  // From the extension: what this browser's player is doing.
  useEffect(() => extension.on(m => {
    const s = st.current;
    if (m.type === 'state' && m.state) {
      const p = m.state as PlayerState;
      if (s.service && p.service !== s.service) return;
      setLocal(p);
      if (!s.service) return;
      // On a title: the host announces it; anyone who picks a different title moves everyone there.
      if (p.id && p.id !== s.sessionId && (s.host || s.status === 'synced' || s.status === 'choosing')) {
        setSessionId(p.id); setStatus('waiting');
        send(msg('title', { service: p.service, id: p.id, url: p.url, title: p.title }));
        const others = Object.values(s.peers);
        overlay(others.length ? `Waiting for ${firstNames(others)} to open it…` : 'Waiting for the others to join…', 'wait');
      }
      if (p.id && p.id === s.sessionId) {
        // Tell the others when readiness changes (and every few seconds, in case a message was missed).
        const key = `${p.id}:${p.ready}`;
        if (key !== lastReady.current.key || Date.now() - lastReady.current.at > 5000) { lastReady.current = { key, at: Date.now() }; send(msg('ready', { id: p.id, ready: p.ready, t: p.t, paused: p.paused })); }
      }
    } else if (m.type === 'user' && s.status === 'synced') {
      const playing = m.action === 'play' ? true : m.action === 'pause' ? false : !(s.local?.paused ?? true);
      lastAction.current = Date.now();
      if (s.local) setLocal({ ...s.local, paused: !playing, t: Number(m.t) || s.local.t });
      send(msg('state', { playing, t: Number(m.t) || 0, id: s.sessionId, action: m.action }));
    } else if (m.type === 'action' && m.action === 'resync') {
      resyncRef.current();
    } else if (m.type === 'player-gone' && s.service) {
      setLocal(null); setStatus('waiting'); setNote(`You closed ${SERVICES[s.service].name}. Open it again to keep watching together.`);
      send(msg('left'));
    }
  }), [send]);

  // From the other person, over the call.
  useEffect(() => call.onParty((m, from) => {
    const s = st.current;
    const name = String(m.name || from.name || 'Someone');
    const peer = (patch: Partial<Peer>) => setPeers(prev => { const base: Peer = prev[from.id] || { name: from.name, id: '', ready: false, t: 0, paused: true, at: Date.now() }; return { ...prev, [from.id]: { ...base, ...patch } }; });
    switch (m.kind) {
      case 'invite':
        peer({});
        if (!s.service) setInvite({ service: m.service as Service, from: from.id, fromName: name });
        break;
      case 'joined': peer({}); if (s.host) { const l = s.local; if (s.sessionId && l) send(msg('title', { service: s.service, id: s.sessionId, url: l.url, title: l.title })); } break;
      case 'title':
        peer({ id: String(m.id), ready: false });
        if (!s.service) { setInvite({ service: m.service as Service, from: from.id, fromName: from.name }); break; }
        if (m.id !== s.sessionId) {
          setSessionId(String(m.id)); setStatus('waiting');
          extension.send({ type: 'open', service: m.service, url: m.url, focus: true });
          overlay(`${from.name.split(' ')[0]} picked “${String(m.title || 'something')}”. Opening it…`, 'wait');
        }
        break;
      case 'ready': peer({ id: String(m.id), ready: !!m.ready, t: Number(m.t) || 0, paused: !!m.paused, at: Date.now() }); break;
      case 'go': {
        // Everyone ready: start together.
        const t = Number(m.t) || 0;
        cmd('seek', t); setStatus('synced'); setNote('');
        overlay(`You’re synced with ${from.name.split(' ')[0]} ✓`, 'ok', 3200);
        setTimeout(() => { if (m.playing !== false) cmd('play', t + (Date.now() - Number(m.at || Date.now())) / 1000); }, Math.max(0, Number(m.delay) || 0));
        break;
      }
      case 'state': {
        if (s.status !== 'synced' && !m.force) break;
        lastAction.current = Date.now();
        const t = (Number(m.t) || 0) + (m.playing ? LATENCY : 0);
        cmd(m.playing ? 'play' : 'pause', t);
        const who = from.name.split(' ')[0];
        if (m.action === 'pause') overlay(`${who} paused`, 'info', 2200);
        else if (m.action === 'play') overlay(`${who} pressed play`, 'info', 2000);
        else if (m.action === 'seek') overlay(`${who} jumped to ${clock(t)}`, 'info', 2200);
        if (m.force) { setStatus('synced'); overlay(`Synced with ${who} ✓`, 'ok', 2500); }
        break;
      }
      case 'beat': {
        // The host's heartbeat: fix drift quietly.
        if (s.status !== 'synced' || !s.local || s.local.id !== m.id || Date.now() - lastAction.current < 2500) break;
        const target = (Number(m.t) || 0) + (m.playing ? LATENCY : 0);
        if (!!m.playing === s.local.paused) cmd(m.playing ? 'play' : 'pause', target);
        else if (Math.abs(s.local.t - target) > 1.5) cmd('seek', target);
        break;
      }
      case 'left': peer({ ready: false }); if (s.service) { setStatus('waiting'); overlay(`${from.name.split(' ')[0]} closed the video`, 'warn', 3500); } break;
      case 'end': setInvite(null); if (s.service) { end(false); } break;
    }
  }), [call, send, end]);

  // Host: when everyone (with the extension) has the same title loaded, count in and start together.
  useEffect(() => {
    if (!host || !service || !local || !sessionId || local.id !== sessionId || !local.ready) return;
    const list = Object.values(peers);
    if (!list.length || status === 'synced') return;
    if (!list.every(p => p.id === sessionId && p.ready)) { setStatus('waiting'); return; }
    setStatus('syncing');
    const t = local.t;
    cmd('pause', t);
    overlay(`${firstNames(list)} ${list.length > 1 ? 'are' : 'is'} here — starting together…`, 'wait');
    const delay = 1600;
    send(msg('go', { t, at: Date.now() + delay, delay, playing: true, id: sessionId }));
    const timer = setTimeout(() => { setStatus('synced'); cmd('play', t); overlay(`You’re synced with ${firstNames(list)} ✓`, 'ok', 3200); }, delay);
    return () => clearTimeout(timer);
    // Re-check whenever someone's readiness changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, service, sessionId, local?.id, local?.ready, JSON.stringify(Object.values(peers).map(p => [p.id, p.ready]))]);

  // Host heartbeat while synced.
  useEffect(() => {
    if (!host || status !== 'synced') return;
    const t = setInterval(() => { const l = st.current.local; if (l && Date.now() - lastAction.current > 2500) send(msg('beat', { t: l.t, playing: !l.paused, id: l.id })); }, 3000);
    return () => clearInterval(t);
  }, [host, status, send]);

  // Call ended: the party ends with it.
  const wasLive = useRef(false);
  useEffect(() => {
    if (call.liveWith > 0) { wasLive.current = true; setNote(n => (n.startsWith('The call ended') ? '' : n)); return; }
    if (wasLive.current && service) setNote('The call ended. Start a call to keep watching together.');
    wasLive.current = false;
  }, [call.liveWith, service]);

  // The Our Space badge on the Netflix / Prime page mirrors the party's status.
  const names = Object.values(peers).map(p => p.name.split(' ')[0]).join(' & ');
  const badgeText = !service ? '' : status === 'synced' ? `In sync with ${names || 'everyone'}` : status === 'syncing' ? 'Starting together…' : status === 'choosing' ? 'Pick something — everyone follows' : names ? `Waiting for ${names}…` : 'Waiting for the others…';
  useEffect(() => { extension.send({ type: 'badge', text: badgeText, tone: status === 'synced' ? 'ok' : 'wait' }); }, [badgeText, status]);
  useEffect(() => () => extension.send({ type: 'badge', text: '' }), []);
  const list = Object.entries(peers).map(([id, p]) => ({ id, name: p.name, ready: p.ready, sameTitle: !!sessionId && p.id === sessionId }));
  const party: Party = { service, status, host, title: local?.title || '', local, peers: list, invite, note };
  return { party, start, end, resync, togglePlay, dismissInvite: () => setInvite(null) };
}

export const clock = (s: number) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return `${h ? h + ':' : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(x).padStart(2, '0')}`; };
