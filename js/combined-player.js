import { FirebaseBus, isFirebaseConfigured } from './firebase-bus.js?v=7.7';

const $=id=>document.getElementById(id);
const AVATARS=['🐻','🐱','🐼','🐰','🐯','🦊','🐧','🐸','🐨','🦁','🐵','🐶'];
const STAGE_META=[
  {round:'ROUND 1',title:'어휘 배틀',icon:'⚡',copy:'빠르게 정답을 고르세요.'},
  {round:'ROUND 2',title:'카드 매칭',icon:'🃏',copy:'같은 뜻의 한국어·몽골어 카드를 짝지으세요.'},
  {round:'ROUND 3',title:'문장 배틀',icon:'🧩',copy:'카드를 배열해 자연스러운 문장을 만드세요.'}
];
let selectedAvatar='🐻';
let uid=localStorage.getItem('kwb_player_uid')||crypto.randomUUID?.()||`u-${Date.now()}-${Math.random()}`;
localStorage.setItem('kwb_player_uid',uid);
let bus=null,state=null,joined=false,joinConfirmed=false,timerLoop=null;
let currentUnitKey='';
let renderedWordKey='';
let renderedMatchingKey='';
let renderedSentenceKey='';
let wordSubmittedKey='';
let sentenceSubmittedKey='';
let selectedMatchCardId=null;
let localPendingPairs=new Set();
let sentenceOrder=[];
let lastKnownScores={word:0,matching:0,sentence:0,total:0};

function show(id){['joinView','waitingView','transitionView','countdownView','wordView','matchingView','sentenceView','resultView','blindView','finishView'].forEach(x=>$(x).classList.toggle('hidden',x!==id));}
function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function unitKey(){return `${state?.stageIndex ?? -1}:${state?.unitIndex ?? -1}`;}
function now(){return bus?.now?.()||Date.now();}
function stageMeta(){return STAGE_META[state?.stageIndex]||STAGE_META[0];}
function myPlayer(){return state?.players?.[uid]||null;}
function totalFromScores(scores){return Math.round(Number(scores?.word||0)+Number(scores?.matching||0)+Number(scores?.sentence||0));}
function rememberScores(me){if(me?.scores){lastKnownScores={word:Number(me.scores.word)||0,matching:Number(me.scores.matching)||0,sentence:Number(me.scores.sentence)||0,total:Number(me.score)||totalFromScores(me.scores)};}}
function scoreText(me){if(state?.blindActive)return'•••';rememberScores(me);return Math.round(Number(me?.score)||lastKnownScores.total).toLocaleString();}
function initAvatars(){$('avatarGrid').innerHTML=AVATARS.map((a,i)=>`<button class="avatar-btn ${i===0?'selected':''}" data-a="${a}" type="button">${a}</button>`).join('');$('avatarGrid').onclick=e=>{const b=e.target.closest('.avatar-btn');if(!b)return;selectedAvatar=b.dataset.a;document.querySelectorAll('.avatar-btn').forEach(x=>x.classList.toggle('selected',x===b));};}

const params=new URLSearchParams(location.search),pinParam=params.get('pin');if(pinParam)$('pinInput').value=pinParam;
function setError(t){$('joinError').textContent=t;}
async function join(){
  const pin=$('pinInput').value.trim(),name=$('nameInput').value.trim();if(!/^\d{6}$/.test(pin))return setError('6자리 PIN을 입력하세요.');if(!name)return setError('이름을 입력하세요.');setError('');$('joinBtn').disabled=true;
  try{
    if(!isFirebaseConfigured())throw new Error('Firebase 연결 설정이 완료되지 않았습니다.');bus?.close();bus=new FirebaseBus(pin,'player');bus.on(handleMessage);await bus.init();uid=bus.uid;const initial=await bus.loadRoom();if(!initial||initial.status==='closed')throw new Error('방을 찾을 수 없습니다. PIN을 확인해 주세요.');if(initial.config?.gameType!=='combined')throw new Error('종합 배틀 방이 아닙니다.');if(initial.status!=='lobby')throw new Error('이미 시작된 종합 배틀입니다.');joined=true;joinConfirmed=false;localStorage.setItem(`kwb_combined_name_${pin}`,name);localStorage.setItem(`kwb_combined_avatar_${pin}`,selectedAvatar);$('myAvatar').textContent=selectedAvatar;$('waitingName').textContent=`${name}님, 입장 요청 중...`;show('waitingView');await bus.send('join',{uid,name,avatar:selectedAvatar});
  }catch(err){joined=false;bus?.close();bus=null;setError(err?.message||'종합 배틀에 입장하지 못했습니다.');show('joinView');}finally{$('joinBtn').disabled=false;}
}
function handleMessage(msg){if(msg.type==='state'){state=msg.payload.room;renderState();}if(msg.type==='room-closed'){alert('교사가 종합 배틀 방을 종료했습니다.');location.href='combined-play.html';}}

function renderState(){
  if(!joined||!state)return;const me=myPlayer();if(!me)return;if(!joinConfirmed){joinConfirmed=true;$('myAvatar').textContent=me.avatar||selectedAvatar;$('waitingName').textContent=`${me.name}님, 입장 완료!`;}
  rememberScores(me);
  const nextKey=unitKey(),unitChanged=nextKey!==currentUnitKey;if(unitChanged){currentUnitKey=nextKey;selectedMatchCardId=null;localPendingPairs=new Set();sentenceOrder=[];}
  if(state.status==='lobby'){show('waitingView');return;}
  if(state.status==='transition'){renderTransition();show('transitionView');return;}
  if(state.status==='countdown'){renderCountdown();show('countdownView');startTimer();return;}
  if(state.status==='playing'){if(state.stageIndex===0){renderWord(me,unitChanged);show('wordView');}else if(state.stageIndex===1){renderMatching(me,unitChanged);show('matchingView');}else{renderSentence(me,unitChanged);show('sentenceView');}startTimer();return;}
  if(state.status==='result'){renderResult(me);show('resultView');return;}
  if(state.status==='finished'){renderFinish(me);show('finishView');stopTimer();return;}
}
function renderTransition(){const m=stageMeta();$('transitionIcon').textContent=m.icon;$('transitionRound').textContent=m.round;$('transitionTitle').textContent=m.title;$('transitionCopy').textContent=state.blindActive?'FINAL ZONE · 점수는 종료 후 공개됩니다.':(state.stageIndex===0?'한 번 입장한 상태로 세 게임을 시작합니다.':'재입장 없이 다음 게임으로 이동합니다.');}
function renderCountdown(){const m=stageMeta();$('countdownStage').textContent=`${m.round} · ${m.title}`;updateCountdown();}
function updateCountdown(){if(!state)return;const left=Math.max(0,state.countdownEndAt-now()),n=Math.max(1,Math.ceil(left/1000));$('countdownNumber').textContent=String(n);}

function renderWord(me,unitChanged){const q=state.currentQuestion;if(!q)return;const key=unitKey();$('wordCounter').textContent=`Q ${state.unitIndex+1}/${state.unitTotal}`;$('wordTotalScore').textContent=scoreText(me);$('wordDirection').textContent=q.direction==='ko-mn'?'한국어 → 몽골어':'몽골어 → 한국어';$('wordPrompt').textContent=q.prompt;const answered=state.answeredUids?.includes(uid)||wordSubmittedKey===key;if(renderedWordKey!==key||!$('wordOptions').children.length){$('wordOptions').innerHTML=q.options.map((v,i)=>`<button class="answer-btn" data-i="${i}" ${answered?'disabled':''}>${esc(v)}</button>`).join('');renderedWordKey=key;}else document.querySelectorAll('#wordOptions .answer-btn').forEach(b=>b.disabled=answered);$('wordSubmitState').textContent=answered?'제출 완료! 다른 학생을 기다리세요.':(state.blindActive?'FINAL ZONE · 점수 비공개':'정답을 선택하세요.');updateTimer('word',state.config.wordTime);}
function submitWord(choice){if(!state||state.status!=='playing'||state.stageIndex!==0||wordSubmittedKey===unitKey())return;wordSubmittedKey=unitKey();document.querySelectorAll('#wordOptions .answer-btn').forEach(b=>{b.disabled=true;b.classList.toggle('chosen',Number(b.dataset.i)===choice);});$('wordSubmitState').textContent='제출 완료!';bus.send('combined-word-answer',{unitIndex:state.unitIndex,choice});}

function renderMatching(me,unitChanged){const r=state.currentRound;if(!r)return;const key=unitKey();$('matchingCounter').textContent=`ROUND ${state.unitIndex+1}/${state.unitTotal}`;$('matchingTotalScore').textContent=scoreText(me);const matched=new Set([...(me.matchedPairIds||[]),...localPendingPairs]);$('matchedCount').textContent=String(matched.size);$('matchedTotal').textContent=String(r.pairCount||0);$('comboCount').textContent=String(me.matchingCombo||0);if(renderedMatchingKey!==key||!$('matchingGrid').children.length){$('matchingGrid').innerHTML=r.cards.map(c=>`<button class="match-card ${c.lang==='mn'?'mn':''}" data-id="${esc(c.id)}" data-pair="${esc(c.pairId)}" type="button">${esc(c.text)}</button>`).join('');renderedMatchingKey=key;}
  document.querySelectorAll('#matchingGrid .match-card').forEach(b=>{const isMatched=matched.has(b.dataset.pair);b.classList.toggle('matched',isMatched);b.classList.toggle('selected',!isMatched&&b.dataset.id===selectedMatchCardId);});$('matchingState').textContent=matched.size>=Number(r.pairCount||0)?'완료! 다른 학생을 기다리세요.':(state.blindActive?'FINAL ZONE · 점수 비공개':'두 카드를 선택해 같은 뜻의 짝을 찾으세요.');updateTimer('matching',state.config.matchTime);}
function clickMatchCard(button){if(!state||state.status!=='playing'||state.stageIndex!==1||button.classList.contains('matched'))return;const id=button.dataset.id,pair=button.dataset.pair;if(!selectedMatchCardId){selectedMatchCardId=id;renderMatching(myPlayer(),false);return;}if(selectedMatchCardId===id){selectedMatchCardId=null;renderMatching(myPlayer(),false);return;}const first=document.querySelector(`#matchingGrid .match-card[data-id="${CSS.escape(selectedMatchCardId)}"]`);if(!first){selectedMatchCardId=null;return;}if(first.dataset.pair===pair){localPendingPairs.add(pair);selectedMatchCardId=null;bus.send('combined-match-pair',{unitIndex:state.unitIndex,pairId:pair});renderMatching(myPlayer(),false);}else{const a=first,b=button;a.classList.add('wrong');b.classList.add('wrong');selectedMatchCardId=null;bus.send('combined-match-mistake',{unitIndex:state.unitIndex});setTimeout(()=>{a.classList.remove('wrong');b.classList.remove('wrong');renderMatching(myPlayer(),false);},320);}}

function renderSentence(me,unitChanged){const q=state.currentQuestion;if(!q)return;const key=unitKey();$('sentenceCounter').textContent=`Q ${state.unitIndex+1}/${state.unitTotal}`;$('sentenceTotalScore').textContent=scoreText(me);const submitted=state.answeredUids?.includes(uid)||sentenceSubmittedKey===key;if(renderedSentenceKey!==key){sentenceOrder=[];renderSentenceCards(q.tokens||[],submitted);renderedSentenceKey=key;}else updateSentenceCardState(q.tokens||[],submitted);$('sentenceSubmitBtn').disabled=submitted||sentenceOrder.length!==(q.tokens||[]).length;$('sentenceResetBtn').disabled=submitted;$('sentenceSubmitState').textContent=submitted?'제출 완료! 다른 학생을 기다리세요.':(state.blindActive?'FINAL ZONE · 점수 비공개':'모든 카드를 배열한 뒤 정답 제출을 누르세요.');updateTimer('sentence',state.config.sentenceTime);}
function renderSentenceCards(tokens,submitted){$('sentenceCards').innerHTML=tokens.map(t=>`<button class="sentence-token" data-id="${esc(t[0])}" type="button" ${submitted?'disabled':''}>${esc(t[1])}</button>`).join('');renderSentenceAnswer(tokens);}
function updateSentenceCardState(tokens,submitted){document.querySelectorAll('#sentenceCards .sentence-token').forEach(b=>{b.classList.toggle('used',sentenceOrder.includes(b.dataset.id));b.disabled=submitted;});renderSentenceAnswer(tokens);}
function renderSentenceAnswer(tokens){const map=new Map((tokens||[]).map(t=>[String(t[0]),String(t[1])]));if(!sentenceOrder.length){$('sentenceAnswer').innerHTML='<span>여기에 문장을 만드세요.</span>';return;}$('sentenceAnswer').innerHTML=sentenceOrder.map(id=>`<button class="placed-card" data-id="${esc(id)}" type="button">${esc(map.get(id)||'')}</button>`).join('');}
function addSentenceCard(id){if(!state||state.status!=='playing'||state.stageIndex!==2||sentenceSubmittedKey===unitKey()||sentenceOrder.includes(id))return;sentenceOrder.push(id);renderSentence(myPlayer(),false);}
function removeSentenceCard(id){if(sentenceSubmittedKey===unitKey())return;const i=sentenceOrder.lastIndexOf(id);if(i>=0)sentenceOrder.splice(i,1);renderSentence(myPlayer(),false);}
function resetSentence(){if(sentenceSubmittedKey===unitKey())return;sentenceOrder=[];renderSentence(myPlayer(),false);}
function submitSentence(){const q=state?.currentQuestion;if(!q||sentenceSubmittedKey===unitKey()||sentenceOrder.length!==(q.tokens||[]).length)return;sentenceSubmittedKey=unitKey();$('sentenceSubmitBtn').disabled=true;$('sentenceResetBtn').disabled=true;$('sentenceSubmitState').textContent='제출 완료!';bus.send('combined-sentence-submit',{unitIndex:state.unitIndex,order:[...sentenceOrder]});}

function renderResult(me){const r=state.unitResults?.[uid]||{correct:false,points:0};const m=stageMeta();$('resultStage').textContent=`${m.round} · ${m.title}`;$('resultView').classList.toggle('wrong',state.stageIndex!==1&&!r.correct);if(state.stageIndex===0){$('resultIcon').textContent=r.correct?'✓':'×';$('resultTitle').textContent=r.correct?'정답!':'아쉬워요';$('resultAnswer').textContent=`정답: ${state.revealAnswer||'-'}`;$('resultPoints').textContent=state.blindActive?'점수 비공개':`+${Number(r.points||0).toLocaleString()}점`;}
  else if(state.stageIndex===1){$('resultIcon').textContent=r.complete?'✓':'⏱';$('resultTitle').textContent=r.complete?'카드 매칭 완료!':'시간 종료';$('resultAnswer').textContent=r.complete?`실수 ${Number(r.mistakes||0)}회`:'다음 라운드를 준비합니다.';$('resultPoints').textContent=state.blindActive?'점수 비공개':`+${Number(r.points||0).toLocaleString()}점`;}
  else{$('resultIcon').textContent=r.correct?'✓':'×';$('resultTitle').textContent=r.correct?'정답!':'아쉬워요';$('resultAnswer').textContent=`정답: ${state.revealSentence||'-'}`;$('resultPoints').textContent=state.blindActive?'점수 비공개':`+${Number(r.points||0).toLocaleString()}점`;}$('resultNote').textContent=state.blindActive?'FINAL ZONE · 종합 순위는 끝난 뒤 공개됩니다.':'다음 문제 또는 다음 게임을 기다려 주세요.';rememberScores(me);}
function renderFinish(me){rememberScores(me);const players=Object.values(state.players||{}).sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0)||String(a.name).localeCompare(String(b.name),'ko')),rank=players.findIndex(p=>p.uid===uid)+1,s=me.scores||lastKnownScores;$('finishAvatar').textContent=me.avatar||selectedAvatar;$('finishName').textContent=`${me.name}님, 수고했어요!`;$('finishWord').textContent=Math.round(Number(s.word)||0).toLocaleString();$('finishMatching').textContent=Math.round(Number(s.matching)||0).toLocaleString();$('finishSentence').textContent=Math.round(Number(s.sentence)||0).toLocaleString();$('finishTotal').textContent=`${Math.round(Number(me.score)||totalFromScores(s)).toLocaleString()} / 3,000`;$('finishRank').textContent=rank>0?`${rank}위`:'-';}

function updateTimer(prefix,seconds){if(!state||state.status!=='playing')return;const total=Math.max(1000,Number(seconds)*1000),left=Math.max(0,Math.min(total,state.unitEndAt-now())),ratio=left/total;const bar=$(`${prefix}TimerBar`),text=$(`${prefix}TimerText`);if(bar)bar.style.width=`${ratio*100}%`;if(text)text.textContent=(left/1000).toFixed(1);}
function startTimer(){if(timerLoop)return;timerLoop=setInterval(()=>{if(!state)return;if(state.status==='countdown')updateCountdown();if(state.status==='playing'){if(state.stageIndex===0)updateTimer('word',state.config.wordTime);else if(state.stageIndex===1)updateTimer('matching',state.config.matchTime);else updateTimer('sentence',state.config.sentenceTime);}},80);}
function stopTimer(){if(timerLoop){clearInterval(timerLoop);timerLoop=null;}}

$('joinBtn').addEventListener('click',join);$('nameInput').addEventListener('keydown',e=>{if(e.key==='Enter')join();});$('wordOptions').addEventListener('click',e=>{const b=e.target.closest('.answer-btn');if(b)submitWord(Number(b.dataset.i));});$('matchingGrid').addEventListener('click',e=>{const b=e.target.closest('.match-card');if(b)clickMatchCard(b);});$('sentenceCards').addEventListener('click',e=>{const b=e.target.closest('.sentence-token');if(b)addSentenceCard(b.dataset.id);});$('sentenceAnswer').addEventListener('click',e=>{const b=e.target.closest('.placed-card');if(b)removeSentenceCard(b.dataset.id);});$('sentenceResetBtn').addEventListener('click',resetSentence);$('sentenceSubmitBtn').addEventListener('click',submitSentence);
initAvatars();show('joinView');
