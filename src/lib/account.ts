// Account storage and Google sign-in for the browser. Same backend, same accounts as the phone app.
import type { Session } from './model';

export const backendUrl = (import.meta.env.VITE_API_URL || 'https://our-space-stg.onrender.com').replace(/\/$/, '').replace(/\/api$/, '');
export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '351421523260-04n8q3b4g79ofjpins9sd4m12933b9rl.apps.googleusercontent.com';

export type Account = { url: string; user: Session; refreshToken: string };
const KEY = 'ourspace.web.account.v1';

export function loadAccount(): Account | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const account = JSON.parse(raw) as Account;
    // Never send saved tokens to a different backend than this build talks to.
    return account.url === backendUrl && account.user?.token && account.refreshToken ? account : null;
  } catch { return null; }
}
export function saveAccount(account: Account | null) {
  try { if (account) localStorage.setItem(KEY, JSON.stringify(account)); else localStorage.removeItem(KEY); } catch { /* private window */ }
}

type GoogleId = {
  accounts: { id: {
    initialize: (o: Record<string, unknown>) => void;
    renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
    prompt: () => void;
    disableAutoSelect: () => void;
  } };
};
declare global { interface Window { google?: GoogleId } }

let gis: Promise<GoogleId> | null = null;
/** Loads Google Identity Services once. */
export function loadGoogle(): Promise<GoogleId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (!gis) gis = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
    s.onload = () => (window.google ? resolve(window.google) : reject(new Error('Google sign-in did not load.')));
    s.onerror = () => { gis = null; reject(new Error('Google sign-in could not load. Check your connection or ad blocker.')); };
    document.head.appendChild(s);
  });
  return gis;
}
/** Draws Google's own sign-in button into `el`; `onCredential` gets the ID token. */
export async function renderGoogleButton(el: HTMLElement, onCredential: (credential: string) => void, width = 320) {
  const google = await loadGoogle();
  google.accounts.id.initialize({ client_id: googleClientId, callback: (r: { credential?: string }) => { if (r.credential) onCredential(r.credential); }, ux_mode: 'popup', auto_select: false, itp_support: true, use_fedcm_for_prompt: true });
  el.innerHTML = '';
  google.accounts.id.renderButton(el, { type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'left', width });
}
export function googleSignOut() { try { window.google?.accounts.id.disableAutoSelect(); } catch { /* not loaded */ } }
