import { ACCESS_API_URL, ACCESS_STORAGE_KEY, ACCESS_DEVICE_KEY, ACCESS_SCHEMA_VERSION } from './access-config.js?v=1.2';

const PLAY_ONLY_BLOCKED_SELECTORS = [
  '#previewBtn', '#vocabBtn', '#openQuestionManagerBtn', '#addQuestionBtn',
  '#selectAllQuestionsBtn', '#clearAllQuestionsBtn', '#applyQuestionManagerBtn',
  '[data-vocab-action]', '[data-action="save-edit"]', '[data-action="restore"]',
  '[data-action="delete"]', '#saveNewQuestionBtn', '#autoCardsBtn'
].join(',');

let watchTimer = null;
let expiryTimer = null;
let redirecting = false;

function nowMs(){ return Date.now(); }
function clean(v){ return String(v ?? '').trim(); }
function apiReady(){ return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/i.test(clean(ACCESS_API_URL)); }

export function getDeviceId(){
  let id = localStorage.getItem(ACCESS_DEVICE_KEY);
  if(id) return id;
  id = globalThis.crypto?.randomUUID?.() || `kwb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(ACCESS_DEVICE_KEY,id);
  return id;
}

export function getStoredAccess(){
  try{
    const data=JSON.parse(localStorage.getItem(ACCESS_STORAGE_KEY)||'null');
    return data && Number(data.schemaVersion)===ACCESS_SCHEMA_VERSION ? data : null;
  }catch{return null;}
}

export function clearTeacherAccess(){
  localStorage.removeItem(ACCESS_STORAGE_KEY);
  if(watchTimer) clearInterval(watchTimer);
  if(expiryTimer) clearTimeout(expiryTimer);
  watchTimer=expiryTimer=null;
}

function saveAccess(data){
  const next={...data,schemaVersion:ACCESS_SCHEMA_VERSION,deviceId:getDeviceId(),savedAt:nowMs()};
  localStorage.setItem(ACCESS_STORAGE_KEY,JSON.stringify(next));
  return next;
}

let requestSeq=0;

function callAccessApi(action,payload={}){
  if(!apiReady()) return Promise.reject(new Error('ACCESS_API_NOT_CONFIGURED'));
  const id=`kwb-${Date.now()}-${++requestSeq}-${Math.random().toString(36).slice(2)}`;
  const frame=document.createElement('iframe');
  const frameName=`kwbAccessFrame_${id.replace(/[^A-Za-z0-9_]/g,'_')}`;
  frame.name=frameName;
  frame.title='KWB access response';
  frame.setAttribute('aria-hidden','true');
  Object.assign(frame.style,{position:'fixed',width:'1px',height:'1px',opacity:'0',pointerEvents:'none',border:'0',left:'-9999px',top:'-9999px'});

  const form=document.createElement('form');
  form.method='POST';
  form.action=ACCESS_API_URL;
  form.target=frameName;
  form.acceptCharset='UTF-8';
  form.style.display='none';

  const add=(name,value)=>{
    const input=document.createElement('input');
    input.type='hidden';input.name=name;input.value=value;form.appendChild(input);
  };
  add('requestId',id);
  add('parentOrigin',location.origin);
  add('payload',JSON.stringify({action,...payload,clientTime:new Date().toISOString()}));

  return new Promise((resolve,reject)=>{
    let settled=false;
    const cleanup=()=>{
      window.removeEventListener('message',onMessage);
      try{form.remove();}catch{}
      try{frame.remove();}catch{}
    };
    const finish=(fn,value)=>{
      if(settled)return;settled=true;clearTimeout(timer);cleanup();fn(value);
    };
    const onMessage=(ev)=>{
      // Apps Script HTML may run inside an extra Google sandbox iframe. In that case
      // ev.source is not the outer target iframe's contentWindow, so source equality
      // would incorrectly discard a valid response. Verify the Google origin plus the
      // per-request cryptographically unpredictable id instead.
      const origin=String(ev.origin||'');
      const trustedOrigin = origin==='https://script.google.com' ||
        origin==='https://script.googleusercontent.com' ||
        /^https:\/\/[A-Za-z0-9.-]+\.googleusercontent\.com$/i.test(origin);
      if(!trustedOrigin || !ev.data || typeof ev.data!=='object') return;
      if(ev.data.type!=='KWB_ACCESS_RESPONSE' || ev.data.id!==id) return;
      const result=ev.data.result||{ok:false,code:'ACCESS_INVALID_RESPONSE',message:'인증 서버 응답을 확인할 수 없습니다.'};
      finish(resolve,result);
    };
    window.addEventListener('message',onMessage);
    const timer=setTimeout(()=>finish(reject,new Error('ACCESS_POST_TIMEOUT')),20000);
    document.body.appendChild(frame);
    document.body.appendChild(form);
    try{form.submit();form.remove();}
    catch(err){finish(reject,err);}
  });
}

function allowedSet(value){
  if(Array.isArray(value)) return new Set(value.map(v=>clean(v).toLowerCase()).filter(Boolean));
  const raw=clean(value);
  if(!raw || raw.toUpperCase()==='ALL') return new Set(['all']);
  return new Set(raw.split(/[;,\s]+/).map(v=>v.toLowerCase()).filter(Boolean));
}

function gameAllowed(access,game){
  if(!game || game==='arena') return true;
  const set=allowedSet(access?.allowedGames);
  return set.has('all') || set.has(game);
}

function safeNext(){
  const parts=location.pathname.split('/').filter(Boolean);
  let relative=parts.at(-1)||'arena.html';
  if(parts.includes('sentence-battle-sample')) relative=`sentence-battle-sample/${relative}`;
  return encodeURIComponent(relative+location.search+location.hash);
}

function goToLogin(reason='required'){
  if(redirecting) return;
  redirecting=true;
  const root=location.pathname.includes('/sentence-battle-sample/')?'../index.html':'index.html';
  location.replace(`${root}?reason=${encodeURIComponent(reason)}&next=${safeNext()}`);
}

function expiresAtMs(access){
  const t=Date.parse(access?.expiresAt||'');
  return Number.isFinite(t)?t:0;
}

function cachedStillFresh(access){
  const last=Number(access?.lastCheckedAt)||0;
  const minutes=Math.max(1,Number(access?.checkMinutes)||1);
  return last>0 && nowMs()-last < minutes*60*1000;
}

export async function loginTeacher({authCode,permitCode}={}){
  const auth=clean(authCode), permit=clean(permitCode);
  if(auth.length<4 || permit.length<4) return {ok:false,message:'인증번호와 허가번호를 확인해 주세요.'};
  const data=await callAccessApi('login',{
    authCode:auth,
    permitCode:permit,
    deviceId:getDeviceId(),
    userAgent:navigator.userAgent.slice(0,240)
  });
  if(!data.ok) return data;
  const access=saveAccess({...data,lastCheckedAt:nowMs()});
  return {...data,access};
}

export async function validateTeacherAccess({force=false}={}){
  let access=getStoredAccess();
  if(!access?.sessionToken) return {ok:false,code:'NO_SESSION'};
  if(expiresAtMs(access) && nowMs()>=expiresAtMs(access)){
    clearTeacherAccess();
    return {ok:false,code:'EXPIRED'};
  }
  if(!force && cachedStillFresh(access)) return {ok:true,access,cached:true};
  try{
    const data=await callAccessApi('validate',{
      sessionToken:access.sessionToken,
      deviceId:getDeviceId(),
      userAgent:navigator.userAgent.slice(0,240)
    });
    if(!data.ok){ clearTeacherAccess(); return data; }
    access=saveAccess({...access,...data,lastCheckedAt:nowMs()});
    return {ok:true,access,cached:false};
  }catch(err){
    return {ok:false,code:err?.message==='ACCESS_API_NOT_CONFIGURED'?'NOT_CONFIGURED':'NETWORK',message:'사용 권한 서버를 확인할 수 없습니다.'};
  }
}

function addAccessBadge(access){
  if(document.querySelector('.kwb-access-badge')) return;
  const badge=document.createElement('div');
  badge.className='kwb-access-badge';
  const level=clean(access?.accessLevel).toUpperCase()==='FULL'?'FULL':'PLAY ONLY';
  const expiry=access?.expiresAt?new Date(access.expiresAt).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
  badge.textContent=`🔐 ${access?.teacherName||'교사'} · ${level}${expiry?` · ~ ${expiry}`:''}`;
  Object.assign(badge.style,{position:'fixed',right:'12px',bottom:'10px',zIndex:'99999',padding:'7px 11px',borderRadius:'999px',font:'700 11px/1.2 system-ui,sans-serif',background:'rgba(6,20,50,.88)',color:'#dff6ff',border:'1px solid rgba(85,213,255,.35)',boxShadow:'0 8px 24px rgba(0,0,0,.24)',pointerEvents:'none'});
  document.body.appendChild(badge);
}

function lockPlayOnlyUi(access){
  if(clean(access?.accessLevel).toUpperCase()==='FULL') return;
  const lock=()=>{
    document.querySelectorAll(PLAY_ONLY_BLOCKED_SELECTORS).forEach(el=>{
      el.setAttribute('disabled','disabled');
      el.setAttribute('aria-disabled','true');
      el.title='외부 교사 PLAY_ONLY 권한에서는 공용 자료 수정 기능을 사용할 수 없습니다.';
      el.style.opacity='.45';
      el.style.pointerEvents='none';
    });
  };
  lock();
  const observer=new MutationObserver(lock);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',e=>{
    if(e.target.closest?.(PLAY_ONLY_BLOCKED_SELECTORS)){
      e.preventDefault();e.stopImmediatePropagation();
    }
  },true);
}

function showAccessExpired(message='사용 허가 기간이 종료되었거나 권한이 해제되었습니다.'){
  if(document.querySelector('.kwb-access-blocker')) return;
  const box=document.createElement('div');
  box.className='kwb-access-blocker';
  box.innerHTML=`<div><b>🔒 사용 권한 종료</b><p>${message}</p><small>잠시 후 인증 화면으로 이동합니다.</small></div>`;
  Object.assign(box.style,{position:'fixed',inset:'0',zIndex:'100000',display:'grid',placeItems:'center',background:'rgba(3,11,28,.94)',color:'#fff',textAlign:'center',fontFamily:'system-ui,sans-serif'});
  const card=box.firstElementChild;Object.assign(card.style,{padding:'30px 34px',borderRadius:'24px',background:'linear-gradient(145deg,#142d62,#07152f)',border:'1px solid rgba(104,218,255,.35)',boxShadow:'0 24px 70px rgba(0,0,0,.45)'});
  card.querySelector('b').style.fontSize='28px';
  card.querySelector('p').style.margin='14px 0 8px';
  document.body.appendChild(box);
}

function scheduleChecks(access){
  if(watchTimer) clearInterval(watchTimer);
  if(expiryTimer) clearTimeout(expiryTimer);
  const checkMin=Math.max(1,Number(access?.checkMinutes)||1);
  watchTimer=setInterval(async()=>{
    const r=await validateTeacherAccess({force:true});
    if(!r.ok){showAccessExpired(r.message);setTimeout(()=>goToLogin(r.code||'expired'),1200);}
  },checkMin*60*1000);
  const exp=expiresAtMs(access);
  if(exp>nowMs()){
    expiryTimer=setTimeout(()=>{clearTeacherAccess();showAccessExpired();setTimeout(()=>goToLogin('expired'),1200);},Math.min(2147483000,Math.max(1000,exp-nowMs()+500)));
  }
}

export function applyTeacherRestrictions(access){
  document.documentElement.dataset.accessLevel=clean(access?.accessLevel||'PLAY_ONLY').toUpperCase();
  if(document.body){addAccessBadge(access);lockPlayOnlyUi(access);}else{
    document.addEventListener('DOMContentLoaded',()=>{addAccessBadge(access);lockPlayOnlyUi(access);},{once:true});
  }
}

export async function requireTeacherAccess({game}={}){
  const r=await validateTeacherAccess({force:false});
  if(!r.ok){goToLogin(r.code||'required');await new Promise(()=>{});}
  const access=r.access;
  if(!gameAllowed(access,game)){
    clearTeacherAccess();
    goToLogin('game-not-allowed');
    await new Promise(()=>{});
  }
  applyTeacherRestrictions(access);
  scheduleChecks(access);
  return access;
}

export async function logoutTeacher(){
  const access=getStoredAccess();
  try{
    if(access?.sessionToken && apiReady()) await callAccessApi('logout',{sessionToken:access.sessionToken,deviceId:getDeviceId()});
  }catch{}
  clearTeacherAccess();
}

export function isAccessApiConfigured(){ return apiReady(); }
export function isGameAllowedForAccess(access,game){ return gameAllowed(access,game); }
