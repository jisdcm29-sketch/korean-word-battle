import { FirebaseBus, isFirebaseConfigured } from './firebase-bus.js?v=8.2';
import { directionLabel } from './game-engine.js';

const $ = (id) => document.getElementById(id);
const AVATARS = ['🐻','🐱','🐼','🐰','🐯','🦊','🐧','🐸','🐨','🦁','🐵','🐶'];
const STAGE_META = [
  { round:'ROUND 1', title:'어휘 배틀', icon:'⚡' },
  { round:'ROUND 2', title:'카드 매칭', icon:'🃏' },
  { round:'ROUND 3', title:'문장 배틀', icon:'🧩' }
];
const TOP_VIEWS = ['joinView','waitingView','transitionView','finishView','wordView','matchingView','sentenceView','countdownView','resultView'];
const BOUND_TEXTS = new Set(['은','는','이','가','을','를','에','에서','에게','한테','께','하고','와','과','도','만','부터','까지','으로','로','의','보다','처럼','입니다','입니까','이에요','예요']);

let selectedAvatar = '🐻';
let uid = localStorage.getItem('kwb_player_uid') || crypto.randomUUID?.() || `u-${Date.now()}-${Math.random()}`;
localStorage.setItem('kwb_player_uid', uid);

let bus = null;
let state = null;
let joined = false;
let joinConfirmed = false;
let timerLoop = null;
let currentUnitKey = '';
let renderedWordKey = '';
let renderedMatchingKey = '';
let renderedSentenceKey = '';
let wordSubmittedKey = '';
let sentenceSubmittedKey = '';
let selectedMatchCardId = null;
let localPendingPairs = new Set();
let sentenceOrder = [];
let previousMatchingScore = 0;
let matchingFeedbackTimer = null;
let lastKnownScores = { word:0, matching:0, sentence:0, total:0 };
let networkConnected=true,hostDisconnected=false,offlinePackage=null,offlineLoop=null;

function esc(value){
  return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function terminalBase(text){
  return String(text || '').trim().replace(/[.。!！?？]+$/g,'');
}
function isBoundText(text){
  return BOUND_TEXTS.has(terminalBase(text));
}
function now(){
  return bus?.now?.() || Date.now();
}
function unitKey(){
  return `${state?.stageIndex ?? -1}:${state?.unitIndex ?? -1}`;
}
function stageMeta(){
  return STAGE_META[state?.stageIndex] || STAGE_META[0];
}
function myPlayer(){
  return state?.players?.[uid] || null;
}
function totalFromScores(scores){
  return Math.round(Number(scores?.word || 0) + Number(scores?.matching || 0) + Number(scores?.sentence || 0));
}
function rememberScores(me){
  if(!me?.scores) return;
  lastKnownScores = {
    word:Number(me.scores.word) || 0,
    matching:Number(me.scores.matching) || 0,
    sentence:Number(me.scores.sentence) || 0,
    total:Number(me.score) || totalFromScores(me.scores)
  };
}
function scoreText(me){
  if(state?.blindActive) return '•••';
  rememberScores(me);
  return Math.round(Number(me?.score) || lastKnownScores.total).toLocaleString();
}

function setSkin(stageIndex = -1){
  const stage = Number(stageIndex);
  $('wordSkin').disabled = stage !== 0;
  $('matchingSkin').disabled = stage !== 1;
  $('sentenceSkin').disabled = stage !== 2;

  $('sharedBg').classList.toggle('combined-off', stage >= 0);
  $('sharedShell').classList.toggle('combined-off', stage >= 0);

  if(stage === 0) document.body.className = 'player-page';
  else if(stage === 1) document.body.className = 'match-player-page';
  else if(stage === 2) document.body.className = 'combined-stage-sentence-active';
  else document.body.className = 'combined-ui';
}
function show(id, stageIndex = -1){
  TOP_VIEWS.forEach(viewId => $(viewId).classList.toggle('combined-off', viewId !== id));
  setSkin(stageIndex);
}
function showStageVariant(group, stageIndex){
  [0,1,2].forEach(i => {
    const names = group === 'countdown'
      ? ['wordCountdownSkin','matchingCountdownSkin','sentenceCountdownSkin']
      : ['wordResultSkin','matchingResultSkin','sentenceResultSkin'];
    $(names[i]).classList.toggle('combined-off', i !== stageIndex);
  });
}

function initAvatars(){
  $('avatarGrid').innerHTML = AVATARS.map((avatar,i) =>
    `<button class="combined-avatar-btn ${i===0?'selected':''}" data-a="${avatar}" type="button">${avatar}</button>`
  ).join('');
  $('avatarGrid').addEventListener('click', e => {
    const button = e.target.closest('.combined-avatar-btn');
    if(!button) return;
    selectedAvatar = button.dataset.a;
    document.querySelectorAll('.combined-avatar-btn').forEach(x => x.classList.toggle('selected', x === button));
  });
}

const params = new URLSearchParams(location.search);
const pinParam = params.get('pin');
if(pinParam) $('pinInput').value = pinParam;

function setError(text){
  $('joinError').textContent = text;
}
async function join(){
  const pin = $('pinInput').value.trim();
  const name = $('nameInput').value.trim();
  if(!/^\d{6}$/.test(pin)) return setError('6자리 PIN을 입력하세요.');
  if(!name) return setError('이름을 입력하세요.');
  setError('');
  $('joinBtn').disabled = true;

  try{
    if(!isFirebaseConfigured()) throw new Error('Firebase 연결 설정이 완료되지 않았습니다.');
    bus?.close();
    bus = new FirebaseBus(pin,'player');
    bus.on(handleMessage);
    await bus.init();
    uid = bus.uid;
    const initial = await bus.loadRoom();
    if(!initial || initial.status === 'closed') throw new Error('방을 찾을 수 없습니다. PIN을 확인해 주세요.');
    if(initial.config?.gameType !== 'combined') throw new Error('종합 배틀 방이 아닙니다.');
    if(initial.status === 'finished' && !initial.players?.[uid]) throw new Error('이미 종료된 종합 배틀입니다.');
    const lateJoin = initial.status !== 'lobby';

    joined = true;
    joinConfirmed = false;
    localStorage.setItem(`kwb_combined_name_${pin}`, name);
    localStorage.setItem(`kwb_combined_avatar_${pin}`, selectedAvatar);
    $('myAvatar').textContent = selectedAvatar;
    $('waitingName').textContent = lateJoin ? `${name}님, 진행 중인 게임에 입장 중...` : `${name}님, 입장 요청 중...`;
    show('waitingView');
    await bus.send('join',{uid,name,avatar:selectedAvatar});
  }catch(err){
    joined = false;
    bus?.close();
    bus = null;
    setError(err?.message || '종합 배틀에 입장하지 못했습니다.');
    show('joinView');
  }finally{
    $('joinBtn').disabled = false;
  }
}
function offlineActive(){return !networkConnected||hostDisconnected;}
function syncOfflineLoop(){if(offlineActive()){if(!offlineLoop)offlineLoop=setInterval(advanceOfflineState,90);}else if(offlineLoop){clearInterval(offlineLoop);offlineLoop=null;}}
function handleMessage(msg){
  if(msg.type === 'connection'){
    networkConnected=msg.connected!==false;
    syncOfflineLoop();
    return;
  }
  if(msg.type === 'state'){
    state = msg.payload.room;
    offlinePackage=state?.offlinePackage||offlinePackage;
    hostDisconnected=Boolean(state?.hostDisconnectedAt);
    syncOfflineLoop();
    renderState();
  }
  if(msg.type === 'room-closed'){
    alert('교사가 종합 배틀 방을 종료했습니다.');
    location.href = 'combined-play.html';
  }
}

function phase3StageItems(stage){if(stage===0)return offlinePackage?.wordQuestions||[];if(stage===1)return offlinePackage?.matchingRounds||[];return offlinePackage?.sentenceQuestions||[];}
function phase3ResetCombinedMatchingPlayers(){Object.values(state?.players||{}).forEach(p=>{p.matchedPairIds=[];p.matchingMistakes=0;p.matchingCombo=0;});}
function phase3StartCombinedUnit(stage,index,startAt){
  const items=phase3StageItems(stage),item=items[index];if(!item||!state)return false;
  const config=state.config||{};let duration=10000,currentQuestion=null,currentRound=null;
  if(stage===0){duration=Math.max(1000,Number(config.wordTime||10)*1000);currentQuestion=item;}
  else if(stage===1){duration=Math.max(1000,Number(config.matchTime||45)*1000);currentRound=item;phase3ResetCombinedMatchingPlayers();}
  else{duration=Math.max(1000,Number(config.sentenceTime||20)*1000);currentQuestion=item;}
  state={...state,status:'playing',stageIndex:stage,stageType:['word','matching','sentence'][stage],unitIndex:index,unitTotal:items.length,unitStartAt:startAt,unitEndAt:startAt+duration,resultEndAt:0,currentQuestion,currentRound,answeredUids:[],unitResults:{},revealAnswer:null,revealSentence:null,offlineSynthetic:true,offlineFinal:false};
  renderState();return true;
}
function phase3BeginCombinedCountdown(stage,index,endAt){
  if(stage===1)phase3ResetCombinedMatchingPlayers();
  state={...state,status:'countdown',stageIndex:stage,stageType:['word','matching','sentence'][stage],unitIndex:index,unitTotal:phase3StageItems(stage).length,countdownEndAt:endAt,unitStartAt:0,unitEndAt:0,resultEndAt:0,currentQuestion:null,currentRound:null,answeredUids:[],unitResults:{},revealAnswer:null,revealSentence:null,offlineSynthetic:true,offlineFinal:false};
  renderState();
}
function advanceOfflineState(){
  if(!offlineActive()||!state||offlinePackage?.kind!=='combined'||state.status==='lobby'||state.status==='finished')return;
  const t=now(),timing=offlinePackage.timing||{},firstCountdown=Number(timing.firstCountdownMs)||3000,nextCountdown=Number(timing.nextCountdownMs)||1600,startDelay=Number(timing.unitStartDelayMs)||150,resultMs=Number(timing.resultMs)||2500;
  const stage=Math.max(0,Math.min(2,Number(state.stageIndex)||0));
  if(state.status==='transition'&&t>=Number(state.transitionEndAt||0)+40){phase3BeginCombinedCountdown(stage,0,Number(state.transitionEndAt||t)+50+firstCountdown);return;}
  if(state.status==='countdown'&&t>=Number(state.countdownEndAt||0)){phase3StartCombinedUnit(stage,Math.max(0,Number(state.unitIndex)||0),Number(state.countdownEndAt||t)+startDelay);return;}
  if(state.status==='playing'&&t>=Number(state.unitEndAt||0)){
    const items=phase3StageItems(stage),last=Number(state.unitIndex)>=items.length-1;
    const completed=Math.min(Number(state.totalSteps)||1,Number(state.completedSteps||0)+1);
    state={...state,status:'result',completedSteps:completed,resultEndAt:Number(state.unitEndAt||t)+resultMs,unitResults:{},answeredUids:[],revealAnswer:null,revealSentence:null,offlineSynthetic:true,offlineFinal:last&&stage===2};renderState();return;
  }
  if(state.status==='result'&&t>=Number(state.resultEndAt||0)){
    const items=phase3StageItems(stage),next=Number(state.unitIndex)+1;
    if(next<items.length){phase3BeginCombinedCountdown(stage,next,Number(state.resultEndAt||t)+nextCountdown);return;}
    if(stage<2){
      const nextStage=stage+1;
      state={...state,status:'transition',stageIndex:nextStage,stageType:['word','matching','sentence'][nextStage],unitIndex:0,unitTotal:phase3StageItems(nextStage).length,transitionEndAt:Number(state.resultEndAt||t)+2400,countdownEndAt:0,unitStartAt:0,unitEndAt:0,resultEndAt:0,currentQuestion:null,currentRound:null,answeredUids:[],unitResults:{},offlineSynthetic:true,offlineFinal:false};renderState();
    }
  }
}

function renderState(){
  if(!joined || !state) return;
  const me = myPlayer();
  if(!me) return;

  if(!joinConfirmed){
    joinConfirmed = true;
    $('myAvatar').textContent = me.avatar || selectedAvatar;
    $('waitingName').textContent = `${me.name}님, 입장 완료!`;
  }
  rememberScores(me);

  const nextKey = unitKey();
  const unitChanged = nextKey !== currentUnitKey;
  if(unitChanged){
    const previousStage = currentUnitKey ? Number(currentUnitKey.split(':')[0]) : -1;
    currentUnitKey = nextKey;
    selectedMatchCardId = null;
    localPendingPairs = new Set();
    sentenceOrder = [];
    clearTimeout(matchingFeedbackTimer);
    $('matchingState').textContent = '';
    if(state.stageIndex === 1 && previousStage !== 1) previousMatchingScore = Number(me.score) || 0;
  }

  if(state.status === 'lobby'){
    show('waitingView');
    return;
  }
  if(state.status === 'transition'){
    renderTransition();
    show('transitionView');
    return;
  }
  if(state.status === 'countdown'){
    renderCountdown();
    showStageVariant('countdown', state.stageIndex);
    show('countdownView', state.stageIndex);
    startTimer();
    return;
  }
  if(state.status === 'playing'){
    // 먼저 화면을 전환한 뒤 렌더링합니다. 이전 카운트다운(GO!) 화면이
    // 렌더링 중 예외나 캐시 불일치로 남는 현상을 방지합니다.
    if(state.stageIndex === 0){
      show('wordView',0);
      renderWord(me, unitChanged);
    }else if(state.stageIndex === 1){
      show('matchingView',1);
      renderMatching(me, unitChanged);
    }else{
      show('sentenceView',2);
      renderSentence(me, unitChanged);
    }
    startTimer();
    return;
  }
  if(state.status === 'result'){
    renderResult(me);
    showStageVariant('result', state.stageIndex);
    show('resultView', state.stageIndex);
    return;
  }
  if(state.status === 'finished'){
    renderFinish(me);
    show('finishView');
    stopTimer();
  }
}

function renderTransition(){
  const meta = stageMeta();
  $('transitionIcon').textContent = meta.icon;
  $('transitionRound').textContent = meta.round;
  $('transitionTitle').textContent = meta.title;
  $('transitionCopy').textContent = state.blindActive
    ? 'FINAL ZONE · 점수는 종료 후 공개됩니다.'
    : (state.stageIndex === 0 ? '한 번 입장한 상태로 세 게임을 시작합니다.' : '재입장 없이 다음 게임으로 이동합니다.');
}
function renderCountdown(){
  updateCountdown();
}
function updateCountdown(){
  if(!state) return;
  const left = Math.max(0, Number(state.countdownEndAt || 0) - now());
  const n = left <= 0 ? 'GO!' : String(Math.max(1, Math.ceil(left/1000)));
  if(state.stageIndex === 0) $('wordCountdownNumber').textContent = n;
  else if(state.stageIndex === 1) $('matchingCountdownNumber').textContent = n;
  else $('sentenceCountdownNumber').textContent = n;
}

// -----------------------------------------------------------------------------
// ROUND 1 · 어휘 배틀: 독립 어휘 배틀과 같은 DOM/CSS 사용
// -----------------------------------------------------------------------------
function renderWord(me){
  const question = state.currentQuestion;
  if(!question) return;
  const key = unitKey();
  $('wordCounter').textContent = `Q ${state.unitIndex+1}/${state.unitTotal}`;
  $('wordTotalScore').textContent = scoreText(me);
  $('wordDirection').textContent = directionLabel(question.direction);
  $('wordPrompt').textContent = question.prompt;

  const answered = state.answeredUids?.includes(uid) || wordSubmittedKey === key;
  if(renderedWordKey !== key || !$('wordOptions').children.length){
    $('wordOptions').innerHTML = question.options.map((value,i) =>
      `<button class="answer-btn" data-i="${i}" ${answered?'disabled':''}>${esc(value)}</button>`
    ).join('');
    renderedWordKey = key;
  }else{
    document.querySelectorAll('#wordOptions .answer-btn').forEach(button => button.disabled = answered);
  }
  $('wordSubmitState').textContent = answered
    ? '제출 완료! 결과를 기다리세요.'
    : (state.blindActive ? 'FINAL ZONE · 점수 비공개' : '정답을 선택하세요.');
  updateTimer();
}
function submitWord(choice){
  if(!state || state.status !== 'playing' || state.stageIndex !== 0 || wordSubmittedKey === unitKey()) return;
  wordSubmittedKey = unitKey();
  document.querySelectorAll('#wordOptions .answer-btn').forEach(button => {
    button.disabled = true;
    button.classList.toggle('chosen', Number(button.dataset.i) === choice);
  });
  $('wordSubmitState').textContent = '제출 완료!';
  bus.send('combined-word-answer',{unitIndex:state.unitIndex,choice,unitStartAt:state.unitStartAt,unitEndAt:state.unitEndAt});
}

// -----------------------------------------------------------------------------
// ROUND 2 · 카드 매칭: 독립 카드 매칭과 같은 카드판/원형 타이머/피드백 사용
// -----------------------------------------------------------------------------
function matchingBlind(){
  return !!state?.blindActive;
}
function setMatchingScoreVisibility(me){
  const blind = matchingBlind();
  $('matchingBlindBadge').classList.toggle('hidden', !blind);
  $('matchingTotalScore').classList.toggle('hidden', blind);
  $('matchingBlindScoreText').classList.toggle('hidden', !blind);
  if(!blind) $('matchingTotalScore').textContent = scoreText(me);
}
function showMatchingScoreFloat(gain){
  if(!gain || matchingBlind()) return;
  const el = $('matchingScoreFloat');
  el.textContent = `+${Number(gain).toLocaleString()}`;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = 'floatScore .85s ease forwards';
  setTimeout(() => el.classList.add('hidden'), 900);
}
function setMatchingFeedback(text,type=''){
  clearTimeout(matchingFeedbackTimer);
  const el = $('matchingState');
  el.textContent = text;
  el.className = `pair-feedback ${type}`;
  if(text && !text.includes('완료')){
    matchingFeedbackTimer = setTimeout(() => {
      if(el.textContent === text){
        el.textContent = '';
        el.className = 'pair-feedback';
      }
    },1300);
  }
}
function findMatchingCard(id){
  return state?.currentRound?.cards?.find(card => String(card.id) === String(id)) || null;
}
function renderMatchingBoard(cards,matched){
  const available = (cards || []).filter(card => !matched.has(card.pairId));
  $('matchingGrid').innerHTML = available.map(card =>
    `<button type="button" class="match-card ${String(card.id)===String(selectedMatchCardId)?'selected':''}" data-id="${esc(card.id)}" data-pair="${esc(card.pairId)}" data-lang="${esc(card.lang)}"><span class="lang-tag">${card.lang==='ko'?'KOR':'MNG'}</span><span class="card-text">${esc(card.text)}</span></button>`
  ).join('');
  if(!available.length){
    $('matchingGrid').innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#74efbd;font-size:20px;font-weight:1000;padding:34px 8px">✓ 모든 카드를 맞췄습니다!</div>';
  }
}
function renderMatching(me){
  const round = state.currentRound;
  if(!round) return;
  const matched = new Set([...(me.matchedPairIds || []), ...localPendingPairs]);
  const pairTotal = Number(round.pairCount || state.config?.pairsPerRound || 0);

  $('matchingCounter').textContent = `ROUND ${state.unitIndex+1}/${state.unitTotal}`;
  $('matchingPairProgress').textContent = `${matched.size}/${pairTotal}쌍`;
  $('comboCount').textContent = `COMBO ${Number(me.matchingCombo ?? me.combo ?? 0)}`;
  setMatchingScoreVisibility(me);

  const currentScore = Number(me.score) || 0;
  if(currentScore > previousMatchingScore){
    showMatchingScoreFloat(currentScore - previousMatchingScore);
    previousMatchingScore = currentScore;
  }

  $('matchingHint').textContent = state.blindActive
    ? '마지막 승부입니다. 같은 뜻의 한국어·몽골어 카드를 빠르게 짝지으세요.'
    : '한국어 카드와 같은 뜻의 몽골어 카드를 선택하세요.';
  renderMatchingBoard(round.cards || [], matched);
  if(matched.size >= pairTotal) setMatchingFeedback('이번 판 완료! 다른 학생을 기다리는 중…','good');
  updateTimer();
}
function clickMatchCard(cardEl){
  if(!state || state.status !== 'playing' || state.stageIndex !== 1 || cardEl.disabled) return;
  const id = cardEl.dataset.id;
  const card = findMatchingCard(id);
  if(!card) return;
  const me = myPlayer();
  if(!me) return;

  const matched = new Set([...(me.matchedPairIds || []), ...localPendingPairs]);
  if(matched.has(card.pairId)) return;

  if(!selectedMatchCardId){
    selectedMatchCardId = id;
    cardEl.classList.add('selected');
    setMatchingFeedback(card.lang === 'ko' ? '같은 뜻의 몽골어 카드를 선택하세요.' : '같은 뜻의 한국어 카드를 선택하세요.');
    return;
  }
  if(String(selectedMatchCardId) === String(id)){
    selectedMatchCardId = null;
    cardEl.classList.remove('selected');
    return;
  }

  const first = findMatchingCard(selectedMatchCardId);
  if(!first){
    selectedMatchCardId = id;
    renderMatching(me);
    return;
  }

  if(first.lang === card.lang){
    selectedMatchCardId = id;
    document.querySelectorAll('#matchingGrid .match-card').forEach(x => x.classList.toggle('selected', x.dataset.id === id));
    return;
  }

  const firstEl = document.querySelector(`#matchingGrid .match-card[data-id="${CSS.escape(String(first.id))}"]`);
  const correct = first.pairId === card.pairId;
  if(correct){
    firstEl?.classList.add('matched');
    cardEl.classList.add('matched');
    localPendingPairs.add(card.pairId);
    selectedMatchCardId = null;
    try{ navigator.vibrate?.(35); }catch{}
    setMatchingFeedback('정답! 카드 한 쌍이 사라집니다.','good');
    bus.send('combined-match-pair',{unitIndex:state.unitIndex,pairId:card.pairId,unitStartAt:state.unitStartAt,unitEndAt:state.unitEndAt});
    setTimeout(() => {
      const currentMe = myPlayer();
      if(state?.status === 'playing' && state.stageIndex === 1 && currentMe) renderMatching(currentMe);
    },390);
  }else{
    firstEl?.classList.add('wrong');
    cardEl.classList.add('wrong');
    selectedMatchCardId = null;
    try{ navigator.vibrate?.([25,40,25]); }catch{}
    setMatchingFeedback('다른 뜻입니다. 다시 찾아보세요!','bad');
    bus.send('combined-match-mistake',{unitIndex:state.unitIndex,unitStartAt:state.unitStartAt,unitEndAt:state.unitEndAt});
    setTimeout(() => {
      firstEl?.classList.remove('wrong','selected');
      cardEl.classList.remove('wrong','selected');
    },360);
  }
}

// -----------------------------------------------------------------------------
// ROUND 3 · 문장 배틀: 독립 문장 배틀과 같은 문장 카드/뒤로/다시/제출 사용
// -----------------------------------------------------------------------------
function sentenceTokens(){
  return (state?.currentQuestion?.tokens || []).map(token => [String(token[0]), String(token[1])]);
}
function renderSentenceAnswer(tokens){
  const map = new Map(tokens.map(token => [String(token[0]), String(token[1])]));
  if(!sentenceOrder.length){
    $('sentenceAnswer').textContent = '카드를 순서대로 눌러 주세요';
    $('sentenceAnswer').classList.add('empty');
    return;
  }
  $('sentenceAnswer').classList.remove('empty');
  const words = [];
  for(const id of sentenceOrder){
    const text = map.get(String(id)) || '';
    if(words.length && isBoundText(text)) words[words.length-1] += text;
    else words.push(text);
  }
  let sentence = words.join(' ');
  if(sentenceOrder.length === tokens.length && !/[.!?]$/.test(sentence)) sentence += '.';
  $('sentenceAnswer').textContent = sentence;
}
function renderSentenceCards(tokens,submitted,animate=false){
  const used = new Set(sentenceOrder.map(String));
  const available = tokens.filter(token => !used.has(String(token[0])));
  $('sentenceCards').innerHTML = available.map((token,i) => {
    const style = animate ? ` style="--delay:${i*65}ms;--x:${Math.floor(Math.random()*220-110)}px;--r:${Math.floor(Math.random()*26-13)}deg"` : '';
    return `<button class="sentence-card${animate?' drop':''}" data-id="${esc(token[0])}" type="button" ${submitted?'disabled':''}${style}>${esc(token[1])}</button>`;
  }).join('');
  renderSentenceAnswer(tokens);
  $('sentenceSubmitBtn').disabled = submitted || available.length > 0;
  $('sentenceUndoBtn').disabled = submitted || sentenceOrder.length === 0;
  $('sentenceResetBtn').disabled = submitted || sentenceOrder.length === 0;
}
function renderSentence(me,unitChanged){
  const question = state.currentQuestion;
  if(!question) return;
  const key = unitKey();
  const tokens = sentenceTokens();
  const submitted = state.answeredUids?.includes(uid) || sentenceSubmittedKey === key;

  $('sentenceCounter').textContent = `Q ${state.unitIndex+1}/${state.unitTotal}`;
  $('sentenceTotalScore').textContent = scoreText(me);

  if(renderedSentenceKey !== key){
    sentenceOrder = [];
    renderedSentenceKey = key;
    renderSentenceCards(tokens,submitted,true);
  }else{
    renderSentenceCards(tokens,submitted,false);
  }

  $('sentenceSubmitState').textContent = submitted
    ? '제출 완료 · 결과를 기다리는 중'
    : (state.blindActive ? 'FINAL ZONE · 점수 비공개' : '');
  $('sentenceSubmitState').className = `submit-state${submitted?' done':''}`;
  updateTimer();
}
function addSentenceCard(id){
  if(!state || state.status !== 'playing' || state.stageIndex !== 2 || sentenceSubmittedKey === unitKey()) return;
  if(sentenceOrder.includes(String(id))) return;
  sentenceOrder.push(String(id));
  renderSentence(myPlayer(),false);
}
function undoSentence(){
  if(sentenceSubmittedKey === unitKey() || !sentenceOrder.length) return;
  sentenceOrder.pop();
  renderSentence(myPlayer(),false);
}
function resetSentence(){
  if(sentenceSubmittedKey === unitKey()) return;
  sentenceOrder = [];
  renderSentence(myPlayer(),false);
}
function submitSentence(){
  const tokens = sentenceTokens();
  if(!state?.currentQuestion || sentenceSubmittedKey === unitKey() || sentenceOrder.length !== tokens.length) return;
  sentenceSubmittedKey = unitKey();
  renderSentence(myPlayer(),false);
  $('sentenceSubmitState').textContent = '제출 완료 · 결과를 기다리는 중';
  $('sentenceSubmitState').className = 'submit-state done';
  bus.send('combined-sentence-submit',{unitIndex:state.unitIndex,order:[...sentenceOrder],unitStartAt:state.unitStartAt,unitEndAt:state.unitEndAt});
}

// -----------------------------------------------------------------------------
// 결과 화면: 각 독립 게임의 결과 화면 스타일을 그대로 사용
// -----------------------------------------------------------------------------
function fitSentenceReveal(){
  const el = $('sentenceResultReveal');
  if(!el) return;
  el.classList.remove('allow-wrap');
  el.style.fontSize = '34px';
  let size = 34;
  while(size > 21 && el.scrollWidth > el.clientWidth){
    size -= 1;
    el.style.fontSize = `${size}px`;
  }
  if(el.scrollWidth > el.clientWidth){
    el.classList.add('allow-wrap');
    el.style.fontSize = '27px';
  }
}
function renderResult(me){
  if(state.offlineSynthetic){
    if(state.stageIndex===0){$('wordResultCard').classList.remove('wrong');$('wordResultIcon').textContent=state.offlineFinal?'✓':'⟳';$('wordResultTitle').textContent=state.offlineFinal?'어휘 완료':'다음 문제 준비';$('wordResultAnswer').textContent='통신 복구 후 채점 결과가 자동 반영됩니다.';$('wordResultPoints').textContent='답안 안전 저장 중';return;}
    if(state.stageIndex===1){$('matchingResultTitle').textContent=state.offlineFinal?'카드 매칭 완료':'다음 판 준비';$('matchingResultStats').textContent='플레이 기록을 저장했습니다. 연결 복구 후 점수가 반영됩니다.';return;}
    $('sentenceResultReveal').textContent=state.offlineFinal?'종합 배틀 문제 완료':'다음 문장 준비 중';$('sentenceRoundResult').className='my-round-result';$('sentenceRoundResult').textContent=state.offlineFinal?'연결 복구 후 최종 점수를 확인합니다.':'제출 내용은 안전하게 저장되어 있습니다.';return;
  }
  const result = state.unitResults?.[uid] || {correct:false,points:0};
  rememberScores(me);

  if(state.stageIndex === 0){
    const correct = !!result.correct;
    $('wordResultCard').classList.toggle('wrong',!correct);
    $('wordResultIcon').textContent = correct ? '✓' : '×';
    $('wordResultTitle').textContent = correct ? '정답!' : '아쉬워요';
    $('wordResultAnswer').textContent = `정답: ${state.revealAnswer || '-'}`;
    $('wordResultPoints').textContent = state.blindActive ? '점수 비공개' : `+${Number(result.points || 0).toLocaleString()} pt`;
    return;
  }

  if(state.stageIndex === 1){
    const complete = !!result.complete;
    $('matchingResultTitle').textContent = complete ? `${state.unitIndex+1}판 완료!` : '시간 종료';
    const pairTotal = Number(state.currentRound?.pairCount || state.config?.pairsPerRound || 0);
    const matchedCount = Number(result.matchedCount ?? pairTotal ?? 0);
    const mistakeText = `실수 ${Number(result.mistakes || 0)}회`;
    const pointText = state.blindActive ? '점수 비공개' : `+${Number(result.points || 0).toLocaleString()}점`;
    $('matchingResultStats').textContent = complete
      ? `맞춘 카드 ${matchedCount || pairTotal}/${pairTotal}쌍 · ${mistakeText} · ${pointText}`
      : `다음 판을 준비합니다. · ${pointText}`;
    return;
  }

  $('sentenceResultReveal').textContent = state.revealSentence || '';
  requestAnimationFrame(fitSentenceReveal);
  $('sentenceRoundResult').className = 'my-round-result';
  if(result.correct){
    $('sentenceRoundResult').textContent = state.blindActive ? '정답 · 점수 비공개' : `정답 · +${Number(result.points || 0).toLocaleString()}점`;
    $('sentenceRoundResult').classList.add('good');
  }else{
    $('sentenceRoundResult').textContent = '오답 · 0점';
    $('sentenceRoundResult').classList.add('bad');
  }
}

function renderFinish(me){
  rememberScores(me);
  const players = Object.values(state.players || {}).sort((a,b) =>
    (Number(b.score)||0) - (Number(a.score)||0) || String(a.name).localeCompare(String(b.name),'ko')
  );
  const rank = players.findIndex(player => player.uid === uid) + 1;
  const scores = me.scores || lastKnownScores;
  $('finishAvatar').textContent = me.avatar || selectedAvatar;
  $('finishName').textContent = `${me.name}님, 수고했어요!`;
  $('finishWord').textContent = Math.round(Number(scores.word)||0).toLocaleString();
  $('finishMatching').textContent = Math.round(Number(scores.matching)||0).toLocaleString();
  $('finishSentence').textContent = Math.round(Number(scores.sentence)||0).toLocaleString();
  $('finishTotal').textContent = `${Math.round(Number(me.score)||totalFromScores(scores)).toLocaleString()} / 3,000`;
  $('finishRank').textContent = rank > 0 ? `${rank}위` : '-';
}

function updateTimer(){
  if(!state || state.status !== 'playing') return;

  if(state.stageIndex === 0){
    const total = Math.max(1000, Number(state.config?.wordTime || 10) * 1000);
    const left = Math.max(0, Math.min(total, Number(state.unitEndAt || 0) - now()));
    $('wordTimerBar').style.width = `${left/total*100}%`;
    $('wordTimerText').textContent = (left/1000).toFixed(1);
    return;
  }

  if(state.stageIndex === 1){
    const total = Math.max(1000, Number(state.config?.matchTime || 45) * 1000);
    const left = Math.max(0, Math.min(total, Number(state.unitEndAt || 0) - now()));
    const ratio = Math.max(0,Math.min(1,left/total));
    const color = ratio <= .18 ? '#ff4f70' : ratio <= .38 ? '#ffc83d' : '#37d8ff';
    const bar = $('matchingTimerBar');
    if(bar){
      bar.style.width = `${ratio*100}%`;
      bar.style.background = color;
      bar.classList.toggle('urgent', ratio <= .18);
    }
    const timerText = $('matchingTimerText');
    if(timerText){
      timerText.textContent = (left/1000).toFixed(1);
      timerText.classList.toggle('urgent', ratio <= .18);
    }
    return;
  }

  const total = Math.max(1000, Number(state.config?.sentenceTime || 20) * 1000);
  const left = Math.max(0, Math.min(total, Number(state.unitEndAt || 0) - now()));
  $('sentenceTimerBar').style.width = `${left/total*100}%`;
  $('sentenceTimerText').textContent = (left/1000).toFixed(1);
  if(left <= 0){
    $('sentenceSubmitBtn').disabled = true;
    $('sentenceUndoBtn').disabled = true;
    $('sentenceResetBtn').disabled = true;
  }
}
function startTimer(){
  if(timerLoop) return;
  timerLoop = setInterval(() => {
    if(!state) return;
    if(state.status === 'countdown') updateCountdown();
    if(state.status === 'playing') updateTimer();
  },80);
}
function stopTimer(){
  if(timerLoop){
    clearInterval(timerLoop);
    timerLoop = null;
  }
}

$('joinBtn').addEventListener('click',join);
$('nameInput').addEventListener('keydown',e => { if(e.key === 'Enter') join(); });
$('wordOptions').addEventListener('click',e => {
  const button = e.target.closest('.answer-btn');
  if(button) submitWord(Number(button.dataset.i));
});
$('matchingGrid').addEventListener('click',e => {
  const button = e.target.closest('.match-card');
  if(button) clickMatchCard(button);
});
$('sentenceCards').addEventListener('click',e => {
  const button = e.target.closest('.sentence-card');
  if(button) addSentenceCard(button.dataset.id);
});
$('sentenceUndoBtn').addEventListener('click',undoSentence);
$('sentenceResetBtn').addEventListener('click',resetSentence);
$('sentenceSubmitBtn').addEventListener('click',submitSentence);

initAvatars();
show('joinView');
