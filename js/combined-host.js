import { loadByConfig } from './data-loader.js';
import { buildQuiz, calculateScore } from './game-engine.js';
import { buildMatchingRounds } from './matching-engine.js';
import { FirebaseBus, isFirebaseConfigured, createUniqueFirebasePin, loadVocabularyTeacherStore } from './firebase-bus.js?v=7.7';
import { firebaseReady, loadSentenceTeacherStore } from '../sentence-battle-sample/js/sentence-live.js?v=2.2';
import { GameAudioEngine } from './audio-engine.js?v=7.4';
import { CombinedSentenceAudio } from './combined-sentence-audio.js?v=1.0';

const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const book=params.get('book')||'1A';
const lesson=Math.max(1,Number(params.get('lesson'))||1);
const VOCAB_LOCAL_KEY='kwb_teacher_vocabulary_v1';
const SENTENCE_LOCAL_PREFIX='kwb_sentence_teacher_v1';
const AVATARS=['🐻','🐱','🐼','🐰','🐯','🦊','🐧','🐸','🐨','🦁','🐵','🐶'];
const STAGE_META=[
  {key:'word',icon:'⚡',title:'어휘 배틀',round:'ROUND 1',copy:'한국어·몽골어 어휘를 빠르게 판단합니다.'},
  {key:'matching',icon:'🃏',title:'카드 매칭',round:'ROUND 2',copy:'같은 뜻의 한국어·몽골어 카드를 빠르게 짝짓습니다.'},
  {key:'sentence',icon:'🧩',title:'문장 배틀',round:'ROUND 3',copy:'카드를 배열해 자연스러운 한국어 문장을 완성합니다.'}
];
const STAGE_FRAME_SRC=['combined-stage-word.html','combined-stage-matching.html','combined-stage-sentence.html'];

const DEMO_PLAYERS=[
  {name:'Ану',avatar:'🐰',word:.95,match:.86,sentence:.90,speed:.92},
  {name:'Тэмүүлэн',avatar:'🐯',word:.90,match:.95,sentence:.84,speed:.90},
  {name:'Номин',avatar:'🐱',word:.92,match:.82,sentence:.95,speed:.86},
  {name:'Бат',avatar:'🐻',word:.87,match:.90,sentence:.83,speed:.84},
  {name:'Саруул',avatar:'🦊',word:.83,match:.88,sentence:.86,speed:.82},
  {name:'Мөнх',avatar:'🐼',word:.84,match:.78,sentence:.88,speed:.79},
  {name:'Энхжин',avatar:'🐧',word:.80,match:.84,sentence:.79,speed:.76},
  {name:'Оюунаа',avatar:'🐨',word:.77,match:.75,sentence:.84,speed:.73},
  {name:'Төгөлдөр',avatar:'🦁',word:.73,match:.81,sentence:.74,speed:.70},
  {name:'Марал',avatar:'🐸',word:.70,match:.72,sentence:.77,speed:.68}
].map((p,i)=>({...p,id:`demo-${i+1}`,scores:{word:0,matching:0,sentence:0}}));

let vocabItems=[];
let sentenceQuestions=[];
let quiz=null;
let matching=null;
let demoRunId=0;
const audio=new GameAudioEngine();
const sentenceAudio=new CombinedSentenceAudio();
let lastCountdownAudioKey='';
let lastTimerTickKey='';
let blindAudioPlayed=false;
let mode='setup';
let liveRoom=null;
let liveBus=null;
let liveGuard=null;
let liveTick=null;
let lastRenderedStage=-99;
let replicaStage=-1;
let replicaReady=false;
let demoReplicaState=null;

function esc(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function now(){return liveBus?.now?.()||Date.now();}
function demoTotal(p){return Math.round(p.scores.word+p.scores.matching+p.scores.sentence);}
function liveTotal(p){return Math.round(Number(p?.scores?.word||0)+Number(p?.scores?.matching||0)+Number(p?.scores?.sentence||0));}
function resetDemoPlayers(){DEMO_PLAYERS.forEach(p=>{p.scores={word:0,matching:0,sentence:0};});}
function sortedDemo(){return [...DEMO_PLAYERS].sort((a,b)=>demoTotal(b)-demoTotal(a)||a.name.localeCompare(b.name));}
function sortedLive(){return Object.values(liveRoom?.players||{}).sort((a,b)=>liveTotal(b)-liveTotal(a)||String(a.name).localeCompare(String(b.name),'ko'));}
function clearLiveGuard(){if(liveGuard){clearTimeout(liveGuard);liveGuard=null;}}
function scheduleLive(fn,ms){clearLiveGuard();liveGuard=setTimeout(fn,Math.max(0,ms));}

function readJsonLocal(key,fallback){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback;}catch{return fallback;}}
function normalizeVocabStore(raw){const overrides={};Object.entries(raw?.overrides||{}).forEach(([id,r])=>{const ko=String(r?.ko||'').trim(),mn=String(r?.mn||'').trim();if(id&&ko&&mn)overrides[String(id)]={id:String(id),ko,mn,updatedAt:Number(r?.updatedAt)||0};});return{version:1,updatedAt:Number(raw?.updatedAt)||0,overrides};}
async function resolveVocabStore(){
  const local=normalizeVocabStore(readJsonLocal(VOCAB_LOCAL_KEY,{version:1,updatedAt:0,overrides:{}}));
  if(!isFirebaseConfigured())return{store:local,state:'local'};
  try{
    const remoteRaw=await loadVocabularyTeacherStore();
    if(!remoteRaw)return{store:local,state:'firebase'};
    const remote=normalizeVocabStore(remoteRaw);
    const chosen=remote.updatedAt>=local.updatedAt?remote:local;
    if(chosen===remote)localStorage.setItem(VOCAB_LOCAL_KEY,JSON.stringify(remote));
    return{store:chosen,state:'firebase'};
  }catch(err){console.warn('종합 배틀 공통 어휘 저장소 읽기 실패',err);return{store:local,state:'local'};}
}
function applyVocabStore(items,store){return items.map(v=>{const s=store?.overrides?.[String(v.id)];return s?{...v,ko:s.ko,mn:s.mn,teacherEdited:true}:v;});}

function sentenceStoreKey(){return`${SENTENCE_LOCAL_PREFIX}:${book}:lesson${String(lesson).padStart(2,'0')}`;}
function normalizeSentenceStore(raw){const customRaw=raw?.customQuestions;const custom=Array.isArray(customRaw)?customRaw:(customRaw&&typeof customRaw==='object'?Object.values(customRaw):[]);return{version:2,updatedAt:Number(raw?.updatedAt)||0,overrides:raw?.overrides&&typeof raw.overrides==='object'?raw.overrides:{},customQuestions:custom.filter(Boolean)};}
async function resolveSentenceStore(){
  const local=normalizeSentenceStore(readJsonLocal(sentenceStoreKey(),{version:2,updatedAt:0,overrides:{},customQuestions:[]}));
  if(!firebaseReady())return{store:local,state:'local'};
  try{
    const remoteRaw=await loadSentenceTeacherStore(book,lesson);
    if(!remoteRaw)return{store:local,state:'firebase'};
    const remote=normalizeSentenceStore(remoteRaw);
    const chosen=remote.updatedAt>=local.updatedAt?remote:local;
    if(chosen===remote)localStorage.setItem(sentenceStoreKey(),JSON.stringify(remote));
    return{store:chosen,state:'firebase'};
  }catch(err){console.warn('종합 배틀 문장 저장소 읽기 실패',err);return{store:local,state:'local'};}
}

const RESPONSE_PREFIX_RE=/^(?:네|아니요|아니오)\s*[,，]\s*/;
const FLEX_PARTICLES=new Set(['은','는','이','가','을','를','에','에서','에게','한테','께','도','만','부터','까지','으로','로','의','보다','처럼','하고','와','과']);
const FLEX_CONJUNCTIONS=new Set(['하고','와','과']);
function normalizeForMatch(text){return String(text||'').normalize('NFC').replace(/[\s\u00a0]+/g,'').replace(/[.,!?;:'"“”‘’()，。！？·…]/g,'').trim();}
function orderFromSentence(cardLabels,sentence){const target=normalizeForMatch(sentence),norm=cardLabels.map(normalizeForMatch),used=new Array(cardLabels.length).fill(false),path=[];function dfs(pos){if(path.length===cardLabels.length)return pos===target.length?[...path]:null;for(let i=0;i<norm.length;i++){if(used[i])continue;const piece=norm[i];if(!piece||!target.startsWith(piece,pos))continue;used[i]=true;path.push(i);const r=dfs(pos+piece.length);if(r)return r;path.pop();used[i]=false;}return null;}return dfs(0);}
function inferFlexibleFrame(tokens,order){
  if(!Array.isArray(order)||order.length<2)return null;
  const label=new Map(tokens),tail=[order[order.length-1]],head=order.slice(0,-1),units=[];
  for(const id of head){const text=label.get(id)||'';if(FLEX_PARTICLES.has(String(text).replace(/[.?!]+$/g,''))&&units.length){units[units.length-1].push(id);continue;}units.push([id]);}
  const merged=[];for(let i=0;i<units.length;i++){const u=[...units[i]],last=String(label.get(u[u.length-1])||'').replace(/[.?!]+$/g,'');if(FLEX_CONJUNCTIONS.has(last)&&i+1<units.length)u.push(...units[++i]);merged.push(u);}return merged.length?{units:merged,tail}:null;
}
function inferFlexibleFrames(tokens,orders){const out=[],seen=new Set();for(const order of orders||[]){const f=inferFlexibleFrame(tokens,order);if(!f)continue;const k=JSON.stringify(f);if(!seen.has(k)){seen.add(k);out.push(f);}}return out;}
function applySentenceRules(displaySentence,tokens,acceptedOrders){
  let display=String(displaySentence||'').trim(),nextTokens=(tokens||[]).map(t=>[String(t[0]),String(t[1])]),nextOrders=(acceptedOrders||[]).map(o=>o.map(String));
  if(RESPONSE_PREFIX_RE.test(display)&&nextOrders.length){const map=new Map(nextTokens),firstId=nextOrders[0]?.[0],firstText=String(map.get(firstId)||'').trim();if(['네','아니요','아니오'].includes(firstText)){display=display.replace(RESPONSE_PREFIX_RE,'').trim();nextTokens=nextTokens.filter(([id])=>id!==firstId);nextOrders=nextOrders.map(o=>o.filter(id=>id!==firstId)).filter(o=>o.length);}}
  if(/[?？]\s*$/.test(display)&&nextOrders.length){const finals=new Set(nextOrders.map(o=>o[o.length-1]).filter(Boolean));nextTokens=nextTokens.map(([id,text])=>finals.has(id)?[id,String(text).trim().replace(/[.。!！?？]+$/g,'')+'?']:[id,text]);}
  return{displaySentence:display,tokens:nextTokens,acceptedOrders:nextOrders};
}
function cleanBaseSentence(q,index){
  const id=String(q.id||`SNU-${book}-${String(lesson).padStart(2,'0')}-${String(index+1).padStart(3,'0')}`),tokens=(q.tokens||[]).map(t=>[String(t[0]),String(t[1])]),orders=(q.acceptedOrders||[]).map(o=>o.map(String));
  const cleaned=applySentenceRules(q.displaySentence,tokens,orders);return{...q,id,displaySentence:cleaned.displaySentence,tokens:cleaned.tokens,acceptedOrders:cleaned.acceptedOrders,flexibleFrames:inferFlexibleFrames(cleaned.tokens,cleaned.acceptedOrders),teacherEdited:false};
}
function storedSentence(record,base=null){
  if(!record)return null;const id=String(record.id||base?.id||'');const cards=Array.isArray(record.cards)?record.cards.map(v=>String(v).trim()).filter(Boolean):[];const answers=Array.isArray(record.answers)?record.answers.map(v=>String(v).trim()).filter(Boolean):[];if(!id||cards.length<2||!answers.length)return null;
  const tokens=cards.map((label,i)=>[`${id}_card_${i}`,label]),orders=[];for(const answer of answers){const idxs=orderFromSentence(cards,answer);if(!idxs)return null;orders.push(idxs.map(i=>tokens[i][0]));}
  const cleaned=applySentenceRules(answers[0],tokens,orders);return{...(base||{}),id,displaySentence:cleaned.displaySentence||answers[0],tokens:cleaned.tokens,acceptedOrders:cleaned.acceptedOrders,flexibleFrames:inferFlexibleFrames(cleaned.tokens,cleaned.acceptedOrders),teacherEdited:true,note:base?.note||'교사 영구 수정'};
}
function applySentenceStore(base,store){const merged=base.map((q,i)=>storedSentence(store?.overrides?.[String(q.id)],q)||cleanBaseSentence(q,i));for(const rec of store?.customQuestions||[]){const q=storedSentence(rec,null);if(q&&!merged.some(x=>x.id===q.id))merged.push(q);}return merged.filter(q=>q.id&&q.displaySentence&&q.tokens.length>=2&&q.acceptedOrders.length);}
function sameOrder(a,b){return a.length===b.length&&a.every((v,i)=>String(v)===String(b[i]));}
function startsWithOrder(order,pos,unit){return pos+unit.length<=order.length&&unit.every((id,i)=>String(order[pos+i])===String(id));}
function matchesFlexibleFrame(order,frame){const tail=Array.isArray(frame?.tail)?frame.tail:[],units=Array.isArray(frame?.units)?frame.units:[],bodyLength=units.reduce((n,u)=>n+u.length,0);if(order.length!==bodyLength+tail.length)return false;if(tail.length&&!sameOrder(order.slice(bodyLength),tail))return false;const body=order.slice(0,bodyLength),used=new Array(units.length).fill(false);function walk(pos,count){if(count===units.length)return pos===body.length;for(let i=0;i<units.length;i++){if(used[i]||!startsWithOrder(body,pos,units[i]))continue;used[i]=true;if(walk(pos+units[i].length,count+1))return true;used[i]=false;}return false;}return walk(0,0);}
function isCorrectSentenceOrder(order,q){if((q.acceptedOrders||[]).some(ans=>sameOrder(order,ans)))return true;return(q.flexibleFrames||[]).some(frame=>matchesFlexibleFrame(order,frame));}
async function loadSentenceBase(){const code=String(lesson).padStart(2,'0');const res=await fetch(`data/sentence/snu/${book}/lesson${code}.json`,{cache:'no-store'});if(!res.ok)throw new Error(`서울대 ${book} ${lesson}과 문장 데이터를 불러오지 못했습니다.`);return res.json();}

function settings(){return{
  wordCount:clamp(Number($('wordCount').value)||5,3,Math.min(20,vocabItems.length||20)),wordTime:Number($('wordTime').value)||10,
  matchRounds:clamp(Number($('matchRounds').value)||2,1,3),pairsPerRound:clamp(Number($('pairsPerRound').value)||6,4,6),matchTime:Number($('matchTime').value)||45,
  sentenceCount:clamp(Number($('sentenceCount').value)||5,3,Math.min(20,sentenceQuestions.length||20)),sentenceTime:Number($('sentenceTime').value)||20,blindAt:.70
};}

async function preload(){
  $('sourceTitle').textContent=`서울대 ${book} · ${lesson}과`;$('contextText').textContent=`종합 배틀 · 서울대 ${book} · ${lesson}과`;
  try{
    const [vocabBase,sentenceBase,vocabResolved,sentenceResolved]=await Promise.all([loadByConfig({sourceType:'snu',snuBook:book,snuLesson:lesson}),loadSentenceBase(),resolveVocabStore(),resolveSentenceStore()]);
    vocabItems=applyVocabStore(vocabBase.items,vocabResolved.store);sentenceQuestions=applySentenceStore(sentenceBase.questions||[],sentenceResolved.store);
    const vocabEdited=vocabItems.filter(x=>x.teacherEdited).length,sentenceEdited=sentenceQuestions.filter(x=>x.teacherEdited).length;
    $('wordCount').max=String(Math.min(20,vocabItems.length));$('sentenceCount').max=String(Math.min(20,sentenceQuestions.length));
    const shared=vocabResolved.state==='firebase'&&sentenceResolved.state==='firebase';$('syncStatus').className=`sync-status ${shared?'ready':'warn'}`;$('syncStatus').textContent=`${shared?'☁ Firebase 공유 저장 연결':'💾 PC 저장 사용'} · 어휘 수정 ${vocabEdited}개 · 문장 수정/추가 ${sentenceEdited}개`;
    $('setupMessage').className='message ready';$('setupMessage').textContent=`준비 완료 · 어휘 ${vocabItems.length}개 · 문장 ${sentenceQuestions.length}개 · 실제 학생도 한 번 입장해 세 게임을 연속 진행합니다.`;
    $('demoBtn').disabled=false;$('liveBtn').disabled=!isFirebaseConfigured();if(!isFirebaseConfigured())$('liveBtn').title='실제 학생 방은 Firebase 연결이 필요합니다.';
  }catch(err){console.error(err);$('setupMessage').className='message error';$('setupMessage').textContent=err?.message||'종합 배틀 자료를 불러오지 못했습니다.';}
}

function setupAudio(){const bgm=$('bgmEnabled'),sfx=$('sfxEnabled'),vol=$('masterVolume');const settings={bgmEnabled:bgm?bgm.checked:true,sfxEnabled:sfx?sfx.checked:true,volume:vol?Number(vol.value)/100:.75};audio.setSettings(settings);sentenceAudio.setSettings(settings);if($('volumeValue'))$('volumeValue').textContent=`${Math.round(settings.volume*100)}%`;return settings;}
async function unlockAudio(){setupAudio();const [a,b]=await Promise.all([audio.unlock(),sentenceAudio.unlock()]);return a||b;}
function stageTone(){audio.playChime();}
function finalTone(){audio.playFinish();}
function stageBgm(stageIndex,blind=false){sentenceAudio.stopTension();if(stageIndex===2){audio.stopBgm();sentenceAudio.startTension(()=>Math.max(0,Number(liveRoom?.unitEndAt||0)-now()),liveRoom?.config?.sentenceTime||20);}else if(blind)audio.startBgm('final');else audio.startBgm('normal');}
function validateQuizIntegrity(qz){for(const q of qz?.questions||[]){if(!Array.isArray(q.options)||q.options.length!==4)throw new Error('어휘 배틀 4지선다 생성 오류가 발견되었습니다.');if(q.correctIndex<0||q.correctIndex>=q.options.length||String(q.options[q.correctIndex])!==String(q.answer))throw new Error(`어휘 배틀 정답 선택지 생성 오류: ${q.prompt}`);}}
function validateMatchingIntegrity(m){for(const round of m?.rounds||[]){const cards=round.cards||[];for(const pair of round.pairs||[]){const same=cards.filter(c=>c.pairId===pair.pairId);const ko=same.find(c=>c.lang==='ko'),mn=same.find(c=>c.lang==='mn');if(same.length!==2||!ko||!mn||String(ko.text)!==String(pair.ko)||String(mn.text)!==String(pair.mn))throw new Error(`카드 매칭 짝 생성 오류: ${pair.ko}`);}}}

function setView(name){for(const id of ['setupView','lobbyView','demoView','replicaView','finalView'])$(id)?.classList.toggle('hidden',id!==`${name}View`);document.body.classList.toggle('replica-active',name==='replica');}
function replicaStageKey(index=liveRoom?.stageIndex){return STAGE_META[clamp(Number(index)||0,0,2)]?.key||'word';}
function currentReplicaKey(){return STAGE_META[clamp(Number(replicaStage)||0,0,2)]?.key||'word';}
function ensureReplicaStage(index){
  const stage=clamp(Number(index)||0,0,2),frame=$('stageFrame'),wrap=$('replicaView');
  setView('replica');
  if(replicaStage!==stage||!frame?.getAttribute('src')){replicaStage=stage;replicaReady=false;wrap?.classList.remove('ready');if(frame)frame.src=STAGE_FRAME_SRC[stage];}
}
function liveReplicaState(){
  if(!liveRoom)return null;
  const t=now(),status=liveRoom.status;
  let remainingMs=0,durationMs=1;
  if(status==='countdown'){remainingMs=Math.max(0,Number(liveRoom.countdownEndAt||0)-t);durationMs=Math.max(1,Number(liveRoom.countdownEndAt||0)-Math.max(0,Number(liveRoom.countdownEndAt||0)-3000));}
  else if(status==='playing'){remainingMs=Math.max(0,Number(liveRoom.unitEndAt||0)-t);durationMs=Math.max(1,Number(liveRoom.unitEndAt||0)-Number(liveRoom.unitStartAt||0));}
  const players=Object.values(liveRoom.players||{}).map(p=>({uid:p.uid,name:p.name,avatar:p.avatar,bot:!!p.bot,scores:{word:Number(p.scores?.word)||0,matching:Number(p.scores?.matching)||0,sentence:Number(p.scores?.sentence)||0},matchedPairIds:[...(p.matchedPairIds||[])],matchingMistakes:Number(p.matchingMistakes)||0}));
  return {status,stageIndex:liveRoom.stageIndex,unitIndex:liveRoom.unitIndex,unitTotal:liveRoom.unitTotal,blindActive:!!liveRoom.blindActive,remainingMs,durationMs,resultRemainingMs:status==='result'?Math.max(0,Number(liveRoom.resultEndAt||0)-t):0,currentWordQuestion:liveRoom.currentWordQuestion,currentMatchingRound:liveRoom.currentMatchingRound,currentSentenceQuestion:liveRoom.currentSentenceQuestion,players,submittedCount:Object.keys(liveRoom.unitResults||{}).length,config:liveRoom.config||{},audio:audio.getSettings(),context:`서울대 ${book} · ${lesson}과`,demoMode:false};
}
function sendReplicaState(){if(!replicaReady)return;const frame=$('stageFrame'),state=liveRoom?liveReplicaState():demoReplicaState;if(!frame?.contentWindow||!state)return;frame.contentWindow.postMessage({type:'combined-stage-state',stage:currentReplicaKey(),state},location.origin);}
function sendReplicaEvent(stage,event){const frame=$('stageFrame');if(!replicaReady||!frame?.contentWindow||currentReplicaKey()!==stage)return;frame.contentWindow.postMessage({type:'combined-stage-event',stage,event},location.origin);}
window.addEventListener('message',async(e)=>{
  if(e.origin!==location.origin)return;const m=e.data||{};
  if(m.type==='combined-stage-ready'){if(m.stage===currentReplicaKey()){replicaReady=true;$('replicaView')?.classList.add('ready');sendReplicaState();}return;}
  if(m.type==='combined-stop-request'){stopCurrent();return;}
  if(m.type==='combined-fullscreen'){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch{}return;}
  if(m.type==='combined-audio-change'){
    const patch=m.patch||{};if(typeof patch.bgmEnabled==='boolean'&&$('bgmEnabled'))$('bgmEnabled').checked=patch.bgmEnabled;if(typeof patch.sfxEnabled==='boolean'&&$('sfxEnabled'))$('sfxEnabled').checked=patch.sfxEnabled;if(Number.isFinite(patch.volume)&&$('masterVolume'))$('masterVolume').value=String(Math.round(clamp(patch.volume,0,1)*100));setupAudio();sendReplicaState();
  }
});
function setStageUi(index,playTone=false){const meta=STAGE_META[index]||STAGE_META[0];$('stageTitle').textContent=`${meta.round} · ${meta.title}`;$('stageSubtitle').textContent=meta.copy;['tabWord','tabMatching','tabSentence'].forEach((id,i)=>{$(id).classList.toggle('active',i===index);$(id).classList.toggle('done',i<index);});if(playTone)stageTone();}
function setProgress(done,total){const pct=clamp(Math.round(done/Math.max(1,total)*100),0,100);$('totalProgress').style.width=`${pct}%`;$('totalProgressText').textContent=`${pct}%`;return pct;}
function stageSplash(icon,title,copy,extra=''){$('gameVisual').innerHTML=`<div class="stage-splash"><span>${icon}</span><strong>${esc(title)}</strong><p>${esc(copy)}</p>${extra}</div>`;$('roundFeedback').textContent='다음 경기를 준비합니다.';}
function renderWordQuestion(q,index,total){$('roundCounter').textContent=`Q ${index+1}/${total}`;$('gameVisual').innerHTML=`<div class="word-visual"><span class="direction-chip">${q.direction==='ko-mn'?'한국어 → 몽골어':'몽골어 → 한국어'}</span><div class="word-prompt">${esc(q.prompt)}</div><div class="word-options">${q.options.map((x)=>`<span>${esc(x)}</span>`).join('')}</div></div>`;}
function renderMatchingRound(round,index,total){$('roundCounter').textContent=`ROUND ${index+1}/${total}`;$('gameVisual').innerHTML=`<div class="matching-visual"><div class="match-round-title"><strong>${round.pairs.length}쌍 카드 매칭</strong><p>한국어와 몽골어 카드를 같은 뜻끼리 빠르게 연결합니다.</p></div><div class="pair-grid">${round.cards.map(c=>`<div class="pair-card ${c.lang==='mn'?'mn':''}">${esc(c.text)}</div>`).join('')}</div></div>`;}
function renderSentenceQuestion(q,index,total,reveal=false){$('roundCounter').textContent=`Q ${index+1}/${total}`;const tokens=q.shuffledTokens||shuffle(q.tokens);$('gameVisual').innerHTML=`<div class="sentence-visual"><div class="sentence-guide">섞인 카드를 자연스러운 문장 순서로 배열하세요.</div><div class="sentence-cards">${tokens.map(t=>`<span class="sentence-card">${esc(Array.isArray(t)?t[1]:t)}</span>`).join('')}</div>${reveal?`<div class="sentence-answer">${esc(q.displaySentence)}</div>`:''}</div>`;}

function demoPlayersPayload(extraById={}){return DEMO_PLAYERS.map(p=>({uid:p.id,name:p.name,avatar:p.avatar,bot:true,scores:{word:Number(p.scores.word)||0,matching:Number(p.scores.matching)||0,sentence:Number(p.scores.sentence)||0},matchedPairIds:[...(extraById[p.id]?.matchedPairIds||[])],matchingMistakes:Number(extraById[p.id]?.matchingMistakes)||0}));}
function setDemoReplica(stageIndex,partial={}){ensureReplicaStage(stageIndex);demoReplicaState={status:'playing',stageIndex,unitIndex:0,unitTotal:1,blindActive:false,remainingMs:0,durationMs:1,resultRemainingMs:0,currentWordQuestion:null,currentMatchingRound:null,currentSentenceQuestion:null,players:demoPlayersPayload(),submittedCount:0,config:settings(),audio:audio.getSettings(),context:`서울대 ${book} · ${lesson}과`,demoMode:true,...partial};sendReplicaState();}
/* ---------------- demo mode ---------------- */
function updateDemoStageLabels(){const max=key=>Math.max(...DEMO_PLAYERS.map(p=>Math.round(p.scores[key])));$('wordStageScore').textContent=`최고 ${max('word')}/1000`;$('matchingStageScore').textContent=`최고 ${max('matching')}/1000`;$('sentenceStageScore').textContent=`최고 ${max('sentence')}/1000`;}
function renderDemoRank(blind=false){$('rankBlind').classList.toggle('hidden',!blind);if(blind)return;$('rankList').innerHTML=sortedDemo().map((p,i)=>`<div class="rank-row ${i<3?'top':''}"><span class="rank-no">${i+1}</span><span class="rank-avatar">${p.avatar}</span><span class="rank-name">${esc(p.name)}</span><span class="rank-score">${demoTotal(p).toLocaleString()}</span></div>`).join('');}
function scoreDemoStep(stage,stepCount){DEMO_PLAYERS.forEach(p=>{const skill=stage==='word'?p.word:stage==='matching'?p.match:p.sentence,correct=Math.random()<(skill*.92+.05),speed=clamp(p.speed+(Math.random()-.5)*.14,.45,.99);let ratio=correct?(.57+.43*speed):(.06+Math.random()*.10);if(stage==='matching')ratio=clamp(.48*skill+.52*speed+(Math.random()-.5)*.08,.34,.99);p.scores[stage]=clamp(p.scores[stage]+1000/stepCount*ratio,0,1000);});}
async function runDemoWord(runId,s,totalSteps,state){
  quiz=buildQuiz(vocabItems,{direction:'mixed',questionCount:s.wordCount});validateQuizIntegrity(quiz);setDemoReplica(0,{status:'transition',unitTotal:quiz.questions.length});audio.startBgm('normal');audio.playChime();await sleep(700);
  for(let i=0;i<quiz.questions.length;i++){if(runId!==demoRunId)return false;const q=quiz.questions[i],duration=1800;audio.playQuestionStart();setDemoReplica(0,{status:'playing',unitIndex:i,unitTotal:quiz.questions.length,currentWordQuestion:q,remainingMs:duration,durationMs:duration,submittedCount:0,players:demoPlayersPayload()});await sleep(1050);scoreDemoStep('word',quiz.questions.length);state.done++;const top=sortedDemo()[0];sendReplicaEvent('word',{kind:'correct',name:top.name,avatar:top.avatar,points:Math.round(1000/quiz.questions.length)});audio.playReveal(1);setDemoReplica(0,{status:'result',unitIndex:i,unitTotal:quiz.questions.length,currentWordQuestion:q,resultRemainingMs:650,players:demoPlayersPayload(),submittedCount:DEMO_PLAYERS.length});await sleep(650);}return true;
}
async function runDemoMatching(runId,s,totalSteps,state){
  matching=buildMatchingRounds(vocabItems,{roundCount:s.matchRounds,pairsPerRound:s.pairsPerRound});validateMatchingIntegrity(matching);setDemoReplica(1,{status:'transition',unitTotal:matching.rounds.length});audio.startBgm('normal');audio.playChime();await sleep(750);
  for(let i=0;i<matching.rounds.length;i++){if(runId!==demoRunId)return false;const r=matching.rounds[i],duration=2200;audio.playQuestionStart();const empty={};for(const p of DEMO_PLAYERS)empty[p.id]={matchedPairIds:[],matchingMistakes:0};setDemoReplica(1,{status:'playing',unitIndex:i,unitTotal:matching.rounds.length,currentMatchingRound:r,remainingMs:duration,durationMs:duration,players:demoPlayersPayload(empty)});await sleep(1350);scoreDemoStep('matching',matching.rounds.length);state.done++;const done={};for(const p of DEMO_PLAYERS){const count=Math.max(1,Math.min(r.pairs.length,Math.round(r.pairs.length*(.6+Math.random()*.4))));done[p.id]={matchedPairIds:r.pairs.slice(0,count).map(x=>x.pairId),matchingMistakes:Math.floor(Math.random()*2)};}audio.playReveal(1);setDemoReplica(1,{status:'result',unitIndex:i,unitTotal:matching.rounds.length,currentMatchingRound:r,resultRemainingMs:750,players:demoPlayersPayload(done)});await sleep(750);}return true;
}
async function runDemoSentence(runId,s,totalSteps,state){
  const selected=shuffle(sentenceQuestions).slice(0,s.sentenceCount);setDemoReplica(2,{status:'transition',unitTotal:selected.length});audio.stopBgm();sentenceAudio.sfx('start');await sleep(750);
  for(let i=0;i<selected.length;i++){if(runId!==demoRunId)return false;const q={...selected[i],shuffledTokens:shuffle(selected[i].tokens).map(t=>[...t])},duration=2000,blind=state.done/totalSteps>=.70;sentenceAudio.startTension(()=>duration,s.sentenceTime);setDemoReplica(2,{status:'playing',unitIndex:i,unitTotal:selected.length,currentSentenceQuestion:q,remainingMs:duration,durationMs:duration,blindActive:blind,submittedCount:0,players:demoPlayersPayload()});await sleep(1200);sentenceAudio.stopTension();scoreDemoStep('sentence',selected.length);state.done++;const top=sortedDemo()[0];sendReplicaEvent('sentence',{kind:'correct',name:top.name,avatar:top.avatar,points:Math.round(1000/selected.length)});sentenceAudio.sfx('answer');const nowBlind=state.done/totalSteps>=.70&&state.done<totalSteps;setDemoReplica(2,{status:'result',unitIndex:i,unitTotal:selected.length,currentSentenceQuestion:q,resultRemainingMs:800,blindActive:nowBlind,submittedCount:DEMO_PLAYERS.length,players:demoPlayersPayload()});await sleep(800);}return true;
}
async function startDemo(){mode='demo';liveRoom=null;demoReplicaState=null;await unlockAudio();audio.stopBgm();sentenceAudio.stopTension();const runId=++demoRunId;resetDemoPlayers();setView('replica');const s=settings(),totalSteps=s.wordCount+s.matchRounds+s.sentenceCount,state={done:0};try{if(!(await runDemoWord(runId,s,totalSteps,state)))return;if(!(await runDemoMatching(runId,s,totalSteps,state)))return;if(!(await runDemoSentence(runId,s,totalSteps,state)))return;await sleep(350);showDemoFinal();}catch(err){console.error(err);alert(err?.message||'종합 데모 진행 중 오류가 발생했습니다.');setView('setup');mode='setup';}}
function showDemoFinal(){demoReplicaState=null;finalTone();setView('final');const ranked=sortedDemo(),top=ranked.slice(0,3),cls=['first','second','third'];$('podium').innerHTML=top.map((p,i)=>`<div class="podium-card ${cls[i]}"><div class="place">${i+1}위</div><div class="avatar">${p.avatar}</div><div class="name">${esc(p.name)}</div><div class="score">${demoTotal(p).toLocaleString()} / 3,000</div></div>`).join('');$('finalRanking').innerHTML=ranked.map((p,i)=>`<div class="final-row"><span>${i+1}</span><span>${p.avatar}</span><b>${esc(p.name)}</b><span class="sub">어휘 ${Math.round(p.scores.word)}</span><span class="sub">매칭 ${Math.round(p.scores.matching)}</span><span class="sub">문장 ${Math.round(p.scores.sentence)}</span><span class="total">${demoTotal(p).toLocaleString()}</span></div>`).join('');}
function stopDemo(){demoRunId++;sentenceAudio.stopAll();audio.stopAll();demoReplicaState=null;replicaReady=false;replicaStage=-1;if($('stageFrame'))$('stageFrame').removeAttribute('src');mode='setup';setView('setup');}

/* ---------------- live Firebase room ---------------- */
function liveStageKey(){return STAGE_META[liveRoom?.stageIndex]?.key||'word';}
function liveUnitTotal(index=liveRoom?.stageIndex){if(index===0)return liveRoom?.config?.wordCount||0;if(index===1)return liveRoom?.config?.matchRounds||0;if(index===2)return liveRoom?.config?.sentenceCount||0;return 0;}
function recalcLivePlayer(p){p.score=liveTotal(p);return p.score;}
function renderQr(url){const box=$('qrBox');box.innerHTML='';if(window.QRCode)new QRCode(box,{text:url,width:172,height:172,correctLevel:QRCode.CorrectLevel.M});else box.textContent='QR을 만들지 못했습니다. PIN을 사용하세요.';}
function renderLobby(){if(!liveRoom)return;const players=Object.values(liveRoom.players||{});$('lobbyCount').textContent=String(players.length);$('startLiveBtn').disabled=players.length===0;$('lobbyPlayers').innerHTML=players.length?players.map(p=>`<div class="player-chip"><span class="avatar">${esc(p.avatar)}</span><strong>${esc(p.name)}</strong></div>`).join(''):'<div class="empty-lobby">학생 입장을 기다리고 있습니다.</div>';}
function updateLiveStageLabels(){const list=Object.values(liveRoom?.players||{}),max=key=>list.length?Math.max(...list.map(p=>Math.round(Number(p.scores?.[key])||0))):0;$('wordStageScore').textContent=`최고 ${max('word')}/1000`;$('matchingStageScore').textContent=`최고 ${max('matching')}/1000`;$('sentenceStageScore').textContent=`최고 ${max('sentence')}/1000`;}
function renderLiveRank(){if(!liveRoom)return;const blind=!!liveRoom.blindActive&&liveRoom.status!=='finished';$('rankBlind').classList.toggle('hidden',!blind);if(blind)return;$('rankList').innerHTML=sortedLive().map((p,i)=>`<div class="rank-row ${i<3?'top':''}"><span class="rank-no">${i+1}</span><span class="rank-avatar">${esc(p.avatar)}</span><span class="rank-name">${esc(p.name)}</span><span class="rank-score">${liveTotal(p).toLocaleString()}</span></div>`).join('');}
function stageProgressPct(){return liveRoom?clamp(Math.round((Number(liveRoom.completedSteps)||0)/Math.max(1,Number(liveRoom.totalSteps)||1)*100),0,100):0;}
function persistLive(){if(!liveRoom||!liveBus)return Promise.resolve();Object.values(liveRoom.players||{}).forEach(recalcLivePlayer);return liveBus.saveRoom(liveRoom).catch(err=>console.warn('종합 배틀 상태 저장 실패',err));}
function currentLiveQuestion(){if(!liveRoom)return null;if(liveRoom.stageIndex===0)return liveRoom.currentWordQuestion;if(liveRoom.stageIndex===2)return liveRoom.currentSentenceQuestion;return null;}

async function createLiveRoom(){
  await unlockAudio();if(!isFirebaseConfigured()){alert('실제 학생 종합 배틀은 Firebase 연결이 필요합니다.');return;}
  try{
    const s=settings();quiz=buildQuiz(vocabItems,{direction:'mixed',questionCount:s.wordCount});validateQuizIntegrity(quiz);matching=buildMatchingRounds(vocabItems,{roundCount:s.matchRounds,pairsPerRound:s.pairsPerRound});validateMatchingIntegrity(matching);const selectedSentence=shuffle(sentenceQuestions).slice(0,s.sentenceCount);
    const pin=await createUniqueFirebasePin();liveRoom={pin,title:`종합 배틀 · 서울대 ${book} ${lesson}과`,status:'lobby',config:{gameType:'combined',...s},players:{},stageIndex:-1,unitIndex:-1,unitTotal:0,unitResults:{},completedSteps:0,totalSteps:s.wordCount+s.matchRounds+s.sentenceCount,blindActive:false,quiz,matching,sentenceSet:selectedSentence,createdAt:Date.now()};
    liveBus?.close();liveBus=new FirebaseBus(pin,'host');liveBus.on(handleLiveMessage);await liveBus.init();liveRoom.createdAt=now();await liveBus.createRoom(liveRoom);mode='live';setView('lobby');$('roomPin').textContent=pin;const url=new URL('combined-play.html',location.href);url.searchParams.set('pin',pin);$('joinUrl').textContent=url.href;$('openPlayerBtn').onclick=()=>window.open(url.href,'_blank');renderQr(url.href);renderLobby();startLiveTick();audio.startBgm('lobby');audio.playChime();
  }catch(err){console.error(err);alert(err?.message||'실제 학생 종합 배틀 방을 만들지 못했습니다.');}
}
function handleLiveMessage(msg){if(!liveRoom)return;const p=msg.payload||{},uid=String(p.uid||msg.uid||'');if(msg.type==='join'){if(liveRoom.status!=='lobby'||!uid||!p.name)return;liveRoom.players[uid]={uid,name:String(p.name).slice(0,20),avatar:AVATARS.includes(p.avatar)?p.avatar:'🐻',scores:{word:0,matching:0,sentence:0},score:0,matchedPairIds:[],matchingMistakes:0,matchingCombo:0};persistLive();renderLobby();return;}if(msg.type==='request-state'){persistLive();return;}if(msg.type==='combined-word-answer')handleWordAnswer(uid,p,msg.at);if(msg.type==='combined-match-pair')handleMatchPair(uid,p,msg.at);if(msg.type==='combined-match-mistake')handleMatchMistake(uid,p);if(msg.type==='combined-sentence-submit')handleSentenceSubmit(uid,p,msg.at);}
function activeLiveCount(){return Object.keys(liveRoom?.players||{}).length;}
function allLiveResponded(){return activeLiveCount()>0&&Object.keys(liveRoom?.unitResults||{}).length>=activeLiveCount();}

async function startLiveGame(){if(!liveRoom||liveRoom.status!=='lobby'||!activeLiveCount())return;await unlockAudio();audio.stopBgm();blindAudioPlayed=false;lastCountdownAudioKey='';lastTimerTickKey='';setView('replica');lastRenderedStage=-99;transitionToStage(0);}
function transitionToStage(index){if(!liveRoom)return;if(index>2){finishLive();return;}clearLiveGuard();sentenceAudio.stopTension();audio.stopBgm();audio.playChime();liveRoom.stageIndex=index;liveRoom.unitIndex=0;liveRoom.unitTotal=liveUnitTotal(index);liveRoom.status='transition';liveRoom.transitionEndAt=now()+2400;liveRoom.countdownEndAt=liveRoom.unitStartAt=liveRoom.unitEndAt=liveRoom.resultEndAt=0;liveRoom.unitResults={};liveRoom.currentWordQuestion=null;liveRoom.currentMatchingRound=null;liveRoom.currentSentenceQuestion=null;liveRoom.blindActive=(liveRoom.completedSteps/liveRoom.totalSteps)>=liveRoom.config.blindAt;persistLive();renderLive();scheduleLive(()=>prepareCountdown(index,0,3000),2450);}
function prepareCountdown(stageIndex,unitIndex,duration=1800){if(!liveRoom||liveRoom.stageIndex!==stageIndex)return;audio.stopBgm();lastCountdownAudioKey='';lastTimerTickKey='';liveRoom.status='countdown';liveRoom.unitIndex=unitIndex;liveRoom.unitTotal=liveUnitTotal(stageIndex);liveRoom.countdownEndAt=now()+duration;liveRoom.unitResults={};if(stageIndex===1){Object.values(liveRoom.players).forEach(p=>{p.matchedPairIds=[];p.matchingMistakes=0;p.matchingCombo=0;p.matchingRoundStartScore=Number(p.scores?.matching)||0;});}persistLive();renderLive();scheduleLive(()=>startLiveUnit(stageIndex,unitIndex),duration+80);}
function startLiveUnit(stageIndex,unitIndex){if(!liveRoom||liveRoom.stageIndex!==stageIndex)return;clearLiveGuard();liveRoom.status='playing';liveRoom.unitIndex=unitIndex;liveRoom.unitResults={};liveRoom.unitStartAt=now()+150;let duration=10000;if(stageIndex===0){const q=liveRoom.quiz.questions[unitIndex];liveRoom.currentWordQuestion=q;liveRoom.currentMatchingRound=null;liveRoom.currentSentenceQuestion=null;duration=liveRoom.config.wordTime*1000;}else if(stageIndex===1){const r=liveRoom.matching.rounds[unitIndex];liveRoom.currentMatchingRound=r;liveRoom.currentWordQuestion=null;liveRoom.currentSentenceQuestion=null;duration=liveRoom.config.matchTime*1000;}else{const q=liveRoom.sentenceSet[unitIndex];liveRoom.currentSentenceQuestion={...q,shuffledTokens:shuffle(q.tokens).map(t=>[...t])};liveRoom.currentWordQuestion=null;liveRoom.currentMatchingRound=null;duration=liveRoom.config.sentenceTime*1000;}liveRoom.unitEndAt=liveRoom.unitStartAt+duration;liveRoom.resultEndAt=0;liveRoom.blindActive=(liveRoom.completedSteps/liveRoom.totalSteps)>=liveRoom.config.blindAt;if(liveRoom.blindActive&&!blindAudioPlayed){blindAudioPlayed=true;audio.playBlindTransition();}stageBgm(stageIndex,liveRoom.blindActive);if(stageIndex===2)sentenceAudio.sfx('start');else audio.playQuestionStart();lastTimerTickKey='';persistLive();renderLive();scheduleLive(()=>endLiveUnit('time'),duration+500);}
function handleWordAnswer(uid,p,receivedAt){if(!liveRoom||liveRoom.status!=='playing'||liveRoom.stageIndex!==0||Number(p.unitIndex)!==liveRoom.unitIndex||liveRoom.unitResults[uid]||!liveRoom.players[uid])return;const q=liveRoom.currentWordQuestion,choice=Number(p.choice),correct=choice===q.correctIndex,elapsed=Math.max(0,(Number(receivedAt)||now())-liveRoom.unitStartAt),raw=calculateScore(liveRoom.config.wordTime*1000,elapsed,correct),points=Math.round(raw/liveRoom.config.wordCount);liveRoom.unitResults[uid]={correct,points,choice};liveRoom.players[uid].scores.word=clamp(Number(liveRoom.players[uid].scores.word||0)+points,0,1000);if(correct){audio.playGift(points);const pl=liveRoom.players[uid];sendReplicaEvent('word',{kind:'correct',uid,name:pl.name,avatar:pl.avatar,points});}persistLive();renderLive();if(allLiveResponded())setTimeout(()=>endLiveUnit('all'),220);}
function handleMatchPair(uid,p,receivedAt){if(!liveRoom||liveRoom.status!=='playing'||liveRoom.stageIndex!==1||Number(p.unitIndex)!==liveRoom.unitIndex||!liveRoom.players[uid])return;const player=liveRoom.players[uid],round=liveRoom.currentMatchingRound,pairId=String(p.pairId||'');if(!round?.pairs?.some(x=>x.pairId===pairId)||player.matchedPairIds.includes(pairId))return;player.matchedPairIds.push(pairId);player.matchingCombo=(Number(player.matchingCombo)||0)+1;const duration=liveRoom.config.matchTime*1000,elapsed=Math.max(0,(Number(receivedAt)||now())-liveRoom.unitStartAt),remaining=clamp(1-elapsed/duration,0,1),perRound=1000/liveRoom.config.matchRounds,perPair=perRound/round.pairs.length,ratio=clamp(.55+.45*remaining+.025*Math.max(0,player.matchingCombo-1),.50,1),points=Math.round(perPair*ratio);player.scores.matching=clamp(Number(player.scores.matching||0)+points,0,1000);audio.playGift(points);if(player.matchedPairIds.length>=round.pairs.length&&!liveRoom.unitResults[uid])liveRoom.unitResults[uid]={correct:true,points:Math.max(0,Math.round(Number(player.scores.matching||0)-Number(player.matchingRoundStartScore||0))),complete:true,mistakes:player.matchingMistakes};persistLive();renderLive();if(allLiveResponded())setTimeout(()=>endLiveUnit('all'),260);}
function handleMatchMistake(uid,p){if(!liveRoom||liveRoom.status!=='playing'||liveRoom.stageIndex!==1||Number(p.unitIndex)!==liveRoom.unitIndex||!liveRoom.players[uid])return;const player=liveRoom.players[uid];player.matchingMistakes=(Number(player.matchingMistakes)||0)+1;player.matchingCombo=0;persistLive();renderLive();}
function handleSentenceSubmit(uid,p,receivedAt){if(!liveRoom||liveRoom.status!=='playing'||liveRoom.stageIndex!==2||Number(p.unitIndex)!==liveRoom.unitIndex||liveRoom.unitResults[uid]||!liveRoom.players[uid])return;const q=liveRoom.currentSentenceQuestion,order=Array.isArray(p.order)?p.order.map(String):[],correct=isCorrectSentenceOrder(order,q),elapsed=Math.max(0,(Number(receivedAt)||now())-liveRoom.unitStartAt),raw=calculateScore(liveRoom.config.sentenceTime*1000,elapsed,correct),points=Math.round(raw/liveRoom.config.sentenceCount);liveRoom.unitResults[uid]={correct,points};liveRoom.players[uid].scores.sentence=clamp(Number(liveRoom.players[uid].scores.sentence||0)+points,0,1000);if(correct){sentenceAudio.sfx('answer');const pl=liveRoom.players[uid];sendReplicaEvent('sentence',{kind:'correct',uid,name:pl.name,avatar:pl.avatar,points});}else sentenceAudio.sfx('submit');persistLive();renderLive();if(allLiveResponded())setTimeout(()=>endLiveUnit('all'),240);}
function endLiveUnit(){if(!liveRoom||liveRoom.status!=='playing')return;clearLiveGuard();for(const uid of Object.keys(liveRoom.players)){if(!liveRoom.unitResults[uid])liveRoom.unitResults[uid]={correct:false,points:0,complete:false};}const results=Object.values(liveRoom.unitResults||{}),success=results.filter(r=>r.correct||r.complete).length,ratio=results.length?success/results.length:0;if(liveRoom.stageIndex===2){sentenceAudio.stopTension();sentenceAudio.sfx('answer');audio.stopBgm();}else{audio.stopBgm();audio.playReveal(ratio);}liveRoom.status='result';liveRoom.completedSteps=Math.min(liveRoom.totalSteps,Number(liveRoom.completedSteps||0)+1);liveRoom.blindActive=(liveRoom.completedSteps/liveRoom.totalSteps)>=liveRoom.config.blindAt&&liveRoom.completedSteps<liveRoom.totalSteps;if(liveRoom.blindActive&&!blindAudioPlayed){blindAudioPlayed=true;audio.playBlindTransition();}liveRoom.resultEndAt=now()+2500;persistLive();renderLive();scheduleLive(advanceLive,2550);}
function advanceLive(){if(!liveRoom||liveRoom.status!=='result')return;const next=liveRoom.unitIndex+1;if(next<liveUnitTotal(liveRoom.stageIndex)){prepareCountdown(liveRoom.stageIndex,next,1600);return;}if(liveRoom.stageIndex<2)transitionToStage(liveRoom.stageIndex+1);else finishLive();}
function finishLive(){if(!liveRoom)return;clearLiveGuard();sentenceAudio.stopTension();audio.stopBgm();liveRoom.status='finished';liveRoom.finishedAt=now();liveRoom.blindActive=false;liveRoom.currentWordQuestion=null;liveRoom.currentMatchingRound=null;liveRoom.currentSentenceQuestion=null;persistLive();renderLiveFinal();}

function renderLive(){if(!liveRoom)return;ensureReplicaStage(clamp(Number(liveRoom.stageIndex),0,2));sendReplicaState();}
function renderLiveFinal(){finalTone();setView('final');const ranked=sortedLive(),top=ranked.slice(0,3),cls=['first','second','third'];$('podium').innerHTML=top.map((p,i)=>`<div class="podium-card ${cls[i]}"><div class="place">${i+1}위</div><div class="avatar">${esc(p.avatar)}</div><div class="name">${esc(p.name)}</div><div class="score">${liveTotal(p).toLocaleString()} / 3,000</div></div>`).join('');$('finalRanking').innerHTML=ranked.map((p,i)=>`<div class="final-row"><span>${i+1}</span><span>${esc(p.avatar)}</span><b>${esc(p.name)}</b><span class="sub">어휘 ${Math.round(p.scores.word)}</span><span class="sub">매칭 ${Math.round(p.scores.matching)}</span><span class="sub">문장 ${Math.round(p.scores.sentence)}</span><span class="total">${liveTotal(p).toLocaleString()}</span></div>`).join('');}
function startLiveTick(){if(liveTick)return;liveTick=setInterval(()=>{if(!liveRoom)return;const t=now();if(liveRoom.status==='countdown'){const left=Math.max(0,liveRoom.countdownEndAt-t),n=Math.max(1,Math.ceil(left/1000)),key=`${liveRoom.stageIndex}:${liveRoom.unitIndex}:${n}`;const el=$('hostCountdownLive');if(el)el.textContent=String(n);$('liveTimer').textContent=(left/1000).toFixed(1);if(n<=3&&key!==lastCountdownAudioKey){lastCountdownAudioKey=key;if(liveRoom.stageIndex===2){if(n===3)sentenceAudio.sfx('start');}else audio.playCountdown(n);}}else if(liveRoom.status==='playing'){const left=Math.max(0,liveRoom.unitEndAt-t),total=Math.max(1,liveRoom.unitEndAt-liveRoom.unitStartAt);$('liveTimer').textContent=(left/1000).toFixed(1);$('liveTimer').style.color=left/total<.25?'#ff8794':'';const sec=Math.ceil(left/1000),key=`${liveRoom.stageIndex}:${liveRoom.unitIndex}:${sec}`;if(sec<=5&&sec>0&&key!==lastTimerTickKey){lastTimerTickKey=key;if(liveRoom.stageIndex===2)sentenceAudio.sfx('tick');else audio.playTimerTick(sec);}}else if(liveRoom.status==='transition'){if($('liveTimer'))$('liveTimer').textContent='';}sendReplicaState();},90);}
async function closeLiveRoom(toSetup=true){clearLiveGuard();sentenceAudio.stopAll();audio.stopAll();if(liveTick){clearInterval(liveTick);liveTick=null;}if(liveBus){try{await liveBus.removeRoom();}catch(err){console.warn(err);}liveBus.close();}liveBus=null;liveRoom=null;lastRenderedStage=-99;replicaReady=false;replicaStage=-1;if($('stageFrame'))$('stageFrame').removeAttribute('src');if(toSetup){mode='setup';setView('setup');}}
async function stopCurrent(){if(mode==='demo'){stopDemo();return;}if(mode==='live'){if(!confirm('진행 중인 종합 배틀 방을 종료할까요?'))return;await closeLiveRoom(true);}}

$('demoBtn').addEventListener('click',startDemo);
$('liveBtn').addEventListener('click',createLiveRoom);
$('startLiveBtn').addEventListener('click',startLiveGame);
$('closeRoomBtn').addEventListener('click',()=>closeLiveRoom(true));
$('stopDemoBtn').addEventListener('click',stopCurrent);
$('againBtn').addEventListener('click',async()=>{if(mode==='demo')startDemo();else{await closeLiveRoom(false);mode='setup';setView('setup');}});
window.addEventListener('beforeunload',()=>{sentenceAudio.stopAll();audio.stopAll();if(mode==='live'&&liveBus&&liveRoom){try{liveBus.removeRoom();}catch{}}});

function bindAudioControls(){setupAudio();$('bgmEnabled')?.addEventListener('change',()=>{setupAudio();if(mode==='live'&&liveRoom?.status==='lobby')audio.startBgm('lobby');});$('sfxEnabled')?.addEventListener('change',setupAudio);$('masterVolume')?.addEventListener('input',setupAudio);$('audioPreviewBtn')?.addEventListener('click',async()=>{await unlockAudio();audio.preview();});}
bindAudioControls();
preload();
