import { WordSearchBus } from './word-search-bus.js';
const $=id=>document.getElementById(id),AV=['🐻','🐱','🐼','🐰','🐯','🦊','🐧','🐸','🐨','🦁','🐵','🐶'];
let selectedAvatar='🐻',bus=null,state=null,uid=null,joined=false,timerRaf=null,countRaf=null,startIndex=null,path=[],pointerId=null,previousScore=0,wrongTimer=null,fitRaf=null;
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
function colorVars(color){return `--word-bg:${color.bg};--word-fg:${color.fg};--word-shadow:${color.shadow}`;}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function show(id){['joinView','waitingView','countdownView','playView','roundWaitView','finishView'].forEach(x=>$(x).classList.toggle('hidden',x!==id));}
function initAvatars(){$('avatarGrid').innerHTML=AV.map((a,i)=>`<button class="avatar-btn ${i===0?'active':''}" data-a="${a}" type="button">${a}</button>`).join('');$('avatarGrid').addEventListener('click',e=>{const b=e.target.closest('.avatar-btn');if(!b)return;selectedAvatar=b.dataset.a;document.querySelectorAll('.avatar-btn').forEach(x=>x.classList.toggle('active',x===b));});}
async function join(){const pin=$('pinInput').value.trim(),name=$('nameInput').value.trim();if(!/^\d{6}$/.test(pin))return $('joinError').textContent='6자리 PIN을 입력하세요.';if(!name)return $('joinError').textContent='이름을 입력하세요.';$('joinBtn').disabled=true;$('joinError').textContent='';try{bus?.close();bus=new WordSearchBus(pin,'player');await bus.init();uid=bus.uid;bus.on(handle);const initial=await bus.loadRoom();if(!initial||initial.status==='closed')throw new Error('방을 찾을 수 없습니다.');if(initial.config?.gameType!=='word-search')throw new Error('단어 찾기 배틀 방이 아닙니다.');state=initial;if(initial.status!=='lobby'){if(initial.players?.[uid]){joined=true;renderState();return;}throw new Error('이미 시작된 게임입니다.');}joined=true;$('myAvatar').textContent=selectedAvatar;$('waitingName').textContent=`${name}님, 입장 요청 중...`;show('waitingView');await bus.send('join',{name,avatar:selectedAvatar});}catch(e){joined=false;bus?.close();bus=null;$('joinError').textContent=e.message||'입장하지 못했습니다.';show('joinView');}finally{$('joinBtn').disabled=false;}}
function handle(msg){if(msg.type==='room-closed'){alert('게임방이 종료되었습니다.');location.href='word-search-play.html';return;}if(msg.type==='state'){state=msg.payload.room;renderState();}}
function me(){return state?.players?.[uid];}
function renderState(){if(!joined||!state)return;const p=me();if(!p)return;if($('waitingName').textContent.includes('요청')){$('waitingName').textContent=`${p.name}님, 입장 완료!`;previousScore=Number(p.score)||0;}if(state.status==='lobby'){stopTimers();show('waitingView');return;}if(state.status==='countdown'){show('countdownView');runCountdown();return;}if(state.status==='playing'){show('playView');renderPlay(p);runTimer();return;}if(state.status==='round-result'){stopTimers();show('roundWaitView');$('roundWaitTitle').textContent=`${state.roundIndex+1}판 종료!`;$('roundWaitStats').textContent=`찾은 단어 ${(p.foundTargetIds||[]).length}/${state.currentRound?.targets?.length||6}개`;return;}if(state.status==='finished'){stopTimers();show('finishView');renderFinish(p);}}
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
function renderGrid(r,found,foundPaths=[]){const grid=$('letterGrid'),colors=targetColorMap(r);grid.style.setProperty('--size',r.size);if(grid.dataset.roundId!==r.id){grid.dataset.roundId=r.id;grid.innerHTML=r.grid.map((ch,i)=>`<button type="button" class="letter-cell" data-index="${i}">${esc(ch)}</button>`).join('');startIndex=null;path=[];}const cellMarks=new Map();for(const fp of foundPaths){if(!Array.isArray(fp?.cells)||!found.has(fp.id))continue;const color=colors.get(String(fp.id));if(!color)continue;for(const idx of fp.cells){const key=Number(idx);if(!Number.isInteger(key))continue;const list=cellMarks.get(key)||[];if(!list.some(c=>c.bg===color.bg))list.push(color);cellMarks.set(key,list);}}grid.querySelectorAll('.letter-cell').forEach(x=>{const idx=Number(x.dataset.index),marks=cellMarks.get(idx)||[];x.classList.remove('selecting','found','found-multi');x.style.removeProperty('--word-bg');x.style.removeProperty('--word-fg');x.style.removeProperty('--word-shadow');x.style.removeProperty('--word-bg-2');if(marks.length){x.classList.add('found');x.style.setProperty('--word-bg',marks[0].bg);x.style.setProperty('--word-fg',marks[0].fg);x.style.setProperty('--word-shadow',marks[0].shadow);if(marks.length>1){x.classList.add('found-multi');x.style.setProperty('--word-bg-2',marks[1].bg);}}});scheduleGridFit();}
function linePath(a,b,size){const ar=Math.floor(a/size),ac=a%size,br=Math.floor(b/size),bc=b%size,dr=br-ar,dc=bc-ac;const steps=Math.max(Math.abs(dr),Math.abs(dc));if(!steps)return[a];if(!(dr===0||dc===0||Math.abs(dr)===Math.abs(dc)))return[];const sr=Math.sign(dr),sc=Math.sign(dc),out=[];for(let i=0;i<=steps;i++)out.push((ar+sr*i)*size+(ac+sc*i));return out;}
function cellFromPoint(x,y){return document.elementFromPoint(x,y)?.closest?.('.letter-cell');}
function paintPath(indices){path=indices;document.querySelectorAll('.letter-cell').forEach(x=>x.classList.toggle('selecting',indices.includes(Number(x.dataset.index))));const text=indices.map(i=>state.currentRound.grid[i]).join('');$('selectionPreview').textContent=text||'첫 글자에서 마지막 글자까지 손가락으로 연결하세요.';}
function begin(e){if(state?.status!=='playing')return;const cell=e.target.closest('.letter-cell');if(!cell)return;e.preventDefault();pointerId=e.pointerId;startIndex=Number(cell.dataset.index);$('letterGrid').setPointerCapture?.(e.pointerId);paintPath([startIndex]);}
function move(e){if(pointerId!==e.pointerId||startIndex==null)return;e.preventDefault();const cell=cellFromPoint(e.clientX,e.clientY);if(!cell)return;const indices=linePath(startIndex,Number(cell.dataset.index),state.currentRound.size);if(indices.length)paintPath(indices);}
async function end(e){if(pointerId!==e.pointerId)return;e.preventDefault();const text=path.map(i=>state.currentRound.grid[i]).join('');document.querySelectorAll('.letter-cell').forEach(x=>x.classList.remove('selecting'));pointerId=null;startIndex=null;path=[];if(text.length<2){$('selectionPreview').textContent='두 글자 이상 연결하세요.';return;}$('selectionPreview').textContent=`${text} · 확인 중…`;await bus.send('word-attempt',{roundIndex:state.roundIndex,text});setTimeout(()=>{if(state?.status==='playing')$('selectionPreview').textContent='다음 단어를 찾아보세요.';},600);}
function scoreFloat(g){const el=$('scoreFloat');el.textContent=`+${g.toLocaleString()}`;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),850);}
function renderFinish(p){const ps=Object.values(state.players||{}).sort((a,b)=>(b.score||0)-(a.score||0)),rank=ps.findIndex(x=>x.uid===uid)+1;$('finishName').textContent=`${p.name}님, 수고했어요!`;$('finishScore').textContent=(p.score||0).toLocaleString();$('finishRank').textContent=rank>0?`${rank}위`:'-';}
initAvatars();$('joinBtn').addEventListener('click',join);$('nameInput').addEventListener('keydown',e=>{if(e.key==='Enter')join();});$('letterGrid').addEventListener('pointerdown',begin);$('letterGrid').addEventListener('pointermove',move);$('letterGrid').addEventListener('pointerup',end);$('letterGrid').addEventListener('pointercancel',end);$('homeBtn').addEventListener('click',()=>location.href='word-search-play.html');window.addEventListener('resize',scheduleGridFit,{passive:true});window.addEventListener('orientationchange',()=>setTimeout(scheduleGridFit,120));window.addEventListener('beforeunload',()=>bus?.close());show('joinView');
