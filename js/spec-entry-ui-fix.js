/* KGA_SPEC_ENTRY_UI_FIX_V1.  No authentication/API/score mutations. */
(() => {
  const container = document.getElementById('joinView');
  const input = document.getElementById('nameInput');
  if (!container || !input) return;
  const modeWords = /^(?:이름으로 입장|등록 전화번호|등록학생|미등록학생|이름 입장|전화번호 입장)\s*$/;
  function stripChoiceControls(){
    for (const el of container.querySelectorAll('button,label')) {
      if(el.id==='joinBtn'||el.htmlFor==='nameInput')continue;
      if(modeWords.test((el.textContent||'').trim())) {
        el.hidden=true;
        el.style.display='none';
        if(el.matches('button')) el.setAttribute('aria-hidden','true');
      }
    }
  }
  // Student field itself stays a single entry; game type is determined by teacher's room.
  input.placeholder='전화번호 또는 이름을 입력하세요';
  const formLabel=input.closest('label');
  if(formLabel){const labels=formLabel.querySelectorAll('span');for(const el of labels){if(/전화번호|이름/.test(el.textContent||''))el.textContent='전화번호 또는 이름';}}
  stripChoiceControls();
  const observer=new MutationObserver(stripChoiceControls);
  observer.observe(container,{childList:true,subtree:true});
  window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
})();
