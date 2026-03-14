// coop-coep.js (Service Worker for GitHub Pages)
// 此腳本強制為 GitHub Pages 的所有請求加上 COOP 與 COEP 標頭，
// 這是讓瀏覽器允許 WebAssembly 使用 SharedArrayBuffer (多執行緒) 的唯一條件。

const CACHE_NAME = "pdf-unlocker-offline-v3";
const PRECACHE_URLS = [
    "/pdf_unlocker/",
    "/pdf_unlocker/index.html",
    "/pdf_unlocker/qpdf.wasm",
    "/pdf_unlocker/qpdf.js"
];

self.addEventListener("install", (event) => {
    self.skipWaiting();
    // 背景預先下載笨重的 WebAssembly 引擎
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log("Pre-caching offline assets");
            return cache.addAll(PRECACHE_URLS).catch(err => console.error("Pre-cache error:", err));
        })
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) return caches.delete(cache);
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") {
        return;
    }

    // 只攔截 GET 請求
    if (event.request.method !== "GET") return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.status === 0) return response;

                // 強制加上 COOP / COEP 安全標頭
                const newHeaders = new Headers(response.headers);
                newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
                newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                const responseToCache = new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: newHeaders,
                });

                // 動態放入快取中
                if (response.status === 200) {
                    const responseClone = responseToCache.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }

                return responseToCache;
            })
            .catch(async (e) => {
                // 如果網路斷線，則無縫轉向本地快取讀取
                console.log("Network fetch failed, falling back to cache for:", event.request.url);
                const cachedResponse = await caches.match(event.request);
                if (cachedResponse) {
                    return cachedResponse;
                }
                throw e;
            })
    );
});
