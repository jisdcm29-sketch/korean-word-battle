(() => {
  const params = new URLSearchParams(location.search);
  const pin = params.get('pin') || '';
  const isSolo = params.get('solo') === '1' || params.get('local') === '1';
  const path = location.pathname.toLowerCase();

  function profileKeys() {
    if (path.includes('sentence-battle-sample')) return { name:'sentence_sample_name', avatar:'sentence_sample_avatar' };
    if (path.endsWith('/matching-play.html') || path.endsWith('matching-play.html')) return { name:`kmp_name_${pin}`, avatar:`kmp_avatar_${pin}` };
    if (path.endsWith('/memory-play.html') || path.endsWith('memory-play.html')) return { name:`kmb_name_${pin}`, avatar:`kmb_avatar_${pin}` };
    if (path.endsWith('/word-search-play.html') || path.endsWith('word-search-play.html')) return { name:`kws_name_${pin}`, avatar:`kws_avatar_${pin}` };
    if (path.endsWith('/combined-play.html') || path.endsWith('combined-play.html')) return { name:`kwb_combined_name_${pin}`, avatar:`kwb_combined_avatar_${pin}` };
    return { name:`kwb_name_${pin}`, avatar:`kwb_avatar_${pin}` };
  }

  let badge = null, hideTimer = null, hadDisconnect = false, preloadShown = false;
  function ensureBadge() {
    if (badge) return badge;
    badge = document.createElement('div');
    badge.id = 'kwbConnectionBadge';
    badge.setAttribute('aria-live','polite');
    Object.assign(badge.style, {
      position:'fixed', top:'max(10px, env(safe-area-inset-top))', left:'50%', transform:'translateX(-50%)',
      zIndex:'2147483647', padding:'8px 13px', borderRadius:'999px', fontSize:'13px', fontWeight:'900',
      fontFamily:'system-ui,-apple-system,"Noto Sans KR",sans-serif', boxShadow:'0 8px 22px rgba(0,0,0,.22)',
      display:'none', pointerEvents:'none', whiteSpace:'nowrap'
    });
    document.body.appendChild(badge);
    return badge;
  }
  function showBadge(text, ok=false, autoHide=0) {
    const el=ensureBadge(); clearTimeout(hideTimer); el.textContent=text; el.style.display='block';
    el.style.background=ok?'rgba(10,135,83,.94)':'rgba(159,86,12,.96)'; el.style.color='#fff';
    if(autoHide)hideTimer=setTimeout(()=>{el.style.display='none';},autoHide);
  }
  function disconnected(){hadDisconnect=true;showBadge('연결 복구 중… 게임 화면은 유지됩니다.');}
  function connected(){if(hadDisconnect){showBadge('연결 복구됨',true,1400);hadDisconnect=false;}}

  window.addEventListener('offline', disconnected);
  window.addEventListener('online', connected);
  window.addEventListener('kwb-connection', e => e.detail?.connected ? connected() : disconnected());
  window.addEventListener('kwb-host-connection', e => { if(e.detail?.connected){connected();}else{hadDisconnect=true;showBadge('교사 연결 복구 중… 게임은 계속 진행됩니다.');} });
  window.addEventListener('kwb-preload', e => { if(e.detail?.ready && !preloadShown){preloadShown=true;const n=Number(e.detail?.itemCount)||0;showBadge(n?`게임 자료 준비 완료 · ${n}개`:'게임 자료 준비 완료',true,1300);} });
  window.addEventListener('kwb-delivery', e => {
    if(e.detail?.status==='queued') showBadge('답안 저장됨 · 연결되면 자동 전송됩니다.');
    if(e.detail?.status==='sent' && hadDisconnect===false) showBadge('저장한 답안 전송 완료',true,1100);
  });
  if(navigator.onLine===false)disconnected();

  // PIN으로 이미 한 번 입장했던 학생이 새로고침했을 때 자동으로 같은 참가자로 복귀합니다.
  if (!pin || isSolo) return;
  const keys = profileKeys();
  let savedName='', savedAvatar='';
  try { savedName=localStorage.getItem(keys.name)||''; savedAvatar=localStorage.getItem(keys.avatar)||''; } catch {}
  if (!savedName) return;

  let tries=0;
  const resume=()=>{
    tries++;
    const nameInput=document.getElementById('nameInput');
    const pinInput=document.getElementById('pinInput');
    const avatarGrid=document.getElementById('avatarGrid');
    const joinBtn=document.getElementById('joinBtn');
    if(!nameInput||!pinInput||!avatarGrid||!joinBtn){if(tries<30)setTimeout(resume,120);return;}
    if(joinBtn.disabled){if(tries<30)setTimeout(resume,150);return;}
    pinInput.value=pin;
    nameInput.value=savedName;
    if(savedAvatar){
      const btn=[...avatarGrid.querySelectorAll('button')].find(b=>(b.dataset.a||b.dataset.avatar||b.textContent.trim())===savedAvatar);
      if(btn)btn.click();
    }
    joinBtn.dataset.autoResume='1';
    joinBtn.click();
  };
  window.addEventListener('load',()=>setTimeout(resume,260),{once:true});
})();
