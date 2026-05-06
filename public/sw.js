const SHELL_CACHE = "glideai-shell-v1";
const RUNTIME_CACHE = "glideai-runtime-v1";
const APP_SHELL_URL = new URL("./", self.registration.scope).href;
const MEDIAPIPE_POSE_FILES = [
  "pose_landmark_full.tflite",
  "pose_solution_packed_assets.data",
  "pose_solution_packed_assets_loader.js",
  "pose_solution_simd_wasm_bin.data",
  "pose_solution_simd_wasm_bin.js",
  "pose_solution_simd_wasm_bin.wasm",
  "pose_solution_wasm_bin.js",
  "pose_solution_wasm_bin.wasm",
  "pose_web.binarypb",
].map((file) => new URL(`vendor/mediapipe/pose/${file}`, self.registration.scope).href);
const SHELL_URLS = [
  APP_SHELL_URL,
  new URL("manifest.webmanifest", self.registration.scope).href,
  new URL("icon.svg", self.registration.scope).href,
  ...MEDIAPIPE_POSE_FILES,
];

async function collectAppShellUrls() {
  const response = await fetch(APP_SHELL_URL);
  const html = await response.clone().text();
  const assetUrls = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((url) => url.includes("_next/static/"))
    .map((url) => new URL(url, APP_SHELL_URL).href);

  return [...assetUrls, ...SHELL_URLS];
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([caches.open(SHELL_CACHE), collectAppShellUrls()])
      .then(([cache, urls]) => cache.addAll([...new Set(urls)]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![SHELL_CACHE, RUNTIME_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isMediaPipePose = isSameOrigin && url.pathname.includes("/vendor/mediapipe/pose/");
  const isStaticAsset =
    isSameOrigin &&
    (url.pathname.includes("/_next/static/") ||
      url.pathname.endsWith("/manifest.webmanifest") ||
      url.pathname.endsWith("/icon.svg"));

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(APP_SHELL_URL))
    );
    return;
  }

  if (!isStaticAsset && !isMediaPipePose) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
