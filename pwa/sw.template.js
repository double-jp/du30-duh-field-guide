/* DU30 · DUH 현장 작업 가이드 — 서비스워커 (오프라인 캐시)
 * 이 파일은 scripts/build.mjs가 VERSION과 PRECACHE를 채워 dist/sw.js로 만든다. 직접 고치지 말 것. */
const VERSION = '__VERSION__';
const CACHE = 'du30-duh-guide-' + VERSION;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', e => {
  // 앱 전체(본문 + 원본 화면 이미지)를 한 번에 저장해 현장에서 인터넷 없이 열리게 한다.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('du30-duh-guide-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// 사용자가 '새 버전 적용'을 누르면 대기 중인 워커가 바로 교체된다.
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 장비 웹(169.254.x.x) 등 외부 주소는 손대지 않음

  if (req.mode === 'navigate') {
    // 페이지 이동은 항상 캐시된 index.html로 응답 → 오프라인에서도 즉시 열림
    e.respondWith(caches.match('./index.html', { cacheName: CACHE }).then(r => r || fetch(req)));
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});
