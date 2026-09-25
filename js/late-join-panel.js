const ACTIVE_STATUSES=new Set(['countdown','playing','result','round-result','preview','transition']);

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
  .kwb-late-join[hidden]{display:none!important}.kwb-late-join.collapsed{width:auto;padding:0;background:transparent;border:0;box-shadow:none;backdrop-filter:none}
  .kwb-late-join-toggle{width:100%;border:0;border-radius:12px;background:linear-gradient(135deg,#35d7ff,#6c70ff);color:#07152f;font-weight:1000;font-size:12px;padding:8px 9px;cursor:pointer;box-shadow:0 7px 18px rgba(41,163,255,.25)}
  .kwb-late-join.collapsed .kwb-late-join-body{display:none}.kwb-late-join:not(.collapsed) .kwb-late-join-toggle{margin-bottom:8px}
  .kwb-late-join-head{display:flex;flex-direction:column;gap:2px;text-align:center;margin-bottom:7px}.kwb-late-join-head strong{font-size:12px;color:#e8f8ff}.kwb-late-join-head span{font-size:10px;color:#9fdcf1}
  .kwb-late-join-qr{width:112px;height:112px;margin:0 auto 7px;padding:5px;border-radius:10px;background:#fff;display:grid;place-items:center;overflow:hidden}.kwb-late-join-qr img,.kwb-late-join-qr canvas{max-width:100%;max-height:100%}
  .kwb-late-join-pin{display:flex;align-items:center;justify-content:center;gap:6px;padding:7px;border-radius:10px;background:rgba(255,255,255,.09)}.kwb-late-join-pin span{font-size:9px;color:#9fb4d2;letter-spacing:.08em}.kwb-late-join-pin b{font-size:18px;letter-spacing:.08em;color:#ffe486}
  .kwb-late-join-note{margin-top:6px;text-align:center;font-size:9px;line-height:1.35;color:#b8c9e3}
  @media(max-width:900px){.kwb-late-join{right:7px;top:50px;width:132px;padding:8px}.kwb-late-join-qr{width:96px;height:96px}.kwb-late-join-pin b{font-size:16px}}
  `;
  document.head.appendChild(style);
}

export function createLateJoinPanel({pin,url,getStatus=()=>'',enabled=()=>true}={}){
  ensureStyle();
  document.getElementById('kwbLateJoinPanel')?.remove();
  const root=document.createElement('aside');
  root.id='kwbLateJoinPanel';
  root.className='kwb-late-join';
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
