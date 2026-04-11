// FULL SW FILE v2.4.12
const CACHE_VERSION = '2.4.12';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});
