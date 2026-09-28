const ACTIVE_STATUSES=new Set(['countdown','playing','result','round-result','preview','transition']);


// Phase 9: compact teacher live layout ---------------------------------------
// Card matching, memory battle and word search used to keep the large setup
// title above the live host panel. That made the teacher screen scroll even on
// a normal desktop browser. Sentence Battle is the reference: once play starts,
// the live monitor itself fills the available viewport without requiring
// fullscreen mode.
function installCompactTeacherLiveLayout(){
  if(typeof document==='undefined'||document.getElementById('kwbCompactTeacherLiveStyle'))return;
  const style=document.createElement('style');
  style.id='kwbCompactTeacherLiveStyle';
  style.textContent=`
  body.kwb-live-host{overflow:hidden!important}
  body.kwb-live-host .match-bg,
  body.kwb-live-host .memory-bg,
  body.kwb-live-host .search-bg{position:fixed!important}
  body.kwb-live-host .match-hero,
  body.kwb-live-host .memory-hero,
  body.kwb-live-host .search-hero{display:none!important}
  body.kwb-live-host .match-shell,
  body.kwb-live-host .memory-shell,
  body.kwb-live-host .search-shell{
    width:100vw!important;max-width:none!important;height:100vh!important;min-height:100vh!important;
    margin:0!important;padding:10px 14px!important;display:flex!important;align-items:stretch!important;justify-content:center!important;
  }
  body.kwb-live-host #hostView{
    width:min(1460px,100%)!important;height:calc(100vh - 20px)!important;min-height:0!important;max-height:calc(100vh - 20px)!important;
    margin:0 auto!important;padding:12px 16px 10px!important;border-radius:20px!important;overflow:hidden!important;
  }
  body.kwb-live-host #hostView>.fullscreen-btn{top:12px!important;right:14px!important;z-index:80!important}
  body.kwb-live-host #gameView:not(.hidden){display:flex!important;flex-direction:column!important;height:100%!important;min-height:0!important;overflow:hidden!important}
  body.kwb-live-host #gameView .game-monitor-head{
    flex:0 0 54px!important;min-height:54px!important;margin:0!important;padding:0 92px 0 8px!important;
  }
  body.kwb-live-host #gameView .host-game-layout{
    flex:1 1 auto!important;min-height:0!important;height:auto!important;margin:0!important;padding-top:8px!important;
    grid-template-columns:minmax(0,1fr) clamp(300px,21vw,360px)!important;gap:12px!important;overflow:hidden!important;
  }
  body.kwb-live-host #gameView .host-stage,
  body.kwb-live-host #gameView .rank-panel{height:100%!important;min-height:0!important;overflow:hidden!important}
  body.kwb-live-host #gameView .rank-panel{display:flex!important;flex-direction:column!important;padding:12px!important}
  body.kwb-live-host #gameView .ranking-list{flex:1 1 auto!important;min-height:0!important;overflow:hidden!important;align-content:start!important}
  body.kwb-live-host #gameView .rank-row{min-height:0!important;max-height:58px!important}
  body.kwb-live-host #gameView>.game-actions{flex:0 0 42px!important;min-height:42px!important;margin:0!important;padding:6px 0 0!important;display:flex!important;justify-content:center!important;align-items:flex-end!important}
  body.kwb-live-host #gameView>.game-actions .btn{min-height:34px!important;padding:7px 14px!important}

  /* Matching / Memory: keep vocabulary and circular timer inside one viewport. */
  body.match-host-page.kwb-live-host #gameView .host-stage,
  body.memory-host-page.kwb-live-host #gameView .host-stage{
    padding:12px 18px 10px!important;display:grid!important;grid-template-rows:auto auto minmax(0,1fr) auto!important;
  }
  body.match-host-page.kwb-live-host #gameView .host-vocab-strip,
  body.memory-host-page.kwb-live-host #gameView .host-memory-strip{
    min-height:0!important;max-height:152px!important;padding:8px 6px!important;gap:8px 10px!important;align-content:center!important;
  }
  body.match-host-page.kwb-live-host #gameView .vocab-pill{min-height:48px!important;padding:9px 14px!important;font-size:clamp(20px,1.6vw,28px)!important}
  body.memory-host-page.kwb-live-host #gameView .memory-pair{min-height:48px!important;padding:8px 12px!important}
  body.match-host-page.kwb-live-host #gameView .host-timer-space,
  body.memory-host-page.kwb-live-host #gameView .host-timer-space{
    min-height:0!important;height:auto!important;padding:2px 0!important;overflow:hidden!important;display:grid!important;place-items:center!important;
  }
  body.match-host-page.kwb-live-host #gameView .circle-timer,
  body.memory-host-page.kwb-live-host #gameView .circle-timer{
    width:min(37vh,330px)!important;max-width:42vw!important;padding:20px!important;
  }
  body.match-host-page.kwb-live-host #gameView .stage-note,
  body.memory-host-page.kwb-live-host #gameView .stage-note{margin-top:4px!important;padding:5px 8px!important;font-size:10px!important;line-height:1.25!important}

  /* Word search: compact targets and board while preserving readable letters. */
  body.search-host-page.kwb-live-host #gameView .host-stage{padding:12px 16px 10px!important;display:flex!important;flex-direction:column!important}
  body.search-host-page.kwb-live-host #gameView .target-head{flex:0 0 auto!important;margin-bottom:6px!important}
  body.search-host-page.kwb-live-host #gameView .host-targets{flex:0 0 auto!important;gap:6px!important;margin-bottom:6px!important}
  body.search-host-page.kwb-live-host #gameView .host-target{min-height:48px!important;padding:5px 8px!important}
  body.search-host-page.kwb-live-host #gameView .host-target strong{font-size:clamp(20px,1.65vw,27px)!important}
  body.search-host-page.kwb-live-host #gameView .teacher-board-wrap{flex:1 1 auto!important;min-height:0!important;display:grid!important;place-items:center!important;overflow:hidden!important}
  body.search-host-page.kwb-live-host #gameView .teacher-grid{width:min(45vh,430px)!important;max-width:100%!important;max-height:100%!important}
  body.search-host-page.kwb-live-host #gameView .stage-note{flex:0 0 auto!important;margin:4px 0 0!important;padding:5px 8px!important;font-size:10px!important}
  body.search-host-page.kwb-live-host #gameView .rank-panel .game-actions{margin-top:auto!important;padding-top:6px!important}

  /* Memory fullscreen uses documentElement.requestFullscreen(). Keep the same
     stable geometry instead of switching to a second, incompatible layout. */
  html:fullscreen body.memory-host-page.kwb-live-host,
  html:-webkit-full-screen body.memory-host-page.kwb-live-host{width:100vw!important;height:100vh!important;overflow:hidden!important}
  html:fullscreen body.memory-host-page.kwb-live-host .memory-shell,
  html:-webkit-full-screen body.memory-host-page.kwb-live-host .memory-shell{width:100vw!important;height:100vh!important;padding:10px 14px!important}

  @media(max-height:760px){
    body.kwb-live-host .match-shell,body.kwb-live-host .memory-shell,body.kwb-live-host .search-shell{padding:6px 10px!important}
    body.kwb-live-host #hostView{height:calc(100vh - 12px)!important;max-height:calc(100vh - 12px)!important;padding:8px 12px 7px!important;border-radius:16px!important}
    body.kwb-live-host #gameView .game-monitor-head{flex-basis:46px!important;min-height:46px!important}
    body.kwb-live-host #gameView .host-game-layout{padding-top:5px!important;gap:9px!important}
    body.match-host-page.kwb-live-host #gameView .circle-timer,
    body.memory-host-page.kwb-live-host #gameView .circle-timer{width:min(34vh,270px)!important;padding:17px!important}
    body.match-host-page.kwb-live-host #gameView .host-vocab-strip,
    body.memory-host-page.kwb-live-host #gameView .host-memory-strip{max-height:126px!important}
    body.search-host-page.kwb-live-host #gameView .teacher-grid{width:min(42vh,360px)!important}
  }
  `;
  document.head.appendChild(style);

  const sync=()=>{
    const game=document.getElementById('gameView');
    const host=document.getElementById('hostView');
    const active=Boolean(game&&host&&!game.classList.contains('hidden')&&!host.classList.contains('hidden'));
    document.body?.classList.toggle('kwb-live-host',active);
  };
  const start=()=>{
    sync();
    const host=document.getElementById('hostView');
    if(host)new MutationObserver(sync).observe(host,{attributes:true,attributeFilter:['class'],subtree:true});
    document.addEventListener('fullscreenchange',sync);
    document.addEventListener('webkitfullscreenchange',sync);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
installCompactTeacherLiveLayout();

export function canAcceptLateJoin(status){
  const s=String(status||'').toLowerCase();
  return Boolean(s) && s!=='closed' && s!=='finished';
}

function ensureStyle(){
  if(document.getElementById('kwbLateJoinPanelStyle'))return;
  const style=document.createElement('style');
  style.id='kwbLateJoinPanelStyle';
  style.textContent=`
  .kwb-late-join{position:fixed;right:12px;top:58px;z-index:99980;width:148px;padding:10px;border-radius:16px;background:rgba(5,21,50,.94);border:1px solid rgba(93,202,255,.42);box-shadow:0 14px 34px rgba(0,0,0,.34);color:#fff;font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;backdrop-filter:blur(10px)}
  .kwb-late-join.left{right:auto;left:12px;top:auto;bottom:16px}
  .kwb-late-join[hidden]{display:none!important}.kwb-late-join.collapsed{width:auto;padding:0;background:transparent;border:0;box-shadow:none;backdrop-filter:none}
  .kwb-late-join-toggle{width:100%;border:0;border-radius:12px;background:linear-gradient(135deg,#35d7ff,#6c70ff);color:#07152f;font-weight:1000;font-size:12px;padding:8px 9px;cursor:pointer;box-shadow:0 7px 18px rgba(41,163,255,.25)}
  .kwb-late-join.collapsed .kwb-late-join-body{display:none}.kwb-late-join:not(.collapsed) .kwb-late-join-toggle{margin-bottom:8px}
  .kwb-late-join-head{display:flex;flex-direction:column;gap:2px;text-align:center;margin-bottom:7px}.kwb-late-join-head strong{font-size:12px;color:#e8f8ff}.kwb-late-join-head span{font-size:10px;color:#9fdcf1}
  .kwb-late-join-qr{width:112px;height:112px;margin:0 auto 7px;padding:5px;border-radius:10px;background:#fff;display:grid;place-items:center;overflow:hidden}.kwb-late-join-qr img,.kwb-late-join-qr canvas{max-width:100%;max-height:100%}
  .kwb-late-join-pin{display:flex;align-items:center;justify-content:center;gap:6px;padding:7px;border-radius:10px;background:rgba(255,255,255,.09)}.kwb-late-join-pin span{font-size:9px;color:#9fb4d2;letter-spacing:.08em}.kwb-late-join-pin b{font-size:18px;letter-spacing:.08em;color:#ffe486}
  .kwb-late-join-note{margin-top:6px;text-align:center;font-size:9px;line-height:1.35;color:#b8c9e3}
  @media(max-width:900px){.kwb-late-join{right:7px;top:50px;width:132px;padding:8px}.kwb-late-join.left{right:auto;left:7px;top:auto;bottom:12px}.kwb-late-join-qr{width:96px;height:96px}.kwb-late-join-pin b{font-size:16px}}
  `;
  document.head.appendChild(style);
}

export function createLateJoinPanel({pin,url,getStatus=()=>'',enabled=()=>true,side='right'}={}){
  ensureStyle();
  document.getElementById('kwbLateJoinPanel')?.remove();
  const root=document.createElement('aside');
  root.id='kwbLateJoinPanel';
  root.className=`kwb-late-join${side==='left'?' left':''}`;
  root.hidden=true;
  root.setAttribute('aria-label','게임 중 늦은 입장 QR');
  root.innerHTML=`<button type="button" class="kwb-late-join-toggle">📱 참여 QR 접기</button><div class="kwb-late-join-body"><div class="kwb-late-join-head"><strong>늦은 입장 · 재입장</strong><span>게임 진행 중에도 참여 가능</span></div><div class="kwb-late-join-qr"></div><div class="kwb-late-join-pin"><span>PIN</span><b></b></div><div class="kwb-late-join-note">같은 기기로 재입장하면 기존 점수를 이어갑니다.</div></div>`;
  const qr=root.querySelector('.kwb-late-join-qr');
  const pinEl=root.querySelector('.kwb-late-join-pin b');
  const toggle=root.querySelector('.kwb-late-join-toggle');
  pinEl.textContent=String(pin||'------');
  let collapsed=false;
  toggle.addEventListener('click',()=>{collapsed=!collapsed;root.classList.toggle('collapsed',collapsed);toggle.textContent=collapsed?'📱 참여 QR':'📱 참여 QR 접기';});
  function renderQr(){
    qr.innerHTML='';
    if(globalThis.QRCode){
      try{new QRCode(qr,{text:String(url||''),width:104,height:104,correctLevel:QRCode.CorrectLevel.M});return;}catch{}
    }
    qr.innerHTML='<span style="color:#27456f;font-size:10px;text-align:center">QR 준비 실패<br>PIN을 사용하세요.</span>';
  }
  renderQr();
  function moveForFullscreen(){
    const parent=document.fullscreenElement||document.body;
    if(parent&&root.parentElement!==parent)parent.appendChild(root);
  }
  function refresh(){
    moveForFullscreen();
    const status=String(getStatus?.()||'').toLowerCase();
    let ok=false;try{ok=Boolean(enabled?.());}catch{}
    root.hidden=!(ok&&ACTIVE_STATUSES.has(status));
  }
  document.body.appendChild(root);
  document.addEventListener('fullscreenchange',moveForFullscreen);
  const timer=setInterval(refresh,250);
  refresh();
  return {refresh,destroy(){clearInterval(timer);document.removeEventListener('fullscreenchange',moveForFullscreen);root.remove();}};
}

// Weekly award Phase 8: load the shared daily-result save bridge on Arena host games.
if(typeof window!=='undefined'){
  const path=String(location.pathname||'').replace(/\\/g,'/').toLowerCase();
  const supported=/\/(?:word-battle|matching-pairs|memory-pairs|word-search|combined-battle)\.html$/.test(path) || /\/sentence-battle-sample\/index\.html$/.test(path);
  if(supported&&!window.__kwbWeeklyResultBridgeLoaded){
    window.__kwbWeeklyResultBridgeLoaded=true;
    import('./weekly-result-save.js?v=2.0').catch(err=>console.error('[KWB weekly result bridge]',err));
  }
}
