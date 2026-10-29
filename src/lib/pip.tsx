// Picture-in-picture for the web, like the phone app: the room's video and/or the call float in a small
// always-on-top window so you can use other apps. Uses the Document Picture-in-Picture API (Chrome, Edge,
// Opera, Brave on desktop). The room and the call render into two slots inside that window through portals:
// the video fills it and the call sits on top as a small strip. Where the browser supports it, switching tabs
// during a call or while a video plays opens it automatically (Media Session "enterpictureinpicture").
// Other browsers (Safari, Firefox) fall back to the video element's own picture-in-picture for calls.
//
// Why a quiet sound plays in the page while a video runs: Chrome only opens picture-in-picture by itself on a tab
// switch when the page's OWN top frame is playing audible media. The YouTube video plays inside YouTube's iframe,
// which doesn't count, so the switch never fired. A looping, practically silent tone (-60 dB, below hearing at
// normal volume, above Chrome's silence threshold) in the page makes the tab qualify. It only plays while a video
// is playing and automatic floating is on.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type Kind = 'video' | 'call';
type DocPip = { requestWindow(o?: { width?: number; height?: number; disallowReturnToOpener?: boolean; preferInitialWindowPlacement?: boolean }): Promise<Window>; window: Window | null };
declare global { interface Window { documentPictureInPicture?: DocPip } }
const docPip = () => (typeof window !== 'undefined' ? window.documentPictureInPicture : undefined);
export const pipSupported = () => !!docPip();

type Slots = { video: HTMLElement; call: HTMLElement };
type Pip = {
  supported: boolean; slots: Slots | null; open: (auto?: boolean) => Promise<boolean>; close: () => void; want: (kind: Kind, on: boolean) => void;
  /** Float the video by itself when you switch tabs or apps (on by default; remembered in this browser). */
  autoFloat: boolean; setAutoFloat: (on: boolean) => void;
  /** Open the floating window when playback starts (by click) and keep it open, so it's there in other apps too. */
  keepFloating: boolean; setKeepFloating: (on: boolean) => void;
  /** Close the floating window but keep playing; it won't pop up again until you come back to the tab. */
  background: () => void;
};
const Context = createContext<Pip>({ supported: false, slots: null, open: async (_auto?: boolean) => false, close: () => {}, want: () => {}, autoFloat: true, setAutoFloat: () => {}, keepFloating: false, setKeepFloating: () => {}, background: () => {} });
const AUTO_KEY = 'ourspace.autoFloat';
const readAuto = () => { try { return localStorage.getItem(AUTO_KEY) !== 'off'; } catch { return true; } };
const KEEP_KEY = 'ourspace.keepFloating';
const readKeep = () => { try { return localStorage.getItem(KEEP_KEY) === 'on'; } catch { return false; } };
export const usePip = () => useContext(Context);

export function PipProvider({ children }: React.PropsWithChildren) {
  const [slots, setSlots] = useState<Slots | null>(null);
  const win = useRef<Window | null>(null);
  const [wants, setWants] = useState<Record<Kind, boolean>>({ video: false, call: false });
  const wantsRef = useRef(wants); wantsRef.current = wants;
  const want = useCallback((kind: Kind, on: boolean) => setWants(w => (w[kind] === on ? w : { ...w, [kind]: on })), []);

  const [autoFloat, setAutoState] = useState(readAuto);
  const setAutoFloat = useCallback((on: boolean) => { setAutoState(on); try { localStorage.setItem(AUTO_KEY, on ? 'on' : 'off'); } catch { /* private mode */ } }, []);
  const [keepFloating, setKeepState] = useState(readKeep);
  const setKeepFloating = useCallback((on: boolean) => { setKeepState(on); try { localStorage.setItem(KEEP_KEY, on ? 'on' : 'off'); } catch { /* private mode */ } }, []);
  /** Chose "keep playing in the background" while away: don't float again until they come back to the tab. */
  const resting = useRef(false);
  /** Opened by itself (you left the tab / app) → closes by itself when you come back, like the phone. */
  const auto = useRef(false);
  /** The video area of the floating window: hidden while only a call is shown. */
  const videoBox = useRef<HTMLElement | null>(null);
  const close = useCallback(() => { const w = win.current; win.current = null; videoBox.current = null; auto.current = false; setSlots(null); try { w?.close(); } catch { /* gone */ } }, []);
  const open = useCallback(async (isAuto = false) => {
    const api = docPip(); if (!api) return false;
    if (isAuto && resting.current) return false;
    if (win.current) { if (!isAuto) { auto.current = false; win.current.focus(); } return true; }
    auto.current = isAuto;
    const video = wantsRef.current.video;
    let w: Window;
    try { w = await api.requestWindow(video ? { width: 480, height: 300 } : { width: 300, height: 360 }); } catch { return false; }
    win.current = w;
    copyStyles(document, w.document);
    w.document.title = 'Our Space';
    w.document.documentElement.classList.add('pip-doc');
    const root = w.document.createElement('div'); root.className = 'pip-root';
    const v = w.document.createElement('div'); v.className = 'pip-video';
    const c = w.document.createElement('div'); c.className = 'pip-call';
    root.append(v, c); w.document.body.append(root);
    w.addEventListener('pagehide', () => { if (win.current === w) { win.current = null; videoBox.current = null; setSlots(null); } });
    // YouTube refuses to play (error 153) when the page holding its player has no web address to send as the
    // referrer, and the floating window is a blank page. So the video goes into a small page of our own site
    // (same origin, so React can still draw into it) and YouTube sees our address as usual.
    const frame = w.document.createElement('iframe');
    frame.className = 'pip-frame'; frame.title = 'Video';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.src = `${import.meta.env.BASE_URL}pip-frame.html`;
    v.append(frame);
    videoBox.current = v; v.hidden = !wantsRef.current.video;
    const ready = await new Promise<boolean>(resolve => { frame.addEventListener('load', () => resolve(true), { once: true }); setTimeout(() => resolve(false), 8000); });
    const fd = frame.contentDocument;
    if (!ready || !fd || win.current !== w) { if (win.current === w) close(); return false; }
    copyStyles(document, fd);
    fd.documentElement.classList.add('pip-doc', 'pip-frame-doc');
    const slot = fd.createElement('div'); slot.className = 'pip-video-slot'; fd.body.append(slot);
    setSlots({ video: slot, call: c });
    return true;
  }, [close]);
  useEffect(() => { if (videoBox.current) videoBox.current.hidden = !wants.video; }, [slots, wants.video]);

  // Nothing left to show (video stopped and no call): close the floating window.
  useEffect(() => { if (slots && !wants.video && !wants.call) close(); }, [slots, wants.video, wants.call, close]);
  useEffect(() => () => close(), [close]);

  // Fetch the floating window's page ahead of time, so opening it doesn't wait for the network.
  useEffect(() => {
    if (!docPip() || !wants.video || document.querySelector('link[data-pip-prefetch]')) return;
    const link = document.createElement('link'); link.rel = 'prefetch'; link.href = `${import.meta.env.BASE_URL}pip-frame.html`; link.setAttribute('data-pip-prefetch', '');
    document.head.append(link);
  }, [wants.video]);
  const background = useCallback(() => { resting.current = true; close(); }, [close]);
  const active = wants.video || wants.call;
  const floats = active && autoFloat;
  // The quiet tone that lets Chrome float the tab by itself (see the note at the top). Video only: calls already
  // qualify through Chrome's rule for video calls (camera or microphone in use).
  useEffect(() => {
    if (!docPip() || !autoFloat || !wants.video || wants.call) return;
    const audio = carrier();
    const start = () => { void audio.play().catch(() => {}); };
    start();
    // Browsers only allow sound after a tap on the page; try again on the next one.
    document.addEventListener('pointerdown', start, true);
    return () => { document.removeEventListener('pointerdown', start, true); audio.pause(); };
  }, [autoFloat, wants.video, wants.call]);
  // 1) Switching to another tab: Chrome asks us to enter PiP by itself (Media Session "enterpictureinpicture").
  useEffect(() => {
    const ms = navigator.mediaSession as MediaSession | undefined;
    if (!ms || !docPip() || !floats) return;
    try { ms.setActionHandler('enterpictureinpicture' as MediaSessionAction, () => { void open(true); }); } catch { return; }
    return () => { try { ms.setActionHandler('enterpictureinpicture' as MediaSessionAction, null); } catch { /* unsupported */ } };
  }, [floats, open]);
  // 2) Switching to another app: browsers only let a page open a window right after a tap/click on it, so this
  //    works when you used the page in the last few seconds (pressed play, answered, typed in chat) and then left.
  // 3) Coming back to the tab closes a window that opened by itself.
  useEffect(() => {
    if (!docPip()) return;
    // A file or photo picker also takes focus away; that isn't leaving either.
    let picking = false;
    const onClick = (e: MouseEvent) => { const t = e.target as HTMLElement | null; if (t?.closest('input[type=file], label:has(input[type=file])')) picking = true; };
    const onBlur = () => {
      if (!floats || win.current || picking) return;
      setTimeout(() => {
        if (document.hasFocus() || win.current) return;
        // Clicking into the YouTube player moves focus into its iframe; that isn't leaving.
        if (document.activeElement instanceof HTMLIFrameElement) return;
        // Browsers only allow the window right after you used the page (a click, or the Alt / Cmd key of
        // Alt-Tab / Cmd-Tab in some browsers). Just try: if it isn't allowed, nothing happens.
        void open(true);
      }, 0);
    };
    // macOS reports the page as hidden when another app covers Chrome or the window is minimised (the old site used
    // this too). Try to float then as well; the browser decides whether it's allowed at that moment.
    const onHidden = () => {
      if (document.visibilityState !== 'hidden' || !floats || win.current || picking) return;
      void open(true).then(ok => { if (!ok && wantsRef.current.call) floatCallVideo(); });
    };
    const onBack = () => {
      if (document.hasFocus()) picking = false;
      if (document.visibilityState === 'visible' && document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => {});
      if (document.visibilityState === 'visible' && document.hasFocus()) { resting.current = false; if (auto.current) close(); }
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    document.addEventListener('visibilitychange', onHidden);
    return () => { document.removeEventListener('visibilitychange', onHidden); document.removeEventListener('click', onClick, true); window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onBack); document.removeEventListener('visibilitychange', onBack); };
  }, [floats, open, close]);

  const value = useMemo(() => ({ supported: pipSupported(), slots, open, close, want, autoFloat, setAutoFloat, keepFloating, setKeepFloating, background }), [slots, open, close, want, autoFloat, setAutoFloat, keepFloating, setKeepFloating, background]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Fallback for calls (what the old site did): float the other person's video with the browser's own video
 * picture-in-picture, which Chrome allows more often than a floating page while a camera call is on. */
function floatCallVideo() {
  if (document.pictureInPictureElement) return;
  const video = Array.from(document.querySelectorAll<HTMLVideoElement>('video[data-remote]')).find(v => v.srcObject && v.videoWidth > 0);
  if (!video || typeof video.requestPictureInPicture !== 'function') return;
  void video.requestPictureInPicture().catch(() => { /* not allowed right now */ });
}

/** Tell the provider this content can go into PiP right now (a video is loaded / a call is on). */
export function useWantPip(kind: Kind, on: boolean) {
  const { want } = usePip();
  useEffect(() => { want(kind, on); }, [kind, on, want]);
  useEffect(() => () => want(kind, false), [kind, want]);
}

function copyStyles(from: Document, to: Document) {
  // Relative URLs in the copied CSS (fonts) resolve against the app, not the blank PiP page.
  const base = to.createElement('base'); base.href = from.baseURI; to.head.append(base);
  // Copy the rules themselves (instant, no second download); fall back to a link if a sheet can't be read.
  for (const sheet of Array.from(from.styleSheets)) {
    try {
      const style = to.createElement('style');
      style.textContent = Array.from(sheet.cssRules).map(r => r.cssText).join('\n');
      to.head.append(style);
    } catch {
      if (sheet.href) { const l = to.createElement('link'); l.rel = 'stylesheet'; l.href = sheet.href; to.head.append(l); }
    }
  }
  const meta = to.createElement('meta'); meta.name = 'color-scheme'; meta.content = 'dark'; to.head.append(meta);
}

/** One looping 1-second tone at -60 dB (30 Hz): inaudible in practice, but it counts as sound for Chrome. */
let carrierAudio: HTMLAudioElement | null = null;
function carrier() {
  if (carrierAudio) return carrierAudio;
  const rate = 8000, n = rate, data = new DataView(new ArrayBuffer(44 + n * 2));
  const text = (o: number, s: string) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true); data.setUint32(24, rate, true);
  data.setUint32(28, rate * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); text(36, 'data'); data.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) data.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * 30 * i / rate) * 32767 * 0.001), true);
  const audio = new Audio(URL.createObjectURL(new Blob([data.buffer], { type: 'audio/wav' })));
  audio.loop = true; audio.preload = 'auto';
  carrierAudio = audio;
  return audio;
}
