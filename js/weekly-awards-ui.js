import { getClassContext } from './class-manager.js?v=1.0';
import { getWeeklyAwardState, finalizeWeeklyAwards, drawWeeklyLucky, drawWeeklyConsolation, createWeeklyTestData, clearWeeklyTestData } from './student-registry.js?v=1.6';

let overlay=null;
let currentState=null;
let consolationEnabled=false;
const LOCAL_DEV_HOSTS=new Set(['localhost','127.0.0.1','::1']);
function localDevMode(){return LOCAL_DEV_HOSTS.has(String(location.hostname||'').toLowerCase());}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function ensureOverlay(){
  if(overlay)return overlay;
  overlay=document.createElement('div');
  overlay.className='weekly-award-backdrop hidden';
  overlay.innerHTML=`<section class="weekly-award-modal" role="dialog" aria-modal="true" aria-labelledby="weeklyAwardTitle">
    <div class="weekly-award-head"><div><h2 id="weeklyAwardTitle">주간 시상</h2><p id="weeklyAwardClass"></p></div><button type="button" class="weekly-award-close">닫기</button></div>
    <div id="weeklyAwardMeta" class="weekly-award-meta"></div>
    <div id="weeklyAwardBody" class="weekly-award-body"><div class="weekly-award-empty">불러오는 중…</div></div>
  </section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.weekly-award-close').addEventListener('click',closeAwards);
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeAwards();});
  return overlay;
}
function closeAwards(){overlay?.classList.add('hidden');}
function topEntry(state,type,index){
  const saved=state?.awards?.[type];
  if(saved)return {rank:index+1,studentName:saved.studentName,weeklyPointTotal:saved.weeklyTotal,saved:true};
  return state?.ranking?.[index]||null;
}
function rankCard(x,index){
  const labels=['🥇','🥈','🥉'];
  if(!x)return `<div class="weekly-award-rank rank${index+1}"><strong>${labels[index]}</strong><b>-</b><small>-</small></div>`;
  return `<div class="weekly-award-rank rank${index+1}"><strong>${labels[index]}</strong><b>${esc(x.studentName)}</b><small>${Number(x.weeklyPointTotal||0).toLocaleString()}점</small></div>`;
}
function winnerBox(label,a){
  return `<div class="weekly-award-winner"><b>${esc(a.studentName||'-')}</b><span>${label}</span></div>`;
}
function render(state){
  currentState=state;
  const meta=overlay.querySelector('#weeklyAwardMeta'),body=overlay.querySelector('#weeklyAwardBody');
  const pending=Number(state?.pendingCount)||0;
  meta.innerHTML=`<span>${esc(state?.weekId||'')}</span>${pending?`<b>이름 확인 ${pending}건</b>`:''}`;
  const ranking=Array.isArray(state?.ranking)?state.ranking:[];
  if(localDevMode()&&Number(state?.testDataCount)>0){
    meta.innerHTML+=`<b class="weekly-test-badge">TEST ${Number(state.testDataCount)}건</b><button type="button" class="weekly-test-clear">테스트 삭제</button>`;
    meta.querySelector('.weekly-test-clear')?.addEventListener('click',clearDevData);
  }
  if(!ranking.length&&!state?.finalized){
    let empty='<div class="weekly-award-empty">이번 주 저장 결과가 없습니다.</div>';
    if(localDevMode()) empty+=`<div class="weekly-award-dev"><button type="button" class="weekly-award-dev-create">개발 테스트 데이터 만들기</button><small>현재 반 학생으로 이번 주 테스트 결과를 만듭니다.</small></div>`;
    body.innerHTML=empty;
    body.querySelector('.weekly-award-dev-create')?.addEventListener('click',createDevData);
    return;
  }
  const first=topEntry(state,'FIRST',0),second=topEntry(state,'SECOND',1),third=topEntry(state,'THIRD',2);
  let html=`<div class="weekly-award-podium">${rankCard(first,0)}${rankCard(second,1)}${rankCard(third,2)}</div>`;
  if(!state.finalized){
    html+=`<button type="button" class="weekly-award-finalize" ${pending||!ranking.length?'disabled':''}>1·2·3위 확정</button>`;
    if(pending)html+=`<p class="weekly-award-note warn">이름 확인 ${pending}건을 먼저 처리해 주세요.</p>`;
    else html+=`<p class="weekly-award-note">이번 주 마지막 게임까지 저장한 뒤 확정하세요.</p>`;
    body.innerHTML=html;
    body.querySelector('.weekly-award-finalize')?.addEventListener('click',finalizeTop3);
    return;
  }
  const lucky=state.awards?.LUCKY;
  html+=`<section class="weekly-award-section"><div class="weekly-award-section-head"><strong>🍀 주간 행운상</strong><small>후보 ${Number(state.luckyCandidateCount)||0}명</small></div>`;
  if(lucky)html+=winnerBox('주간 행운상',lucky);
  else if(Number(state.luckyCandidateCount)>0)html+=`<div class="weekly-award-actions"><button type="button" class="weekly-award-action gold" data-award-action="lucky">행운상 뽑기</button></div>`;
  else html+=`<p class="weekly-award-note">후보 없음</p>`;
  html+=`</section>`;

  const consolation=state.awards?.CONSOLATION;
  if(consolation)consolationEnabled=true;
  html+=`<section class="weekly-award-section"><div class="weekly-award-section-head"><label class="weekly-consolation-toggle"><input id="weeklyConsolationToggle" type="checkbox" ${consolationEnabled?'checked':''}> 🎁 아차상</label><small>후보 ${Number(state.consolationCandidateCount)||0}명</small></div>`;
  if(consolation)html+=winnerBox('아차상',consolation);
  else if(consolationEnabled){
    const disabled=state.luckyRequiredBeforeConsolation||Number(state.consolationCandidateCount)<1;
    html+=`<div class="weekly-award-actions"><button type="button" class="weekly-award-action" data-award-action="consolation" ${disabled?'disabled':''}>아차상 뽑기</button></div>`;
    if(state.luckyRequiredBeforeConsolation)html+=`<p class="weekly-award-note">주간 행운상을 먼저 뽑아 주세요.</p>`;
    else if(Number(state.consolationCandidateCount)<1)html+=`<p class="weekly-award-note">후보 없음</p>`;
  }
  html+=`</section>`;
  body.innerHTML=html;
  body.querySelector('#weeklyConsolationToggle')?.addEventListener('change',e=>{consolationEnabled=!!e.target.checked;render(currentState);});
  body.querySelector('[data-award-action="lucky"]')?.addEventListener('click',drawLucky);
  body.querySelector('[data-award-action="consolation"]')?.addEventListener('click',drawConsolation);
}
async function reload(){
  const ctx=getClassContext();
  if(!ctx||ctx.mode!=='CLASS'||!ctx.classId)return;
  overlay.querySelector('#weeklyAwardBody').innerHTML='<div class="weekly-award-empty">불러오는 중…</div>';
  try{const r=await getWeeklyAwardState(ctx.classId);if(!r?.ok)throw new Error(r?.message||'주간 시상을 불러오지 못했습니다.');render(r);}catch(err){console.error('[KWB weekly award]',err);overlay.querySelector('#weeklyAwardBody').innerHTML=`<div class="weekly-award-empty error">${esc(err?.message||'주간 시상을 불러오지 못했습니다.')}</div>`;}
}
async function openAwards(){
  const ctx=getClassContext();if(!ctx||ctx.mode!=='CLASS'||!ctx.classId)return;
  ensureOverlay();overlay.classList.remove('hidden');overlay.querySelector('#weeklyAwardClass').textContent=ctx.className||ctx.classId;consolationEnabled=false;await reload();
}
async function finalizeTop3(){
  const ctx=getClassContext();if(!ctx)return;
  if(!confirm('이번 주 1·2·3위를 확정할까요?'))return;
  try{const r=await finalizeWeeklyAwards(ctx.classId,currentState?.weekId||'');if(!r?.ok)throw new Error(r?.message||'주간 순위를 확정하지 못했습니다.');render(r);}catch(err){alert(err?.message||'주간 순위를 확정하지 못했습니다.');}
}
async function drawLucky(){
  const ctx=getClassContext();if(!ctx)return;
  if(!confirm('주간 행운상은 한 번만 뽑습니다. 진행할까요?'))return;
  try{const r=await drawWeeklyLucky(ctx.classId,currentState?.weekId||'');if(!r?.ok)throw new Error(r?.message||'행운상을 뽑지 못했습니다.');render(r);}catch(err){alert(err?.message||'행운상을 뽑지 못했습니다.');}
}
async function drawConsolation(){
  const ctx=getClassContext();if(!ctx)return;
  if(!confirm('아차상은 한 번만 뽑습니다. 진행할까요?'))return;
  try{const r=await drawWeeklyConsolation(ctx.classId,currentState?.weekId||'');if(!r?.ok)throw new Error(r?.message||'아차상을 뽑지 못했습니다.');render(r);}catch(err){alert(err?.message||'아차상을 뽑지 못했습니다.');}
}

async function createDevData(){
  const ctx=getClassContext();if(!ctx)return;
  if(!confirm('현재 반의 실제 학생 명단을 이용해 이번 주 개발 테스트 결과를 만들까요?\n\n실제 저장 결과가 있는 주에는 생성되지 않습니다.'))return;
  try{
    const r=await createWeeklyTestData(ctx.classId);
    if(!r?.ok)throw new Error(r?.message||'테스트 데이터를 만들지 못했습니다.');
    await reload();
  }catch(err){alert(err?.message||'테스트 데이터를 만들지 못했습니다.');}
}
async function clearDevData(){
  const ctx=getClassContext();if(!ctx)return;
  if(!confirm('이 반의 이번 주 개발 테스트 결과와 테스트로 만든 주간 시상을 삭제할까요?'))return;
  try{
    const r=await clearWeeklyTestData(ctx.classId,currentState?.weekId||'');
    if(!r?.ok)throw new Error(r?.message||'테스트 데이터를 삭제하지 못했습니다.');
    consolationEnabled=false;
    await reload();
  }catch(err){alert(err?.message||'테스트 데이터를 삭제하지 못했습니다.');}
}

function syncButtons(){const ctx=getClassContext(),show=!!(ctx&&ctx.mode==='CLASS'&&ctx.classId);document.querySelectorAll('.weekly-award-btn').forEach(btn=>{btn.hidden=!show;});}
document.querySelectorAll('.weekly-award-btn').forEach(btn=>btn.addEventListener('click',openAwards));
window.addEventListener('pageshow',syncButtons);setInterval(syncButtons,1000);syncButtons();
