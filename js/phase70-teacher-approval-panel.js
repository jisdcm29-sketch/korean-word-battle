/* Phase70 optional teacher panel. STAGING ONLY; never auto-enable on production. */
import { getStoredAccess, getDeviceId } from './access-control.js?v=1.6';
import { phoneEntryRequest } from './phase68-phone-entry-api.js?v=1';
export function mountPhase70ApprovalPanel({pin,container}){
  if(!container||!/^\d{6}$/.test(String(pin)))return ()=>{};
  const root=document.createElement('section');
  root.id='kga71TeacherApproval';
  root.style.cssText='margin:12px 0;padding:12px;border:1px solid #91a9c5;border-radius:12px;background:#fff;color:#123';
  const title=document.createElement('strong');title.textContent='등록 학생 입장 승인 (테스트 전용)';root.append(title);
  const status=document.createElement('p');status.textContent='승인 서버 미배포 시 목록을 불러올 수 없습니다.';root.append(status);
  const list=document.createElement('div');root.append(list);container.append(root);
  let active=true;
  const auth=()=>{const a=getStoredAccess();if(!a?.sessionToken)throw new Error('교사 로그인 필요');return {sessionToken:a.sessionToken,deviceId:getDeviceId(),pin:String(pin)};};
  const request=async(action,extra={})=>phoneEntryRequest(action,{...auth(),...extra});
  async function reload(){
    try{
      const res=await request('kga70ListRequests');if(!active)return;
      if(!res?.ok)throw new Error(res?.code||'조회 실패');
      list.replaceChildren();status.textContent=`승인 대기 ${res.requests?.length||0}건`;
      for(const rec of res.requests||[]){
        const row=document.createElement('div');row.style.margin='8px 0';
        const label=document.createElement('span');label.textContent='입장 요청 (전화번호 비공개) ';
        row.append(label);
        for(const [decision,text] of [['APPROVE','승인'],['REJECT','거부']]){
          const button=document.createElement('button');button.type='button';button.textContent=text;button.style.marginRight='8px';
          button.onclick=async()=>{
            if(!confirm('교실 내 실제 참가자를 별도로 확인했습니까?'))return;
            button.disabled=true;
            try{const r=await request('kga67TeacherReview',{requestId:rec.requestId,decision});if(!r?.ok)throw new Error(r?.code||'처리 실패');await reload();}
            catch(e){status.textContent=`승인 처리 실패: ${e.message}`;button.disabled=false;}
          };row.append(button);
        }list.append(row);
      }
    }catch(e){if(active)status.textContent=`승인 서버 연결 전 또는 오류: ${e.message}`;}
  }
  const button=document.createElement('button');button.type='button';button.textContent='입장 요청 새로고침';button.onclick=reload;root.append(button);
  // No automatic polling, no calls until the teacher presses refresh.
  return ()=>{active=false;root.remove()};
}
