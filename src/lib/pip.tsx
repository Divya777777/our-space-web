// Picture-in-picture for the web, like the phone app: the room's video and/or the call float in a small
// always-on-top window so you can use other apps. Uses the Document Picture-in-Picture API (Chrome, Edge,
// Opera, Brave on desktop). The room and the call render into two slots inside that window through portals:
// the video fills it and the call sits on top as a small strip. Where the browser supports it, switching tabs
// during a call or while a video plays opens it automatically (Media Session "enterpictureinpicture").
// Other browsers (Safari, Firefox) fall back to the video element's own picture-in-picture for calls.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type Kind = 'video' | 'call';
type DocPip = { requestWindow(o?: { width?: number; height?: number; disallowReturnToOpener?: boolean; preferInitialWindowPlacement?: boolean }): Promise<Window>; window: Window | null };
declare global { interface Window { documentPictureInPicture?: DocPip } }
const docPip = () => (typeof window !== 'undefined' ? window.documentPictureInPicture : undefined);
export const pipSupported = () => !!docPip();

type Slots = { video: HTMLElement; call: HTMLElement };
type Pip = { supported: boolean; slots: Slots | null; open: (auto?: boolean) => Promise<boolean>; close: () => void; want: (kind: Kind, on: boolean) => void };
const Context = createContext<Pip>({ supported: false, slots: null, open: async (_auto?: boolean) => false, close: () => {}, want: () => {} });
export const usePip = () => useContext(Context);

export function PipProvider({ children }: React.PropsWithChildren) {
  const [slots, setSlots] = useState<Slots | null>(null);
  const win = useRef<Window | null>(null);
  const [wants, setWants] = useState<Record<Kind, boolean>>({ video: false, call: false });
  const wantsRef = useRef(wants); wantsRef.current = wants;
  const want = useCallback((kind: Kind, on: boolean) => setWants(w => (w[kind] === on ? w : { ...w, [kind]: on })), []);

  /** Opened by itself (you left the tab / app) → closes by itself when you come back, like the phone. */
  const auto = useRef(false);
  const close = useCallback(() => { const w = win.current; win.current = null; auto.current = false; setSlots(null); try { w?.close(); } catch { /* gone */ } }, []);
  const open = useCallback(async (isAuto = false) => {
    const api = docPip(); if (!api) return false;
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
    w.addEventListener('pagehide', () => { if (win.current === w) { win.current = null; setSlots(null); } });
    setSlots({ video: v, call: c });
    return true;
  }, []);

  // Nothing left to show (video stopped and no call): close the floating window.
  useEffect(() => { if (slots && !wants.video && !wants.call) close(); }, [slots, wants.video, wants.call, close]);
  useEffect(() => () => close(), [close]);

  const active = wants.video || wants.call;
  // 1) Switching to another tab: Chrome asks us to enter PiP by itself (Media Session "enterpictureinpicture").
  useEffect(() => {
    const ms = navigator.mediaSession as MediaSession | undefined;
    if (!ms || !docPip() || !active) return;
    try { ms.setActionHandler('enterpictureinpicture' as MediaSessionAction, () => { void open(true); }); } catch { return; }
    return () => { try { ms.setActionHandler('enterpictureinpicture' as MediaSessionAction, null); } catch { /* unsupported */ } };
  }, [active, open]);
  // 2) Switching to another app: browsers only let a page open a window right after a tap/click on it, so this
  //    works when you used the page in the last few seconds (pressed play, answered, typed in chat) and then left.
  // 3) Coming back to the tab closes a window that opened by itself.
  useEffect(() => {
    if (!docPip() || !active) return;
    // A file or photo picker also takes focus away; that isn't leaving either.
    let picking = false;
    const onClick = (e: MouseEvent) => { const t = e.target as HTMLElement | null; if (t?.closest('input[type=file], label:has(input[type=file])')) picking = true; };
    const onBlur = () => {
      if (win.current || picking) return;
      setTimeout(() => {
        if (document.hasFocus() || win.current) return;
        // Clicking into the YouTube player moves focus into its iframe; that isn't leaving.
        if (document.activeElement instanceof HTMLIFrameElement) return;
        const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
        if (ua && !ua.isActive) return;
        void open(true);
      }, 0);
    };
    const onBack = () => { if (document.hasFocus()) picking = false; if (document.visibilityState === 'visible' && document.hasFocus() && auto.current) close(); };
    document.addEventListener('click', onClick, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    return () => { document.removeEventListener('click', onClick, true); window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onBack); document.removeEventListener('visibilitychange', onBack); };
  }, [active, open, close]);

  const value = useMemo(() => ({ supported: pipSupported(), slots, open, close, want }), [slots, open, close, want]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
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
