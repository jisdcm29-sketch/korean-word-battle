import { ACCESS_API_URL } from './access-config.js?v=1.3';
import { getStoredAccess, getDeviceId } from './access-control.js?v=1.6';

const SESSION_KEY='kwb_arena_class_context_v1';
let requestSeq=0;

function clean(v){return String(v??'').trim();}
function apiReady(){return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/i.test(clean(ACCESS_API_URL));}

function callApi(action,payload={}){
  if(!apiReady()) return Promise.reject(new Error('ACCESS_API_NOT_CONFIGURED'));
  const id=`kwb-class-${Date.now()}-${++requestSeq}-${Math.random().toString(36).slice(2)}`;
  const frame=document.createElement('iframe');
  const frameName=`kwbClassFrame_${id.replace(/[^A-Za-z0-9_]/g,'_')}`;
  frame.name=frameName;frame.title='KWB class response';frame.setAttribute('aria-hidden','true');
  Object.assign(frame.style,{position:'fixed',width:'1px',height:'1px',opacity:'0',pointerEvents:'none',border:'0',left:'-9999px',top:'-9999px'});
  const form=document.createElement('form');form.method='POST';form.action=ACCESS_API_URL;form.target=frameName;form.acceptCharset='UTF-8';form.style.display='none';
  const add=(name,value)=>{const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);};
  add('requestId',id);add('parentOrigin',location.origin);add('payload',JSON.stringify({action,...payload,clientTime:new Date().toISOString()}));
  return new Promise((resolve,reject)=>{
    let settled=false;
    const cleanup=()=>{window.removeEventListener('message',onMessage);try{form.remove();}catch{}try{frame.remove();}catch{}};
    const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);cleanup();fn(value);};
    const onMessage=(ev)=>{
      const origin=String(ev.origin||'');
      const trusted=origin==='https://script.google.com'||origin==='https://script.googleusercontent.com'||/^https:\/\/[A-Za-z0-9.-]+\.googleusercontent\.com$/i.test(origin);
      if(!trusted||!ev.data||typeof ev.data!=='object'||ev.data.type!=='KWB_ACCESS_RESPONSE'||ev.data.id!==id)return;
      finish(resolve,ev.data.result||{ok:false,code:'INVALID_RESPONSE'});
    };
    window.addEventListener('message',onMessage);
    const timer=setTimeout(()=>finish(reject,new Error('CLASS_API_TIMEOUT')),20000);
    document.body.appendChild(frame);document.body.appendChild(form);
    try{form.submit();form.remove();}catch(err){finish(reject,err);}
  });
}

function authPayload(){
  const access=getStoredAccess();
  if(!access?.sessionToken||!access?.licenseId) throw new Error('NO_TEACHER_SESSION');
  return {sessionToken:access.sessionToken,deviceId:getDeviceId()};
}

export function teacherId(){return clean(getStoredAccess()?.licenseId);}
export function getClassContext(){
  try{const access=getStoredAccess(),x=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');return x&&x.teacherId===teacherId()&&x.sessionToken===clean(access?.sessionToken)?x:null;}catch{return null;}
}
export function setClassContext(value){const access=getStoredAccess();const next={teacherId:teacherId(),sessionToken:clean(access?.sessionToken),...value};sessionStorage.setItem(SESSION_KEY,JSON.stringify(next));return next;}
export function clearClassContext(){sessionStorage.removeItem(SESSION_KEY);}
export async function listClasses(){return callApi('listClasses',authPayload());}
export async function saveClass(className,classId=''){return callApi('saveClass',{...authPayload(),className:clean(className),classId:clean(classId)});}
