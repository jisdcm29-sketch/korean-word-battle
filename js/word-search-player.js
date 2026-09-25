import { WordSearchBus } from './word-search-bus.js?v=2.1';
const $=id=>document.getElementById(id),AV=['🐻','🐱','🐼','🐰','🐯','🦊','🐧','🐸','🐨','🦁','🐵','🐶'];
let selectedAvatar='🐻',bus=null,state=null,uid=null,joined=false,timerRaf=null,countRaf=null,startIndex=null,path=[],previousScore=0,wrongTimer=null,fitRaf=null;
let networkConnected=true,hostDisconnected=false,offlinePackage=null,offlineLoop=null;
let localHitStore={savedAt:0,rounds:{}};
const params=new URLSearchParams(location.search);if(params.get('pin'))$('pinInput').value=params.get('pin');
const WORD_COLORS=[
  {bg:'#69e7c0',fg:'#073f35',shadow:'#2aa27f'},
  {bg:'#ff8fbd',fg:'#5b1230',shadow:'#c64d7d'},
  {bg:'#ffd166',fg:'#503600',shadow:'#c99624'},
  {bg:'#8cc8ff',fg:'#0b3a64',shadow:'#4a8fc7'},
  {bg:'#b99cff',fg:'#35205f',shadow:'#7b5ec5'},
  {bg:'#ffad72',fg:'#5b2b0a',shadow:'#c7763f'}
];
function targetColorMap(round){const map=new Map();(round?.targets||[]).forEach((t,i)=>map.set(String(t.id),WORD_COLORS[i%WORD_COLORS.length]));return map;}
function localHitKey(){return bus?.pin&&uid?`kws_local_hits_v1_${bus.pin}_${uid}`:null;}
function loadLocalHits(){const key=localHitKey();localHitStore={savedAt:Date.now(),rounds:{}};if(!key)return;try{const parsed=JSON.parse(localStorage.getItem(key)||'null');if(parsed?.rounds&&Date.now()-Number(parsed.savedAt||0)<=30*60*1000)localHitStore=parsed;}catch{}}
function saveLocalHits(){const key=localHitKey();if(!key)return;localHitStore.savedAt=Date.now();try{localStorage.setItem(key,JSON.stringify(localHitStore));}catch{}}
function localRoundHits(index=state?.roundIndex){const key=String(Number(index));localHitStore.rounds||={};localHitStore.rounds[key]||={hits:[]};return localHitStore.rounds[key];}
function pruneLocalHits(){const limit=Date.now()-30*60*1000;for(const [key,rec] of Object.entries(localHitStore.rounds||{})){rec.hits=(rec.hits||[]).filter(x=>Number(x.at||0)>=limit);if(!rec.hits.length)delete localHitStore.rounds[key];}saveLocalHits();}
function reconcileLocalHits(room){if(!room||!uid)return;const index=Number(room.roundIndex);const rec=localHitStore.rounds?.[String(index)];if(rec){const server=new Set(room.players?.[uid]?.foundTargetIds||[]);rec.hits=(rec.hits||[]).filter(x=>!server.has(x.id));if(!rec.hits.length)delete localHitStore.rounds[String(index)];}pruneLocalHits();}
function mergedPlayer(p,index=state?.roundIndex){if(!p)return p;const rec=localHitStore.rounds?.[String(Number(index))],ids=new Set(p.foundTargetIds||[]),paths=new Map((p.foundPaths||[]).map(fp=>[String(fp.id),fp]));for(const hit of rec?.hits||[]){ids.add(hit.id);if(!paths.has(String(hit.id)))paths.set(String(hit.id),{id:hit.id,cells:[...(hit.cells||[])]});}return {...p,foundTargetIds:[...ids],foundPaths:[...paths.values()]};}
function solutionRound(index=state?.roundIndex){return offlinePackage?.rounds?.[Number(index)]||null;}
function samePath(a,b){return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Number(v)===Number(b[i]));}
function solutionForPath(indices,index=state?.roundIndex){const r=solutionRound(index),solutions=r?.solutions||[];return solutions.find(sol=>samePath(indices,sol.cells)||samePath(indices,[...(sol.cells||[])].reverse()))||null;}
function hasFoundTarget(id,index=state?.roundIndex){const p=mergedPlayer(me(),index);return new Set(p?.foundTargetIds||[]).has(id);}
function rememberLocalCorrect(solution,index=state?.roundIndex){if(!solution||hasFoundTarget(solution.id,index))return false;const rec=localRoundHits(index);rec.hits.push({id:solution.id,cells:[...(solution.cells||[])],at:Date.now()});saveLocalHits();return true;}
function colorVars(color){return `--word-bg:${color.bg};--word-fg:${color.fg};--word-shadow:${color.shadow}`;}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function show(id){['joinView','waitingView','countdownView','playView','roundWaitView','finishView'].forEach(x=>$(x).classList.toggle('hidden',x!==id));}
function initAvatars(){$('avatarGrid').innerHTML=AV.map((a,i)=>`<button class="avatar-btn ${i===0?'active':''}" data-a="${a}" type="button">${a}</button>`).join('');$('avatarGrid').addEventListener('click',e=>{const b=e.target.closest('.avatar-btn');if(!b)return;selectedAvatar=b.dataset.a;document.querySelectorAll('.avatar-btn').forEach(x=>x.classList.toggle('active',x===b));});}
async function join(){const pin=$('pinInput').value.trim(),name=$('nameInput').value.trim();if(!/^\d{6}$/.test(pin))return $('joinError').textContent='6자리 PIN을 입력하세요.';if(!name)return $('joinError').textContent='이름을 입력하세요.';$('joinBtn').disabled=true;$('joinError').textContent='';try{bus?.close();bus=new WordSearchBus(pin,'player');await bus.init();uid=bus.uid;loadLocalHits();bus.on(handle);const initial=await bus.loadRoom();if(!initial||initial.status==='closed')throw new Error('방을 찾을 수 없습니다.');if(initial.config?.gameType!=='word-search')throw new Error('단어 찾기 배틀 방이 아닙니다.');state=initial;offlinePackage=initial?.offlinePackage||offlinePackage;hostDisconnected=Boolean(initial?.hostDisconnectedAt);if(initial.status!=='lobby'&&initial.players?.[uid]){joined=true;renderState();return;}if(initial.status==='finished')throw new Error('이미 종료된 게임입니다.');const lateJoin=initial.status!=='lobby';joined=true;localStorage.setItem(`kws_name_${pin}`,name);localStorage.setItem(`kws_avatar_${pin}`,selectedAvatar);$('myAvatar').textContent=selectedAvatar;$('waitingName').textContent=lateJoin?`${name}님, 진행 중인 게임에 입장 중...`:`${name}님, 입장 요청 중...`;show('waitingView');await bus.send('join',{name,avatar:selectedAvatar});}catch(e){joined=false;bus?.close();bus=null;$('joinError').textContent=e.message||'입장하지 못했습니다.';show('joinView');}finally{$('joinBtn').disabled=false;}}
function offlineActive(){return !networkConnected||hostDisconnected;}
function syncOfflineLoop(){if(offlineActive()){if(!offlineLoop)offlineLoop=setInterval(advanceOfflineState,90);}else if(offlineLoop){clearInterval(offlineLoop);offlineLoop=null;}}
function resetOfflinePlayerRound(){const p=state?.players?.[uid];if(p){p.foundTargetIds=[];p.foundPaths=[];p.combo=0;}startIndex=null;path=[];}
function startOfflineRound(index,startAt){const rounds=offlinePackage?.rounds||[],round=rounds[index];if(!round||!state)return false;resetOfflinePlayerRound();const duration=Math.max(1000,Number(state.config?.roundTime||60)*1000);state={...state,status:'playing',roundIndex:index,roundTotal:rounds.length,roundStartAt:startAt,roundEndAt:startAt+duration,currentRound:round,offlineSynthetic:true,offlineFinal:false};renderState();return true;}
function advanceOfflineState(){if(!offlineActive()||!state||offlinePackage?.kind!=='word-search'||['lobby','finished','closed'].includes(state.status))return;const t=bus?.now?bus.now():Date.now(),resultMs=Number(offlinePackage?.timing?.roundResultMs)||2600,startDelay=Number(offlinePackage?.timing?.roundStartDelayMs)||100;if(state.status==='countdown'&&t>=Number(state.countdownEndAt||0)){startOfflineRound(0,Number(state.countdownEndAt||t)+startDelay);return;}if(state.status==='playing'&&t>=Number(state.roundEndAt||0)){const last=Number(state.roundIndex)>=Number((offlinePackage.rounds||[]).length)-1;state={...state,status:'round-result',roundResultEndAt:Number(state.roundEndAt||t)+resultMs,offlineSynthetic:true,offlineFinal:last};renderState();return;}if(state.status==='round-result'&&t>=Number(state.roundResultEndAt||0)){if(state.offlineFinal){state={...state,status:'finished',offlineSynthetic:true,offlineFinal:true};renderState();return;}startOfflineRound(Number(state.roundIndex)+1,Number(state.roundResultEndAt||t)+startDelay);}}
function handle(msg){if(msg.type==='connection'){networkConnected=msg.connected!==false;syncOfflineLoop();return;}if(msg.type==='room-closed'){alert('게임방이 종료되었습니다.');location.href='word-search-play.html';return;}if(msg.type==='state'){reconcileLocalHits(msg.payload.room);state=msg.payload.room;offlinePackage=state?.offlinePackage||offlinePackage;hostDisconnected=Boolean(state?.hostDisconnectedAt);syncOfflineLoop();renderState();}}
function me(){return state?.players?.[uid];}
function renderState(){if(!joined||!state)return;const p=mergedPlayer(me());if(!p)return;if($('waitingName').textContent.includes('요청')){$('waitingName').textContent=`${p.name}님, 입장 완료!`;previousScore=Number(p.score)||0;}if(state.status==='lobby'){stopTimers();show('waitingView');return;}if(state.status==='countdown'){show('countdownView');runCountdown();return;}if(state.status==='playing'){show('playView');renderPlay(p);runTimer();return;}if(state.status==='round-result'){stopTimers();show('roundWaitView');$('roundWaitTitle').textContent=`${state.roundIndex+1}판 종료!`;$('roundWaitStats').textContent=state.offlineSynthetic?'답안이 기기에 저장되었습니다. 연결되면 자동 채점됩니다.':`찾은 단어 ${(p.foundTargetIds||[]).length}/${state.currentRound?.targets?.length||6}개`;return;}if(state.status==='finished'){stopTimers();show('finishView');renderFinish(p);}}
function stopTimers(){cancelAnimationFrame(timerRaf);cancelAnimationFrame(countRaf);timerRaf=countRaf=null;}
function runCountdown(){cancelAnimationFrame(countRaf);const tick=()=>{if(state?.status!=='countdown')return;$('playerCountdown').textContent=Math.max(1,Math.ceil((state.countdownEndAt-(bus?.now?bus.now():Date.now()))/1000));countRaf=requestAnimationFrame(tick);};countRaf=requestAnimationFrame(tick);}
function runTimer(){cancelAnimationFrame(timerRaf);const tick=()=>{if(state?.status!=='playing')return;const total=Math.max(1000,Number(state.config.roundTime)*1000),rem=Math.max(0,state.roundEndAt-(bus?.now?bus.now():Date.now())),ratio=Math.max(0,Math.min(1,rem/total));$('playerTimerText').textContent=(rem/1000).toFixed(1);$('playerTimerBar').style.width=`${ratio*100}%`;timerRaf=requestAnimationFrame(tick);};timerRaf=requestAnimationFrame(tick);}
function renderPlay(p){const r=state.currentRound;if(!r)return;const found=new Set(p.foundTargetIds||[]),colors=targetColorMap(r);$('playerRoundLabel').textContent=`ROUND ${state.roundIndex+1}/${state.roundTotal}`;$('foundProgress').textContent=`${found.size}/${r.targets.length}개`;$('comboText').textContent=`${r.size}×${r.size} · 8방향 · COMBO ${p.combo||0}`;$('myScore').textContent=(Number(p.score)||0).toLocaleString();if(Number(p.score)>previousScore){scoreFloat(Number(p.score)-previousScore);previousScore=Number(p.score);} $('targetList').innerHTML=r.targets.map(t=>{const hit=found.has(t.id),color=colors.get(String(t.id));return `<div class="target-chip ${hit?'found':''}"${hit&&color?` style="${colorVars(color)}"`:''}>${esc(t.mn)}</div>`;}).join('');renderGrid(r,found,p.foundPaths||[]);}
function fitLetterGrid(){
  const grid=$('letterGrid'),play=$('playView');if(!grid||!play||play.classList.contains('hidden'))return;
  const size=Math.max(5,Number(state?.currentRound?.size)||7);
  const style=getComputedStyle(play),padX=(parseFloat(style.paddingLeft)||0)+(parseFloat(style.paddingRight)||0),padBottom=parseFloat(style.paddingBottom)||0;
  const width=Math.max(180,play.clientWidth-padX);
  const top=grid.getBoundingClientRect().top,preview=$('selectionPreview'),reserve=(preview?.offsetHeight||0)+padBottom+6;
  const availableH=Math.max(180,window.innerHeight-top-reserve);
  // Fill the largest square that fits the phone. Smaller grids therefore get larger cells; larger grids keep the board size but shrink text automatically.
  const board=Math.max(180,Math.min(width,availableH));
  const gap=size<=5?5:size<=7?4:size<=9?3:2;
  const padding=size<=6?7:size<=8?6:4;
  const usable=Math.max(120,board-padding*2-gap*(size-1));
  const cell=usable/size;
  // V1.4: Korean board letters are slightly smaller so the Mongolian targets can carry equal visual weight.
  const font=Math.max(12,Math.min(40,Math.floor(cell*(size<=6?.49:size<=8?.46:.43))));
  const radius=Math.max(4,Math.min(12,Math.floor(cell*.18)));
  grid.style.setProperty('--board-px',`${Math.floor(board)}px`);
  grid.style.setProperty('--cell-font',`${font}px`);
  grid.style.setProperty('--grid-gap',`${gap}px`);
  grid.style.setProperty('--grid-pad',`${padding}px`);
  grid.style.setProperty('--cell-radius',`${radius}px`);

  // Make Mongolian target words as large as the Korean board letters whenever they fit.
  // Longer Mongolian words are reduced only enough to stay within two lines.
  const chips=[...$('targetList').querySelectorAll('.target-chip')];
  chips.forEach((chip)=>{
    const text=String(chip.textContent||'').trim();
    const chars=Math.max(1,Array.from(text).length);
    const foundReserve=chip.classList.contains('found')?24:0;
    const usableW=Math.max(54,chip.clientWidth-12-foundReserve);
    const twoLineFit=Math.floor((usableW*2)/(chars*.62));
    const targetFont=Math.max(18,Math.min(font,twoLineFit));
    chip.style.setProperty('--target-font',`${targetFont}px`);
  });
}
function scheduleGridFit(){cancelAnimationFrame(fitRaf);fitRaf=requestAnimationFrame(()=>{fitRaf=requestAnimationFrame(fitLetterGrid);});}
function renderGrid(r,found,foundPaths=[]){
  const grid=$('letterGrid'),colors=targetColorMap(r);grid.style.setProperty('--size',r.size);
  if(grid.dataset.roundId!==r.id){
    grid.dataset.roundId=r.id;
    grid.innerHTML=r.grid.map((ch,i)=>`<button type="button" class="letter-cell" data-index="${i}">${esc(ch)}</button>`).join('');
    startIndex=null;path=[];
    $('selectionPreview').textContent='첫 글자를 누른 뒤 마지막 글자를 누르세요.';
  }
  const cellMarks=new Map();
  for(const fp of foundPaths){
    if(!Array.isArray(fp?.cells)||!found.has(fp.id))continue;
    const color=colors.get(String(fp.id));if(!color)continue;
    for(const idx of fp.cells){
      const key=Number(idx);if(!Number.isInteger(key))continue;
      const list=cellMarks.get(key)||[];if(!list.some(c=>c.bg===color.bg))list.push(color);cellMarks.set(key,list);
    }
  }
  grid.querySelectorAll('.letter-cell').forEach(x=>{
    const idx=Number(x.dataset.index),marks=cellMarks.get(idx)||[];
    x.classList.remove('selecting','selection-start','found','found-multi');
    x.style.removeProperty('--word-bg');x.style.removeProperty('--word-fg');x.style.removeProperty('--word-shadow');x.style.removeProperty('--word-bg-2');
    if(marks.length){
      x.classList.add('found');x.style.setProperty('--word-bg',marks[0].bg);x.style.setProperty('--word-fg',marks[0].fg);x.style.setProperty('--word-shadow',marks[0].shadow);
      if(marks.length>1){x.classList.add('found-multi');x.style.setProperty('--word-bg-2',marks[1].bg);}
    }
  });
  // V1.5: keep the local first-click selection visible even while Firebase state updates arrive.
  if(path.length){
    grid.querySelectorAll('.letter-cell').forEach(x=>x.classList.toggle('selecting',path.includes(Number(x.dataset.index))));
    grid.querySelector(`[data-index="${startIndex}"]`)?.classList.add('selection-start');
  }
  scheduleGridFit();
}
function linePath(a,b,size){const ar=Math.floor(a/size),ac=a%size,br=Math.floor(b/size),bc=b%size,dr=br-ar,dc=bc-ac;const steps=Math.max(Math.abs(dr),Math.abs(dc));if(!steps)return[a];if(!(dr===0||dc===0||Math.abs(dr)===Math.abs(dc)))return[];const sr=Math.sign(dr),sc=Math.sign(dc),out=[];for(let i=0;i<=steps;i++)out.push((ar+sr*i)*size+(ac+sc*i));return out;}
function paintPath(indices){
  path=indices;
  document.querySelectorAll('.letter-cell').forEach(x=>{
    const idx=Number(x.dataset.index);x.classList.toggle('selecting',indices.includes(idx));x.classList.toggle('selection-start',startIndex!=null&&idx===startIndex);
  });
}
function resetClickSelection(message='첫 글자를 누른 뒤 마지막 글자를 누르세요.'){
  startIndex=null;path=[];
  document.querySelectorAll('.letter-cell').forEach(x=>x.classList.remove('selecting','selection-start'));
  $('selectionPreview').textContent=message;
}
async function chooseCell(e){
  if(state?.status!=='playing')return;
  const cell=e.target.closest('.letter-cell');if(!cell)return;
  e.preventDefault();
  const idx=Number(cell.dataset.index),grid=state.currentRound.grid;
  if(startIndex==null){
    startIndex=idx;paintPath([idx]);
    $('selectionPreview').textContent=`시작 글자 ${grid[idx]} 선택 · 마지막 글자를 누르세요.`;
    return;
  }
  if(idx===startIndex){
    resetClickSelection('선택을 취소했습니다. 다시 첫 글자를 누르세요.');
    return;
  }
  const indices=linePath(startIndex,idx,state.currentRound.size);
  if(!indices.length){
    startIndex=idx;paintPath([idx]);
    $('selectionPreview').textContent=`시작 글자를 ${grid[idx]}로 변경했습니다 · 마지막 글자를 누르세요.`;
    return;
  }
  const text=indices.map(i=>grid[i]).join('');
  paintPath(indices);
  const solution=solutionForPath(indices,state.roundIndex);
  const already=solution&&hasFoundTarget(solution.id,state.roundIndex);
  if(solution&&!already){
    rememberLocalCorrect(solution,state.roundIndex);
    startIndex=null;path=[];
    $('selectionPreview').classList.remove('bad');$('selectionPreview').classList.add('good');
    $('selectionPreview').textContent=offlineActive()?`정답! ${text} · 기기에 저장됨 · 연결되면 자동 전송`:`정답! ${text} · 점수 반영 중…`;
    try{navigator.vibrate?.(35);}catch{}
    renderPlay(mergedPlayer(me()));
  }else if(already){
    startIndex=null;path=[];
    $('selectionPreview').classList.remove('bad');$('selectionPreview').classList.add('good');
    $('selectionPreview').textContent='이미 찾은 단어입니다. 다른 단어를 찾아보세요.';
  }else{
    $('selectionPreview').classList.remove('good');$('selectionPreview').classList.add('bad');
    $('selectionPreview').textContent=`${text} · 다시 찾아보세요`;
    document.querySelectorAll('.letter-cell').forEach(x=>{if(indices.includes(Number(x.dataset.index)))x.classList.add('wrong');});
    startIndex=null;path=[];
    try{navigator.vibrate?.([25,35,25]);}catch{}
  }
  if(!already){
    const delivery=await bus.send('word-attempt',{roundIndex:state.roundIndex,text});
    if(delivery?.queued&&solution)$('selectionPreview').textContent=`정답! ${text} · 기기에 저장됨 · 연결되면 자동 전송`;
    else if(delivery?.queued&&!solution)$('selectionPreview').textContent=`${text} · 시도 저장됨 · 연결되면 자동 전송`;
  }
  setTimeout(()=>{
    document.querySelectorAll('.letter-cell').forEach(x=>x.classList.remove('selecting','selection-start','wrong'));
    $('selectionPreview').classList.remove('good','bad');
    if(state?.status==='playing')$('selectionPreview').textContent='다음 단어: 첫 글자 → 마지막 글자를 누르세요.';
  },650);
}
function applyClickInstructions(){
  const steps=[...document.querySelectorAll('.how-strip span')];
  if(steps[0])steps[0].innerHTML='<b>1</b>몽골어 뜻 확인';
  if(steps[1])steps[1].innerHTML='<b>2</b>첫 글자 탭';
  if(steps[2])steps[2].innerHTML='<b>3</b>마지막 글자 탭';
  const guide=document.querySelector('.search-guide span');if(guide)guide.textContent='몽골어 뜻을 보고 첫 글자와 마지막 글자를 차례로 누르세요.';
  $('selectionPreview').textContent='첫 글자를 누른 뒤 마지막 글자를 누르세요.';
}
function scoreFloat(g){const el=$('scoreFloat');el.textContent=`+${g.toLocaleString()}`;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),850);}
function renderFinish(p){const ps=Object.values(state.players||{}).sort((a,b)=>(b.score||0)-(a.score||0)),rank=ps.findIndex(x=>x.uid===uid)+1;$('finishName').textContent=`${p.name}님, 수고했어요!`;$('finishScore').textContent=(p.score||0).toLocaleString();$('finishRank').textContent=state.offlineSynthetic?'연결 복구 후 순위 확정':(rank>0?`${rank}위`:'-');}
initAvatars();applyClickInstructions();$('joinBtn').addEventListener('click',join);$('nameInput').addEventListener('keydown',e=>{if(e.key==='Enter')join();});$('letterGrid').addEventListener('click',chooseCell);$('homeBtn').addEventListener('click',()=>location.href='word-search-play.html');window.addEventListener('resize',scheduleGridFit,{passive:true});window.addEventListener('orientationchange',()=>setTimeout(scheduleGridFit,120));window.addEventListener('beforeunload',()=>{if(offlineLoop)clearInterval(offlineLoop);bus?.close();});show('joinView');
