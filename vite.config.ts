import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

function offlineShell(): Plugin {
  return {
    name: 'ninelab-offline-shell',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const assets = Object.keys(bundle).filter((file) => /\.(js|css)$/.test(file)).sort()
      const digest = createHash('sha256').update(assets.join('|'))
      for (const file of ['index.html', 'public/manifest.webmanifest', 'public/icon-192.png', 'public/icon-512.png']) {
        digest.update(readFileSync(file))
      }
      const hash = digest.digest('hex').slice(0, 12)
      const files = ['./index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png',
        ...assets.map((file) => './' + file)]
      this.emitFile({
        type: 'asset', fileName: 'sw.js', source: `
const prefix = 'ninelab:' + self.registration.scope + ':';
const cacheName = prefix + '${hash}';
self.addEventListener('install', event => event.waitUntil(
  caches.open(cacheName).then(cache => cache.addAll(${JSON.stringify(files)})).then(() => self.skipWaiting())
));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(prefix) && key !== cacheName)
    .map(key => caches.delete(key)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.registration.scope)) return;
  event.respondWith(caches.open(cacheName).then(async cache => {
    if (event.request.mode === 'navigate') {
      // Use the same shell as the cached assets while this worker controls the page.
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    // Static release assets are immutable across request modes and Origin headers.
    return (await cache.match(event.request, { ignoreVary: true })) || fetch(event.request);
  }));
});
` })
    },
  }
}

export default defineConfig({ base: './', plugins: [vue(), offlineShell()] })
