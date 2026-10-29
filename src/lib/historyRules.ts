// Browser back works like the phone app:
// - On Home, back leaves the site (Home is always the first page of the site in this tab's history).
// - Anywhere else (Rooms, Library, You, a room), back goes to Home, not to the page before.
// The site's history is kept at most two pages deep: [Home] or [Home, current page]. Moving between pages that
// aren't Home replaces the current entry instead of adding one; going to Home steps back instead of adding one.
// Works with React Router because every in-app navigation goes through history.pushState.
let homeBelow = false; // the current entry sits right on top of the Home entry

export function installHistoryRules(basePath: string) {
  if (typeof window === 'undefined' || !window.history) return;
  const base = basePath.replace(/\/$/, '');
  const appPath = (url: string | URL | null | undefined) => {
    const path = new URL(url ? String(url) : window.location.href, window.location.href).pathname;
    const p = path.startsWith(base) ? path.slice(base.length) : path;
    return p === '' ? '/' : p;
  };
  const isHome = (url?: string | URL | null) => appPath(url) === '/';
  const push = window.history.pushState.bind(window.history);
  const replace = window.history.replaceState.bind(window.history);

  // Opened straight on a room or invite link: put Home underneath, so back goes Home instead of leaving.
  if (!isHome()) {
    const here = window.location.pathname + window.location.search + window.location.hash;
    replace(null, '', `${base}/`);
    push(null, '', here);
    homeBelow = true;
  }

  window.history.pushState = function (state: unknown, unused: string, url?: string | URL | null) {
    const fromHome = isHome();
    if (isHome(url)) {
      if (fromHome) { replace(state, unused, url); return; }
      if (homeBelow) {
        // Step back to the Home entry that's already there (the router has already shown Home).
        homeBelow = false;
        window.history.back();
        return;
      }
      replace(state, unused, url); homeBelow = false; return;
    }
    if (fromHome) { push(state, unused, url); homeBelow = true; return; }
    replace(state, unused, url); // page → page: stay one step above Home
  };
  window.addEventListener('popstate', () => { homeBelow = !isHome(); });
}
