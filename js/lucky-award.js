const presentationState = new WeakMap();

const LUCKY_DRAW_SECONDS_KEY='kwb_lucky_draw_seconds_v1';
const LUCKY_DRAW_OPTIONS=[5,7,10,15,20];
const DEFAULT_LUCKY_DRAW_SECONDS=10;

function keyOf(player){
  return String(player?.uid ?? player?.id ?? player?.name ?? '').trim();
}

function esc(value){
  return String(value ?? '').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function ensureStyles(){
  if(document.querySelector('link[data-lucky-award-style]')) return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=new URL('../css/lucky-award.css?v=1.6',import.meta.url).href;
  link.dataset.luckyAwardStyle='1';
  document.head.append(link);
}

function safeStorageGet(){
  try{return localStorage.getItem(LUCKY_DRAW_SECONDS_KEY);}catch{return null;}
}

function safeStorageSet(value){
  try{localStorage.setItem(LUCKY_DRAW_SECONDS_KEY,String(value));}catch{}
}

function normalizeSeconds(value){
  const n=Number(value);
  return LUCKY_DRAW_OPTIONS.includes(n)?n:DEFAULT_LUCKY_DRAW_SECONDS;
}

export function getLuckyDrawSeconds(){
  return normalizeSeconds(safeStorageGet());
}

export function setLuckyDrawSeconds(value){
  const seconds=normalizeSeconds(value);
  safeStorageSet(seconds);
  document.querySelectorAll('[data-lucky-duration-select]').forEach((select)=>{
    if(select.value!==String(seconds))select.value=String(seconds);
  });
  document.querySelectorAll('[data-lucky-duration-value]').forEach((el)=>{el.textContent=`${seconds}초`;});
  return seconds;
}

export function getLuckyDrawDurationMs(){
  return getLuckyDrawSeconds()*1000;
}

function buildDurationSetting(){
  const wrap=document.createElement('div');
  wrap.className='lucky-duration-setting';
  wrap.dataset.luckyDurationSetting='1';
  const current=getLuckyDrawSeconds();
  wrap.innerHTML=`
    <div class="lucky-duration-copy">
      <strong>🎁 행운상 추첨 시간</strong>
      <span>모든 게임에 공통 적용 · 마지막에 점점 느려집니다.</span>
    </div>
    <label class="lucky-duration-control">
      <span data-lucky-duration-value>${current}초</span>
      <select data-lucky-duration-select aria-label="행운상 추첨 시간">
        ${LUCKY_DRAW_OPTIONS.map((sec)=>`<option value="${sec}"${sec===current?' selected':''}>${sec}초${sec===10?' · 기본':''}</option>`).join('')}
      </select>
    </label>
  `;
  const select=wrap.querySelector('[data-lucky-duration-select]');
  select?.addEventListener('change',()=>setLuckyDrawSeconds(select.value));
  return wrap;
}

export function installLuckyAwardSettings(){
  if(typeof document==='undefined')return null;
  if(document.querySelector('[data-lucky-duration-setting]'))return document.querySelector('[data-lucky-duration-setting]');
  const setup=document.querySelector('#setupView');
  if(!setup)return null;
  ensureStyles();
  const control=buildDurationSetting();

  const appendTarget=
    setup.querySelector('.word-sound-card') ||
    setup.querySelector('.matching-sound-card') ||
    setup.querySelector('.sound-card');

  if(appendTarget){
    appendTarget.append(control);
    control.classList.add('inside-setting-card');
    return control;
  }

  const afterTarget=
    setup.querySelector('.sound-strip') ||
    setup.querySelector('.setup-grid') ||
    setup.querySelector('.stage-grid');

  if(afterTarget){
    afterTarget.insertAdjacentElement('afterend',control);
    return control;
  }

  setup.append(control);
  return control;
}

export function ensureLuckyAward(holder, rankedPlayers, at=Date.now()){
  const ranked=Array.isArray(rankedPlayers)?rankedPlayers.filter(Boolean):[];
  const eligible=ranked.slice(3).filter((p)=>keyOf(p));
  if(!holder || !eligible.length){
    if(holder && holder.luckyAward) holder.luckyAward=null;
    return {award:null,eligible,changed:false};
  }

  const existingKey=String(holder.luckyAward?.uid||'');
  const existing=eligible.find((p)=>keyOf(p)===existingKey);
  if(existing){
    const rank=ranked.findIndex((p)=>keyOf(p)===existingKey)+1;
    holder.luckyAward={
      ...holder.luckyAward,
      uid:existingKey,
      name:String(existing.name||''),
      avatar:String(existing.avatar||'🎁'),
      rank:rank>0?rank:Number(holder.luckyAward.rank)||0
    };
    return {award:holder.luckyAward,eligible,changed:false};
  }

  const winner=eligible[Math.floor(Math.random()*eligible.length)];
  const uid=keyOf(winner);
  const rank=ranked.findIndex((p)=>keyOf(p)===uid)+1;
  holder.luckyAward={
    uid,
    name:String(winner.name||'행운의 참가자'),
    avatar:String(winner.avatar||'🎁'),
    rank:rank>0?rank:0,
    pickedAt:Number(at)||Date.now()
  };
  return {award:holder.luckyAward,eligible,changed:true};
}

function clearTimers(card){
  const state=presentationState.get(card);
  if(!state) return;
  clearTimeout(state.startTimer);
  clearTimeout(state.spinTimer);
  clearTimeout(state.revealTimer);
  presentationState.delete(card);
}

function markCompactFinalLayout(anchor){
  if(!anchor?.closest) return null;
  const host=anchor.closest('.final-card') || anchor.closest('#finalArea') || anchor.closest('.final-panel') || anchor.closest('.final-view');
  if(host){
    host.classList.add('lucky-final-dashboard');
    host.dataset.luckyFinalLayout='compact';
  }
  return host;
}

function buildCard(){
  const card=document.createElement('section');
  card.className='lucky-award-card';
  card.setAttribute('aria-live','polite');
  card.innerHTML=`
    <div class="lucky-sparkles" aria-hidden="true"><i>✦</i><i>✧</i><i>✦</i><i>★</i><i>✧</i><i>✦</i></div>
    <div class="lucky-ribbon">🎁 LUCKY AWARD</div>
    <div class="lucky-title">오늘의 행운상</div>
    <div class="lucky-stage">
      <div class="lucky-avatar">🎁</div>
      <div class="lucky-copy">
        <strong class="lucky-name">추첨 준비 중...</strong>
        <span class="lucky-sub">1~3위를 제외한 참가자 중 무작위 추첨</span>
      </div>
    </div>
  `;
  return card;
}

function shuffleCandidates(items){
  const list=[...items];
  for(let i=list.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [list[i],list[j]]=[list[j],list[i]];
  }
  return list;
}

function spinDelay(progress){
  const p=Math.max(0,Math.min(1,Number(progress)||0));
  if(p<.70)return 95;
  const t=(p-.70)/.30;
  return Math.round(95+640*t*t);
}

export function renderLuckyAward({anchor,award,eligible=[],onDraw,onTick,onReveal,startDelay=250,drawDuration=null,position='after'}={}){
  ensureStyles();
  if(!anchor) return null;
  markCompactFinalLayout(anchor);
  let card=anchor.parentElement?.querySelector(':scope > .lucky-award-card')||null;
  if(!award){
    if(card){ clearTimers(card); card.remove(); }
    return null;
  }
  if(!card){
    card=buildCard();
    anchor.insertAdjacentElement(position==='before'?'beforebegin':'afterend',card);
  }

  const winnerKey=String(award.uid||'');
  if(card.dataset.winnerUid===winnerKey && (card.classList.contains('revealed') || presentationState.has(card))) return card;
  clearTimers(card);
  card.dataset.winnerUid=winnerKey;
  card.classList.remove('revealed','drawing','slowing');

  const avatarEl=card.querySelector('.lucky-avatar');
  const nameEl=card.querySelector('.lucky-name');
  const subEl=card.querySelector('.lucky-sub');
  const candidates=(Array.isArray(eligible)?eligible:[]).filter(Boolean);
  const duration=Math.max(3000,Math.min(30000,Number(drawDuration)||getLuckyDrawDurationMs()));
  let queue=[];
  let lastKey='';

  const nextCandidate=()=>{
    if(!candidates.length)return award;
    if(!queue.length)queue=shuffleCandidates(candidates);
    let candidate=queue.shift()||award;
    if(candidates.length>1&&keyOf(candidate)===lastKey){
      const alternate=queue.findIndex((p)=>keyOf(p)!==lastKey);
      if(alternate>=0){
        [candidate,queue[alternate]]=[queue[alternate],candidate];
      }else{
        queue=shuffleCandidates(candidates.filter((p)=>keyOf(p)!==lastKey));
        candidate=queue.shift()||candidate;
      }
    }
    lastKey=keyOf(candidate);
    return candidate;
  };

  const reveal=()=>{
    const state=presentationState.get(card);
    if(state?.spinTimer)clearTimeout(state.spinTimer);
    avatarEl.textContent=String(award.avatar||'🎁');
    nameEl.textContent=String(award.name||'행운의 참가자');
    subEl.innerHTML='<b>🎉 축하합니다!</b> · 순위와 관계없는 무작위 행운상';
    card.classList.remove('drawing','slowing');
    card.classList.add('revealed');
    try{onReveal?.();}catch{}
    presentationState.delete(card);
  };

  const startTimer=setTimeout(()=>{
    const started=performance.now();
    card.classList.add('drawing');
    nameEl.textContent='행운의 주인공을 찾는 중...';
    subEl.textContent=`누구에게 행운이 찾아올까요? · ${Math.ceil(duration/1000)}초`;
    try{onDraw?.();}catch{}

    const spin=()=>{
      const elapsed=Math.max(0,performance.now()-started);
      const progress=Math.max(0,Math.min(1,elapsed/duration));
      if(progress>=1)return;
      const p=nextCandidate();
      avatarEl.textContent=String(p?.avatar||'🎁');
      nameEl.textContent=String(p?.name||'행운상 후보');
      const remaining=Math.max(1,Math.ceil((duration-elapsed)/1000));
      subEl.textContent=progress>=.70?`곧 멈춥니다... · ${remaining}초`:`누구에게 행운이 찾아올까요? · ${remaining}초`;
      card.classList.toggle('slowing',progress>=.70);
      try{onTick?.(progress,p);}catch{}
      const delay=spinDelay(progress);
      const state=presentationState.get(card)||{};
      state.spinTimer=setTimeout(spin,Math.min(delay,Math.max(20,duration-elapsed)));
      presentationState.set(card,state);
    };

    spin();
    const revealTimer=setTimeout(reveal,duration);
    const state=presentationState.get(card)||{};
    state.startTimer=null;
    state.revealTimer=revealTimer;
    presentationState.set(card,state);
  },Math.max(0,Number(startDelay)||0));

  presentationState.set(card,{startTimer,spinTimer:null,revealTimer:null});
  return card;
}

if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>installLuckyAwardSettings(),{once:true});
  else queueMicrotask(()=>installLuckyAwardSettings());
}
