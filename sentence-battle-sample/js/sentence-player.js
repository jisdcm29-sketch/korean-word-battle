import { SentencePlayerBus } from './sentence-live.js?v=1.9';

const $=id=>document.getElementById(id);
const els={joinView:$('joinView'),waitView:$('waitView'),countdownView:$('countdownView'),playView:$('playView'),resultView:$('resultView'),studentFinalView:$('studentFinalView'),closedView:$('closedView'),pinInput:$('pinInput'),nameInput:$('nameInput'),avatarGrid:$('avatarGrid'),joinBtn:$('joinBtn'),joinMessage:$('joinMessage'),myAvatar:$('myAvatar'),waitName:$('waitName'),waitPin:$('waitPin'),studentCountdown:$('studentCountdown'),studentQuestion:$('studentQuestion'),studentScore:$('studentScore'),studentTimer:$('studentTimer'),studentTimerBar:$('studentTimerBar'),studentAnswer:$('studentAnswer'),studentCards:$('studentCards'),submitState:$('submitState'),undoBtn:$('undoBtn'),resetBtn:$('resetBtn'),submitBtn:$('submitBtn'),studentReveal:$('studentReveal'),myRoundResult:$('myRoundResult'),myFinalScore:$('myFinalScore'),myFinalRank:$('myFinalRank'),studentFinalRanking:$('studentFinalRanking'),leaveBtn:$('leaveBtn'),closedHomeBtn:$('closedHomeBtn')};
const AVATARS=['🦊','🐰','🐯','🐼','🐱','🐻','🐸','🦁'];
const BOUND_TEXTS=new Set(['은','는','이','가','을','를','에','에서','에게','한테','께','하고','와','과','도','만','부터','까지','으로','로','의','보다','처럼','입니다','입니까','이에요','예요']);
function terminalBase(text){return String(text||'').trim().replace(/[.。!！?？]+$/g,'');}
function isBoundText(text){return BOUND_TEXTS.has(terminalBase(text));}
let selectedAvatar='🦊',bus=null,state=null,currentQuestionIndex=-1,currentTokens=[],available=[],chosen=[],submitted=false,timerRaf=null,countdownRaf=null;

function setView(name){['join','wait','countdown','play','result','studentFinal','closed'].forEach(v=>els[`${v}View`]?.classList.toggle('hidden',v!==name));}
function now(){return bus?.now?.()||Date.now();}
function safe(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function myUid(){return bus?.uid||'';}
function myPlayer(){return state?.players?.[myUid()]||null;}
function ranking(){return Object.values(state?.players||{}).sort((a,b)=>(b.score||0)-(a.score||0)||a.name.localeCompare(b.name));}
function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

function initAvatars(){els.avatarGrid.innerHTML=AVATARS.map(a=>`<button type="button" class="avatar-btn ${a===selectedAvatar?'active':''}" data-avatar="${a}">${a}</button>`).join('');els.avatarGrid.addEventListener('click',e=>{const b=e.target.closest('.avatar-btn');if(!b)return;selectedAvatar=b.dataset.avatar;document.querySelectorAll('.avatar-btn').forEach(x=>x.classList.toggle('active',x===b));});}

async function joinRoom(){
  const pin=els.pinInput.value.trim(),name=els.nameInput.value.trim();
  if(!/^\d{6}$/.test(pin)){els.joinMessage.textContent='6자리 PIN을 입력해 주세요.';return;}
  if(!name){els.joinMessage.textContent='닉네임을 입력해 주세요.';return;}
  els.joinBtn.disabled=true;els.joinMessage.textContent='게임방 확인 중...';
  try{
    bus?.close();bus=new SentencePlayerBus(pin);bus.on(handleBus);await bus.init();
    if(!(await bus.exists()))throw new Error('문장 배틀 게임방을 찾을 수 없습니다.');
    localStorage.setItem('sentence_sample_name',name);localStorage.setItem('sentence_sample_avatar',selectedAvatar);
    await bus.send('join',{name,avatar:selectedAvatar});
    els.myAvatar.textContent=selectedAvatar;els.waitName.textContent=name;els.waitPin.textContent=pin;setView('wait');els.joinMessage.textContent='';
  }catch(err){els.joinMessage.textContent=err.message;bus?.close();bus=null;setView('join');}finally{els.joinBtn.disabled=false;}
}

function handleBus(msg){if(msg.type==='closed'){stopLoops();setView('closed');return;}if(msg.type!=='state')return;state=msg.state;if(state.kind!=='sentence-sample'){els.joinMessage.textContent='문장 배틀 방이 아닙니다.';return;}renderState();}
function renderState(){
  const p=myPlayer();if(p)els.studentScore.textContent=Number(p.score||0).toLocaleString();
  if(state.status==='lobby'){setView('wait');return;}
  if(state.status==='countdown'){setView('countdown');runCountdown();return;}
  if(state.status==='playing'){setView('play');if(currentQuestionIndex!==state.questionIndex)loadQuestion();else updateTimer();return;}
  if(state.status==='result'){showResult();return;}
  if(state.status==='finished'){showFinal();return;}
  if(state.status==='closed'){setView('closed');}
}
function runCountdown(){cancelAnimationFrame(countdownRaf);const frame=()=>{if(!state||state.status!=='countdown')return;const left=Math.max(0,(state.countdownEndAt||0)-now());els.studentCountdown.textContent=left<=0?'GO!':String(Math.max(1,Math.ceil(left/1000)));if(left>0)countdownRaf=requestAnimationFrame(frame);};countdownRaf=requestAnimationFrame(frame);}

function loadQuestion(){
  currentQuestionIndex=state.questionIndex;currentTokens=(state.currentQuestion?.tokens||[]).map(t=>[...t]);available=[...currentTokens];chosen=[];submitted=false;els.studentQuestion.textContent=`Q ${state.questionIndex+1}/${state.questionTotal}`;els.submitState.textContent='';els.submitState.className='submit-state';renderCards(true);updateTimer();runTimer();
}
function renderCards(animate=false){
  els.studentCards.innerHTML='';available.forEach((tok,i)=>{const b=document.createElement('button');b.type='button';b.className='sentence-card'+(animate?' drop':'');b.textContent=tok[1];b.dataset.id=tok[0];if(animate){b.style.setProperty('--delay',`${i*65}ms`);b.style.setProperty('--x',`${Math.floor(Math.random()*220-110)}px`);b.style.setProperty('--r',`${Math.floor(Math.random()*26-13)}deg`);}b.addEventListener('click',()=>choose(tok[0]));els.studentCards.append(b);});renderAnswer();els.submitBtn.disabled=submitted||available.length>0;els.undoBtn.disabled=submitted||chosen.length===0;els.resetBtn.disabled=submitted||chosen.length===0;}
function choose(id){if(submitted)return;const i=available.findIndex(t=>t[0]===id);if(i<0)return;const [tok]=available.splice(i,1);chosen.push(tok);renderCards(false);}
function renderAnswer(){if(!chosen.length){els.studentAnswer.textContent='카드를 순서대로 눌러 주세요';els.studentAnswer.classList.add('empty');return;}els.studentAnswer.classList.remove('empty');const words=[];for(const [,text] of chosen){if(words.length&&isBoundText(text))words[words.length-1]+=text;else words.push(text);}let s=words.join(' ');if(!available.length&&!/[.!?]$/.test(s))s+='.';els.studentAnswer.textContent=s;}
function undo(){if(submitted||!chosen.length)return;available.push(chosen.pop());renderCards(false);}
function reset(){if(submitted)return;available=[...currentTokens];chosen=[];renderCards(false);}
async function submit(){if(submitted||available.length)return;submitted=true;renderCards(false);els.submitState.textContent='제출 완료 · 결과를 기다리는 중';els.submitState.className='submit-state done';try{await bus.send('submit',{questionIndex:state.questionIndex,order:chosen.map(t=>t[0])});}catch{els.submitState.textContent='제출 전송에 실패했습니다.';}}
function updateTimer(){if(!state||state.status!=='playing')return;const total=(state.config?.timeLimit||20)*1000,left=Math.max(0,(state.questionEndAt||0)-now());els.studentTimer.textContent=(left/1000).toFixed(1);els.studentTimerBar.style.width=`${Math.max(0,left/total*100)}%`;if(left<=0&&!submitted){submitted=true;renderCards(false);els.submitState.textContent='시간 종료';}}
function runTimer(){cancelAnimationFrame(timerRaf);const frame=()=>{if(!state||state.status!=='playing')return;updateTimer();if((state.questionEndAt||0)>now())timerRaf=requestAnimationFrame(frame);};timerRaf=requestAnimationFrame(frame);}


function fitRevealSentence(){
  const el=els.studentReveal;
  if(!el)return;
  el.classList.remove('allow-wrap');
  el.style.fontSize='34px';
  const min=21;
  let size=34;
  // 가능한 한 한 줄 유지: 글자 크기를 조금씩 줄여 컨테이너 폭에 맞춥니다.
  while(size>min && el.scrollWidth>el.clientWidth){
    size-=1;
    el.style.fontSize=`${size}px`;
  }
  // 최소 크기로도 한 줄이 불가능하면 띄어쓰기 위치에서만 두 줄 허용합니다.
  if(el.scrollWidth>el.clientWidth){
    el.classList.add('allow-wrap');
    el.style.fontSize='27px';
    requestAnimationFrame(()=>{
      let s=27;
      while(s>20 && el.scrollHeight>Math.ceil(parseFloat(getComputedStyle(el).lineHeight))*2+4){
        s-=1;
        el.style.fontSize=`${s}px`;
      }
    });
  }
}

function showResult(){stopLoops();setView('result');els.studentReveal.textContent=state.revealSentence||'';requestAnimationFrame(fitRevealSentence);const r=state.roundResults?.[myUid()];els.myRoundResult.className='my-round-result';if(r?.correct){els.myRoundResult.textContent=`${r.rank}등 · +${Number(r.points||0).toLocaleString()}점`;els.myRoundResult.classList.add('good');}else if(r){els.myRoundResult.textContent='오답 · 0점';els.myRoundResult.classList.add('bad');}else{els.myRoundResult.textContent='시간 종료 · 0점';els.myRoundResult.classList.add('bad');}}
function showFinal(){stopLoops();setView('studentFinal');const p=myPlayer(),list=ranking(),rank=list.findIndex(x=>x.uid===myUid())+1;els.myFinalScore.textContent=Number(p?.score||0).toLocaleString();els.myFinalRank.textContent=rank>0?`${rank}위`:'-위';els.studentFinalRanking.innerHTML=list.slice(0,10).map((x,i)=>`<div class="student-rank-row ${x.uid===myUid()?'me':''}"><b>${i+1}</b><span>${safe(x.avatar)}</span><strong>${safe(x.name)}</strong><em>${Number(x.score||0).toLocaleString()}</em></div>`).join('');}
function stopLoops(){cancelAnimationFrame(timerRaf);cancelAnimationFrame(countdownRaf);timerRaf=countdownRaf=null;}
function resetHome(){stopLoops();bus?.close();bus=null;state=null;currentQuestionIndex=-1;els.joinMessage.textContent='';setView('join');}

els.joinBtn.addEventListener('click',joinRoom);els.pinInput.addEventListener('keydown',e=>{if(e.key==='Enter')els.nameInput.focus();});els.nameInput.addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom();});els.undoBtn.addEventListener('click',undo);els.resetBtn.addEventListener('click',reset);els.submitBtn.addEventListener('click',submit);els.leaveBtn.addEventListener('click',resetHome);els.closedHomeBtn.addEventListener('click',resetHome);
window.addEventListener('pagehide',()=>{try{if(bus&&state?.status==='lobby')bus.send('leave',{});}catch{}});

const params=new URLSearchParams(location.search);const pin=params.get('pin')||'';if(pin)els.pinInput.value=pin;els.nameInput.value=localStorage.getItem('sentence_sample_name')||'';const savedAvatar=localStorage.getItem('sentence_sample_avatar');if(savedAvatar&&AVATARS.includes(savedAvatar))selectedAvatar=savedAvatar;initAvatars();setView('join');
