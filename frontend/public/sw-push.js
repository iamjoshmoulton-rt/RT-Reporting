self.addEventListener('push', function (event) {
  if (!event.data) return

  const data = event.data.json()
  const options = {
    body: data.body || '',
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || '/pwa-192x192.png',
    data: { url: data.url || '/dashboard' },
    vibrate: [100, 50, 100],
    actions: [{ action: 'open', title: 'Open' }],
  }

  event.waitUntil(self.registration.showNotification(data.title || 'RT Reporting', options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const url = event.notification.data?.url || '/dashboard'
  event.waitUntil(clients.openWindow(url))
})
