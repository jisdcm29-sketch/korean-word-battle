import { loginTeacher, validateTeacherAccess, clearTeacherAccess, isAccessApiConfigured } from './access-control.js?v=1.6';

const $=id=>document.getElementById(id);
const form=$('accessForm'),auth=$('authCode'),permit=$('permitCode'),submit=$('accessSubmit'),message=$('accessMessage'),setup=$('setupWarning');

function safeTarget(){
  const next=new URLSearchParams(location.search).get('next')||'';
  if(next && !next.includes('://') && !next.startsWith('//') && /^[A-Za-z0-9_./?=&%#-]+$/.test(next)) return next;
  return 'arena.html';
}
function msg(text,type='info'){message.textContent=text;message.dataset.type=type;}
function go(){location.replace(safeTarget());}

if(!isAccessApiConfigured()){
  setup.classList.remove('hidden');
  submit.disabled=true;
  msg('관리자 설정이 아직 완료되지 않았습니다.','error');
}else{
  const existing=await validateTeacherAccess({force:true});
  if(existing.ok){msg(`${existing.access.teacherName||'교사'}님, 인증된 사용권을 확인했습니다. 이동합니다.`,'success');setTimeout(go,450);}
}

form.addEventListener('submit',async e=>{
  e.preventDefault();
  submit.disabled=true;auth.disabled=true;permit.disabled=true;msg('사용 권한을 확인하고 있습니다…');
  try{
    const r=await loginTeacher({authCode:auth.value,permitCode:permit.value});
    if(!r.ok){msg(r.message||'인증번호 또는 허가번호, 사용 기간을 확인해 주세요.','error');return;}
    msg(`${r.teacherName||'교사'}님 인증 완료 · 허가 기간 안에서 사용할 수 있습니다.`,'success');
    setTimeout(go,650);
  }catch(err){
    const code=String(err?.message||'');
    const detail=code==='ACCESS_API_NOT_CONFIGURED'?'관리자 설정이 필요합니다.':code==='ACCESS_POST_TIMEOUT'?'인증 서버는 호출되었지만 브라우저가 응답을 받지 못했습니다. Apps Script가 최신 버전(1.8.2)으로 배포되었는지 확인해 주세요.':'인증 서버에 연결하지 못했습니다. Apps Script 배포 상태를 확인해 주세요.';
    console.error('[KWB access]',err);
    msg(detail,'error');
  }finally{
    submit.disabled=false;auth.disabled=false;permit.disabled=false;
  }
});

$('clearAccessBtn').addEventListener('click',()=>{clearTeacherAccess();auth.value='';permit.value='';msg('저장된 인증 정보를 지웠습니다.');auth.focus();});
