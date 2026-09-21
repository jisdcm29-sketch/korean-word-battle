const presentationState = new WeakMap();

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
  link.href=new URL('../css/lucky-award.css?v=1.4',import.meta.url).href;
  link.dataset.luckyAwardStyle='1';
  document.head.append(link);
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
  clearInterval(state.interval);
  clearTimeout(state.startTimer);
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

export function renderLuckyAward({anchor,award,eligible=[],onDraw,onReveal,startDelay=1300,drawDuration=2200,position='after'}={}){
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
  if(card.dataset.winnerUid===winnerKey && card.classList.contains('revealed')) return card;
  clearTimers(card);
  card.dataset.winnerUid=winnerKey;
  card.classList.remove('revealed','drawing');

  const avatarEl=card.querySelector('.lucky-avatar');
  const nameEl=card.querySelector('.lucky-name');
  const subEl=card.querySelector('.lucky-sub');
  const candidates=(Array.isArray(eligible)?eligible:[]).filter(Boolean);
  let spinIndex=0;

  const startTimer=setTimeout(()=>{
    card.classList.add('drawing');
    nameEl.textContent='행운의 주인공을 찾는 중...';
    subEl.textContent='누구에게 행운이 찾아올까요?';
    try{onDraw?.();}catch{}
    const interval=setInterval(()=>{
      const p=candidates.length?candidates[spinIndex++%candidates.length]:award;
      avatarEl.textContent=String(p?.avatar||'🎁');
      nameEl.textContent=String(p?.name||'행운상 후보');
    },115);
    const revealTimer=setTimeout(()=>{
      clearInterval(interval);
      avatarEl.textContent=String(award.avatar||'🎁');
      nameEl.textContent=String(award.name||'행운의 참가자');
      subEl.innerHTML='<b>🎉 축하합니다!</b> · 순위와 관계없는 무작위 행운상';
      card.classList.remove('drawing');
      card.classList.add('revealed');
      try{onReveal?.();}catch{}
      presentationState.delete(card);
    },Math.max(800,Number(drawDuration)||2200));
    presentationState.set(card,{interval,startTimer:null,revealTimer});
  },Math.max(0,Number(startDelay)||0));

  presentationState.set(card,{interval:null,startTimer,revealTimer:null});
  return card;
}
