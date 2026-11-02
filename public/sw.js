// Our Space website notifications (Web Push): calls, messages and join requests on this computer, even when the
// site is closed. Pushes say only who and where; chat stays end-to-end encrypted.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const base = new URL('./', self.location).href; // e.g. https://divya777777.github.io/our-space-web/
const target = data => data && data.code ? `${base}room/${encodeURIComponent(data.code)}${data.type === 'message' ? '?tab=chat' : data.type === 'goal' ? '?tab=goals' : data.type === 'game' ? '?tab=play' : data.type === 'request' ? '?tab=people' : ''}` : base;

self.addEventListener('push', event => {
  let msg = {}; try { msg = event.data ? event.data.json() : {}; } catch { msg = { title: 'Our Space', body: event.data && event.data.text() }; }
  const data = msg.data || {};
  event.waitUntil((async () => {
    // Our Space is open and in front of you: it shows calls and messages itself.
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (open.some(c => c.visibilityState === 'visible' && c.focused)) return;
    const call = data.type === 'call';
    await self.registration.showNotification(msg.title || 'Our Space', {
      body: msg.body || '', icon: `${base}icon-192.png`, badge: `${base}icon-192.png`,
      tag: call ? `call-${data.callId || data.code}` : `${data.type || 'note'}-${data.code || ''}`, renotify: true,
      requireInteraction: call, silent: false, data,
      actions: call ? [{ action: 'answer', title: data.video === false ? 'Answer' : 'Answer with video' }] : [],
    });
    // A call stops ringing after 40 s (missed).
    if (call) setTimeout(async () => { for (const n of await self.registration.getNotifications({ tag: `call-${data.callId || data.code}` })) n.close(); }, 40000);
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = target(event.notification.data);
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const same = wins.find(c => c.url.startsWith(base));
    if (same) { await same.focus(); if (!same.url.startsWith(url.split('?')[0])) await same.navigate(url).catch(() => {}); return; }
    await self.clients.openWindow(url);
  })());
});
