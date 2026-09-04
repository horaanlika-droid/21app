const CACHE='21-v1';
const CORE=['./','./index.html','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE).catch(()=>{})));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(
    caches.match(e.request).then(hit=>hit||fetch(e.request).then(res=>{
      const copy=res.clone();
      if(e.request.url.indexOf('/assets/')>-1||e.request.destination==='image'||e.request.destination==='style'||e.request.destination==='font'){
        caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
      }
      return res;
    }).catch(()=>caches.match('./index.html')))
  );
});
