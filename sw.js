/* Offline support. Bump VERSION whenever app files change so phones pick up the update. */
const VERSION="qb-2026-11-11c";
const SHELL=["./","index.html","app.js","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png","icons/apple-touch-icon.png","banks/index.json",
  "fonts/barlow-semi-condensed-latin-500-normal.woff2","fonts/barlow-semi-condensed-latin-600-normal.woff2","fonts/barlow-semi-condensed-latin-700-normal.woff2",
  "fonts/source-sans-3-latin-400-normal.woff2","fonts/source-sans-3-latin-500-normal.woff2","fonts/source-sans-3-latin-600-normal.woff2","fonts/source-sans-3-latin-700-normal.woff2",
  "fonts/jetbrains-mono-latin-400-normal.woff2","fonts/jetbrains-mono-latin-600-normal.woff2"];
self.addEventListener("install",e=>{e.waitUntil((async()=>{
  const c=await caches.open(VERSION);await c.addAll(SHELL);
  try{const idx=await (await fetch("banks/index.json",{cache:"no-cache"})).json();await c.addAll((idx.banks||[]).map(f=>"banks/"+f))}catch(err){}
  self.skipWaiting();
})())});
self.addEventListener("activate",e=>{e.waitUntil((async()=>{
  for(const k of await caches.keys())if(k!==VERSION)await caches.delete(k);
  await self.clients.claim();
})())});
self.addEventListener("fetch",e=>{
  const req=e.request;if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin!==location.origin)return;
  // Bank files: try the network first so updates arrive, fall back to the cached copy offline.
  if(url.pathname.includes("/banks/")){
    e.respondWith((async()=>{const c=await caches.open(VERSION);
      try{const r=await fetch(req,{cache:"no-cache"});if(r.ok)c.put(req,r.clone());return r}
      catch(err){return (await c.match(req,{ignoreSearch:true}))||Response.error()}})());return}
  // Everything else: cache first.
  e.respondWith((async()=>{const hit=await caches.match(req,{ignoreSearch:true});if(hit)return hit;
    try{const r=await fetch(req);if(r.ok){const c=await caches.open(VERSION);c.put(req,r.clone())}return r}
    catch(err){if(req.mode==="navigate")return caches.match("index.html");return Response.error()}})());
});
