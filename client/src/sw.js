import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

self.addEventListener('push', (event) => {
  const payload = readPayload(event);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visibleWindows = windows.filter((client) => client.visibilityState === 'visible');
    if (visibleWindows.length) {
      visibleWindows.forEach((client) => client.postMessage(payload));
      return;
    }

    await self.registration.showNotification(payload.title || 'MoneyMate', {
      body: payload.body,
      icon: payload.icon || '/icon-192.png',
      badge: payload.badge || '/icon-192.png',
      tag: payload.tag,
      renotify: true,
      data: { url: payload.url || '/', spaceId: payload.spaceId, transactionId: payload.transactionId },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      await existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});

function readPayload(event) {
  if (!event.data) return { type: 'transaction-created', title: 'MoneyMate', body: 'Gia đình vừa có khoản chi mới.', url: '/' };
  try {
    return event.data.json();
  } catch {
    return { type: 'transaction-created', title: 'MoneyMate', body: event.data.text(), url: '/' };
  }
}
