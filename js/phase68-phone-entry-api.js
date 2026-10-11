// Phase68: opt-in staging API client. Never store phone or claimSecret persistently.
import { ACCESS_API_URL } from './access-config.js?v=1.3';
let seq=0;
const ready=()=>/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/i.test(String(ACCESS_API_URL||''));
export function phoneEntryAvailable(){
  return ['localhost','127.0.0.1'].includes(location.hostname) && ready() && (new URLSearchParams(location.search).get('phase68')==='1' || (new URLSearchParams(location.search).get('phase71')==='1' && location.pathname.endsWith('/word-battle.html')));
}
export function phoneEntryRequest(action,payload){
 if(!phoneEntryAvailable())return Promise.reject(new Error('STAGING_NOT_AVAILABLE'));
 const id='kga68-'+Date.now()+'-'+(++seq)+'-'+Math.random().toString(36).slice(2);
 const frame=document.createElement('iframe');frame.name='kga68_'+id.replace(/[^a-zA-Z0-9_]/g,'_');frame.setAttribute('aria-hidden','true');frame.title='학생 입장 응답';frame.style.cssText='position:absolute;width:1px;height:1px;left:-9999px;opacity:0;pointer-events:none';
 const form=document.createElement('form');form.style.display='none';form.method='POST';form.target=frame.name;form.action=ACCESS_API_URL;
 const add=(k,v)=>{const el=document.createElement('input');el.type='hidden';el.name=k;el.value=v;form.appendChild(el)};
 add('requestId',id);add('parentOrigin',location.origin);add('payload',JSON.stringify({action,...payload}));
 return new Promise((resolve,reject)=>{
  let done=false;
  const clear=()=>{window.removeEventListener('message',receive);form.remove();frame.remove();clearTimeout(timeout)};
  const finish=(cb,v)=>{if(done)return;done=true;clear();cb(v)};
  const receive=(event)=>{if(!/^https:\/\/(?:script\.google\.com|(?:[a-zA-Z0-9.-]+\.)?googleusercontent\.com)$/.test(event.origin))return;
   if(event.data?.type!=='KWB_ACCESS_RESPONSE'||event.data?.id!==id)return;finish(resolve,event.data.result||{ok:false,code:'EMPTY_RESPONSE'});};
  const timeout=setTimeout(()=>finish(reject,new Error('REQUEST_TIMEOUT')),18000);
  window.addEventListener('message',receive);document.body.append(frame,form);try{form.submit();}catch(error){finish(reject,error)}
 });
}
