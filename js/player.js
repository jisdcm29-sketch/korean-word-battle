import { LocalBus } from './local-bus.js?v=7.3';
import { FirebaseBus, isFirebaseConfigured } from './firebase-bus.js?v=7.3';
import { calculateScore, directionLabel } from './game-engine.js';

const $=(id)=>document.getElementById(id);
const AVATARS=['🐻','🐱','🐼','🐰','🐯','🦊','🐧','🐸','🐨','🦁','🐵','🐶'];
let selectedAvatar='🐻', uid=localStorage.getItem('kwb_player_uid')||crypto.randomUUID?.()||`u-${Date.now()}-${Math.random()}`;
localStorage.setItem('kwb_player_uid',uid);
let bus=null, state=null, joined=false, joinConfirmed=false, joinConfirmTimer=null, submittedFor=-1, timerLoop=null, solo=null, soloScore=0;

function show(id){['joinView','waitingView','countdownView','quizView','resultView','finishView'].forEach(x=>$(x).classList.toggle('hidden',x!==id));}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function initAvatars(){ $('avatarGrid').innerHTML=AVATARS.map((a,i)=>`<button class="avatar-btn ${i===0?'selected':''}" data-a="${a}">${a}</button>`).join(''); $('avatarGrid').onclick=e=>{const b=e.target.closest('.avatar-btn');if(!b)return;selectedAvatar=b.dataset.a;document.querySelectorAll('.avatar-btn').forEach(x=>x.classList.toggle('selected',x===b));}; }

const params=new URLSearchParams(location.search); const pinParam=params.get('pin'); const soloMode=params.get('solo')==='1'; const localMode=params.get('local')==='1';
if(pinParam)$('pinInput').value=pinParam;

function nowMs(){ return bus?.now ? bus.now() : Date.now(); }

async function join(){
  const pin=$('pinInput').value.trim(); const name=$('nameInput').value.trim();
  if(!/^\d{6}$/.test(pin))return setError('6자리 PIN을 입력하세요.');
  if(!name)return setError('이름을 입력하세요.');
  setError('');
  $('joinBtn').disabled=true;
  try {
    bus?.close();
    let initialRoom=null;
    if(localMode){
      initialRoom=readLocalRoom(pin);
      if(!initialRoom)throw new Error('로컬 테스트 방을 찾을 수 없습니다. 교사 화면과 같은 PC/브라우저에서 열어 주세요.');
      bus=new LocalBus(pin);
    }else{
      if(!isFirebaseConfigured())throw new Error('Firebase 연결 설정이 완료되지 않았습니다. 교사에게 알려 주세요.');
      bus=new FirebaseBus(pin,'player');
    }
    bus.on(handleMessage);
    if(bus.mode==='firebase'){
      await bus.init();
      uid=bus.uid;
      initialRoom=await bus.loadRoom();
      if(!initialRoom || initialRoom.status==='closed')throw new Error('방을 찾을 수 없습니다. PIN을 확인해 주세요.');
    }
    if(initialRoom.status!=='lobby')throw new Error('이미 게임이 시작된 방입니다.');
    joined=true;
    joinConfirmed=false;
    localStorage.setItem(`kwb_name_${pin}`,name); localStorage.setItem(`kwb_avatar_${pin}`,selectedAvatar);
    $('myAvatar').textContent=selectedAvatar;
    $('waitingName').textContent=`${name}님, 입장 요청 중...`;
    show('waitingView');
    await bus.send('join',{uid,name,avatar:selectedAvatar});
    if(bus.mode==='local') bus.send('request-state',{});
    clearTimeout(joinConfirmTimer);
    joinConfirmTimer=setTimeout(()=>{
      if(joined && !joinConfirmed){
        $('waitingName').textContent=`${name}님, 입장 확인 중...`;
      }
    },5000);
    if(bus.mode==='local'){
      setTimeout(()=>{const latest=readLocalRoom(pin);if(latest){state=toPublic(latest);renderState();}},100);
    }
  } catch(e) {
    joined=false;
    joinConfirmed=false;
    clearTimeout(joinConfirmTimer);
    bus?.close(); bus=null;
    setError(e?.message || '게임방에 입장하지 못했습니다.');
  } finally {
    $('joinBtn').disabled=false;
  }
}

function setError(t){$('joinError').textContent=t;}
function readLocalRoom(pin){try{return JSON.parse(localStorage.getItem(`kwb_room_${pin}`)||'null')}catch{return null}}
function toPublic(room){const q=room.quiz?.questions?.[room.questionIndex]||null;return {pin:room.pin,status:room.status,config:room.config,players:room.players,questionIndex:room.questionIndex,questionTotal:room.quiz?.questions?.length||0,questionStartAt:room.questionStartAt||0,questionEndAt:room.questionEndAt||0,countdownEndAt:room.countdownEndAt||0,resultEndAt:room.resultEndAt||0,currentQuestion:q?{id:q.id,direction:q.direction,prompt:q.prompt,options:q.options}:null,answeredUids:Object.keys(room.questionResults||{}),myResults:room.questionResults||{},revealAnswer:room.status==='result'&&q?q.answer:null};}
function handleMessage(msg){if(msg.type==='state'){state=msg.payload.room;renderState();}if(msg.type==='room-closed'){alert('교사가 방을 종료했습니다.');location.href='play.html';}}

function renderState(){
  if(!joined||!state)return;
  const me=state.players?.[uid]; if(!me)return;
  if(!joinConfirmed){
    joinConfirmed=true;
    clearTimeout(joinConfirmTimer);
    $('myAvatar').textContent=me.avatar||selectedAvatar;
    $('waitingName').textContent=`${me.name}님, 입장 완료!`;
  }
  if(state.status==='lobby'){show('waitingView');return;}
  if(state.status==='countdown'){show('countdownView');renderCountdown();startTimerLoop();return;}
  if(state.status==='playing'){show('quizView');renderQuiz(me);startTimerLoop();return;}
  if(state.status==='result'){show('resultView');renderResult(me);return;}
  if(state.status==='finished'){show('finishView');renderFinish(me);stopTimerLoop();return;}
}
function renderCountdown(){if(!state)return;const n=Math.max(1,Math.ceil((state.countdownEndAt-nowMs())/1000));$('playerCountdown').textContent=n;}
function renderQuiz(me){const q=state.currentQuestion;if(!q)return;$('playerQuestionCounter').textContent=`Q ${state.questionIndex+1}/${state.questionTotal}`;$('myScore').textContent=(me.score||0).toLocaleString();$('playerDirection').textContent=directionLabel(q.direction);$('playerPrompt').textContent=q.prompt;const already=state.answeredUids?.includes(uid);$('answerGrid').innerHTML=q.options.map((v,i)=>`<button class="answer-btn" data-i="${i}" ${already?'disabled':''}>${escapeHtml(v)}</button>`).join('');$('submitState').textContent=already?'제출 완료! 결과를 기다리세요.':'정답을 선택하세요.';if(already)submittedFor=state.questionIndex;}
function answer(i){if(!state||state.status!=='playing'||submittedFor===state.questionIndex)return;submittedFor=state.questionIndex;document.querySelectorAll('.answer-btn').forEach(b=>{b.disabled=true;b.classList.toggle('chosen',Number(b.dataset.i)===i)});$('submitState').textContent='제출 완료!';bus.send('answer',{uid,qIndex:state.questionIndex,choice:i});}
function renderResult(me){const r=state.myResults?.[uid];const correct=!!r?.correct;$('resultView').classList.toggle('wrong',!correct);$('resultIcon').textContent=correct?'✓':'×';$('resultTitle').textContent=correct?'정답!':'아쉬워요';$('resultAnswer').textContent=`정답: ${state.revealAnswer||'-'}`;$('resultPoints').textContent=correct?`+${(r.points||0).toLocaleString()} pt`:'+0 pt';}
function renderFinish(me){const players=Object.values(state.players||{}).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'ko'));const rank=players.findIndex(p=>p.uid===uid)+1;$('finishAvatar').textContent=me.avatar;$('finishName').textContent=`${me.name}님, 수고했어요!`;$('finishScore').textContent=(me.score||0).toLocaleString();$('finishRank').textContent=rank>0?`${rank}위`:'-';}
function startTimerLoop(){if(timerLoop)return;timerLoop=setInterval(()=>{if(!state)return;if(state.status==='countdown')renderCountdown();if(state.status==='playing'){const d=state.config.timeLimit*1000;const r=Math.max(0,Math.min(d,state.questionEndAt-nowMs()));$('playerTimerBar').style.width=`${r/d*100}%`;$('playerTimerText').textContent=(r/1000).toFixed(1);}},80)}
function stopTimerLoop(){clearInterval(timerLoop);timerLoop=null;}
if(!soloMode)$('answerGrid').addEventListener('click',e=>{const b=e.target.closest('.answer-btn');if(b)answer(Number(b.dataset.i));});

function startSoloMode(){
  try{solo=JSON.parse(localStorage.getItem('kwb_solo_payload')||'null');}catch{}
  if(!solo?.quiz?.questions?.length){alert('교사용 화면에서 [테스트 플레이]를 먼저 눌러 주세요.');location.href='index.html';return;}
  uid='solo';selectedAvatar='🐻';soloScore=0;show('countdownView');let countEnd=nowMs()+3200;state={status:'countdown',countdownEndAt:countEnd};startTimerLoop();
  const wait=setInterval(()=>{renderCountdown();if(nowMs()>=countEnd){clearInterval(wait);runSoloQuestion(0);}},80);
}
function runSoloQuestion(index){
  if(index>=solo.quiz.questions.length)return finishSolo();
  const q=solo.quiz.questions[index];const duration=solo.config.timeLimit*1000;submittedFor=-1;
  state={status:'playing',questionIndex:index,questionTotal:solo.quiz.questions.length,currentQuestion:{direction:q.direction,prompt:q.prompt,options:q.options},questionStartAt:nowMs()+200,questionEndAt:nowMs()+200+duration,config:solo.config,players:{solo:{uid:'solo',name:'교사 테스트',avatar:'🐻',score:soloScore}},answeredUids:[]};
  show('quizView');renderQuiz(state.players.solo);startTimerLoop();
  const checker=setInterval(()=>{if(state.status==='playing'&&nowMs()>=state.questionEndAt){clearInterval(checker);soloReveal(index,null,0,false);}},80);
  $('answerGrid').onclick=e=>{const b=e.target.closest('.answer-btn');if(!b||state.status!=='playing')return;const choice=Number(b.dataset.i);const elapsed=Math.max(0,nowMs()-state.questionStartAt);const correct=choice===q.correctIndex;const pts=calculateScore(duration,elapsed,correct);clearInterval(checker);soloScore+=pts;soloReveal(index,q.answer,pts,correct);};
}
function soloReveal(index,answerText,pts,correct){state.status='result';show('resultView');$('resultView').classList.toggle('wrong',!correct);$('resultIcon').textContent=correct?'✓':'×';$('resultTitle').textContent=correct?'정답!':'아쉬워요';$('resultAnswer').textContent=`정답: ${answerText||solo.quiz.questions[index].answer}`;$('resultPoints').textContent=`+${pts.toLocaleString()} pt`;setTimeout(()=>runSoloQuestion(index+1),1600);}
function finishSolo(){stopTimerLoop();show('finishView');$('finishAvatar').textContent='🧑‍🏫';$('finishName').textContent='테스트 완료';$('finishScore').textContent=soloScore.toLocaleString();$('finishRank').textContent=`${solo.quiz.questions.length}문제 완료`;$('finishNote').textContent='창을 닫고 교사용 설정 화면으로 돌아가세요.';}

initAvatars();$('joinBtn').addEventListener('click',join);$('nameInput').addEventListener('keydown',e=>{if(e.key==='Enter')join()});
if(soloMode)startSoloMode();else show('joinView');
