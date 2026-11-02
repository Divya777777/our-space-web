// Notifications on this computer (Web Push through our service worker), for calls, messages and join requests.
type Api = <T>(path: string, body?: unknown, method?: string) => Promise<T>;
const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const notifySupported = supported();
const b64uToBytes = (s: string) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };

async function registration() {
  return navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
}
/** Subscribe this browser and tell the server. Asks for permission when `ask` (must come from a click). */
export async function enableNotifications(api: Api, ask: boolean): Promise<NotificationPermission | 'unsupported' | 'error'> {
  if (!supported()) return 'unsupported';
  let perm = Notification.permission;
  if (perm === 'default' && ask) perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm;
  try {
    const reg = await registration();
    await navigator.serviceWorker.ready;
    const { key } = await api<{ key: string }>('/webpush/key');
    let sub = await reg.pushManager.getSubscription();
    // A different server key (new server) needs a fresh subscription.
    const current = sub?.options?.applicationServerKey ? btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';
    if (sub && current && current !== key) { await sub.unsubscribe().catch(() => {}); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) });
    await api('/webpush', { subscription: sub.toJSON() }, 'PUT');
    return 'granted';
  } catch { return 'error'; }
}
export async function disableNotifications(api: Api) {
  if (!supported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await api('/webpush', { endpoint: sub.endpoint }, 'DELETE').catch(() => {}); await sub.unsubscribe().catch(() => {}); }
  } catch { /* nothing to undo */ }
}
