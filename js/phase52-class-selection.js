/* Localhost-only Phase52: choose authenticated teacher class after a completed game.
   The only network calls are read-only listClasses and local loopback receiver.
   No saveDailyResults calls; no changes to teacher/students on Google Sheets. */
import { listClasses, getClassContext, setClassContext } from './class-manager.js?v=1.1';
import { phase51AfterFinish } from './phase51-finish-loopback.js?v=1';

const clean=x=>String(x??'').trim();
export function phase52ValidClasses(response){
  if(!response?.ok||!Array.isArray(response.classes))return [];
  const seen=new Set();
  return response.classes.filter(c=>{
    const id=clean(c?.classId), name=clean(c?.className);
    if(!id||!name||seen.has(id))return false;
    seen.add(id);return true;
  }).map(c=>({classId:clean(c.classId),className:clean(c.className)}));
}
export async function phase52HandleNoClass(room, result, options={}){
  if(options.hostname!=='localhost'&&options.hostname!=='127.0.0.1')return false;
  if(room?.status!=='finished'||result?.code!=='NO_CLASS')return false;
  const parent=document.getElementById('finalArea');
  if(!parent)return false;
  if(document.getElementById('kga52-class-panel'))return true;
  const panel=document.createElement('div');panel.id='kga52-class-panel';
  Object.assign(panel.style,{margin:'16px auto',padding:'14px',border:'1px solid #bdd1e9',borderRadius:'12px',background:'#eff6ff',color:'#173358',maxWidth:'480px',font:'14px/1.5 sans-serif'});
  const title=document.createElement('div');title.textContent='로컬 성적 전송 테스트 — 반 선택 필요';title.style.fontWeight='bold';panel.appendChild(title);
  const description=document.createElement('p');description.textContent='게임과 시상식은 정상 완료되었습니다. 학생 성적을 로컬 수신 서버에 보내려면 실제 등록된 반을 선택하세요. 운영 성적 저장은 하지 않습니다.';panel.appendChild(description);
  const button=document.createElement('button');button.type='button';button.textContent='내 반 목록 불러오기';button.style.cssText='padding:8px 14px;cursor:pointer;';panel.appendChild(button);
  const status=document.createElement('div');status.style.marginTop='8px';status.setAttribute('role','status');panel.appendChild(status);
  parent.appendChild(panel);
  button.addEventListener('click',async()=>{
    button.disabled=true;status.textContent='교사에게 등록된 반 목록을 조회하고 있습니다…';
    try{
      const response=await listClasses();
      const classes=phase52ValidClasses(response);
      if(!response?.ok){status.textContent='반 조회 실패: 인증 상태 또는 서버 연결을 확인해 주세요.';return;}
      if(!classes.length){status.textContent='등록된 반이 없습니다. 성적 전송을 보류합니다. 교사 반 관리 화면에서 반을 등록한 뒤 다시 시도하세요.';return;}
      const selector=document.createElement('select');selector.style.cssText='padding:8px;max-width:100%;margin-right:8px;';
      const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='반을 선택하세요';selector.appendChild(placeholder);
      for(const c of classes){const item=document.createElement('option');item.value=c.classId;item.textContent=c.className;selector.appendChild(item);}
      const send=document.createElement('button');send.type='button';send.textContent='선택한 반으로 로컬 전송';send.style.cssText='padding:8px 12px;cursor:pointer;';
      panel.appendChild(selector);panel.appendChild(send);button.remove();status.textContent='교사가 직접 선택한 반만 사용합니다.';
      send.addEventListener('click',async()=>{
        const selected=classes.find(c=>c.classId===selector.value);if(!selected){status.textContent='반을 먼저 선택하세요.';return;}
        send.disabled=true;selector.disabled=true;status.textContent='로컬 수신 서버에 전송하는 중…';
        try{
          setClassContext({mode:'CLASS',classId:selected.classId,className:selected.className});
          const result=await phase51AfterFinish(room,getClassContext(),{hostname:location.hostname});
          console.info('[KGA52 CLASS LOOPBACK]',result.code||'UNKNOWN',result.ok===true);
          status.textContent=result.ok?'로컬 서버 전송 성공 (Google 시트 기록 없음)':`로컬 전송 보류: ${clean(result.code)||'UNKNOWN'}`;
        }catch(_){status.textContent='로컬 전송 오류 — 시상식에는 영향이 없습니다.';}
        finally{send.disabled=false;selector.disabled=false;}
      });
    }catch(_){status.textContent='반 목록을 조회하지 못했습니다. 서버 인증 상태를 확인해 주세요.';}
    finally{button.disabled=false;}
  });
  return true;
}
