const CACHE='21-v30';
const CORE=['./','./index.html','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE).catch(()=>{})));self.skipWaiting();});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const req=e.request;
  // Навигацию и HTML — всегда с сети (stale-while-revalidate), чтобы UI обновлялся
  if(req.mode==='navigate'||(req.url.indexOf('/index.html')>-1)){
    e.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});return res;}).catch(()=>caches.match('./index.html')));
    return;
  }
  // Статику (assets/шрифты/стили) — cache-first с фоновым обновлением
  e.respondWith(
    caches.match(req).then(hit=>{
      const net=fetch(req).then(res=>{
        if(res && res.status===200 && (req.url.indexOf('/assets/')>-1||req.destination==='image'||req.destination==='style'||req.destination==='font'||req.destination==='manifest')){
          const copy=res.clone(); caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});
        }
        return res;
      }).catch(()=>hit);
      return hit || net;
    })
  );
});
