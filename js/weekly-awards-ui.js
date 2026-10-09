import { getClassContext } from './class-manager.js?v=1.0';
import { getWeeklyAwardState, finalizeWeeklyAwards, drawWeeklyLucky, drawWeeklyConsolation, createWeeklyTestData, clearWeeklyTestData } from './student-registry.js?v=1.7';
import { GameAudioEngine } from './audio-engine.js?v=1.6';

let overlay=null;
let currentState=null;
let drawTimer=null;
let spinning=false;
let phase='MAIN_READY';
const audio=new GameAudioEngine();
const LOCAL_DEV_HOSTS=new Set(['localhost','127.0.0.1','::1']);

function localDevMode(){return LOCAL_DEV_HOSTS.has(String(location.hostname||'').toLowerCase());}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function localDateText(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;}
function selectedEndDate(){return overlay?.querySelector('#weeklyAwardEndDate')?.value||localDateText();}
function stopSpin(){if(drawTimer){clearTimeout(drawTimer);drawTimer=null;}spinning=false;}
function showCeremonyError(message){const body=overlay?.querySelector('#weeklyAwardBody');if(!body)return;const note=document.createElement('div');note.className='weekly-award-note warn';note.style.cssText='margin-top:14px;text-align:center;font-size:18px;font-weight:1000';note.textContent=String(message||'시상 처리를 완료하지 못했습니다.');body.appendChild(note);}
function awardName(type){return type==='FIRST'?'🥇 주간 1위':type==='SECOND'?'🥈 주간 2위':type==='THIRD'?'🥉 주간 3위':type==='LUCKY'?'🍀 주간 행운상':'🎁 아차상';}
function closeAwards(){stopSpin();audio.stopCeremonyMusic({reset:true});overlay?.classList.add('hidden');}

function ensureOverlay(){
  if(overlay)return overlay;
  overlay=document.createElement('div');
  overlay.className='weekly-award-backdrop hidden weekly-ceremony-v8';
  overlay.innerHTML=`<section class="weekly-award-modal weekly-ceremony-modal" role="dialog" aria-modal="true" aria-labelledby="weeklyAwardTitle">
    <div class="weekly-award-head">
      <div><h2 id="weeklyAwardTitle">주간 시상식</h2><p id="weeklyAwardClass"></p></div>
      <button type="button" class="weekly-award-close">닫기</button>
    </div>
    <div class="weekly-ceremony-toolbar">
      <label>시상 기준일 <input id="weeklyAwardEndDate" type="date"></label>
      <button id="weeklyCeremonyLoad" type="button">결과 불러오기</button>
      <button id="weeklyCeremonyMute" type="button">🔊 음악</button>
      <button id="weeklyCeremonyFullscreen" type="button">⛶ 전체 화면</button>
    </div>
    <div id="weeklyAwardMeta" class="weekly-award-meta"></div>
    <div id="weeklyAwardBody" class="weekly-award-body"><div class="weekly-award-empty">불러오는 중…</div></div>
  </section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#weeklyAwardEndDate').value=localDateText();
  overlay.querySelector('.weekly-award-close').addEventListener('click',closeAwards);
  overlay.querySelector('#weeklyCeremonyLoad').addEventListener('click',()=>reload(true));
  overlay.querySelector('#weeklyCeremonyMute').addEventListener('click',e=>{
    audio.bgmEnabled=!audio.bgmEnabled;
    audio.setSettings({bgmEnabled:audio.bgmEnabled});
    e.currentTarget.textContent=audio.bgmEnabled?'🔊 음악':'🔇 음소거';
  });
  const fullscreenBtn=overlay.querySelector('#weeklyCeremonyFullscreen');
  const syncFullscreenButton=()=>{fullscreenBtn.textContent=document.fullscreenElement?'⛶ 전체 화면 종료':'⛶ 전체 화면';};
  fullscreenBtn.addEventListener('click',async()=>{
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    }catch(err){
      console.warn('[KWB weekly award fullscreen]',err);
      alert('브라우저에서 전체 화면을 시작하지 못했습니다.');
    }
    syncFullscreenButton();
  });
  document.addEventListener('fullscreenchange',syncFullscreenButton);
  return overlay;
}

function candidateCards(items,{showEligibility=false}={}){
  const xs=Array.isArray(items)?items:[];
  if(!xs.length)return '<div class="weekly-v8-empty">후보가 없습니다.</div>';
  return `<div class="weekly-v8-candidate-grid">${xs.map(x=>`<div class="weekly-v8-candidate ${showEligibility&&x.presentOnAwardDay===false?'excluded':''}"><strong>${esc(x.studentName)}</strong>${showEligibility&&x.presentOnAwardDay===false?'<small>당일 미참여 · 선발 제외</small>':''}</div>`).join('')}</div>`;
}

function top3Result(state){
  const a=state?.awards||{};
  return `<div class="weekly-v8-top3-results">
    ${['FIRST','SECOND','THIRD'].map((type,i)=>`<div class="weekly-v8-rank rank${i+1}"><span>${awardName(type)}</span><strong>${esc(a[type]?.studentName||'-')}</strong><small>${Number(a[type]?.weeklyTotal||0).toLocaleString()}점</small></div>`).join('')}
  </div>`;
}

function singleWinner(type,a){
  return `<div class="weekly-v8-single-winner ${type.toLowerCase()}"><span>${awardName(type)}</span><strong>${esc(a?.studentName||'-')}</strong></div>`;
}

function phaseForState(state){
  if(!state?.finalized)return 'MAIN_READY';
  // Today's lucky award is handled independently by the game result ceremony.
  if(!state?.awards?.CONSOLATION)return 'MAIN_RESULT';
  return 'CONSOLATION_RESULT';
}

function render(state,{keepPhase=false}={}){
  currentState=state;
  stopSpin();
  if(!keepPhase)phase=phaseForState(state);
  const meta=overlay.querySelector('#weeklyAwardMeta');
  const body=overlay.querySelector('#weeklyAwardBody');
  const pending=Number(state?.pendingCount)||0;
  const absent=Number(state?.absentRankedCount)||0;
  meta.innerHTML=`<span>${esc(state?.weekId||'')} · ${esc(state?.endDate||'')}</span><span>시상일 참여 ${Number(state?.presentRankedCount)||0}명</span>${absent?`<b>당일 미참여 ${absent}명</b>`:''}${pending?`<b>이름 확인 ${pending}건</b>`:''}`;
  const ranking=Array.isArray(state?.ranking)?state.ranking:[];
  if(!ranking.length&&!state?.finalized){
    let empty='<div class="weekly-award-empty">선택한 기준일까지 저장된 결과가 없습니다.</div>';
    if(localDevMode())empty+=`<div class="weekly-award-dev"><button type="button" class="weekly-award-dev-create">개발 테스트 데이터 만들기</button><small>현재 반 학생으로 선택한 시상 기준일까지 테스트 결과를 만듭니다.</small></div>`;
    body.innerHTML=empty;
    body.querySelector('.weekly-award-dev-create')?.addEventListener('click',createDevData);
    return;
  }
  body.innerHTML=renderPhase(state,pending);
  bindPhaseButtons();
}

function renderPhase(state,pending){
  if(phase==='MAIN_READY'){
    const disabled=pending||Number(state.mainEligibleCandidateCount)<3;
    return `<section class="weekly-v8-stage weekly-v8-home">
      <div class="weekly-v8-center-copy"><div class="weekly-v8-kicker">WEEKLY AWARDS</div><h3>주간 1·2·3위 시상</h3><p>먼저 후보를 공개한 뒤 1·2·3위를 한 번에 발표합니다.</p></div>
      <button class="weekly-v8-primary" data-v8-action="show-main" ${disabled?'disabled':''}>🏆 1·2·3위 후보 보기</button>
      ${pending?`<p class="weekly-award-note warn">이름 확인 ${pending}건을 먼저 처리해 주세요.</p>`:''}
    </section>`;
  }
  if(phase==='MAIN_CANDIDATES'){
    return `<section class="weekly-v8-stage">
      <div class="weekly-v8-title"><span>🏆</span><div><h3>주간 1·2·3위 후보</h3><p>기간 내 일일 1·2·3위 경험자 · 순위는 숨김 · 당일 미참여자는 선발 제외</p></div></div>
      ${candidateCards(state.mainCandidates,{showEligibility:true})}
      <button class="weekly-v8-primary" data-v8-action="draw-main">🎯 1·2·3위 추첨</button>
    </section>`;
  }
  if(phase==='MAIN_DRAW'){
    return `<section class="weekly-v8-stage weekly-v8-draw-stage">
      <div class="weekly-v8-draw-title">🏆 주간 1·2·3위 발표</div>
      <div class="weekly-v8-top3-results spinning" id="weeklyV8MainSpin">
        ${['FIRST','SECOND','THIRD'].map((type,i)=>`<div class="weekly-v8-rank rank${i+1}" data-v8-main="${type}"><span>${awardName(type)}</span><strong></strong><small></small></div>`).join('')}
      </div>
    </section>`;
  }
  if(phase==='MAIN_RESULT'){
    return `<section class="weekly-v8-stage weekly-v8-result-stage">
      <div class="weekly-v8-draw-title">🎉 주간 1·2·3위</div>
      ${top3Result(state)}
      <button class="weekly-v8-primary next" data-v8-action="show-consolation">🎁 아차상 후보 보기</button>
    </section>`;
  }
  if(phase==='LUCKY_CANDIDATES'){
    return `<section class="weekly-v8-stage">
      <div class="weekly-v8-title"><span>🍀</span><div><h3>주간 행운상 후보</h3><p>1·2·3위를 제외한 시상일 참여 학생 중 추첨합니다.</p></div></div>
      ${candidateCards(state.luckyCandidates)}
      <button class="weekly-v8-primary lucky" data-v8-action="draw-lucky" ${Number(state.luckyCandidateCount)<1?'disabled':''}>🍀 행운상 추첨</button>
    </section>`;
  }
  if(phase==='LUCKY_DRAW'){
    return `<section class="weekly-v8-stage weekly-v8-draw-stage"><div class="weekly-v8-draw-title">🍀 주간 행운상</div><div class="weekly-v8-single-spin" id="weeklyV8SingleSpin"><strong></strong><small></small></div></section>`;
  }
  if(phase==='LUCKY_RESULT'){
    return `<section class="weekly-v8-stage weekly-v8-result-stage">${singleWinner('LUCKY',state.awards?.LUCKY)}<button class="weekly-v8-primary next" data-v8-action="show-consolation">🎁 아차상 후보 보기</button></section>`;
  }
  if(phase==='CONSOLATION_CANDIDATES'){
    return `<section class="weekly-v8-stage">
      <div class="weekly-v8-title"><span>🎁</span><div><h3>아차상 후보</h3><p>앞선 수상자를 제외한 시상일 참여 후보 중 추첨합니다.</p></div></div>
      ${candidateCards(state.consolationCandidates)}
      <button class="weekly-v8-primary consolation" data-v8-action="draw-consolation" ${Number(state.consolationCandidateCount)<1?'disabled':''}>🎁 아차상 추첨</button>
    </section>`;
  }
  if(phase==='CONSOLATION_DRAW'){
    return `<section class="weekly-v8-stage weekly-v8-draw-stage"><div class="weekly-v8-draw-title">🎁 아차상</div><div class="weekly-v8-single-spin" id="weeklyV8SingleSpin"><strong></strong><small></small></div></section>`;
  }
  return `<section class="weekly-v8-stage weekly-v8-result-stage">${singleWinner('CONSOLATION',state.awards?.CONSOLATION)}<div class="weekly-v8-finish">🎉 주간 시상이 모두 끝났습니다.</div></section>`;
}

function bindPhaseButtons(){
  const body=overlay.querySelector('#weeklyAwardBody');
  body.querySelector('[data-v8-action="show-main"]')?.addEventListener('click',()=>{phase='MAIN_CANDIDATES';render(currentState,{keepPhase:true});});
  body.querySelector('[data-v8-action="draw-main"]')?.addEventListener('click',drawTop3);
  body.querySelector('[data-v8-action="show-lucky"]')?.addEventListener('click',()=>{phase='LUCKY_CANDIDATES';render(currentState,{keepPhase:true});});
  body.querySelector('[data-v8-action="draw-lucky"]')?.addEventListener('click',()=>drawSingle('LUCKY'));
  body.querySelector('[data-v8-action="show-consolation"]')?.addEventListener('click',()=>{phase='CONSOLATION_CANDIDATES';render(currentState,{keepPhase:true});});
  body.querySelector('[data-v8-action="draw-consolation"]')?.addEventListener('click',()=>drawSingle('CONSOLATION'));
}

function waitMs(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

async function spinRankSlot(slot,names,finalAward,{duration=3000,label=''}={}){
  if(!slot)return;
  const title=overlay.querySelector('.weekly-v8-draw-title');
  const nameEl=slot.querySelector('strong');
  const subEl=slot.querySelector('small');
  if(title&&label)title.textContent=label;
  nameEl.textContent='';
  subEl.textContent='';
  slot.classList.add('active-spin');
  const started=performance.now();
  let i=0;
  await new Promise(resolve=>{
    const tick=()=>{
      const elapsed=performance.now()-started;
      if(elapsed>=duration){drawTimer=null;resolve();return;}
      nameEl.textContent=names.length?names[i++%names.length]:'';
      subEl.textContent='';
      audio.playLuckyTick(Math.min(.95,elapsed/duration));
      drawTimer=setTimeout(tick,80+Math.round(220*(elapsed/duration)*(elapsed/duration)));
    };
    tick();
  });
  slot.classList.remove('active-spin');
  if(finalAward){
    nameEl.textContent=finalAward.studentName||'-';
    subEl.textContent=`${Number(finalAward.weeklyTotal||0).toLocaleString()}점`;
    slot.classList.add('revealed');
    audio.playLuckyWinner();
  }else{
    nameEl.textContent='';
    subEl.textContent='';
  }
}

async function spinTop3(candidates,resultPromise,{spinMs=3000,betweenMs=2000}={}){
  stopSpin();spinning=true;
  const slots={
    FIRST:overlay.querySelector('[data-v8-main="FIRST"]'),
    SECOND:overlay.querySelector('[data-v8-main="SECOND"]'),
    THIRD:overlay.querySelector('[data-v8-main="THIRD"]')
  };
  const names=(Array.isArray(candidates)?candidates:[]).map(x=>x.studentName).filter(Boolean);
  Object.values(slots).forEach(slot=>{
    if(!slot)return;
    slot.classList.remove('revealed','active-spin');
    slot.querySelector('strong').textContent='';
    slot.querySelector('small').textContent='';
  });

  try{
    // 서버 확정은 뒤에서 동시에 진행하되, 화면은 3위 추첨부터 즉시 시작합니다.
    let settled=false,resultState=null,resultError=null;
    Promise.resolve(resultPromise).then(v=>{settled=true;resultState=v;}).catch(e=>{settled=true;resultError=e;});

    const waitForResult=async()=>{
      while(!settled)await waitMs(60);
      if(resultError)throw resultError;
      return resultState;
    };

    // 3위: 버튼을 누른 즉시 회전합니다. 서버 결과가 3초보다 늦어도
    // 이름을 지우지 않고 계속 회전하다가 결과가 준비되는 순간 바로 공개합니다.
    const thirdSlot=slots.THIRD;
    const thirdName=thirdSlot?.querySelector('strong');
    const thirdSub=thirdSlot?.querySelector('small');
    const title=overlay.querySelector('.weekly-v8-draw-title');
    if(title)title.textContent='🥉 주간 3위 추첨';
    if(thirdSlot){thirdSlot.classList.add('active-spin');thirdName.textContent='';thirdSub.textContent='';}
    const thirdStarted=performance.now();
    let thirdIndex=0;
    const state=await new Promise((resolve,reject)=>{
      const tick=()=>{
        if(resultError){drawTimer=null;reject(resultError);return;}
        const elapsed=performance.now()-thirdStarted;
        if(elapsed>=spinMs&&settled){drawTimer=null;resolve(resultState);return;}
        if(thirdName)thirdName.textContent=names.length?names[thirdIndex++%names.length]:'';
        if(thirdSub)thirdSub.textContent='';
        audio.playLuckyTick(Math.min(.95,elapsed/spinMs));
        drawTimer=setTimeout(tick,80+Math.round(220*Math.min(1,elapsed/spinMs)**2));
      };
      tick();
    });
    if(thirdSlot)thirdSlot.classList.remove('active-spin');
    if(thirdName)thirdName.textContent=state?.awards?.THIRD?.studentName||'-';
    if(thirdSub)thirdSub.textContent=`${Number(state?.awards?.THIRD?.weeklyTotal||0).toLocaleString()}점`;
    if(thirdSlot)thirdSlot.classList.add('revealed');
    audio.playLuckyWinner();

    // 2초 정지 후 2위 추첨
    await waitMs(betweenMs);
    await spinRankSlot(slots.SECOND,names,state?.awards?.SECOND,{duration:spinMs,label:'🥈 주간 2위 추첨'});

    // 2초 정지 후 1위 추첨
    await waitMs(betweenMs);
    await spinRankSlot(slots.FIRST,names,state?.awards?.FIRST,{duration:spinMs,label:'🥇 주간 1위 추첨'});

    const doneTitle=overlay.querySelector('.weekly-v8-draw-title');
    if(doneTitle)doneTitle.textContent='🎉 주간 1·2·3위 발표 완료';
    await waitMs(700);
    spinning=false;
    return state;
  }catch(err){
    stopSpin();spinning=false;throw err;
  }
}

async function spinSingle(candidates,resultPromise,type,{duration=3000}={}){
  stopSpin();spinning=true;
  const holder=overlay.querySelector('#weeklyV8SingleSpin');
  const nameEl=holder.querySelector('strong');
  const subEl=holder.querySelector('small');
  const names=(Array.isArray(candidates)?candidates:[]).map(x=>x.studentName).filter(Boolean);
  nameEl.textContent='';subEl.textContent='';
  let settled=false,resultState=null,resultError=null;
  Promise.resolve(resultPromise).then(v=>{settled=true;resultState=v;}).catch(e=>{settled=true;resultError=e;});
  const started=performance.now();let i=0;
  await new Promise((resolve,reject)=>{
    const tick=()=>{
      if(resultError){drawTimer=null;reject(resultError);return;}
      const elapsed=performance.now()-started;
      if(elapsed>=duration&&settled){drawTimer=null;resolve();return;}
      nameEl.textContent=names.length?names[i++%names.length]:'';
      subEl.textContent='';
      audio.playLuckyTick(Math.min(.95,elapsed/duration));
      drawTimer=setTimeout(tick,80+Math.round(220*Math.min(1,elapsed/duration)**2));
    };
    tick();
  });
  const award=resultState?.awards?.[type];
  nameEl.textContent=award?.studentName||'-';
  subEl.textContent='🎉 축하합니다!';
  audio.playLuckyWinner();
  await waitMs(800);
  spinning=false;
  return resultState;
}

async function reload(resetPhase=false){
  const ctx=getClassContext();if(!ctx||ctx.mode!=='CLASS'||!ctx.classId)return;
  stopSpin();
  overlay.querySelector('#weeklyAwardBody').innerHTML='<div class="weekly-award-empty">불러오는 중…</div>';
  try{
    const r=await getWeeklyAwardState(ctx.classId,'',selectedEndDate());
    if(!r?.ok)throw new Error(r?.message||'주간 시상을 불러오지 못했습니다.');
    if(resetPhase) phase='MAIN_READY';
    render(r,{keepPhase:true});
  }catch(err){console.error('[KWB weekly award]',err);overlay.querySelector('#weeklyAwardBody').innerHTML=`<div class="weekly-award-empty error">${esc(err?.message||'주간 시상을 불러오지 못했습니다.')}</div>`;}
}

async function openAwards(){
  const ctx=getClassContext();if(!ctx||ctx.mode!=='CLASS'||!ctx.classId)return;
  ensureOverlay();
  stopSpin();
  currentState=null;
  phase='MAIN_READY';
  overlay.classList.remove('hidden');
  overlay.querySelector('#weeklyAwardClass').textContent=ctx.className||ctx.classId;
  overlay.querySelector('#weeklyAwardEndDate').value=localDateText();
  overlay.querySelector('#weeklyAwardMeta').innerHTML='';
  overlay.querySelector('#weeklyAwardBody').innerHTML=`<section class="weekly-v8-stage weekly-v8-home"><div class="weekly-v8-center-copy"><div class="weekly-v8-kicker">WEEKLY AWARDS</div><h3>주간 시상식</h3><p>시상 기준일을 선택한 뒤 <b>결과 불러오기</b>를 눌러 주세요.</p></div></section>`;
  await audio.unlock();
  audio.playCeremonyMusic({restart:true});
}

async function drawTop3(){
  if(spinning)return;const ctx=getClassContext();if(!ctx)return;const before=currentState;
  phase='MAIN_DRAW';render(before,{keepPhase:true});
  const eligible=Array.isArray(before?.mainEligibleCandidates)?before.mainEligibleCandidates:[];

  // 서버 확정 작업과 화면 추첨 애니메이션을 동시에 시작합니다.
  const resultPromise=(async()=>{
    const finalized=await finalizeWeeklyAwards(ctx.classId,before?.weekId||'',before?.endDate||selectedEndDate());
    if(!finalized?.ok)throw new Error(finalized?.message||'주간 1·2·3위를 발표하지 못했습니다.');
    let refreshed=await getWeeklyAwardState(ctx.classId,finalized?.weekId||before?.weekId||'',finalized?.endDate||before?.endDate||selectedEndDate());
    if(!refreshed?.ok)refreshed=finalized;
    const fallback={
      FIRST:eligible[0]?{studentId:eligible[0].studentId,studentName:eligible[0].studentName,weeklyTotal:eligible[0].weeklyPointTotal}:null,
      SECOND:eligible[1]?{studentId:eligible[1].studentId,studentName:eligible[1].studentName,weeklyTotal:eligible[1].weeklyPointTotal}:null,
      THIRD:eligible[2]?{studentId:eligible[2].studentId,studentName:eligible[2].studentName,weeklyTotal:eligible[2].weeklyPointTotal}:null
    };
    const awards={...(refreshed?.awards||{})};
    ['FIRST','SECOND','THIRD'].forEach(type=>{if(!awards[type]?.studentName&&fallback[type])awards[type]=fallback[type];});
    return {...refreshed,awards};
  })();

  try{
    const displayState=await spinTop3(eligible,resultPromise,{spinMs:2000,betweenMs:2000});
    currentState=displayState;phase='MAIN_RESULT';render(displayState,{keepPhase:true});
  }catch(err){stopSpin();phase='MAIN_CANDIDATES';render(before,{keepPhase:true});showCeremonyError(err?.message||'주간 1·2·3위를 발표하지 못했습니다.');}
}

async function drawSingle(type){
  if(spinning)return;const ctx=getClassContext();if(!ctx)return;const before=currentState;const isLucky=type==='LUCKY';
  phase=isLucky?'LUCKY_DRAW':'CONSOLATION_DRAW';render(before,{keepPhase:true});
  const candidates=isLucky?before?.luckyCandidates:before?.consolationCandidates;
  const resultPromise=(async()=>{
    const r=isLucky?await drawWeeklyLucky(ctx.classId,before?.weekId||'',before?.endDate||selectedEndDate()):await drawWeeklyConsolation(ctx.classId,before?.weekId||'',before?.endDate||selectedEndDate());
    if(!r?.ok)throw new Error(r?.message||(isLucky?'행운상을 뽑지 못했습니다.':'아차상을 뽑지 못했습니다.'));
    return r;
  })();
  try{
    // 버튼을 누르는 즉시 이름 회전을 시작하고 약 3초 뒤 수상자를 공개합니다.
    const r=await spinSingle(candidates,resultPromise,type,{duration:3000});
    currentState=r;phase=isLucky?'LUCKY_RESULT':'CONSOLATION_RESULT';render(r,{keepPhase:true});
  }catch(err){stopSpin();phase=isLucky?'LUCKY_CANDIDATES':'CONSOLATION_CANDIDATES';render(before,{keepPhase:true});showCeremonyError(err?.message||(isLucky?'행운상을 뽑지 못했습니다.':'아차상을 뽑지 못했습니다.'));}
}

async function createDevData(){
  const ctx=getClassContext();if(!ctx)return;const endDate=selectedEndDate();
  if(!confirm(`현재 반의 실제 학생 명단을 이용해 ${endDate} 기준 개발 테스트 결과를 만들까요?\n\n선택한 주차에 실제 저장 결과가 있으면 생성되지 않습니다.`))return;
  try{const r=await createWeeklyTestData(ctx.classId,'',endDate);if(!r?.ok)throw new Error(r?.message||'테스트 데이터를 만들지 못했습니다.');await reload(true);}catch(err){alert(err?.message||'테스트 데이터를 만들지 못했습니다.');}
}

async function clearDevData(){
  const ctx=getClassContext();if(!ctx)return;
  if(!confirm('이 반의 이번 주 개발 테스트 결과와 테스트로 만든 주간 시상을 삭제할까요?'))return;
  try{const r=await clearWeeklyTestData(ctx.classId,currentState?.weekId||'');if(!r?.ok)throw new Error(r?.message||'테스트 데이터를 삭제하지 못했습니다.');await reload(true);}catch(err){alert(err?.message||'테스트 데이터를 삭제하지 못했습니다.');}
}

function syncButtons(){const ctx=getClassContext(),show=!!(ctx&&ctx.mode==='CLASS'&&ctx.classId);document.querySelectorAll('.weekly-award-btn').forEach(btn=>{btn.hidden=!show;});}
document.querySelectorAll('.weekly-award-btn').forEach(btn=>btn.addEventListener('click',openAwards));
window.addEventListener('pageshow',syncButtons);setInterval(syncButtons,1000);syncButtons();
