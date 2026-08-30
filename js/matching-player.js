import { LocalBus, publicRoomState as localPublicRoomState } from './local-bus.js?v=7.6';
import { FirebaseBus, isFirebaseConfigured } from './firebase-bus.js?v=7.6';
import { calculateMatchingPairScore, calculateRoundClearBonus } from './matching-engine.js';

const $=(id)=>document.getElementById(id);
const AVATARS=['🐻','🐱','🐼','🐰','🐯','🦊','🐧','🐸','🐨','🦁','🐵','🐶'];
let selectedAvatar='🐻';
let uid=localStorage.getItem('kmp_player_uid') || (crypto.randomUUID?.() || `u-${Date.now()}-${Math.random()}`);
localStorage.setItem('kmp_player_uid',uid);
let bus=null,state=null,joined=false,joinConfirmed=false,joinTimer=null;
let selectedCardId=null,optimisticMatched=new Set(),boardRoundIndex=-99,timerRaf=null,countdownRaf=null;
let previousScore=0,feedbackTimer=null;
let solo=null,soloPlayer=null,soloRoundTimer=null,soloTransitionTimer=null;

const params=new URLSearchParams(location.search);
const pinParam=params.get('pin'); const localMode=params.get('local')==='1'; const soloMode=params.get('solo')==='1';
if(pinParam)$('pinInput').value=pinParam;

function nowMs(){return bus?.now?bus.now():Date.now();}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function show(id){['joinView','waitingView','countdownView','playView','roundWaitView','finishView'].forEach((x)=>$(x).classList.toggle('hidden',x!==id));}
function initAvatars(){ $('avatarGrid').innerHTML=AVATARS.map((a,i)=>`<button class="avatar-btn ${i===0?'active':''}" data-a="${a}" type="button">${a}</button>`).join(''); $('avatarGrid').addEventListener('click',(e)=>{const b=e.target.closest('.avatar-btn');if(!b)return;selectedAvatar=b.dataset.a;document.querySelectorAll('.avatar-btn').forEach((x)=>x.classList.toggle('active',x===b));}); }
function setError(text){$('joinError').textContent=text;}
function vibrate(pattern){try{navigator.vibrate?.(pattern);}catch{}}

async function join(){
  const pin=$('pinInput').value.trim(),name=$('nameInput').value.trim(); if(!/^\d{6}$/.test(pin))return setError('6자리 PIN을 입력하세요.'); if(!name)return setError('이름을 입력하세요.'); setError(''); $('joinBtn').disabled=true;
  try{
    bus?.close(); let initial=null;
    if(localMode){ const raw=readLocalRoom(pin); if(!raw)throw new Error('로컬 데모 방을 찾을 수 없습니다. 같은 PC/브라우저에서 열어 주세요.'); if(raw.config?.gameType!=='matching-pairs')throw new Error('카드 매칭 게임방이 아닙니다.'); initial=localPublicRoomState(raw); bus=new LocalBus(pin); }
    else { if(!isFirebaseConfigured())throw new Error('Firebase 연결 설정이 완료되지 않았습니다. 선생님에게 알려 주세요.'); bus=new FirebaseBus(pin,'player'); }
    bus.on(handleMessage); if(bus.mode==='firebase'){await bus.init();uid=bus.uid;initial=await bus.loadRoom();if(!initial||initial.status==='closed')throw new Error('방을 찾을 수 없습니다. PIN을 확인해 주세요.');if(initial.config?.gameType!=='matching-pairs')throw new Error('카드 매칭 게임방이 아닙니다.');}
    if(initial.status!=='lobby')throw new Error('이미 게임이 시작된 방입니다.'); joined=true;joinConfirmed=false;localStorage.setItem(`kmp_name_${pin}`,name);localStorage.setItem(`kmp_avatar_${pin}`,selectedAvatar);$('myAvatar').textContent=selectedAvatar;$('waitingName').textContent=`${name}님, 입장 요청 중...`;show('waitingView'); await bus.send('join',{uid,name,avatar:selectedAvatar}); if(bus.mode==='local')bus.send('request-state',{});
    clearTimeout(joinTimer);joinTimer=setTimeout(()=>{if(joined&&!joinConfirmed)$('waitingName').textContent=`${name}님, 입장 확인 중...`;},5000);
  }catch(e){joined=false;joinConfirmed=false;clearTimeout(joinTimer);bus?.close();bus=null;setError(e?.message||'게임방에 입장하지 못했습니다.');}finally{$('joinBtn').disabled=false;}
}
function readLocalRoom(pin){try{return JSON.parse(localStorage.getItem(`kwb_room_${pin}`)||'null');}catch{return null;}}
function handleMessage(msg){if(msg.type==='state'){state=msg.payload.room;renderState();}if(msg.type==='room-closed'){alert('선생님이 게임방을 종료했습니다.');location.href='matching-play.html';}}

function renderState(){
  if(!joined||!state)return; const me=state.players?.[uid]; if(!me)return;
  if(!joinConfirmed){joinConfirmed=true;clearTimeout(joinTimer);$('myAvatar').textContent=me.avatar||selectedAvatar;$('waitingName').textContent=`${me.name}님, 입장 완료!`;previousScore=Number(me.score)||0;}
  if(state.status==='lobby'){stopTimer();show('waitingView');return;}
  if(state.status==='countdown'){show('countdownView');runCountdown();return;}
  if(state.status==='playing'){show('playView');renderPlay(me);runTimer();return;}
  if(state.status==='round-result'){stopTimer();show('roundWaitView');renderRoundWait(me);return;}
  if(state.status==='finished'){stopTimer();show('finishView');renderFinish(me);return;}
}
function runCountdown(){cancelAnimationFrame(countdownRaf);const frame=()=>{if(!state||state.status!=='countdown')return;const n=Math.max(1,Math.ceil((state.countdownEndAt-nowMs())/1000));$('playerCountdown').textContent=n;countdownRaf=requestAnimationFrame(frame);};countdownRaf=requestAnimationFrame(frame);}
function stopTimer(){cancelAnimationFrame(timerRaf);timerRaf=null;}
function stopLoops(){cancelAnimationFrame(timerRaf);cancelAnimationFrame(countdownRaf);timerRaf=countdownRaf=null;}
function localProgress(){ if(!state)return 0;if(state.status==='finished')return 1;if(state.status==='lobby'||state.status==='countdown')return 0;const total=Math.max(1,Number(state.roundTotal||state.config?.roundCount||1));const index=Math.max(0,Number(state.roundIndex||0));if(state.status==='round-result')return Math.min(1,(index+1)/total);const start=Number(state.roundStartAt||0),end=Number(state.roundEndAt||0);const f=end>start?Math.max(0,Math.min(1,(nowMs()-start)/(end-start))):0;return Math.min(1,(index+f)/total);}
function isBlind(){return state?.status!=='finished'&&(state?.blindActive||localProgress()>=.70);}
function updateScoreVisibility(me){const blind=isBlind();$('playerBlindBadge').classList.toggle('hidden',!blind);$('myScore').classList.toggle('hidden',blind);$('blindScoreText').classList.toggle('hidden',!blind);if(!blind&&Number.isFinite(Number(me.score)))$('myScore').textContent=(Number(me.score)||0).toLocaleString();}
function timerVisual(remaining,duration){const ratio=Math.max(0,Math.min(1,remaining/duration));const color=ratio<=.18?'#ff4f70':ratio<=.38?'#ffc83d':'#37d8ff';const ring=$('playerCircleTimer');ring.style.setProperty('--progress',`${ratio*100}%`);ring.style.setProperty('--timer-color',color);ring.classList.toggle('urgent',ratio<=.18);$('playerTimerText').textContent=(remaining/1000).toFixed(1);}
function runTimer(){cancelAnimationFrame(timerRaf);const frame=()=>{if(!state||state.status!=='playing')return;const duration=(Number(state.config?.roundTime)||45)*1000;const remaining=Math.max(0,Math.min(duration,Number(state.roundEndAt||0)-nowMs()));timerVisual(remaining,duration);const me=state.players?.[uid];if(me)updateScoreVisibility(me);if(remaining>0)timerRaf=requestAnimationFrame(frame);};timerRaf=requestAnimationFrame(frame);}

function renderPlay(me){
  const round=state.currentRound;if(!round)return;const roundChanged=boardRoundIndex!==state.roundIndex;if(roundChanged){boardRoundIndex=state.roundIndex;selectedCardId=null;optimisticMatched=new Set();$('pairFeedback').textContent='';$('comboText').textContent='COMBO 0';}
  $('playerRoundLabel').textContent=`ROUND ${state.roundIndex+1}/${state.roundTotal}`;const matched=new Set([...(me.matchedPairIds||[]),...optimisticMatched]);$('pairProgress').textContent=`${matched.size}/${state.config.pairsPerRound}쌍`;$('comboText').textContent=`COMBO ${me.combo||0}`;updateScoreVisibility(me);
  const score=Number(me.score);if(Number.isFinite(score)&&score>previousScore&&!isBlind()){showScoreFloat(score-previousScore);previousScore=score;}else if(Number.isFinite(score)&&score>previousScore)previousScore=score;
  renderBoard(round.cards||[],matched);
  if((me.matchedPairIds||[]).length>=state.config.pairsPerRound){setFeedback('이번 판 완료! 다른 학생을 기다리는 중…','good');}
}
function renderBoard(cards,matched){
  const available=cards.filter((c)=>!matched.has(c.pairId));
  $('cardBoard').innerHTML=available.map((c)=>`<button type="button" class="match-card ${c.id===selectedCardId?'selected':''}" data-id="${escapeHtml(c.id)}" data-pair="${escapeHtml(c.pairId)}" data-lang="${c.lang}"><span class="lang-tag">${c.lang==='ko'?'KOR':'MNG'}</span><span class="card-text">${escapeHtml(c.text)}</span></button>`).join('');
  if(!available.length)$('cardBoard').innerHTML='<div style="grid-column:1/-1;text-align:center;color:#74efbd;font-size:20px;font-weight:1000;padding:34px 8px">✓ 모든 카드를 맞췄습니다!</div>';
}
function findCard(id){return state?.currentRound?.cards?.find((c)=>c.id===id)||null;}
function clickCard(cardEl){
  if(!state||state.status!=='playing'||cardEl.disabled)return;const id=cardEl.dataset.id;const card=findCard(id);if(!card)return;const me=state.players?.[uid];if(!me)return;const matched=new Set([...(me.matchedPairIds||[]),...optimisticMatched]);if(matched.has(card.pairId))return;
  if(!selectedCardId){selectedCardId=id;cardEl.classList.add('selected');setFeedback(card.lang==='ko'?'같은 뜻의 몽골어 카드를 선택하세요.':'같은 뜻의 한국어 카드를 선택하세요.','');return;}
  if(selectedCardId===id){selectedCardId=null;cardEl.classList.remove('selected');return;}
  const first=findCard(selectedCardId);if(!first){selectedCardId=id;renderPlay(me);return;}
  if(first.lang===card.lang){selectedCardId=id;document.querySelectorAll('.match-card').forEach((x)=>x.classList.toggle('selected',x.dataset.id===id));return;}
  const firstEl=document.querySelector(`.match-card[data-id="${CSS.escape(first.id)}"]`);const correct=first.pairId===card.pairId;
  if(correct){
    firstEl?.classList.add('matched');cardEl.classList.add('matched');optimisticMatched.add(card.pairId);selectedCardId=null;vibrate(35);setFeedback('정답! 카드 한 쌍이 사라집니다.','good');
    if(soloMode)soloMatch(card.pairId);else bus?.send('pair-match',{uid,roundIndex:state.roundIndex,pairId:card.pairId});
    setTimeout(()=>{const currentMe=state?.players?.[uid];if(state?.status==='playing'&&currentMe)renderPlay(currentMe);},390);
  }else{
    firstEl?.classList.add('wrong');cardEl.classList.add('wrong');selectedCardId=null;vibrate([25,40,25]);setFeedback('다른 뜻입니다. 다시 찾아보세요!','bad');
    if(soloMode)soloMiss();else bus?.send('pair-miss',{uid,roundIndex:state.roundIndex});
    setTimeout(()=>{firstEl?.classList.remove('wrong','selected');cardEl.classList.remove('wrong','selected');},360);
  }
}
function setFeedback(text,type=''){clearTimeout(feedbackTimer);const el=$('pairFeedback');el.textContent=text;el.className=`pair-feedback ${type}`;if(text&&!text.includes('완료'))feedbackTimer=setTimeout(()=>{if(el.textContent===text){el.textContent='';el.className='pair-feedback';}},1300);}
function showScoreFloat(gain){const el=$('scoreFloat');el.textContent=`+${Number(gain).toLocaleString()}`;el.classList.remove('hidden');el.style.animation='none';void el.offsetWidth;el.style.animation='floatScore .85s ease forwards';setTimeout(()=>el.classList.add('hidden'),900);}
function renderRoundWait(me){ const matched=me.matchedPairIds?.length||0;$('roundWaitTitle').textContent=`${state.roundIndex+1}판 종료!`;$('roundWaitStats').textContent=`맞춘 카드 ${matched}/${state.config.pairsPerRound}쌍 · 실수 ${me.mistakes||0}회`; }
function renderFinish(me){ const players=Object.values(state.players||{}).filter((p)=>Number.isFinite(Number(p.score))).sort((a,b)=>Number(b.score)-Number(a.score)||a.name.localeCompare(b.name,'ko'));const rank=players.findIndex((p)=>p.uid===uid)+1;$('finishName').textContent=`${me.name}님, 수고했어요!`;$('finishScore').textContent=(Number(me.score)||0).toLocaleString();$('finishRank').textContent=rank>0?`${rank}위`:'-'; }

/* Solo mode */
function startSolo(){
  try{solo=JSON.parse(localStorage.getItem('kmp_solo_payload')||'null');}catch{}
  if(!solo?.matching?.rounds?.length){alert('교사용 설정 화면에서 [혼자 게임]을 먼저 눌러 주세요.');location.href='matching-pairs.html';return;}
  uid='solo';joined=true;joinConfirmed=true;soloPlayer={uid:'solo',name:'혼자 게임',avatar:'🐻',score:0,matchedPairIds:[],matchedCount:0,mistakes:0,combo:0,roundFinishedAt:0,lastGain:0,lastGainAt:0};previousScore=0;show('countdownView');const end=Date.now()+3200;state={status:'countdown',countdownEndAt:end,config:solo.config,players:{solo:soloPlayer},roundTotal:solo.matching.roundCount};runCountdown();soloTransitionTimer=setTimeout(()=>startSoloRound(0),3250);
}
function startSoloRound(index){
  clearTimeout(soloRoundTimer);if(index>=solo.matching.rounds.length)return finishSolo();soloPlayer.matchedPairIds=[];soloPlayer.matchedCount=0;soloPlayer.mistakes=0;soloPlayer.combo=0;soloPlayer.roundFinishedAt=0;optimisticMatched=new Set();selectedCardId=null;boardRoundIndex=-99;const start=Date.now()+180;const end=start+solo.config.roundTime*1000;state={status:'playing',config:solo.config,players:{solo:soloPlayer},roundIndex:index,roundTotal:solo.matching.roundCount,roundStartAt:start,roundEndAt:end,currentRound:solo.matching.rounds[index],blindActive:false};show('playView');renderPlay(soloPlayer);runTimer();soloRoundTimer=setTimeout(()=>finishSoloRound(),solo.config.roundTime*1000+240);
}
function soloMatch(pairId){
  if(!state||state.status!=='playing'||soloPlayer.matchedPairIds.includes(pairId))return;const at=Date.now();soloPlayer.matchedPairIds.push(pairId);soloPlayer.matchedCount=soloPlayer.matchedPairIds.length;soloPlayer.combo+=1;const duration=solo.config.roundTime*1000;const elapsed=Math.max(0,at-state.roundStartAt);let points=calculateMatchingPairScore(duration,elapsed,soloPlayer.combo);if(soloPlayer.matchedCount>=solo.config.pairsPerRound&&!soloPlayer.roundFinishedAt){soloPlayer.roundFinishedAt=at;points+=calculateRoundClearBonus(duration,elapsed);}soloPlayer.score+=points;soloPlayer.lastGain=points;soloPlayer.lastGainAt=at;state.players.solo={...soloPlayer};renderPlay(soloPlayer);if(soloPlayer.matchedCount>=solo.config.pairsPerRound){clearTimeout(soloRoundTimer);soloRoundTimer=setTimeout(()=>finishSoloRound(),650);}
}
function soloMiss(){if(!state||state.status!=='playing')return;soloPlayer.combo=0;soloPlayer.mistakes+=1;state.players.solo={...soloPlayer};renderPlay(soloPlayer);}
function finishSoloRound(){
  if(!state||state.status!=='playing')return;stopTimer();state.status='round-result';show('roundWaitView');renderRoundWait(soloPlayer);const next=state.roundIndex+1;soloTransitionTimer=setTimeout(()=>{if(next>=solo.matching.rounds.length)finishSolo();else{show('countdownView');const end=Date.now()+2200;state={...state,status:'countdown',countdownEndAt:end};runCountdown();soloTransitionTimer=setTimeout(()=>startSoloRound(next),2250);}},1900);
}
function finishSolo(){stopLoops();clearTimeout(soloRoundTimer);clearTimeout(soloTransitionTimer);state={...state,status:'finished',players:{solo:soloPlayer},blindActive:false};show('finishView');$('finishName').textContent='혼자 게임 완료!';$('finishScore').textContent=soloPlayer.score.toLocaleString();$('finishRank').textContent=`${solo.matching.roundCount}판 완료`;}

initAvatars();$('joinBtn').addEventListener('click',join);$('nameInput').addEventListener('keydown',(e)=>{if(e.key==='Enter')join();});$('cardBoard').addEventListener('click',(e)=>{const card=e.target.closest('.match-card');if(card)clickCard(card);});$('homeBtn').addEventListener('click',()=>location.href='matching-play.html');
window.addEventListener('beforeunload',()=>{stopLoops();clearTimeout(soloRoundTimer);clearTimeout(soloTransitionTimer);bus?.close();});
if(soloMode)startSolo();else show('joinView');
