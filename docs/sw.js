// بيخلي البرنامج يتسطّب على الكمبيوتر والموبايل. البيانات دايمًا بتيجي من السيرفر (مفيش تخزين قديم).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
