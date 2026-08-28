import { SentenceHostBus, createUniquePin, serverNow, firebaseReady } from './sentence-live.js?v=2.1';

const launchParams=new URLSearchParams(location.search);
const selectedBook=launchParams.get('book')||'1A';
const selectedLesson=Math.max(1,Number(launchParams.get('lesson'))||1);

let teacherQuestions=[];
let lessonDataMeta=null;

async function loadLessonQuestions(){
  const lessonCode=String(selectedLesson).padStart(2,'0');
  const dataUrl=`../data/sentence/snu/${encodeURIComponent(selectedBook)}/lesson${lessonCode}.json`;
  const response=await fetch(dataUrl,{cache:'no-store'});
  if(!response.ok)throw new Error(`서울대 ${selectedBook} ${selectedLesson}과 문장 데이터를 불러올 수 없습니다. (${response.status})`);
  const data=await response.json();
  const questions=Array.isArray(data?.questions)?data.questions:[];
  if(!questions.length)throw new Error(`서울대 ${selectedBook} ${selectedLesson}과에 사용할 문장 데이터가 없습니다.`);
  teacherQuestions=questions.map((q,index)=>{
    const tokens=Array.isArray(q.tokens)?q.tokens.map(t=>[String(t[0]),String(t[1])]):[];
    const acceptedOrders=Array.isArray(q.acceptedOrders)?q.acceptedOrders.map(o=>o.map(String)):[];
    const flexibleFrames=Array.isArray(q.flexibleFrames)&&q.flexibleFrames.length
      ? q.flexibleFrames.map(f=>({units:(f.units||[]).map(u=>u.map(String)),tail:(f.tail||[]).map(String)}))
      : inferFlexibleFrames(tokens,acceptedOrders);
    return {...q,id:String(q.id||`SNU-${selectedBook}-${lessonCode}-${String(index+1).padStart(3,'0')}`),tokens,acceptedOrders,flexibleFrames,displaySentence:String(q.displaySentence||''),enabled:true,edited:false,custom:false};
  }).filter(q=>q.tokens.length>=2&&q.acceptedOrders.length);
  if(!teacherQuestions.length)throw new Error(`서울대 ${selectedBook} ${selectedLesson}과 문장 데이터 형식이 올바르지 않습니다.`);
  lessonDataMeta=data;
}
const DEMO_NAMES=[['Бат','🦊'],['Солонго','🐰'],['Тэмүүжин','🐯'],['Номин','🐼'],['Ану','🐱'],['Мөнх','🐻'],['Саруул','🐸'],['Энхжин','🦁'],['Төгөлдөр','🐨'],['Болор','🦄']];
const SCORE_TABLE=[1200,1050,950,875,800,750,700,650,600,550];
const BOUND_TEXTS=new Set(['은','는','이','가','을','를','에','에서','에게','한테','께','하고','와','과','도','만','부터','까지','으로','로','의','보다','처럼','입니다','입니까','이에요','예요']);
const AUTO_PARTICLES=['에서','에게','한테','께','부터','까지','으로','보다','처럼','하고','은','는','이','가','을','를','에','도','만','와','과','로','의'];
const AUTO_COPULAS=['입니다','입니까','이에요','예요'];

const $=id=>document.getElementById(id);
const els={
  setupView:$('setupView'),lobbyView:$('lobbyView'),gameView:$('gameView'),finalView:$('finalView'),sentenceBookContext:$('sentenceBookContext'),sentenceContextNote:$('sentenceContextNote'),
  timeInput:$('timeInput'),openQuestionManagerBtn:$('openQuestionManagerBtn'),selectedQuestionBadge:$('selectedQuestionBadge'),
  createRoomBtn:$('createRoomBtn'),demoBtn:$('demoBtn'),setupMessage:$('setupMessage'),
  roomPin:$('roomPin'),joinLabel:$('joinLabel'),qrBox:$('qrBox'),openPlayerBtn:$('openPlayerBtn'),joinUrl:$('joinUrl'),localhostHint:$('localhostHint'),
  lobbyPlayers:$('lobbyPlayers'),lobbyCount:$('lobbyCount'),startGameBtn:$('startGameBtn'),lobbyHomeBtn:$('lobbyHomeBtn'),
  questionLabel:$('questionLabel'),playerCount:$('playerCount'),roundNumber:$('roundNumber'),bigTimer:$('bigTimer'),circleTimer:$('circleTimer'),promptCards:$('promptCards'),submittedCount:$('submittedCount'),submittedTotal:$('submittedTotal'),
  playingStage:$('playingStage'),revealStage:$('revealStage'),revealedSentence:$('revealedSentence'),variantNote:$('variantNote'),revealTimer:$('revealTimer'),rankPanel:$('rankPanel'),rankTitle:$('rankTitle'),rankSubtitle:$('rankSubtitle'),rankList:$('rankList'),rankBlindMessage:$('rankBlindMessage'),countdown:$('countdown'),
  gameHomeBtn:$('gameHomeBtn'),finalViewCard:$('finalView'),finalRanking:$('finalRanking'),finalHomeBtn:$('finalHomeBtn'),finalAgainBtn:$('finalAgainBtn'),
  questionManager:$('questionManager'),closeQuestionManagerBtn:$('closeQuestionManagerBtn'),addQuestionBtn:$('addQuestionBtn'),selectAllQuestionsBtn:$('selectAllQuestionsBtn'),clearAllQuestionsBtn:$('clearAllQuestionsBtn'),managerSelectedCount:$('managerSelectedCount'),managerTotalCount:$('managerTotalCount'),questionList:$('questionList'),applyQuestionManagerBtn:$('applyQuestionManagerBtn'),
  newQuestionEditor:$('newQuestionEditor'),closeNewQuestionBtn:$('closeNewQuestionBtn'),cancelNewQuestionBtn:$('cancelNewQuestionBtn'),saveNewQuestionBtn:$('saveNewQuestionBtn'),autoCardsBtn:$('autoCardsBtn'),newSentenceInput:$('newSentenceInput'),newCardsInput:$('newCardsInput'),newAnswersInput:$('newAnswersInput'),newQuestionError:$('newQuestionError'),
  fireworksLayer:$('fireworksLayer'),correctToast:$('correctToast')
};

let room=null,bus=null,isDemo=false,fullQuestions=[],currentQuestion=null,roundSubmissions=new Map(),correctCount=0,roundTimers=[],raf=null,revealRaf=null,countdownTimer=null;
let audioCtx=null,muted=false,volume=1,editingQuestionIndex=null,lastMode='actual';
let tensionTimer=null,toastTimer=null;
let tensionBedNodes=[];

function cloneQuestions(){return teacherQuestions.filter(q=>q.enabled).map(q=>({...q,tokens:q.tokens.map(t=>[...t]),acceptedOrders:q.acceptedOrders.map(o=>[...o]),flexibleFrames:(q.flexibleFrames||[]).map(f=>({units:f.units.map(u=>[...u]),tail:[...(f.tail||[])]}))}));}
function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function sameOrder(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i]);}
function startsWithOrder(order,pos,unit){return pos+unit.length<=order.length&&unit.every((id,i)=>order[pos+i]===id);}
function matchesFlexibleFrame(order,frame){
  const tail=Array.isArray(frame?.tail)?frame.tail:[],units=Array.isArray(frame?.units)?frame.units:[];
  const bodyLength=units.reduce((n,u)=>n+u.length,0);
  if(order.length!==bodyLength+tail.length)return false;
  if(tail.length&&!sameOrder(order.slice(bodyLength),tail))return false;
  const body=order.slice(0,bodyLength),used=new Array(units.length).fill(false);
  function walk(pos,count){
    if(count===units.length)return pos===body.length;
    for(let i=0;i<units.length;i++){
      if(used[i]||!startsWithOrder(body,pos,units[i]))continue;
      used[i]=true;if(walk(pos+units[i].length,count+1))return true;used[i]=false;
    }
    return false;
  }
  return walk(0,0);
}
function isCorrectOrder(order,q){
  if(q.acceptedOrders.some(ans=>sameOrder(order,ans)))return true;
  return (q.flexibleFrames||[]).some(frame=>matchesFlexibleFrame(order,frame));
}
function randomCorrectOrder(q){
  const frames=q.flexibleFrames||[];
  if(frames.length&&Math.random()<.8){const frame=frames[Math.floor(Math.random()*frames.length)];return shuffle(frame.units).flat().concat(frame.tail||[]);}
  const answers=q.acceptedOrders||[];return answers.length?[...answers[Math.floor(Math.random()*answers.length)]]:[];
}
function flexibleOrderCount(q){
  const seen=new Set((q.acceptedOrders||[]).map(o=>o.join('\u0001'))),frames=q.flexibleFrames||[];
  for(const frame of frames){
    const units=frame.units||[],tail=frame.tail||[],used=new Array(units.length).fill(false),path=[];
    const walk=()=>{if(seen.size>=240)return;if(path.length===units.length){seen.add(path.flat().concat(tail).join('\u0001'));return;}for(let i=0;i<units.length;i++){if(used[i])continue;used[i]=true;path.push(units[i]);walk();path.pop();used[i]=false;}};walk();
  }
  return seen.size;
}
function playerArray(){return Object.values(room?.players||{}).sort((a,b)=>(b.score||0)-(a.score||0)||a.name.localeCompare(b.name));}
function activePlayerCount(){return Object.keys(room?.players||{}).length;}
function pointForRank(rank){return SCORE_TABLE[rank-1] ?? Math.max(300,550-(rank-10)*40);}
function now(){return bus?.now?.()||serverNow();}

function setView(name){['setup','lobby','game','final'].forEach(v=>els[`${v}View`]?.classList.toggle('hidden',v!==name));}
function safeText(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

function initAudio(){if(muted)return;if(!audioCtx){const C=window.AudioContext||window.webkitAudioContext;if(C)audioCtx=new C();}if(audioCtx?.state==='suspended')audioCtx.resume();}
function tone(freq=440,dur=.08,type='sine',gain=.05,delay=0){if(muted||volume<=0)return;initAudio();if(!audioCtx)return;const t=audioCtx.currentTime+delay,o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0001,gain*volume),t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g);g.connect(audioCtx.destination);o.start(t);o.stop(t+dur+.03);}
function sfx(kind){if(kind==='tick')tone(340,.06,'square',.055);if(kind==='start'){tone(470,.1,'square',.085);tone(650,.15,'square',.095,.09);}if(kind==='answer'){tone(520,.13,'triangle',.095);tone(690,.16,'triangle',.11,.08);tone(860,.2,'triangle',.12,.16);}if(kind==='join')tone(620,.11,'sine',.065);if(kind==='submit')tone(430,.07,'triangle',.05);}
function syncVolume(){document.querySelectorAll('.volume-slider').forEach(x=>x.value=String(Math.round(volume*100)));document.querySelectorAll('.volume-label').forEach(x=>x.textContent=`${Math.round(volume*100)}%`);document.querySelectorAll('.sound-toggle').forEach(x=>x.textContent=(muted||volume===0)?'🔇':volume<.5?'🔉':'🔊');}

function stopTensionBed(){
  tensionBedNodes.forEach(node=>{try{node.stop?.();}catch{} try{node.disconnect?.();}catch{}});
  tensionBedNodes=[];
}
function startTensionBed(){
  stopTensionBed();
  if(muted||volume<=0)return;
  initAudio();
  if(!audioCtx)return;
  const t=audioCtx.currentTime;
  const master=audioCtx.createGain();
  master.gain.setValueAtTime(Math.max(.0001,.11*volume),t);
  master.connect(audioCtx.destination);

  const bass=audioCtx.createOscillator();
  const bassGain=audioCtx.createGain();
  bass.type='sine'; bass.frequency.setValueAtTime(82,t);
  bassGain.gain.setValueAtTime(.58,t);
  bass.connect(bassGain); bassGain.connect(master); bass.start(t);

  const mid=audioCtx.createOscillator();
  const midGain=audioCtx.createGain();
  mid.type='triangle'; mid.frequency.setValueAtTime(123,t);
  midGain.gain.setValueAtTime(.22,t);
  mid.connect(midGain); midGain.connect(master); mid.start(t);

  const lfo=audioCtx.createOscillator();
  const lfoGain=audioCtx.createGain();
  lfo.type='sine'; lfo.frequency.setValueAtTime(2.25,t); lfoGain.gain.setValueAtTime(.065,t);
  lfo.connect(lfoGain); lfoGain.connect(master.gain); lfo.start(t);
  tensionBedNodes=[bass,mid,lfo,bassGain,midGain,lfoGain,master];
}
function stopTensionAudio(){if(tensionTimer){clearTimeout(tensionTimer);tensionTimer=null;}stopTensionBed();}
function startTensionAudio(){
  stopTensionAudio();
  startTensionBed();
  const pulse=()=>{
    if(!room||room.status!=='playing'){stopTensionAudio();return;}
    const left=Math.max(0,(room.questionEndAt||0)-now());
    const ratio=room.config?.timeLimit?left/(room.config.timeLimit*1000):1;
    if(!muted&&volume>0){
      const urgent=left<=5000;
      const tense=left<=10000;
      // 분명하게 들리는 리듬 + 고음 펄스. 마지막 5초는 더 빠르고 강하게.
      tone(urgent?168:tense?148:132,urgent?.15:.12,'triangle',urgent?.11:.075);
      tone(urgent?252:tense?222:198,urgent?.11:.09,'square',urgent?.055:.038,urgent?.06:.07);
      if(urgent)tone(336,.07,'sine',.04,.12);
    }
    const delay=left<=5000?240:left<=10000?360:Math.round(500+130*Math.max(0,ratio));
    tensionTimer=setTimeout(pulse,Math.max(210,delay));
  };
  pulse();
}

function createFireworkBurst(x,y,hue,particles=20){
  if(!els.fireworksLayer)return;
  const burst=document.createElement('div');burst.className='firework-burst';burst.style.left=`${x}%`;burst.style.top=`${y}%`;burst.style.setProperty('--hue',String(hue));
  const ring=document.createElement('span');ring.className='firework-ring';ring.style.setProperty('--hue',String(hue));burst.append(ring);
  for(let i=0;i<particles;i++){
    const p=document.createElement('span');p.className='firework-particle';const angle=(Math.PI*2*i/particles)+(Math.random()*.22-.11),distance=72+Math.random()*115;
    p.style.setProperty('--hue',String((hue+Math.random()*34-17+360)%360));p.style.setProperty('--dx',`${Math.cos(angle)*distance}px`);p.style.setProperty('--dy',`${Math.sin(angle)*distance}px`);p.style.setProperty('--dur',`${.72+Math.random()*.42}s`);burst.append(p);
  }
  els.fireworksLayer.append(burst);setTimeout(()=>burst.remove(),1350);
}
function celebrateCorrect(uid,rank,points){
  const p=room?.players?.[uid];if(!p)return;
  sfx('answer');
  const bursts=4;
  for(let i=0;i<bursts;i++)setTimeout(()=>createFireworkBurst(14+Math.random()*72,22+Math.random()*55,Math.floor(Math.random()*360),18+Math.floor(Math.random()*8)),i*105);
  if(els.correctToast){
    if(toastTimer)clearTimeout(toastTimer);els.correctToast.classList.remove('hidden');void els.correctToast.offsetWidth;els.correctToast.classList.remove('correct-toast');void els.correctToast.offsetWidth;els.correctToast.classList.add('correct-toast');
    els.correctToast.innerHTML=`<span class="toast-avatar">${safeText(p.avatar)}</span><span><b>${safeText(p.name)}</b> 정답!</span><span class="toast-points">+${Number(points||0).toLocaleString()}점</span>`;
    toastTimer=setTimeout(()=>{els.correctToast?.classList.add('hidden');},900);
  }
}

function assembleSentence(order,q){const map=new Map(q.tokens),words=[];for(const id of order){const text=map.get(id)||'';if(words.length&&BOUND_TEXTS.has(text))words[words.length-1]+=text;else words.push(text);}let s=words.join(' ').trim();if(s&&!/[.!?]$/.test(s))s+='.';return s;}
function canonicalSentence(q){return String(q?.displaySentence||'').trim()||assembleSentence(q.acceptedOrders[0]||[],q);}

function publicRoomState(){
  return {
    kind:'sentence-sample',pin:room.pin,status:room.status,title:'문장 배틀',demoMode:isDemo,
    config:{timeLimit:room.config.timeLimit,revealSeconds:5,questionTotal:fullQuestions.length,sourceType:'snu',snuBook:room.config.snuBook||selectedBook,snuLesson:room.config.snuLesson||selectedLesson},
    players:room.players,questionIndex:room.questionIndex,questionTotal:fullQuestions.length,
    countdownEndAt:room.countdownEndAt||0,questionStartAt:room.questionStartAt||0,questionEndAt:room.questionEndAt||0,resultEndAt:room.resultEndAt||0,
    currentQuestion:room.currentQuestion||null,answerCount:room.answerCount||0,roundResults:room.status==='result'?room.roundResults||{}:{},
    revealSentence:room.status==='result'?room.revealSentence||'':null,variantCount:room.status==='result'?room.variantCount||1:0,finishedAt:room.finishedAt||0
  };
}
async function persist(){if(bus&&!isDemo)await bus.saveState(publicRoomState());}

function renderLobby(){
  const players=Object.values(room?.players||{});
  els.lobbyCount.textContent=String(players.length);
  els.lobbyPlayers.innerHTML=players.length?players.map(p=>`<div class="lobby-player"><span class="avatar">${safeText(p.avatar)}</span><b>${safeText(p.name)}</b></div>`).join(''):'<div class="lobby-player"><span class="avatar">⏳</span><b>학생 입장을 기다리는 중</b></div>';
  els.startGameBtn.disabled=players.length<1;
}
function isRankBlind(){
  if(!room||!fullQuestions.length||room.questionIndex<0)return false;
  const blindCount=Math.max(1,Math.ceil(fullQuestions.length*.30));
  return room.questionIndex>=fullQuestions.length-blindCount && room.status!=='finished';
}
function renderRank(){
  const blind=isRankBlind();
  els.rankPanel?.classList.toggle('rank-blind',blind);
  els.rankBlindMessage?.classList.toggle('hidden',!blind);
  if(els.rankTitle)els.rankTitle.textContent=blind?'🔒 순위 비공개':'🏆 실시간 순위';
  if(els.rankSubtitle)els.rankSubtitle.textContent=blind?'마지막 30%':'동시 문장 배틀';
  if(blind){els.rankList.innerHTML='';return;}
  const list=playerArray();
  els.rankList.innerHTML=list.length?list.map((p,i)=>`<div class="rank-row ${i===0?'top1':''}"><span class="rank-pos">${i+1}</span><span class="rank-avatar">${safeText(p.avatar)}</span><span class="rank-name">${safeText(p.name)}</span><span class="rank-score">${Number(p.score||0).toLocaleString()}</span></div>`).join(''):'<div class="rank-row"><span class="rank-pos">-</span><span class="rank-avatar">⏳</span><span class="rank-name">대기 중</span><span class="rank-score">0</span></div>';
}
function renderPromptCards(){
  if(!els.promptCards)return;
  const tokens=room?.currentQuestion?.tokens||[];
  els.promptCards.innerHTML=tokens.length
    ? tokens.map(([,text])=>`<span class="prompt-card">${safeText(text)}</span>`).join('')
    : '';
}
function renderGameMeta(){els.questionLabel.textContent=`Q ${room.questionIndex+1}/${fullQuestions.length}`;els.roundNumber.textContent=String(room.questionIndex+1);els.playerCount.textContent=String(activePlayerCount());els.submittedTotal.textContent=String(activePlayerCount());els.submittedCount.textContent=String(room.answerCount||0);renderPromptCards();renderRank();}

function buildJoinUrl(){const u=new URL('play.html',location.href);u.searchParams.set('pin',room.pin);return u.href;}
function renderQr(url){els.qrBox.innerHTML='';if(window.QRCode)new QRCode(els.qrBox,{text:url,width:170,height:170,correctLevel:QRCode.CorrectLevel.M});else els.qrBox.textContent='QR 로드 실패';}

async function createRoom(demo=false){
  try{
    initAudio();
    fullQuestions=cloneQuestions();
    if(!fullQuestions.length){openQuestionManager();return;}
    const timeLimit=Math.max(5,Math.min(60,Number(els.timeInput.value)||20));els.timeInput.value=String(timeLimit);
    isDemo=demo;lastMode=demo?'demo':'actual';clearRuntime();document.body.classList.toggle('demo-mode',demo);
    if(!demo&&!firebaseReady())throw new Error('실제 학생 입장 테스트에는 Firebase 설정이 필요합니다.');
    const pin=demo?String(Math.floor(100000+Math.random()*900000)):await createUniquePin();
    room={pin,status:'lobby',config:{timeLimit,sourceType:'snu',snuBook:selectedBook,snuLesson:selectedLesson},players:{},questionIndex:-1,answerCount:0,roundResults:{},createdAt:Date.now()};
    if(demo){DEMO_NAMES.forEach(([name,avatar],i)=>{room.players[`demo-${i+1}`]={uid:`demo-${i+1}`,name,avatar,score:0};});}
    else{
      bus=new SentenceHostBus(pin);bus.on(handleMessage);await bus.init();await bus.createRoom(publicRoomState());
    }
    els.roomPin.textContent=demo?'DEMO':pin;els.joinLabel.textContent=demo?'10명 자동 시연':'GAME PIN';
    const join=buildJoinUrl();els.joinUrl.textContent=join;renderQr(join);els.openPlayerBtn.onclick=()=>{const preview=new URL(join);preview.searchParams.set('preview','1');window.open(preview.href,'_blank');};
    els.localhostHint.classList.toggle('hidden',location.hostname!=='localhost'&&location.hostname!=='127.0.0.1');
    renderLobby();setView('lobby');sfx('start');
  }catch(err){els.setupMessage.textContent=err.message;els.setupMessage.style.color='#ffb1bd';}
}

async function handleMessage(msg){
  if(!room||isDemo)return;
  const uid=msg.uid||msg.payload?.uid;if(!uid)return;
  if(msg.type==='join'&&room.status==='lobby'){
    const name=String(msg.payload?.name||'학생').trim().slice(0,18),avatar=String(msg.payload?.avatar||'🙂');
    room.players[uid]={uid,name,avatar,score:room.players[uid]?.score||0};renderLobby();sfx('join');await persist();
  }else if(msg.type==='submit'&&room.status==='playing'){
    processSubmission(uid,msg.payload?.questionIndex,msg.payload?.order,msg.at||now());
  }else if(msg.type==='leave'&&room.status==='lobby'){
    delete room.players[uid];renderLobby();await persist();
  }
}

async function beginGame(){
  if(!room||activePlayerCount()<1)return;
  room.questionIndex=0;room.status='countdown';room.countdownEndAt=now()+3300;room.answerCount=0;room.roundResults={};
  await persist();setView('game');renderGameMeta();showCountdown(room.countdownEndAt);countdownTimer=setTimeout(()=>startRound(),3400);
}
function showCountdown(endAt){
  els.countdown.classList.remove('hidden');
  const tick=()=>{const left=endAt-now();if(left<=0){els.countdown.innerHTML='<span>GO!</span>';sfx('start');setTimeout(()=>els.countdown.classList.add('hidden'),350);return;}const n=Math.max(1,Math.ceil(left/1000));els.countdown.innerHTML=`<span>${n}</span>`;setTimeout(tick,Math.min(500,left));};tick();
}

async function startRound(){
  if(!room||room.questionIndex<0||room.questionIndex>=fullQuestions.length)return;
  currentQuestion=fullQuestions[room.questionIndex];roundSubmissions=new Map();correctCount=0;room.status='playing';room.answerCount=0;room.roundResults={};room.revealSentence='';room.variantCount=flexibleOrderCount(currentQuestion);
  const t=now();room.questionStartAt=t;room.questionEndAt=t+room.config.timeLimit*1000;room.currentQuestion={id:currentQuestion.id,tokens:shuffle(currentQuestion.tokens).map(t=>[...t])};
  els.playingStage.classList.remove('hidden');els.revealStage.classList.add('hidden');renderGameMeta();await persist();runHostTimer();startTensionAudio();if(isDemo)scheduleDemoSubmissions();
}
function runHostTimer(){cancelAnimationFrame(raf);let lastSecond=null;const frame=()=>{if(!room||room.status!=='playing')return;const left=Math.max(0,room.questionEndAt-now()),ratio=Math.max(0,Math.min(1,left/(room.config.timeLimit*1000)));els.bigTimer.textContent=(left/1000).toFixed(1);if(els.circleTimer){els.circleTimer.style.setProperty('--progress',`${ratio*100}%`);const color=ratio<=.25?'#ff5b6e':ratio<=.5?'#ffc83d':'#37d8ff';els.circleTimer.style.setProperty('--timer-color',color);els.circleTimer.classList.toggle('urgent',left<=5000);}const sec=Math.ceil(left/1000);if(sec<=5&&sec!==lastSecond){lastSecond=sec;sfx('tick');}if(left<=0){endRound();return;}raf=requestAnimationFrame(frame);};raf=requestAnimationFrame(frame);}

function processSubmission(uid,questionIndex,order,at){
  if(!room||room.status!=='playing'||Number(questionIndex)!==room.questionIndex||roundSubmissions.has(uid)||!room.players[uid])return;
  const ids=Array.isArray(order)?order.map(String):[];const correct=isCorrectOrder(ids,currentQuestion);let rank=0,points=0;if(correct){rank=++correctCount;points=pointForRank(rank);room.players[uid].score=(room.players[uid].score||0)+points;}
  const result={uid,correct,rank,points,at:Number(at)||now()};roundSubmissions.set(uid,result);room.answerCount=roundSubmissions.size;room.roundResults[uid]=result;if(correct)celebrateCorrect(uid,rank,points);else sfx('submit');renderGameMeta();persist();
  if(room.answerCount>=activePlayerCount()&&activePlayerCount()>0)setTimeout(()=>endRound(),280);
}
function scheduleDemoSubmissions(){
  roundTimers.forEach(clearTimeout);roundTimers=[];const total=room.config.timeLimit*1000;Object.keys(room.players).forEach((uid,i)=>{if(Math.random()<.08)return;const delay=Math.max(800,Math.min(total-400,total*(.18+Math.random()*.68)));const timer=setTimeout(()=>{if(room.status!=='playing')return;const correct=Math.random()<(.88-i*.018);let order;if(correct)order=randomCorrectOrder(currentQuestion);else order=shuffle(currentQuestion.tokens.map(t=>t[0]));processSubmission(uid,room.questionIndex,order,now());},delay);roundTimers.push(timer);});}

function fitRevealedSentence(){
  const el=els.revealedSentence;if(!el)return;
  const stage=els.revealStage||el.parentElement;
  const available=Math.max(320,(stage?.clientWidth||window.innerWidth)-56);
  el.classList.remove('two-line');
  el.style.whiteSpace='nowrap';
  el.style.wordBreak='keep-all';
  el.style.overflowWrap='normal';
  el.style.width=`${available}px`;
  el.style.maxWidth=`${available}px`;

  // 정답 문장은 항상 한 줄로 유지하면서 화면 폭을 최대한 가득 채웁니다.
  let low=22,high=132,best=low;
  while(low<=high){
    const mid=Math.floor((low+high)/2);
    el.style.fontSize=`${mid}px`;
    if(el.scrollWidth<=el.clientWidth){best=mid;low=mid+1;}else high=mid-1;
  }
  el.style.fontSize=`${best}px`;
  if(el.scrollWidth>el.clientWidth){
    const scaled=Math.max(16,Math.floor(best*(el.clientWidth/el.scrollWidth)));
    el.style.fontSize=`${scaled}px`;
  }
}

async function endRound(){
  if(!room||room.status!=='playing')return;cancelAnimationFrame(raf);stopTensionAudio();roundTimers.forEach(clearTimeout);roundTimers=[];room.status='result';room.revealSentence=canonicalSentence(currentQuestion);room.variantCount=flexibleOrderCount(currentQuestion);room.resultEndAt=now()+((room.config?.revealSeconds||5)*1000);room.currentQuestion=null;await persist();
  if(els.promptCards)els.promptCards.innerHTML='';els.playingStage.classList.add('hidden');els.revealStage.classList.remove('hidden');els.revealedSentence.textContent=room.revealSentence;els.variantNote.classList.toggle('hidden',room.variantCount<=1);requestAnimationFrame(()=>fitRevealedSentence());sfx('answer');renderRank();runRevealTimer();
}
function runRevealTimer(){cancelAnimationFrame(revealRaf);const frame=()=>{if(!room||room.status!=='result')return;const left=Math.max(0,room.resultEndAt-now());els.revealTimer.textContent=(left/1000).toFixed(1);if(left<=0){advanceRound();return;}revealRaf=requestAnimationFrame(frame);};revealRaf=requestAnimationFrame(frame);}
async function advanceRound(){if(!room||room.status!=='result')return;cancelAnimationFrame(revealRaf);if(room.questionIndex+1>=fullQuestions.length){finishGame();return;}room.questionIndex+=1;await startRound();}
async function finishGame(){room.status='finished';room.finishedAt=now();room.currentQuestion=null;await persist();renderFinal();setView('final');}
function renderFinal(){const list=playerArray();els.finalRanking.innerHTML=list.map((p,i)=>`<div class="final-rank-row"><b>${i+1}</b><span>${safeText(p.avatar)}</span><strong>${safeText(p.name)}</strong><em>${Number(p.score||0).toLocaleString()}점</em></div>`).join('');}

async function goHome(){
  if(room&&['playing','result','countdown'].includes(room.status)){if(!confirm('진행 중인 문장 배틀을 중단하고 홈으로 돌아가시겠습니까?'))return;}
  clearRuntime();if(bus&&!isDemo){try{await bus.closeRoom();}catch{}}bus=null;room=null;document.body.classList.remove('demo-mode');setView('setup');updateQuestionSelectionUI();
}
function clearRuntime(){cancelAnimationFrame(raf);cancelAnimationFrame(revealRaf);stopTensionAudio();if(toastTimer){clearTimeout(toastTimer);toastTimer=null;}els.correctToast?.classList.add('hidden');if(els.fireworksLayer)els.fireworksLayer.innerHTML='';if(countdownTimer)clearTimeout(countdownTimer);roundTimers.forEach(clearTimeout);roundTimers=[];raf=revealRaf=null;countdownTimer=null;}

async function toggleFullscreen(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch{}}

document.querySelectorAll('.fullscreen-trigger').forEach(b=>b.addEventListener('click',toggleFullscreen));document.querySelectorAll('.sound-toggle').forEach(b=>b.addEventListener('click',()=>{muted=!muted;syncVolume();if(!muted){initAudio();sfx('start');if(room?.status==='playing')startTensionAudio();}else stopTensionAudio();}));document.querySelectorAll('.volume-slider').forEach(sl=>sl.addEventListener('input',()=>{volume=Math.max(0,Math.min(1,Number(sl.value)/100));muted=volume===0;syncVolume();if(room?.status==='playing'){if(muted)stopTensionAudio();else startTensionAudio();}}));

// ---- 출제 문장 관리 ----
function normalizeForMatch(text){return String(text||'').normalize('NFC').replace(/[\s\u00a0]+/g,'').replace(/[.,!?;:'\"“”‘’()，。！？·…]/g,'').trim();}
function orderFromSentence(cardLabels,sentence){const target=normalizeForMatch(sentence),norm=cardLabels.map(normalizeForMatch),used=new Array(cardLabels.length).fill(false),path=[];function dfs(pos){if(path.length===cardLabels.length)return pos===target.length?[...path]:null;for(let i=0;i<norm.length;i++){if(used[i])continue;const piece=norm[i];if(!piece||!target.startsWith(piece,pos))continue;used[i]=true;path.push(i);const r=dfs(pos+piece.length);if(r)return r;path.pop();used[i]=false;}return null;}return dfs(0);}
function parseCardLabels(v){return String(v||'').split('|').map(s=>s.trim()).filter(Boolean);}
function uniqueAnswerLines(primary,extra){const lines=[primary,...String(extra||'').split(/\r?\n/)].map(s=>s.trim()).filter(Boolean),seen=new Set();return lines.filter(line=>{const k=normalizeForMatch(line);if(!k||seen.has(k))return false;seen.add(k);return true;});}
const FLEX_PARTICLES=new Set(['은','는','이','가','을','를','에','에서','에게','한테','께','도','만','부터','까지','으로','로','의','보다','처럼','하고','와','과']);
const FLEX_CONJUNCTIONS=new Set(['하고','와','과']);
function inferFlexibleFrame(tokens,order){
  if(!Array.isArray(order)||order.length<2)return null;
  const label=new Map(tokens),tail=[order[order.length-1]],head=order.slice(0,-1),units=[];
  for(let i=0;i<head.length;i++){
    const id=head[i],text=label.get(id)||'';
    if(FLEX_PARTICLES.has(text)&&units.length){units[units.length-1].push(id);continue;}
    units.push([id]);
  }
  // '책+하고 + 연필+이'처럼 접속 조사로 이어진 명사구는 한 덩어리로 유지합니다.
  const merged=[];
  for(let i=0;i<units.length;i++){
    const u=[...units[i]],lastText=label.get(u[u.length-1])||'';
    if(FLEX_CONJUNCTIONS.has(lastText)&&i+1<units.length){u.push(...units[++i]);}
    merged.push(u);
  }
  return merged.length?{units:merged,tail}:null;
}
function inferFlexibleFrames(tokens,orders){
  const frames=[],seen=new Set();
  for(const order of orders){const f=inferFlexibleFrame(tokens,order);if(!f)continue;const key=JSON.stringify(f);if(!seen.has(key)){seen.add(key);frames.push(f);}}
  return frames;
}
function buildQuestionParts(id,cards,answers){if(cards.length<2)return{error:'카드는 2개 이상 입력해야 합니다.'};if(!answers.length)return{error:'대표 문장을 입력해야 합니다.'};const tokens=cards.map((label,i)=>[`${id}_card_${i}`,label]),orders=[];for(const line of answers){const idxs=orderFromSentence(cards,line);if(!idxs)return{error:`“${line}” 문장은 입력한 카드를 모두 한 번씩 사용해 만들 수 없습니다.`};orders.push(idxs.map(i=>tokens[i][0]));}return{tokens,orders,flexibleFrames:inferFlexibleFrames(tokens,orders)};}
function suggestCards(sentence){const clean=String(sentence||'').trim().replace(/[.!?。！？]+$/g,'');if(!clean)return[];const chunks=clean.split(/\s+/).filter(Boolean),cards=[];for(const chunk of chunks){let done=false;for(const suffix of AUTO_COPULAS){if(chunk.length>suffix.length&&chunk.endsWith(suffix)){cards.push(chunk.slice(0,-suffix.length),suffix);done=true;break;}}if(done)continue;for(const suffix of AUTO_PARTICLES){if(chunk.length>suffix.length&&chunk.endsWith(suffix)){const base=chunk.slice(0,-suffix.length);if(base==='씨'&&cards.length&&!BOUND_TEXTS.has(cards[cards.length-1]))cards[cards.length-1]+=' 씨';else if(base)cards.push(base);cards.push(suffix);done=true;break;}}if(!done)cards.push(chunk);}return cards;}
function questionSentence(q,index=0){if(index===0&&String(q?.displaySentence||'').trim())return String(q.displaySentence).trim();return assembleSentence(q.acceptedOrders[index]||q.acceptedOrders[0]||[],q);}
function updateQuestionSelectionUI(){const selected=teacherQuestions.filter(q=>q.enabled).length,total=teacherQuestions.length;els.selectedQuestionBadge.textContent=`${selected}/${total}`;els.managerSelectedCount.textContent=String(selected);els.managerTotalCount.textContent=String(total);els.createRoomBtn.disabled=selected===0;els.demoBtn.disabled=selected===0;}
function renderQuestionManager(){els.questionList.innerHTML='';teacherQuestions.forEach((q,index)=>{const item=document.createElement('article');item.className='question-item'+(q.enabled?'':' excluded');const primary=questionSentence(q),alternates=q.acceptedOrders.slice(1).map((_,i)=>questionSentence(q,i+1)).join(' / ');item.innerHTML=`<div class="question-item-main"><label class="question-check"><input class="question-enable" data-index="${index}" type="checkbox" ${q.enabled?'checked':''}></label><div><div class="question-no">Q ${index+1} · ${safeText(q.id)}</div><div class="question-preview">${safeText(primary)}</div><div class="question-meta"><span>카드 ${q.tokens.length}개</span><span>정답 어순 ${flexibleOrderCount(q)}개 자동 인정</span>${q.edited?'<span>수정됨</span>':''}${q.custom?'<span>직접 추가</span>':''}</div>${alternates?`<div class="accepted-preview"><b>추가 정답:</b> ${safeText(alternates)}</div>`:''}</div><div class="question-action-buttons"><button class="question-edit-btn" data-action="edit" data-index="${index}" type="button">${editingQuestionIndex===index?'수정 닫기':'✎ 문장 수정'}</button>${q.custom?`<button class="question-delete-btn" data-action="delete" data-index="${index}" type="button">삭제</button>`:''}</div></div>`;if(editingQuestionIndex===index){const ed=document.createElement('div');ed.className='question-editor';ed.innerHTML=`<div class="editor-field"><label>대표 문장</label><input id="editSentence-${index}" value="${safeText(primary)}"></div><div class="editor-field"><div class="editor-label-row"><label>카드 구성</label><button class="mini-action-btn" data-action="auto-edit" data-index="${index}" type="button">대표 문장에서 카드 자동 만들기</button></div><input id="editCards-${index}" value="${safeText(q.tokens.map(t=>t[1]).join(' | '))}"><small>조사는 분리하고 동사·형용사의 종결형은 한 카드로 입력합니다.</small></div><div class="editor-field"><label>추가로 인정할 문장</label><textarea id="editAnswers-${index}" rows="3">${safeText(q.acceptedOrders.slice(1).map((_,i)=>questionSentence(q,i+1)).join('\n'))}</textarea></div><div id="editError-${index}" class="edit-error"></div><div class="editor-actions"><button class="btn btn-secondary" data-action="cancel-edit" data-index="${index}" type="button">취소</button><button class="btn btn-primary" data-action="save-edit" data-index="${index}" type="button">✓ 수정 저장</button></div>`;item.append(ed);}els.questionList.append(item);});updateQuestionSelectionUI();}
function openQuestionManager(){renderQuestionManager();els.questionManager.classList.remove('hidden');els.questionManager.setAttribute('aria-hidden','false');}
function closeQuestionManager(){editingQuestionIndex=null;closeNewEditor();els.questionManager.classList.add('hidden');els.questionManager.setAttribute('aria-hidden','true');updateQuestionSelectionUI();}
function saveQuestionEdit(index){const q=teacherQuestions[index],primary=$(`editSentence-${index}`)?.value.trim()||'',cards=parseCardLabels($(`editCards-${index}`)?.value||''),answers=uniqueAnswerLines(primary,$(`editAnswers-${index}`)?.value||''),error=$(`editError-${index}`),r=buildQuestionParts(q.id,cards,answers);if(r.error){if(error)error.textContent=r.error;return;}q.tokens=r.tokens;q.acceptedOrders=r.orders;q.flexibleFrames=r.flexibleFrames;q.displaySentence=primary;q.edited=true;editingQuestionIndex=null;renderQuestionManager();}
function openNewEditor(){editingQuestionIndex=null;renderQuestionManager();els.newQuestionEditor.classList.remove('hidden');els.newQuestionError.textContent='';els.newSentenceInput.focus();}
function closeNewEditor(){els.newQuestionEditor.classList.add('hidden');els.newQuestionError.textContent='';}
function nextCustomId(){let n=teacherQuestions.filter(q=>q.custom).length+1,id;do{id=`CUSTOM-${String(n++).padStart(3,'0')}`;}while(teacherQuestions.some(q=>q.id===id));return id;}
function saveNewQuestion(){const primary=els.newSentenceInput.value.trim(),cards=parseCardLabels(els.newCardsInput.value),answers=uniqueAnswerLines(primary,els.newAnswersInput.value),id=nextCustomId(),r=buildQuestionParts(id,cards,answers);if(r.error){els.newQuestionError.textContent=r.error;return;}teacherQuestions.push({id,displaySentence:primary,tokens:r.tokens,acceptedOrders:r.orders,flexibleFrames:r.flexibleFrames,note:'교사 직접 추가',enabled:true,edited:true,custom:true});els.newSentenceInput.value=els.newCardsInput.value=els.newAnswersInput.value='';closeNewEditor();renderQuestionManager();}

els.openQuestionManagerBtn.addEventListener('click',openQuestionManager);els.closeQuestionManagerBtn.addEventListener('click',closeQuestionManager);els.applyQuestionManagerBtn.addEventListener('click',closeQuestionManager);els.addQuestionBtn.addEventListener('click',openNewEditor);els.closeNewQuestionBtn.addEventListener('click',closeNewEditor);els.cancelNewQuestionBtn.addEventListener('click',closeNewEditor);els.autoCardsBtn.addEventListener('click',()=>{const cards=suggestCards(els.newSentenceInput.value);els.newCardsInput.value=cards.join(' | ');els.newQuestionError.textContent=cards.length?'':'먼저 대표 문장을 입력하세요.';});els.saveNewQuestionBtn.addEventListener('click',saveNewQuestion);els.selectAllQuestionsBtn.addEventListener('click',()=>{teacherQuestions.forEach(q=>q.enabled=true);renderQuestionManager();});els.clearAllQuestionsBtn.addEventListener('click',()=>{teacherQuestions.forEach(q=>q.enabled=false);renderQuestionManager();});els.questionManager.addEventListener('click',e=>{if(e.target===els.questionManager)closeQuestionManager();});
els.questionList.addEventListener('change',e=>{const input=e.target.closest('.question-enable');if(!input)return;const i=Number(input.dataset.index);if(teacherQuestions[i])teacherQuestions[i].enabled=input.checked;renderQuestionManager();});
els.questionList.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const i=Number(b.dataset.index),a=b.dataset.action;if(a==='edit'){editingQuestionIndex=editingQuestionIndex===i?null:i;closeNewEditor();renderQuestionManager();}else if(a==='cancel-edit'){editingQuestionIndex=null;renderQuestionManager();}else if(a==='save-edit')saveQuestionEdit(i);else if(a==='auto-edit'){const cards=suggestCards($(`editSentence-${i}`)?.value||'');$(`editCards-${i}`).value=cards.join(' | ');}else if(a==='delete'&&teacherQuestions[i]?.custom){teacherQuestions.splice(i,1);editingQuestionIndex=null;renderQuestionManager();}});

[...document.querySelectorAll('.time-chip')].forEach(ch=>ch.addEventListener('click',()=>{els.timeInput.value=ch.dataset.time;document.querySelectorAll('.time-chip').forEach(x=>x.classList.toggle('active',x===ch));}));els.timeInput.addEventListener('input',()=>{const v=Number(els.timeInput.value);document.querySelectorAll('.time-chip').forEach(x=>x.classList.toggle('active',Number(x.dataset.time)===v));});
els.createRoomBtn.addEventListener('click',()=>createRoom(false));els.demoBtn.addEventListener('click',()=>createRoom(true));els.startGameBtn.addEventListener('click',beginGame);els.lobbyHomeBtn.addEventListener('click',goHome);els.gameHomeBtn.addEventListener('click',goHome);els.finalHomeBtn.addEventListener('click',goHome);els.finalAgainBtn.addEventListener('click',()=>{goHome().then(()=>createRoom(lastMode==='demo'));});
window.addEventListener('beforeunload',()=>{try{bus?.closeRoom();}catch{}});

async function initializeSentenceBattle(){
  if(els.sentenceBookContext)els.sentenceBookContext.textContent=`문장 배틀 · 서울대 ${selectedBook} · ${selectedLesson}과`;
  if(els.sentenceContextNote)els.sentenceContextNote.innerHTML=`선택한 교재: <b>서울대 ${selectedBook} · ${selectedLesson}과</b> · 교재 기반 문장 데이터를 불러오는 중입니다.`;
  els.createRoomBtn.disabled=true;els.demoBtn.disabled=true;
  els.setupMessage.textContent='선택한 과의 어휘·문법·예문을 바탕으로 출제 문장을 준비하고 있습니다.';
  setView('setup');syncVolume();renderQuestionManager();
  try{
    await loadLessonQuestions();
    const count=teacherQuestions.length;
    if(els.sentenceContextNote)els.sentenceContextNote.innerHTML=`선택한 교재: <b>서울대 ${selectedBook} · ${selectedLesson}과</b> · <b>${count}개</b>의 교재 기반 문장을 불러왔습니다. 출제 전 문장을 확인·수정하거나 제외할 수 있습니다.`;
    els.setupMessage.textContent=`서울대 ${selectedBook} ${selectedLesson}과 문장 ${count}개 준비 완료 · 학생은 각자 휴대폰에서 PIN 또는 QR로 입장합니다.`;
    els.setupMessage.style.color='';
    renderQuestionManager();updateQuestionSelectionUI();
  }catch(err){
    teacherQuestions=[];renderQuestionManager();updateQuestionSelectionUI();
    if(els.sentenceContextNote)els.sentenceContextNote.innerHTML=`<b>서울대 ${selectedBook} · ${selectedLesson}과</b> 문장 데이터를 불러오지 못했습니다.`;
    els.setupMessage.textContent=err?.message||'문장 데이터를 불러오지 못했습니다.';els.setupMessage.style.color='#ffb1bd';
  }
}
initializeSentenceBattle();
