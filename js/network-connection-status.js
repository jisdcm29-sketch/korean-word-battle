// Report Firebase server connection transitions; initial SDK false is not a lost connection.
const states = new WeakMap();
let activeBus = null;
let hideTimer = null;
function badge(){
  if(typeof document==='undefined')return null;
  let el=document.querySelector('.kwb-network-badge');
  if(!el){
    el=document.createElement('div');el.className='kwb-network-badge';
    Object.assign(el.style,{position:'fixed',left:'12px',bottom:'10px',zIndex:'99998',padding:'8px 12px',borderRadius:'999px',font:'800 12px/1.25 system-ui,sans-serif',boxShadow:'0 8px 24px rgba(0,0,0,.25)',pointerEvents:'none',transition:'opacity .2s ease'});
    document.body?.appendChild(el);
  }
  return el;
}
function hideBadge(){
  clearTimeout(hideTimer);hideTimer=null;
  const el=typeof document==='undefined'?null:document.querySelector('.kwb-network-badge');
  if(el){el.style.display='none';el.style.opacity='0';delete el.dataset.offline;}
}
function showBadge(text,recovered=false){
  clearTimeout(hideTimer);hideTimer=null;
  const el=badge();if(!el)return;
  el.textContent=text;el.style.background=recovered?'rgba(5,92,67,.94)':'rgba(117,72,0,.94)';
  el.style.color=recovered?'#d7fff1':'#fff2bd';el.style.display='block';el.style.opacity='1';
  if(recovered){delete el.dataset.offline;hideTimer=setTimeout(()=>{el.style.opacity='0';hideTimer=null;},2400);}
  else el.dataset.offline='1';
}
export function updateConnectionBadge(bus,connected){
  if(!bus||bus.closed)return;
  let state=states.get(bus);
  if(!state){state={connected:null,everConnected:false,pending:null};states.set(bus,state);}
  if(activeBus!==bus){activeBus=bus;hideBadge();}
  if(state.connected===connected)return;
  state.connected=connected;clearTimeout(state.pending);state.pending=null;
  if(connected){
    const recovered=state.everConnected;state.everConnected=true;
    if(recovered)showBadge('✓ 게임 서버 연결 복구 · 자동 동기화 중',true);
    else hideBadge();
  }else if(state.everConnected){
    showBadge('⚠ 연결 끊김 · 현재 답안 보관 · 다음 문제 동기화 대기');
  }else if(typeof navigator!=='undefined'&&navigator.onLine===false){
    showBadge('⚠ 인터넷 오프라인 · 게임 서버 연결 대기');
  }else{
    // Firebase can report false briefly while establishing its first connection.
    state.pending=setTimeout(()=>{
      state.pending=null;
      if(activeBus===bus&&!bus.closed&&state.connected===false)
        showBadge('게임 서버 연결 대기 중');
    },5000);
  }
}
export function clearConnectionBadge(bus){
  const state=states.get(bus);if(state)clearTimeout(state.pending);
  states.delete(bus);
  if(activeBus===bus){activeBus=null;hideBadge();}
}
