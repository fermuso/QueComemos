const VERSION='quecomemos-app-0.1.0-c78af7d7bed3e358';
const SHELL=['./','index.html','styles.css','manifest.webmanifest','assets/icon.svg','assets/icon-maskable.svg','js/app.js','js/domain.js','js/storage.js','js/rag.js','js/ingest.js','js/model-worker.js','data/catalog.json','data/QueComemos-DatosDemo-1.0.0.json','data/model-manifest.json'];
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(VERSION);await cache.addAll(SHELL);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('quecomemos-app-')&&name!==VERSION)await caches.delete(name);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  // Keep a versioned application shell. Large vendor assets are cached on first use.
  event.respondWith((async()=>{
    const cache=await caches.open(VERSION),cached=await cache.match(request);if(cached)return cached;
    if(/\/(vendor\/|js\/model-worker\.js)/.test(url.pathname)){const prepared=await(await caches.open('quecomemos-model-meta-v1')).match(request);if(prepared)return prepared;}
    try{const response=await fetch(request);if(response.ok&&!response.headers.get('Content-Type')?.includes('text/event-stream'))await cache.put(request,response.clone());return response;}
    catch(error){if(request.mode==='navigate')return(await cache.match(new URL('index.html',self.registration.scope)))||Response.error();throw error;}
  })());
});
self.addEventListener('message',event=>{
  if(event.data?.type==='CLEAR_APP_CACHE')event.waitUntil((async()=>{await caches.delete(VERSION);event.ports[0]?.postMessage({ok:true});})());
  if(event.data?.type==='SHELL_STATUS')event.waitUntil((async()=>{const cache=await caches.open(VERSION);const present=await Promise.all(SHELL.map(path=>cache.match(new URL(path,self.registration.scope))));event.ports[0]?.postMessage({complete:present.every(Boolean),version:VERSION});})());
});
