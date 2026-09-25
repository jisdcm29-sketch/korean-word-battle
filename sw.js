const CACHE_NAME='kwb-offline-v1.0.4';
const CORE_ASSETS=[
  './','./index.html','./arena.html','./join.html',
  './word-battle.html','./play.html','./matching-pairs.html','./matching-play.html',
  './memory-pairs.html','./memory-play.html','./word-search.html','./word-search-play.html',
  './combined-battle.html','./combined-play.html','./sentence-battle-sample/index.html','./sentence-battle-sample/play.html',
  './css/access.css','./css/join.css','./css/app.css','./css/standalone-ui-sync-v2.css','./css/platform.css',
  './css/matching.css','./css/matching-setup-word-theme-v1.css','./css/memory.css','./css/memory-player-mobile.css',
  './css/word-search.css','./css/combined.css','./css/combined-player.css','./sentence-battle-sample/css/sentence-sample.css','./sentence-battle-sample/css/sentence-player.css',
  './js/access-config.js','./js/access-control.js','./js/access-login.js','./js/arena-access.js','./js/platform.js','./js/player-resume-helper.js','./js/local-bus.js','./js/firebase-config.js','./js/firebase-bus.js',
  './js/data-loader.js','./js/catalog.js','./js/game-engine.js','./js/audio-engine.js','./js/lucky-award.js',
  './js/host.js','./js/player.js','./js/matching-engine.js','./js/matching-host.js','./js/matching-player.js',
  './js/memory-engine.js','./js/memory-host.js','./js/memory-player.js',
  './js/word-search-engine.js','./js/word-search-bus.js','./js/word-search-host.js','./js/word-search-player.js',
  './js/combined-host.js','./js/combined-player.js','./js/combined-sentence-audio.js','./js/join.js',
  './sentence-battle-sample/js/sentence-live.js','./sentence-battle-sample/js/sentence-host.js','./sentence-battle-sample/js/sentence-player.js'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await Promise.allSettled(CORE_ASSETS.map(async url=>{
      try{
        const response=await fetch(url,{cache:'reload'});
        if(response && (response.ok || response.type==='opaque')) await cache.put(url,response.clone());
      }catch{}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('kwb-offline-')&&k!==CACHE_NAME).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

function cacheableRequest(request){
  if(request.method!=='GET') return false;
  const url=new URL(request.url);
  const sameOrigin=url.origin===self.location.origin;
  const trustedStaticHost=['www.gstatic.com','cdnjs.cloudflare.com','fonts.gstatic.com'].includes(url.hostname);
  if(request.mode==='navigate') return sameOrigin;
  if(!sameOrigin&&!trustedStaticHost) return false;
  const path=url.pathname.toLowerCase();
  if(['script','style','image','audio','font','worker'].includes(request.destination)) return true;
  return /\.(?:html?|css|js|json|m4a|mp3|wav|ogg|png|jpe?g|webp|svg|gif|woff2?|ttf)$/i.test(path);
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(!cacheableRequest(request)) return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request);
        if(response && response.ok){const cache=await caches.open(CACHE_NAME);cache.put(request,response.clone()).catch(()=>{});}
        return response;
      }catch(err){
        const cached=await caches.match(request,{ignoreSearch:true});
        if(cached) return cached;
        const fallback=await caches.match('./index.html');
        if(fallback) return fallback;
        throw err;
      }
    })());
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(request);
    if(cached){
      event.waitUntil(fetch(request).then(async response=>{
        if(response && (response.ok||response.type==='opaque')){const cache=await caches.open(CACHE_NAME);await cache.put(request,response.clone());}
      }).catch(()=>{}));
      return cached;
    }
    try{
      const response=await fetch(request);
      if(response && (response.ok||response.type==='opaque')){const cache=await caches.open(CACHE_NAME);cache.put(request,response.clone()).catch(()=>{});}
      return response;
    }catch(err){
      const relaxed=await caches.match(request,{ignoreSearch:true});
      if(relaxed) return relaxed;
      throw err;
    }
  })());
});
