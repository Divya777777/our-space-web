import { useEffect, useState } from 'react';
// Full screen: the browser's tabs and address bar go away, and so does the app's own side menu (html.app-full).
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
const doc = () => document as FsDoc;
export const fullscreenSupported = typeof document !== 'undefined' && !!(document.documentElement.requestFullscreen || (document.documentElement as FsEl).webkitRequestFullscreen);
export const isFull = () => !!(doc().fullscreenElement || doc().webkitFullscreenElement);
export async function toggleFullscreen() {
  try {
    if (isFull()) await (doc().exitFullscreen?.() ?? doc().webkitExitFullscreen?.());
    else { const el = document.documentElement as FsEl; await (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.()); }
  } catch { /* the browser said no */ }
}
export function useFullscreen() {
  const [on, setOn] = useState(isFull);
  useEffect(() => {
    const sync = () => { const f = isFull(); setOn(f); document.documentElement.classList.toggle('app-full', f); };
    document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync);
    return () => { document.removeEventListener('fullscreenchange', sync); document.removeEventListener('webkitfullscreenchange', sync); };
  }, []);
  return on;
}
