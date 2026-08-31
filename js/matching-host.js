import { CATALOG } from './catalog.js';
import { loadByConfig } from './data-loader.js';
import { buildMatchingRounds, calculateMatchingPairScore, calculateRoundClearBonus, isMatchingBlind } from './matching-engine.js';
import { LocalBus } from './local-bus.js?v=7.6';
import { FirebaseBus, publicRoomState, isFirebaseConfigured, createUniqueFirebasePin } from './firebase-bus.js?v=7.6';
import { GameAudioEngine } from './audio-engine.js?v=7.4';

const $ = (id) => document.getElementById(id);
const audio = new GameAudioEngine();
const AVATARS = ['🐻','🐱','🐼','🐰','🐯','🦊','🐧','🐸','🐨','🦁','🐵','🐶'];
const DEMO_STUDENTS = [
  {name:'Ану',avatar:'🐰',finish:.39,accuracy:.97},{name:'Тэмүүлэн',avatar:'🐯',finish:.43,accuracy:.95},
  {name:'Номин',avatar:'🐱',finish:.48,accuracy:.93},{name:'Бат',avatar:'🐻',finish:.53,accuracy:.90},
  {name:'Саруул',avatar:'🦊',finish:.58,accuracy:.88},{name:'Мөнх',avatar:'🐼',finish:.64,accuracy:.85},
  {name:'Энхжин',avatar:'🐧',finish:.70,accuracy:.82},{name:'Оюунаа',avatar:'🐨',finish:.76,accuracy:.79},
  {name:'Төгөлдөр',avatar:'🦁',finish:.82,accuracy:.76},{name:'Марал',avatar:'🐸',finish:.88,accuracy:.73}
];

let room = null;
let bus = null;
let loop = null;
let botTimers = [];
let earlyEndTimer = null;
let sourceItems = [];
let currentItems = [];
let currentTitle = '';
let activeSourceKey = '';
let draftSelection = new Set();
const selectionBySource = new Map();
let lastCountdownNumber = null;
let lastTimerTick = null;
let blindTransitionPlayed = false;
let currentMusicMode = 'normal';
let closingRound = false;
let toastTimer = null;

function nowMs(){ return bus?.now ? bus.now() : Date.now(); }
function escapeHtml(value){ return String(value ?? '').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function toast(text){ clearTimeout(toastTimer); const el=$('toast'); el.textContent=text; el.classList.remove('hidden'); toastTimer=setTimeout(()=>el.classList.add('hidden'),2600); }

function fillCatalog(){
  $('snuBook').innerHTML = CATALOG.snuBooks.map((b)=>`<option value="${b.id}">${b.title}</option>`).join('');
  $('collocationSet').innerHTML = [...CATALOG.collocationSets.map((s)=>`<option value="${s.id}">${s.label}</option>`),'<option value="all">전체 1-500 랜덤</option>'].join('');
  fillLessons();
}
function fillLessons(){
  const book = CATALOG.snuBooks.find((b)=>b.id===$('snuBook').value) || CATALOG.snuBooks[0];
  $('snuLesson').innerHTML = book.lessons.map((n)=>`<option value="${n}">${n}과</option>`).join('');
}
function applyLaunchParams(){
  const p=new URLSearchParams(location.search);
  const source=p.get('source'); if(['preliminary','snu','topik1'].includes(source)) $('sourceType').value=source;
  const book=p.get('book'); if(book && CATALOG.snuBooks.some((b)=>b.id===book)){ $('snuBook').value=book; fillLessons(); }
  const lesson=Number(p.get('lesson')); if(lesson && [...$('snuLesson').options].some((o)=>Number(o.value)===lesson)) $('snuLesson').value=String(lesson);
  const collocation=p.get('collocation'); if(collocation && [...$('collocationSet').options].some((o)=>o.value===collocation)) $('collocationSet').value=collocation;
}
function updateSourceFields(){
  const type=$('sourceType').value;
  $('bookField').classList.toggle('hidden',type!=='snu');
  $('lessonField').classList.toggle('hidden',type!=='snu');
  $('collocationField').classList.toggle('hidden',type!=='topik1');
}
function sourceKeyFromConfig(c){ if(c.sourceType==='preliminary') return 'preliminary'; if(c.sourceType==='topik1') return `topik1:${c.collocationSet}`; return `snu:${c.snuBook}:${c.snuLesson}`; }
function getConfig(){
  return {
    gameType:'matching-pairs', sourceType:$('sourceType').value, snuBook:$('snuBook').value, snuLesson:Number($('snuLesson').value), collocationSet:$('collocationSet').value,
    roundCount:Number($('roundCount').value), pairsPerRound:Number($('pairsPerRound').value), roundTime:Number($('roundTime').value), blindAt:.70,
    audio:{bgmEnabled:$('bgmEnabled').checked,sfxEnabled:$('sfxEnabled').checked,volume:Number($('masterVolume').value)/100}
  };
}
function ensureSelectionForSource(key,items){
  const valid=new Set(items.map((v)=>v.id));
  if(!selectionBySource.has(key)) selectionBySource.set(key,new Set(valid));
  else {
    const kept=new Set([...selectionBySource.get(key)].filter((id)=>valid.has(id)));
    if(!kept.size) items.forEach((v)=>kept.add(v.id));
    selectionBySource.set(key,kept);
  }
  return selectionBySource.get(key);
}
function selectedItemsFor(key,items){ const set=ensureSelectionForSource(key,items); return items.filter((v)=>set.has(v.id)); }
function syncSelectedBadge(){ $('selectedBadge').textContent=`${selectionBySource.get(activeSourceKey)?.size||0}/${sourceItems.length}`; }

async function refreshData(){
  try{
    updateSourceFields();
    const config=getConfig();
    const data=await loadByConfig(config);
    activeSourceKey=sourceKeyFromConfig(config); sourceItems=data.items; currentItems=selectedItemsFor(activeSourceKey,sourceItems); currentTitle=data.title; syncSelectedBadge();
    const need=Number($('pairsPerRound').value)||6;
    const totalCards=need*2;
    $('dataSummary').textContent=`${data.title} · 전체 ${sourceItems.length}개 중 ${currentItems.length}개 선택 · 한 판 ${need}쌍(${totalCards}장) · ${$('roundCount').value}판`;
  }catch(e){ $('dataSummary').textContent=e?.message||'자료를 불러오지 못했습니다.'; }
}
async function ensureData(){
  const config=getConfig(); const data=await loadByConfig(config); const key=sourceKeyFromConfig(config); activeSourceKey=key; sourceItems=data.items; currentItems=selectedItemsFor(key,sourceItems); currentTitle=data.title; syncSelectedBadge(); return {title:data.title,items:currentItems};
}

function updateBackendStatus(){
  const el=$('backendStatus'); const ready=isFirebaseConfigured(); el.classList.toggle('ready',ready);
  el.innerHTML=ready?'<strong>● Firebase 실시간 연결 준비 완료</strong><span>학생들이 QR/PIN으로 각자 휴대폰에서 같은 게임방에 입장할 수 있습니다.</span>':'<strong>⚠ Firebase 설정 필요</strong><span>혼자 게임과 데모 시연은 가능하지만 실제 학생 휴대폰 입장은 Firebase 설정 후 사용할 수 있습니다.</span>';
}
function setupAudio(){ audio.setSettings(getConfig().audio); syncAudioControls(); }
function syncAudioControls(){ const s=audio.getSettings(); const pct=Math.round(s.volume*100); $('volumeValue').textContent=`${pct}%`; $('masterVolume').value=String(pct); $('gameBgmBtn').textContent=s.bgmEnabled?'BGM ON':'BGM OFF'; $('gameSfxBtn').textContent=s.sfxEnabled?'SFX ON':'SFX OFF'; }
function setMusicMode(mode){ currentMusicMode=mode; const labels={lobby:'🎵 LOBBY',countdown:'⏱ COUNTDOWN',normal:'🎵 BATTLE',blind:'⚠️ TENSION',final:'🔥 FINAL'}; $('musicMode').textContent=labels[mode]||labels.normal; }
function applyLiveAudio(patch={}){ const cur=audio.getSettings(); audio.setSettings({bgmEnabled:typeof patch.bgmEnabled==='boolean'?patch.bgmEnabled:cur.bgmEnabled,sfxEnabled:typeof patch.sfxEnabled==='boolean'?patch.sfxEnabled:cur.sfxEnabled,volume:Number.isFinite(patch.volume)?patch.volume:cur.volume}); $('bgmEnabled').checked=audio.getSettings().bgmEnabled; $('sfxEnabled').checked=audio.getSettings().sfxEnabled; syncAudioControls(); if(room?.status==='lobby') audio.startBgm('lobby'); else if(['playing','round-result'].includes(room?.status)) audio.startBgm(currentMusicMode); }

function setRoundTime(value){ const v=Math.max(15,Math.min(120,Number(value)||45)); $('roundTime').value=String(v); $('timeValue').textContent=`${v}초`; document.querySelectorAll('#timePresets button').forEach((b)=>b.classList.toggle('active',Number(b.dataset.time)===v)); }

async function openVocabModal(){
  try{ await ensureData(); draftSelection=new Set(selectionBySource.get(activeSourceKey)||[]); $('vocabSearch').value=''; renderVocabList(); $('vocabModal').classList.remove('hidden'); }
  catch(e){toast(e.message);}
}
function renderVocabList(){
  const q=$('vocabSearch').value.trim().toLowerCase();
  const filtered=sourceItems.filter((v)=>!q||v.ko.toLowerCase().includes(q)||v.mn.toLowerCase().includes(q));
  $('vocabList').innerHTML=filtered.map((v)=>`<label class="vocab-row ${draftSelection.has(v.id)?'selected':''}"><input type="checkbox" data-id="${escapeHtml(v.id)}" ${draftSelection.has(v.id)?'checked':''}/><strong>${escapeHtml(v.ko)}</strong><span>${escapeHtml(v.mn)}</span></label>`).join('');
  $('modalSelectedCount').textContent=`${draftSelection.size}개 선택`; $('modalRequirement').textContent=`최소 ${$('pairsPerRound').value}개 필요`;
}
function closeVocabModal(){ $('vocabModal').classList.add('hidden'); }
function applyVocabSelection(){ const need=Number($('pairsPerRound').value)||6; if(draftSelection.size<need){toast(`한 판 ${need}쌍을 위해 최소 ${need}개를 선택해 주세요.`);return;} selectionBySource.set(activeSourceKey,new Set(draftSelection)); closeVocabModal(); refreshData(); }

function validateConfig(data){
  const config=getConfig();
  if(!Number.isInteger(config.roundCount)||config.roundCount<1||config.roundCount>10) throw new Error('게임 판 수는 1~10판으로 설정해 주세요.');
  if(!Number.isInteger(config.pairsPerRound)||config.pairsPerRound<2) throw new Error('카드 쌍 수를 확인해 주세요.');
  if(data.items.length<config.pairsPerRound) throw new Error(`선택한 어휘가 ${data.items.length}개입니다. 한 판 ${config.pairsPerRound}쌍을 위해 어휘를 더 선택해 주세요.`);
  if(config.roundTime<15||config.roundTime>120) throw new Error('제한 시간은 15~120초 사이로 설정해 주세요.');
  return config;
}
async function startSolo(){
  try{ const data=await ensureData(); const config=validateConfig(data); const matching=buildMatchingRounds(data.items,config); localStorage.setItem('kmp_solo_payload',JSON.stringify({config,matching,title:data.title,at:Date.now()})); window.open('matching-play.html?solo=1','_blank'); }
  catch(e){toast(e.message);}
}
async function makeLocalPin(){ for(let i=0;i<40;i++){ const pin=String(Math.floor(100000+Math.random()*900000)); if(!localStorage.getItem(`kwb_room_${pin}`)) return pin; } return String(Math.floor(100000+Math.random()*900000)); }
async function createRoom(demoMode=false){
  try{
    setupAudio(); await audio.unlock();
    if(!demoMode&&!isFirebaseConfigured()) throw new Error('실제 학생 게임방은 Firebase 연결이 필요합니다. js/firebase-config.js 설정을 먼저 확인해 주세요.');
    const data=await ensureData(); const config=validateConfig(data); const matching=buildMatchingRounds(data.items,config);
    const pin=demoMode?await makeLocalPin():await createUniqueFirebasePin();
    room={pin,title:data.title,status:'lobby',config,players:{},matching,roundIndex:-1,roundStartAt:0,roundEndAt:0,blindActive:false,demoMode:Boolean(demoMode),createdAt:Date.now()};
    bus?.close();
    if(demoMode){ bus=new LocalBus(pin); bus.on(handleMessage); bus.saveRoom(room); }
    else { bus=new FirebaseBus(pin,'host'); bus.on(handleMessage); await bus.init(); room.createdAt=nowMs(); await bus.createRoom(room); }
    if(demoMode) addDemoStudents(10,false); else persistAndBroadcast();
    $('setupView').classList.add('hidden'); $('hostView').classList.remove('hidden'); showHostSubView('lobbyView'); $('roomPin').textContent=pin;
    const url=new URL('matching-play.html',location.href); url.searchParams.set('pin',pin); if(bus.mode==='local') url.searchParams.set('local','1'); $('joinUrl').textContent=url.href; $('openPlayerBtn').onclick=()=>window.open(url.href,'_blank'); renderQr(url.href); renderLobby(); startLoop();
    lastCountdownNumber=null; lastTimerTick=null; blindTransitionPlayed=false; setMusicMode('lobby'); audio.startBgm('lobby');
    if(demoMode) toast('가상 학생 10명이 입장했습니다. [게임 시작]을 누르면 시연이 시작됩니다.');
  }catch(e){toast(e?.message||'게임방을 만들지 못했습니다.');}
}
function renderQr(url){ const box=$('qrBox'); box.innerHTML=''; if(window.QRCode)new QRCode(box,{text:url,width:170,height:170,correctLevel:QRCode.CorrectLevel.M}); else box.innerHTML='<span>QR 라이브러리를 불러오지 못했습니다.<br>PIN을 사용해 주세요.</span>'; }
function showHostSubView(id){ ['lobbyView','gameView','roundResultView','finalView'].forEach((x)=>$(x).classList.toggle('hidden',x!==id)); }

function addDemoStudents(limit=10,announce=true){
  if(!room||room.status!=='lobby') return; let added=0;
  DEMO_STUDENTS.slice(0,limit).forEach((s,i)=>{const uid=`match-demo-${i+1}`; if(room.players[uid])return; room.players[uid]={uid,name:s.name,avatar:s.avatar,score:0,bot:true,finish:s.finish,accuracy:s.accuracy,matchedPairIds:[],matchedCount:0,totalMatched:0,mistakes:0,totalMistakes:0,combo:0,roundFinishedAt:0,lastGain:0,lastGainAt:0};added++;});
  room.demoMode=true; persistAndBroadcast(); renderLobby(); if(announce&&added)audio.playChime(); if(announce)toast(added?`데모 학생 ${added}명을 추가했습니다.`:'데모 학생이 이미 들어와 있습니다.');
}
function handleMessage(msg){
  if(!room)return;
  if(msg.type==='join'){
    const {uid,name,avatar}=msg.payload||{}; if(!uid||!name||room.status!=='lobby')return;
    room.players[uid]={uid,name:String(name).slice(0,20),avatar:AVATARS.includes(avatar)?avatar:'🐻',score:room.players[uid]?.score||0,bot:false,matchedPairIds:[],matchedCount:0,totalMatched:0,mistakes:0,totalMistakes:0,combo:0,roundFinishedAt:0,lastGain:0,lastGainAt:0}; persistAndBroadcast(); renderLobby();
  }
  if(msg.type==='pair-match') handlePairMatch(msg.payload,msg.at);
  if(msg.type==='pair-miss') handlePairMiss(msg.payload,msg.at);
  if(msg.type==='request-state') broadcastState();
}
function currentRound(){ return room?.matching?.rounds?.[room.roundIndex]||null; }
function handlePairMatch({uid,roundIndex,pairId}={},receivedAt=null){
  if(!room||room.status!=='playing'||Number(roundIndex)!==room.roundIndex)return; const p=room.players[uid]; if(!p)return;
  const round=currentRound(); if(!round?.pairs?.some((x)=>x.pairId===pairId))return; if((p.matchedPairIds||[]).includes(pairId))return;
  const at=Number(receivedAt)||nowMs(); if(at>room.roundEndAt+300)return;
  p.matchedPairIds=[...(p.matchedPairIds||[]),pairId]; p.matchedCount=p.matchedPairIds.length; p.combo=(Number(p.combo)||0)+1;
  const duration=room.config.roundTime*1000; const elapsed=Math.max(0,at-room.roundStartAt); let points=calculateMatchingPairScore(duration,elapsed,p.combo);
  if(p.matchedCount>=room.config.pairsPerRound&&!p.roundFinishedAt){ p.roundFinishedAt=at; points+=calculateRoundClearBonus(duration,elapsed); }
  p.score=(Number(p.score)||0)+points; p.totalMatched=(Number(p.totalMatched)||0)+1; p.lastGain=points; p.lastGainAt=at; audio.playGift(points); persistAndBroadcast(); renderGame(); maybeEndRoundEarly();
}
function handlePairMiss({uid,roundIndex}={},receivedAt=null){
  if(!room||room.status!=='playing'||Number(roundIndex)!==room.roundIndex)return; const p=room.players[uid]; if(!p)return; const at=Number(receivedAt)||nowMs(); if(at>room.roundEndAt+300)return; p.combo=0; p.mistakes=(Number(p.mistakes)||0)+1; p.totalMistakes=(Number(p.totalMistakes)||0)+1; p.lastGain=0; p.lastGainAt=at; persistAndBroadcast(); renderGame();
}
function startGame(){
  if(!room||!Object.keys(room.players).length)return; setupAudio(); audio.unlock(); audio.stopBgm(); clearBotTimers(); clearTimeout(earlyEndTimer); lastCountdownNumber=null; setMusicMode('countdown'); room.status='countdown'; room.countdownEndAt=nowMs()+3200; room.blindActive=false; showHostSubView('gameView'); persistAndBroadcast(); renderGame();
}
function resetPlayersForRound(){ Object.values(room.players).forEach((p)=>{p.matchedPairIds=[];p.matchedCount=0;p.mistakes=0;p.combo=0;p.roundFinishedAt=0;p.lastGain=0;p.lastGainAt=0;}); }
function startRound(index){
  if(!room||index>=room.matching.rounds.length)return finishGame(); clearBotTimers(); clearTimeout(earlyEndTimer); closingRound=false; room.status='playing'; room.roundIndex=index; resetPlayersForRound(); room.roundStartAt=nowMs()+260; room.roundEndAt=room.roundStartAt+room.config.roundTime*1000; room.roundResultEndAt=0; lastTimerTick=null;
  const blind=isMatchingBlind(room,room.roundStartAt); room.blindActive=blind; if(blind&&!blindTransitionPlayed){blindTransitionPlayed=true;audio.playBlindTransition();} setMusicMode(blind?'blind':'normal'); audio.startBgm(blind?'blind':'normal'); audio.playQuestionStart(); persistAndBroadcast(); renderGame(); scheduleDemoRound();
}
function syncBlind(){ if(!room||room.status!=='playing')return; const blind=isMatchingBlind(room,nowMs()); if(blind!==room.blindActive){ room.blindActive=blind; if(blind&&!blindTransitionPlayed){blindTransitionPlayed=true;audio.playBlindTransition();} setMusicMode(blind?'blind':'normal'); audio.startBgm(blind?'blind':'normal'); persistAndBroadcast(); renderGame(); } }
function endRound(){
  if(!room||room.status!=='playing'||closingRound)return; closingRound=true; clearBotTimers(); clearTimeout(earlyEndTimer); room.status='round-result'; room.roundResultEndAt=nowMs()+2800; room.blindActive=isMatchingBlind(room,room.roundEndAt); audio.playReveal(1); persistAndBroadcast(); renderRoundResult(); showHostSubView('roundResultView');
}
function maybeEndRoundEarly(){ if(!room||room.status!=='playing')return; const players=Object.values(room.players); if(!players.length)return; const allDone=players.every((p)=>(p.matchedPairIds||[]).length>=room.config.pairsPerRound); if(allDone&&!earlyEndTimer) earlyEndTimer=setTimeout(()=>{earlyEndTimer=null;if(room?.status==='playing')endRound();},650); }
function finishGame(){
  if(!room)return; clearBotTimers(); clearTimeout(earlyEndTimer); room.status='finished'; room.blindActive=false; room.finishedAt=nowMs(); setMusicMode('final'); audio.playFinish(); persistAndBroadcast(); renderFinal(); showHostSubView('finalView');
}
function clearBotTimers(){ botTimers.forEach(clearTimeout); botTimers=[]; }
function scheduleDemoRound(){
  clearBotTimers(); if(!room||room.status!=='playing')return; const pairs=[...(currentRound()?.pairs||[])]; const duration=room.config.roundTime*1000; const untilStart=Math.max(0,room.roundStartAt-nowMs());
  Object.values(room.players).filter((p)=>p.bot).forEach((bot,bi)=>{
    pairs.forEach((pair,pi)=>{
      const targetFraction=Math.max(.08,Math.min(.96,Number(bot.finish||.65)*((pi+1)/pairs.length)+(Math.random()-.5)*.025));
      const delay=untilStart+Math.floor(duration*targetFraction)+bi*17;
      if(Math.random()>Number(bot.accuracy||.8)){
        const missTimer=setTimeout(()=>{if(room?.status==='playing')handlePairMiss({uid:bot.uid,roundIndex:room.roundIndex},nowMs());},Math.max(250,delay-260)); botTimers.push(missTimer);
      }
      const matchTimer=setTimeout(()=>{if(room?.status==='playing')handlePairMatch({uid:bot.uid,roundIndex:room.roundIndex,pairId:pair.pairId},nowMs());},delay); botTimers.push(matchTimer);
    });
  });
}
function startLoop(){
  clearInterval(loop); loop=setInterval(()=>{ if(!room)return; const now=nowMs();
    if(room.status==='countdown'){ renderCountdown(); if(now>=room.countdownEndAt)startRound(0); }
    else if(room.status==='playing'){ syncBlind(); renderTimer(); if(now>=room.roundEndAt)endRound(); }
    else if(room.status==='round-result'){ renderRoundResultCountdown(); if(now>=room.roundResultEndAt){ const next=room.roundIndex+1; if(next>=room.matching.rounds.length)finishGame(); else {showHostSubView('gameView');startRound(next);} } }
  },80);
}
function persistAndBroadcast(){ if(!room||!bus)return; const pending=bus.saveRoom(room); if(pending?.catch)pending.catch((e)=>console.error('room sync failed',e)); if(bus.mode==='local')broadcastState(); }
function broadcastState(){ if(room&&bus?.mode==='local')bus.send('state',{room:publicRoomState(room)}); }

function renderLobby(){
  if(!room)return; const players=Object.values(room.players); $('playerCount').textContent=`${players.length}명`; $('startGameBtn').disabled=!players.length; $('demoInfo').classList.toggle('hidden',!players.some((p)=>p.bot)); $('addDemoBtn').disabled=players.filter((p)=>p.bot).length>=10;
  $('playerList').classList.toggle('empty',!players.length); $('playerList').innerHTML=players.length?players.map((p)=>`<div class="player-chip"><span class="avatar">${p.avatar}</span><strong>${escapeHtml(p.name)}</strong>${p.bot?'<span class="bot-tag">DEMO</span>':''}</div>`).join(''):'QR 또는 PIN으로 학생이 입장하면 여기에 표시됩니다.';
}
function renderCountdown(){
  if(!room)return; const n=Math.max(1,Math.ceil((room.countdownEndAt-nowMs())/1000)); $('countdownOverlay').classList.remove('hidden'); $('countdownText').textContent=n; if(n!==lastCountdownNumber){lastCountdownNumber=n;audio.playCountdown(n);} }
function timerVisual(el,textEl,remaining,duration){ const ratio=Math.max(0,Math.min(1,remaining/duration)); const color=ratio<=.18?'#ff4f70':ratio<=.38?'#ffc83d':'#37d8ff'; el.style.setProperty('--progress',`${ratio*100}%`); el.style.setProperty('--timer-color',color); el.classList.toggle('urgent',ratio<=.18); textEl.textContent=(remaining/1000).toFixed(1); }
function renderTimer(){
  if(!room||room.status!=='playing')return; $('countdownOverlay').classList.add('hidden'); const duration=room.config.roundTime*1000; const remaining=Math.max(0,Math.min(duration,room.roundEndAt-nowMs())); timerVisual($('hostCircleTimer'),$('hostTimerText'),remaining,duration); const sec=Math.ceil(remaining/1000); if(sec<=5&&sec>0&&sec!==lastTimerTick){lastTimerTick=sec;audio.playTimerTick(sec);} renderGame(false);
}
function sortedPlayers(){ return Object.values(room?.players||{}).sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0)||a.name.localeCompare(b.name,'ko')); }
function renderGame(refreshVocab=true){
  if(!room||room.roundIndex<0)return; const round=currentRound(); if(!round)return; $('countdownOverlay').classList.toggle('hidden',room.status!=='countdown'); $('hostRoundLabel').textContent=`ROUND ${room.roundIndex+1}/${room.matching.roundCount}`; const blind=isMatchingBlind(room,nowMs())||room.blindActive; $('blindBadge').classList.toggle('hidden',!blind); $('rankBlindCover').classList.toggle('hidden',!blind);
  if(refreshVocab) $('hostVocabStrip').innerHTML=round.cards.map((c)=>`<span class="vocab-pill ${c.lang==='mn'?'mn':'ko'}">${escapeHtml(c.text)}</span>`).join('');
  const players=sortedPlayers(); const complete=players.filter((p)=>(p.matchedPairIds||[]).length>=room.config.pairsPerRound).length; $('progressText').textContent=`${complete}/${players.length}명 완료`; const avg=players.length?players.reduce((a,p)=>a+(p.matchedPairIds?.length||0),0)/players.length:0; $('hostMatchedSummary').textContent=`평균 ${avg.toFixed(1)}/${room.config.pairsPerRound}쌍`;
  $('rankingList').innerHTML=players.map((p,i)=>{const matched=p.matchedPairIds?.length||0;const pct=Math.min(100,matched/room.config.pairsPerRound*100);return `<div class="rank-row"><span class="rank-num">${i+1}</span><span class="rank-avatar">${p.avatar}</span><span class="rank-copy"><strong>${escapeHtml(p.name)}${p.bot?' · DEMO':''}</strong><span>${matched}/${room.config.pairsPerRound}쌍 · 실수 ${p.mistakes||0}</span><span class="progress-mini"><i style="width:${pct}%"></i></span></span><strong class="rank-score">${blind?'••••':`${(p.score||0).toLocaleString()} pt`}</strong></div>`;}).join('');
}
function renderRoundResult(){
  const players=sortedPlayers(); $('roundResultTitle').textContent=`${room.roundIndex+1}판 종료`; $('roundTop3').innerHTML=room.blindActive?'<div class="round-top-item" style="min-width:360px"><b>🙈</b><strong>최종 30% 순위 비공개</strong><span>게임 종료 후 최종 순위를 공개합니다.</span></div>':players.slice(0,3).map((p,i)=>`<div class="round-top-item"><b>${p.avatar}</b><strong>${i+1}위 · ${escapeHtml(p.name)}</strong><span>${(p.score||0).toLocaleString()} pt</span></div>`).join(''); renderRoundResultCountdown();
}
function renderRoundResultCountdown(){ if(!room)return; const n=Math.max(0,Math.ceil((room.roundResultEndAt-nowMs())/1000)); $('roundResultTimer').textContent=room.roundIndex+1>=room.matching.roundCount?`최종 결과 ${n}`:`다음 판 ${n}`; }
function renderFinal(){
  const players=sortedPlayers();
  const top=players.slice(0,3);
  const order=top.length>=3?[top[1],top[0],top[2]]:top;
  $('finalPodium').innerHTML=order.map((p)=>{const rank=players.findIndex((x)=>x.uid===p.uid)+1;return `<div class="podium-item rank${rank}"><div class="avatar">${p.avatar}</div><strong>${escapeHtml(p.name)}</strong><span>${(p.score||0).toLocaleString()} pt</span><em>${rank}위 · 총 실수 ${p.totalMistakes||0}회</em></div>`;}).join('');
  const finalRanking=$('finalRanking');
  const columns=players.length>24?3:(players.length>12?2:1);
  const rows=Math.max(1,Math.ceil(players.length/columns));
  finalRanking.dataset.columns=String(columns);
  finalRanking.style.setProperty('--final-columns',String(columns));
  finalRanking.style.setProperty('--final-rows',String(rows));
  finalRanking.innerHTML=players.map((p,i)=>`<div class="rank-row"><span class="rank-num">${i+1}</span><span class="rank-avatar">${p.avatar}</span><span class="rank-copy"><strong>${escapeHtml(p.name)}</strong><span>총 매칭 ${p.totalMatched||''}${p.bot?' · DEMO':''}</span></span><strong class="rank-score">${(p.score||0).toLocaleString()} pt</strong></div>`).join('');
}

async function endRoom(){
  if(!room)return; clearBotTimers(); clearTimeout(earlyEndTimer); audio.stopAll(); try{if(bus?.mode==='firebase')await bus.removeRoom();else bus?.removeRoom();}catch{} bus?.close(); bus=null; room=null; clearInterval(loop); $('hostView').classList.add('hidden'); $('setupView').classList.remove('hidden'); if(document.fullscreenElement)document.exitFullscreen().catch(()=>{}); }
function backToSetup(){ if(!room||room.status!=='lobby')return; endRoom(); }
async function toggleFullscreen(){ try{if(!document.fullscreenElement)await $('hostView').requestFullscreen();else await document.exitFullscreen();}catch(e){toast('전체 화면을 시작하지 못했습니다.');} }

fillCatalog(); applyLaunchParams(); updateSourceFields(); refreshData(); updateBackendStatus(); setRoundTime(45); syncAudioControls();
$('sourceType').addEventListener('change',refreshData); $('snuBook').addEventListener('change',()=>{fillLessons();refreshData();}); $('snuLesson').addEventListener('change',refreshData); $('collocationSet').addEventListener('change',refreshData); $('roundCount').addEventListener('change',refreshData); $('pairsPerRound').addEventListener('change',()=>{refreshData();renderVocabList();});
$('timePresets').addEventListener('click',(e)=>{const b=e.target.closest('button[data-time]');if(b)setRoundTime(b.dataset.time);}); $('roundTime').addEventListener('input',()=>setRoundTime($('roundTime').value));
$('vocabBtn').addEventListener('click',openVocabModal); $('closeVocabBtn').addEventListener('click',closeVocabModal); $('vocabModal').addEventListener('click',(e)=>{if(e.target===$('vocabModal'))closeVocabModal();}); $('vocabSearch').addEventListener('input',renderVocabList); $('vocabList').addEventListener('change',(e)=>{const cb=e.target.closest('input[type=checkbox][data-id]');if(!cb)return; if(cb.checked)draftSelection.add(cb.dataset.id);else draftSelection.delete(cb.dataset.id); cb.closest('.vocab-row')?.classList.toggle('selected',cb.checked); $('modalSelectedCount').textContent=`${draftSelection.size}개 선택`;}); $('selectAllBtn').addEventListener('click',()=>{sourceItems.forEach((v)=>draftSelection.add(v.id));renderVocabList();}); $('clearAllBtn').addEventListener('click',()=>{draftSelection.clear();renderVocabList();}); $('applyVocabBtn').addEventListener('click',applyVocabSelection);
$('masterVolume').addEventListener('input',()=>{const v=Number($('masterVolume').value)/100;$('volumeValue').textContent=`${Math.round(v*100)}%`;audio.setSettings({volume:v});}); $('bgmEnabled').addEventListener('change',()=>audio.setSettings({bgmEnabled:$('bgmEnabled').checked})); $('sfxEnabled').addEventListener('change',()=>audio.setSettings({sfxEnabled:$('sfxEnabled').checked})); $('soundTestBtn').addEventListener('click',async()=>{setupAudio();await audio.preview();});
$('gameBgmBtn').addEventListener('click',()=>applyLiveAudio({bgmEnabled:!audio.getSettings().bgmEnabled})); $('gameSfxBtn').addEventListener('click',()=>applyLiveAudio({sfxEnabled:!audio.getSettings().sfxEnabled}));
$('soloBtn').addEventListener('click',startSolo); $('demoBtn').addEventListener('click',()=>createRoom(true)); $('createRoomBtn').addEventListener('click',()=>createRoom(false)); $('addDemoBtn').addEventListener('click',()=>addDemoStudents(10,true)); $('startGameBtn').addEventListener('click',startGame); $('backSetupBtn').addEventListener('click',backToSetup); $('endRoomBtn').addEventListener('click',endRoom); $('newGameBtn').addEventListener('click',endRoom); $('fullscreenBtn').addEventListener('click',toggleFullscreen);
window.addEventListener('beforeunload',()=>{clearBotTimers();clearTimeout(earlyEndTimer);if(room&&bus?.mode==='local')bus.removeRoom();bus?.close();});
