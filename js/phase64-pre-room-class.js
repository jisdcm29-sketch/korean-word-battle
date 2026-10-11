/* Phase64: PRE-ROOM class selection, localhost opt-in ONLY.
   This is not student identity verification or a server-side PIN binding.
   No student phone numbers, StudentIDs, server writes or Firebase changes. */
import { listClasses, setClassContext, getClassContext } from './class-manager.js?v=1.1';
export function phase64IsEnabled(){
  return ['localhost','127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('phase64')==='1';
}
export async function phase64SelectClass(){
  if(!phase64IsEnabled())return null;
  let response;
  try{response=await listClasses();}catch(_){alert('반 목록을 조회할 수 없습니다. 교사 로그인을 확인하세요.');return null;}
  if(!response?.ok||!Array.isArray(response.classes)){alert('교사 인증 또는 반 목록 조회에 실패했습니다.');return null;}
  const seen=new Set();
  const classes=response.classes.map(c=>({classId:String(c?.classId||'').trim(),className:String(c?.className||'').trim()}))
    .filter(c=>{if(!c.classId||!c.className||seen.has(c.classId))return false;seen.add(c.classId);return true;});
  if(!classes.length){alert('등록된 반이 없습니다. 교사 반 관리에서 먼저 반을 설정하세요.');return null;}
  const overlay=document.createElement('div');overlay.id='kga64-class-modal';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','게임 시작 전 반 선택');
  overlay.style.cssText='position:fixed;inset:0;z-index:999999;background:#001a39d9;display:flex;justify-content:center;align-items:center;padding:16px';
  const panel=document.createElement('section');panel.style.cssText='box-sizing:border-box;background:white;color:#173358;padding:24px;border-radius:16px;max-width:460px;width:100%;box-shadow:0 14px 40px #0005;font:16px/1.5 sans-serif';
  const title=document.createElement('h2');title.textContent='테스트: 게임 시작 전 반 선택';title.style.margin='0 0 12px';
  const explanation=document.createElement('p');explanation.textContent='교사 인증으로 반 목록을 조회했습니다. 선택한 반은 이 브라우저의 로컬 세션에만 저장되며, 서버의 PIN 연결/전화번호 인증은 아직 활성화되지 않습니다.';
  const select=document.createElement('select');select.setAttribute('aria-label','수업 반');select.style.cssText='width:100%;padding:12px;font-size:16px;margin:10px 0';
  const empty=document.createElement('option');empty.value='';empty.textContent='반을 선택하세요';select.appendChild(empty);
  for(const c of classes){const o=document.createElement('option');o.value=c.classId;o.textContent=c.className;select.appendChild(o);}
  const current=getClassContext();if(classes.some(c=>c.classId===current?.classId))select.value=current.classId;
  const status=document.createElement('p');status.setAttribute('role','status');status.style.color='#9b2530';
  const controls=document.createElement('div');controls.style.cssText='display:flex;gap:12px;justify-content:flex-end';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='취소';cancel.style.cssText='padding:10px 18px';
  const confirm=document.createElement('button');confirm.type='button';confirm.textContent='이 반으로 테스트 시작';confirm.style.cssText='padding:10px 18px;background:#175dc4;color:white;border:0;border-radius:7px';
  controls.append(cancel,confirm);panel.append(title,explanation,select,status,controls);overlay.append(panel);document.body.append(overlay);select.focus();
  return await new Promise(resolve=>{
    const done=value=>{overlay.remove();resolve(value);};
    cancel.onclick=()=>done(null);
    confirm.onclick=()=>{const chosen=classes.find(c=>c.classId===select.value);if(!chosen){status.textContent='반을 먼저 선택하세요.';return;}
      setClassContext({mode:'CLASS',classId:chosen.classId,className:chosen.className});done(chosen);
    };
  });
}
