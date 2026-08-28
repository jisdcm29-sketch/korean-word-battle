import { CATALOG } from './catalog.js';
import { loadByConfig } from './data-loader.js';
import { buildQuiz, calculateScore, directionLabel, getQuizCapacity } from './game-engine.js';
import { LocalBus } from './local-bus.js?v=7.3';
import { FirebaseBus, publicRoomState, isFirebaseConfigured, createUniqueFirebasePin } from './firebase-bus.js?v=7.3';
import { GameAudioEngine } from './audio-engine.js?v=7.4';

const $ = (id) => document.getElementById(id);
const audio = new GameAudioEngine();
const AVATARS = ['🐻','🐱','🐼','🐰','🐯','🦊','🐧','🐸','🐨','🦁','🐵','🐶'];
const DEMO_STUDENTS = [
  { name:'Ану', avatar:'🐰', accuracy:.96, speed:.13 },
  { name:'Тэмүүлэн', avatar:'🐯', accuracy:.93, speed:.17 },
  { name:'Номин', avatar:'🐱', accuracy:.90, speed:.22 },
  { name:'Бат', avatar:'🐻', accuracy:.87, speed:.27 },
  { name:'Саруул', avatar:'🦊', accuracy:.84, speed:.31 },
  { name:'Мөнх', avatar:'🐼', accuracy:.80, speed:.36 },
  { name:'Энхжин', avatar:'🐧', accuracy:.77, speed:.41 },
  { name:'Оюунаа', avatar:'🐨', accuracy:.73, speed:.47 },
  { name:'Төгөлдөр', avatar:'🦁', accuracy:.69, speed:.52 },
  { name:'Марал', avatar:'🐸', accuracy:.65, speed:.58 }
];

let room = null;
let bus = null;
let loop = null;
let botTimers = [];
let currentItems = [];
let sourceItems = [];
let currentTitle = '';
let currentCapacity = 0;
let activeSourceKey = '';
const selectionBySource = new Map();
let draftSelection = new Set();
let closingQuestion = false;
let lastCountdownNumber = null;
let lastTimerTickSecond = null;
let currentMusicMode = 'normal';
let blindTransitionPlayed = false;

function nowMs() { return bus?.now ? bus.now() : Date.now(); }

function updateBackendStatus() {
  const el = $('backendStatus');
  if (!el) return;
  const ok = isFirebaseConfigured();
  el.className = `backend-status ${ok ? 'ready' : 'warning'}`;
  el.innerHTML = ok
    ? '<strong>● Firebase 실시간 연결 준비 완료</strong><span>학생 스마트폰이 QR/PIN으로 같은 게임방에 접속할 수 있습니다.</span>'
    : '<strong>⚠ Firebase 설정 필요</strong><span>10명 데모와 혼자 테스트는 가능하지만, 실제 학생 스마트폰 입장은 Firebase 설정 후 사용할 수 있습니다.</span>';
}

function setGameFocus(active) {
  document.body.classList.toggle('game-active', Boolean(active));
}

function syncFullscreenButton() {
  const btn = $('fullscreenBtn');
  if (!btn) return;
  const active = Boolean(document.fullscreenElement);
  btn.textContent = active ? '⛶ 전체 화면 종료' : '⛶ 전체 화면';
  btn.title = active ? '전체 화면 종료 (ESC)' : '전체 화면으로 전환 (ESC로 종료)';
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      const target = $('hostView');
      if (target?.requestFullscreen) await target.requestFullscreen();
      else throw new Error('이 브라우저에서는 전체 화면 기능을 지원하지 않습니다.');
    } else {
      await document.exitFullscreen();
    }
  } catch (e) {
    toast(e?.message || '전체 화면을 시작하지 못했습니다.');
  } finally {
    syncFullscreenButton();
  }
}

function fillCatalog() {
  $('snuBook').innerHTML = CATALOG.snuBooks.map(b => `<option value="${b.id}">${b.title}</option>`).join('');
  $('collocationSet').innerHTML = [
    ...CATALOG.collocationSets.map(s => `<option value="${s.id}">${s.label}</option>`),
    '<option value="all">전체 1-500 랜덤</option>'
  ].join('');
  fillLessons();
}

function fillLessons() {
  const book = CATALOG.snuBooks.find(b => b.id === $('snuBook').value) || CATALOG.snuBooks[0];
  $('snuLesson').innerHTML = book.lessons.map(n => `<option value="${n}">${n}과</option>`).join('');
}

function applyPlatformLaunchParams() {
  const params = new URLSearchParams(location.search);
  const source = params.get('source');
  if (['preliminary','snu','topik1'].includes(source)) $('sourceType').value = source;
  const book = params.get('book');
  if (book && CATALOG.snuBooks.some(b => b.id === book)) {
    $('snuBook').value = book;
    fillLessons();
  }
  const lesson = Number(params.get('lesson'));
  if (lesson && [...$('snuLesson').options].some(o => Number(o.value) === lesson)) $('snuLesson').value = String(lesson);
  const collocation = params.get('collocation');
  if (collocation && [...$('collocationSet').options].some(o => o.value === collocation)) $('collocationSet').value = collocation;
  const context = $('platformSelectionText');
  if (context) {
    if ($('sourceType').value === 'snu') context.textContent = `어휘 배틀 · 서울대 ${$('snuBook').value} · ${$('snuLesson').value}과`;
    else if ($('sourceType').value === 'topik1') context.textContent = '어휘 배틀 · TOPIK 1 연어 표현';
    else context.textContent = '어휘 배틀 · 예비편 어휘 40';
  }
}

function syncPlatformContext() {
  const context = $('platformSelectionText');
  if (!context) return;
  if ($('sourceType').value === 'snu') context.textContent = `어휘 배틀 · 서울대 ${$('snuBook').value} · ${$('snuLesson').value}과`;
  else if ($('sourceType').value === 'topik1') context.textContent = '어휘 배틀 · TOPIK 1 연어 표현';
  else context.textContent = '어휘 배틀 · 예비편 어휘 40';
}

function sourceKeyFromConfig(config) {
  if (config.sourceType === 'preliminary') return 'preliminary';
  if (config.sourceType === 'topik1') return `topik1:${config.collocationSet}`;
  return `snu:${config.snuBook}:${config.snuLesson}`;
}

function getConfig() {
  return {
    gameType: 'word-battle',
    sourceType: $('sourceType').value,
    snuBook: $('snuBook').value,
    snuLesson: Number($('snuLesson').value),
    collocationSet: $('collocationSet').value,
    direction: $('direction').value,
    questionCount: Number($('questionCount').value),
    timeLimit: Number($('timeLimit').value),
    blindMode: $('blindMode').checked,
    audio: {
      bgmEnabled: $('bgmEnabled').checked,
      sfxEnabled: $('sfxEnabled').checked,
      volume: Number($('masterVolume').value) / 100
    }
  };
}


function setupAudioSettings() {
  audio.setSettings({
    bgmEnabled: $('bgmEnabled').checked,
    sfxEnabled: $('sfxEnabled').checked,
    volume: Number($('masterVolume').value) / 100
  });
  syncAudioControls();
}

function syncAudioControls() {
  const settings = audio.getSettings();
  const pct = Math.round(settings.volume * 100);
  $('volumeValue').textContent = `${pct}%`;
  $('gameVolume').value = String(pct);
  $('gameVolumeText').textContent = `${pct}%`;
  $('gameBgmBtn').textContent = settings.bgmEnabled ? '🎵 BGM ON' : '🎵 BGM OFF';
  $('gameSfxBtn').textContent = settings.sfxEnabled ? '🔔 효과음 ON' : '🔔 효과음 OFF';
  $('gameBgmBtn').classList.toggle('active', settings.bgmEnabled);
  $('gameSfxBtn').classList.toggle('active', settings.sfxEnabled);
}

function setMusicMode(mode) {
  currentMusicMode = mode;
  const labels = { lobby:'🎵 LOBBY', countdown:'⏱ 3·2·1', normal:'🎵 BATTLE', blind:'⚠️ TENSION', final:'🔥 FINAL' };
  $('musicModeBadge').textContent = labels[mode] || labels.normal;
  $('musicModeBadge').classList.toggle('tension', mode === 'blind');
  $('musicModeBadge').classList.toggle('final', mode === 'final');
}

function applyLiveAudioSettings({ bgmEnabled, sfxEnabled, volume } = {}) {
  const current = audio.getSettings();
  const next = {
    bgmEnabled: typeof bgmEnabled === 'boolean' ? bgmEnabled : current.bgmEnabled,
    sfxEnabled: typeof sfxEnabled === 'boolean' ? sfxEnabled : current.sfxEnabled,
    volume: Number.isFinite(volume) ? volume : current.volume
  };
  audio.setSettings(next);
  $('bgmEnabled').checked = next.bgmEnabled;
  $('sfxEnabled').checked = next.sfxEnabled;
  $('masterVolume').value = String(Math.round(next.volume * 100));
  syncAudioControls();
  if (room && room.status === 'lobby' && next.bgmEnabled) audio.startBgm('lobby');
  if (room && ['playing','result'].includes(room.status) && next.bgmEnabled) audio.startBgm(currentMusicMode);
}

function updateQuestionCountControl(items) {
  const capacity = getQuizCapacity(items, $('direction').value);
  currentCapacity = capacity;
  const input = $('questionCount');
  input.max = String(Math.max(1, capacity));
  const current = Number(input.value);
  if (!Number.isFinite(current) || current < 1) input.value = String(Math.min(10, capacity || 1));
  if (current > capacity && capacity > 0) input.value = String(capacity);
  $('questionMaxText').textContent = `최대 ${capacity}문제`;
  $('allQuestionsBtn').disabled = capacity < 1;
  return capacity;
}

function ensureSelectionForSource(key, items) {
  const validIds = new Set(items.map(v => v.id));
  if (!selectionBySource.has(key)) {
    selectionBySource.set(key, new Set(validIds));
  } else {
    const kept = new Set([...selectionBySource.get(key)].filter(id => validIds.has(id)));
    if (kept.size === 0 && items.length) items.forEach(v => kept.add(v.id));
    selectionBySource.set(key, kept);
  }
  return selectionBySource.get(key);
}

function selectedItemsFor(key, items) {
  const selected = ensureSelectionForSource(key, items);
  return items.filter(v => selected.has(v.id));
}

function syncSelectedBadge() {
  const selected = selectionBySource.get(activeSourceKey)?.size || 0;
  const total = sourceItems.length;
  $('selectedCountBadge').textContent = `${selected}/${total}`;
}

async function refreshSummary() {
  try {
    const config = getConfig();
    const data = await loadByConfig(config);
    const key = sourceKeyFromConfig(config);
    activeSourceKey = key;
    sourceItems = data.items;
    currentItems = selectedItemsFor(key, sourceItems);
    currentTitle = data.title;
    const capacity = updateQuestionCountControl(currentItems);
    const extra = $('direction').value === 'mn-ko' && capacity < currentItems.length
      ? ` · 1정답 원칙에 따라 역방향 출제 가능 ${capacity}개`
      : ` · 최대 ${capacity}문제 출제 가능`;
    const preNote = config.sourceType === 'preliminary' ? ' · 자모음 학습용 예비편' : '';
    $('dataSummary').textContent = `${data.title}${preNote} · 전체 ${sourceItems.length}개 중 ${currentItems.length}개 선택${extra}`;
    syncSelectedBadge();
  } catch (e) {
    $('dataSummary').textContent = e.message;
  }
}

function updateSourceFields() {
  const type = $('sourceType').value;
  const topik = type === 'topik1';
  const snu = type === 'snu';
  $('bookField').classList.toggle('hidden', !snu);
  $('lessonField').classList.toggle('hidden', !snu);
  $('collocationField').classList.toggle('hidden', !topik);
  refreshSummary();
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2400);
}

async function ensureData() {
  const config = getConfig();
  const data = await loadByConfig(config);
  const key = sourceKeyFromConfig(config);
  activeSourceKey = key;
  sourceItems = data.items;
  currentItems = selectedItemsFor(key, sourceItems);
  currentTitle = data.title;
  updateQuestionCountControl(currentItems);
  syncSelectedBadge();
  return { ...data, items: currentItems, allItems: sourceItems };
}

async function openPreview() {
  const config = getConfig();
  const data = await loadByConfig(config);
  activeSourceKey = sourceKeyFromConfig(config);
  sourceItems = data.items;
  const selected = ensureSelectionForSource(activeSourceKey, sourceItems);
  draftSelection = new Set(selected);
  currentTitle = data.title;
  $('previewTitle').textContent = `${data.title} · 어휘 선택`;
  $('previewCount').textContent = `총 ${data.items.length}개`;
  $('previewSearch').value = '';
  renderPreview(data.items);
  updateDraftSelectionCount();
  $('previewModal').classList.remove('hidden');
}

function previewFilteredItems() {
  const q = $('previewSearch').value.trim().toLowerCase();
  return !q ? sourceItems : sourceItems.filter(v => v.ko.toLowerCase().includes(q) || v.mn.toLowerCase().includes(q));
}

function renderPreview(items) {
  const numberMap = new Map(sourceItems.map((v,i)=>[v.id,i+1]));
  $('previewBody').innerHTML = items.map(v => `
    <tr class="${draftSelection.has(v.id)?'selected-row':''}">
      <td><input class="vocab-check" type="checkbox" data-id="${escapeHtml(v.id)}" ${draftSelection.has(v.id)?'checked':''}></td>
      <td>${numberMap.get(v.id) || ''}</td>
      <td><strong>${escapeHtml(v.ko)}</strong></td>
      <td>${escapeHtml(v.mn)}</td>
    </tr>`).join('');
}

function updateDraftSelectionCount() {
  $('selectionFooterCount').textContent = `${draftSelection.size}개 선택`;
}

function setVisibleSelection(checked) {
  previewFilteredItems().forEach(v => checked ? draftSelection.add(v.id) : draftSelection.delete(v.id));
  renderPreview(previewFilteredItems());
  updateDraftSelectionCount();
}

function applySelection() {
  if (draftSelection.size < 4) {
    toast('4지선다 게임을 위해 어휘를 최소 4개 선택해 주세요.');
    return;
  }
  const draftItems = sourceItems.filter(v => draftSelection.has(v.id));
  const capacity = getQuizCapacity(draftItems, $('direction').value);
  if (capacity < 4) {
    toast('현재 출제 방향에서는 중복 뜻 때문에 4지선다를 만들 수 없습니다. 어휘를 조금 더 선택해 주세요.');
    return;
  }
  selectionBySource.set(activeSourceKey, new Set(draftSelection));
  $('previewModal').classList.add('hidden');
  refreshSummary();
  toast(`${draftSelection.size}개 어휘를 게임 범위로 적용했습니다.`);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function validateQuestionCount() {
  const n = Number($('questionCount').value);
  if (!Number.isInteger(n) || n < 1) throw new Error('문제 수는 1개 이상으로 입력해 주세요.');
  if (n > currentCapacity) throw new Error(`현재 설정에서는 최대 ${currentCapacity}문제까지 출제할 수 있습니다.`);
}

async function startSolo() {
  try {
    const data = await ensureData();
    validateQuestionCount();
    const config = getConfig();
    const quiz = buildQuiz(data.items, config);
    localStorage.setItem('kwb_solo_payload', JSON.stringify({ config, quiz, title: data.title, at: Date.now() }));
    window.open('play.html?solo=1', '_blank');
  } catch (e) { toast(e.message); }
}

async function makePin() {
  if (isFirebaseConfigured()) return createUniqueFirebasePin();
  for (let i=0;i<30;i++) {
    const pin = String(Math.floor(100000 + Math.random()*900000));
    if (!localStorage.getItem(`kwb_room_${pin}`)) return pin;
  }
  return String(Math.floor(100000 + Math.random()*900000));
}

async function createRoom(demoMode = false) {
  try {
    setupAudioSettings();
    await audio.unlock();
    if (!demoMode && !isFirebaseConfigured()) {
      throw new Error('실제 학생이 입장하는 게임방은 Firebase 설정이 필요합니다. 먼저 Firebase 프로젝트를 연결해 주세요.');
    }
    const data = await ensureData();
    validateQuestionCount();
    const config = getConfig();
    const quiz = buildQuiz(data.items, config);
    const pin = await makePin();
    room = {
      pin,
      status:'lobby',
      config,
      title:data.title,
      players:{},
      quiz,
      questionIndex:-1,
      questionResults:{},
      demoMode:Boolean(demoMode),
      createdAt:Date.now()
    };
    bus?.close();

    if (isFirebaseConfigured()) {
      bus = new FirebaseBus(pin, 'host');
      bus.on(handleMessage);
      await bus.init();
      room.createdAt = nowMs();
      await bus.createRoom(room);
    } else {
      bus = new LocalBus(pin);
      bus.on(handleMessage);
      bus.saveRoom(room);
    }

    if (demoMode) addDemoStudents(10, false);
    else persistAndBroadcast();

    setGameFocus(false);
    $('setupView').classList.add('hidden');
    $('hostView').classList.remove('hidden');
    $('lobbyArea').classList.remove('hidden');
    $('gameArea').classList.add('hidden');
    $('finalArea').classList.add('hidden');
    $('roomPin').textContent = pin;
    const url = new URL('play.html', location.href);
    url.searchParams.set('pin',pin);
    if (bus.mode === 'local') url.searchParams.set('local','1');
    $('joinUrl').textContent = url.href;
    $('openPlayerBtn').onclick = () => window.open(url.href,'_blank');
    renderQr(url.href);
    renderLobby();
    startLoop();
    blindTransitionPlayed = false;
    lastCountdownNumber = null;
    lastTimerTickSecond = null;
    setMusicMode('lobby');
    audio.startBgm('lobby');
    if (demoMode) toast('가상 학생 10명이 입장했습니다. [게임 시작]을 눌러 시연하세요.');
  } catch (e) { toast(e.message); }
}

function renderQr(url) {
  const box=$('qrBox');
  box.innerHTML='';
  if (window.QRCode) new QRCode(box,{text:url,width:170,height:170,correctLevel:QRCode.CorrectLevel.M});
  else box.innerHTML='<span>QR 라이브러리를 불러오지 못했습니다.<br>PIN 또는 학생 화면 버튼을 사용하세요.</span>';
}

function addDemoStudents(limit = 10, announce = true) {
  if (!room || room.status !== 'lobby') return;
  let added = 0;
  DEMO_STUDENTS.slice(0, limit).forEach((student, index) => {
    const uid = `demo-${index+1}`;
    if (room.players[uid]) return;
    room.players[uid] = {
      uid,
      name:student.name,
      avatar:student.avatar,
      score:0,
      bot:true,
      accuracy:student.accuracy,
      speed:student.speed
    };
    added++;
  });
  if (added > 0) room.demoMode = true;
  persistAndBroadcast();
  renderLobby();
  if (announce && added) audio.playChime();
  if (announce) toast(added ? `데모 학생 ${added}명을 추가했습니다.` : '데모 학생 10명이 이미 들어와 있습니다.');
}

function handleMessage(msg) {
  if (!room) return;
  if (msg.type === 'join') {
    const {uid,name,avatar} = msg.payload;
    if (!uid || !name || room.status !== 'lobby') return;
    room.players[uid] = {
      uid,
      name:String(name).slice(0,20),
      avatar:AVATARS.includes(avatar)?avatar:'🐻',
      score:room.players[uid]?.score || 0,
      bot:false
    };
    persistAndBroadcast();
    renderLobby();
  }
  if (msg.type === 'answer') handleAnswer(msg.payload, msg.at);
  if (msg.type === 'request-state') broadcastState();
}

function handleAnswer({uid,qIndex,choice}, receivedAt = null) {
  if (!room || room.status !== 'playing' || qIndex !== room.questionIndex) return;
  if (!room.players[uid] || room.questionResults[uid]) return;
  const now=Number(receivedAt) || nowMs();
  if (now > room.questionEndAt + 250) return;
  const q=room.quiz.questions[room.questionIndex];
  const selected=Number(choice);
  const correct=selected===q.correctIndex;
  const elapsed=Math.max(0, now-room.questionStartAt);
  const points=calculateScore(room.config.timeLimit*1000, elapsed, correct);
  room.questionResults[uid]={selectedIndex:selected,correct,points,elapsed};
  room.players[uid].score += points;
  if (correct) dropGift(points);
  persistAndBroadcast();
  renderGame();
  const active=Object.keys(room.players).length;
  if (active>0 && Object.keys(room.questionResults).length>=active) endQuestion();
}

function startGame() {
  if (!room || !Object.keys(room.players).length) return;
  setupAudioSettings();
  audio.unlock();
  audio.stopBgm();
  lastCountdownNumber = null;
  lastTimerTickSecond = null;
  setMusicMode('countdown');
  room.status='countdown';
  room.countdownEndAt=nowMs()+3200;
  setGameFocus(true);
  $('lobbyArea').classList.add('hidden');
  $('gameArea').classList.remove('hidden');
  persistAndBroadcast();
  renderGame();
}

function clearBotTimers() {
  botTimers.forEach(t => clearTimeout(t));
  botTimers = [];
}

function scheduleBotAnswers() {
  clearBotTimers();
  if (!room || room.status !== 'playing') return;
  const q = room.quiz.questions[room.questionIndex];
  const duration = room.config.timeLimit * 1000;
  const untilStart = Math.max(0, room.questionStartAt - nowMs());
  Object.values(room.players).filter(p => p.bot).forEach((bot, index) => {
    const jitter = (Math.random() - .5) * .13;
    const fraction = Math.max(.08, Math.min(.82, Number(bot.speed || .35) + jitter));
    const answerAfter = untilStart + Math.max(320, Math.min(duration - 180, Math.floor(duration * fraction)));
    const timer = setTimeout(() => {
      if (!room || room.status !== 'playing' || room.questionResults[bot.uid]) return;
      const correct = Math.random() < Number(bot.accuracy || .75);
      let choice = q.correctIndex;
      if (!correct) {
        const wrong = q.options.map((_,i)=>i).filter(i=>i!==q.correctIndex);
        choice = wrong[Math.floor(Math.random()*wrong.length)];
      }
      handleAnswer({ uid:bot.uid, qIndex:room.questionIndex, choice }, nowMs());
    }, answerAfter + index * 18);
    botTimers.push(timer);
  });
}

function startQuestion(index) {
  if (!room || index>=room.quiz.questions.length) return finishGame();
  clearBotTimers();
  room.status='playing';
  room.questionIndex=index;
  room.questionResults={};
  room.questionStartAt=nowMs()+250;
  room.questionEndAt=room.questionStartAt+room.config.timeLimit*1000;
  closingQuestion=false;
  lastTimerTickSecond = null;

  const total = room.quiz.questions.length;
  const blindStart = Math.floor(total * .8);
  const inBlind = room.config.blindMode && index >= blindStart;
  const isFinal = index === total - 1;
  if (room.config.blindMode && inBlind && !blindTransitionPlayed) {
    blindTransitionPlayed = true;
    audio.playBlindTransition();
  }
  const musicMode = isFinal ? 'final' : inBlind ? 'blind' : 'normal';
  setMusicMode(musicMode);
  audio.startBgm(musicMode);
  audio.playQuestionStart();

  persistAndBroadcast();
  renderGame();
  scheduleBotAnswers();
}

function endQuestion() {
  if (!room || room.status!=='playing' || closingQuestion) return;
  clearBotTimers();
  closingQuestion=true;
  const results = Object.values(room.questionResults || {});
  const correctCount = results.filter(r => r.correct).length;
  const ratio = Object.keys(room.players).length ? correctCount / Object.keys(room.players).length : 0;
  audio.playReveal(ratio);
  room.status='result';
  room.resultEndAt=nowMs()+1900;
  persistAndBroadcast();
  renderGame();
}

function finishGame() {
  clearBotTimers();
  setMusicMode('final');
  audio.playFinish();
  room.status='finished';
  room.finishedAt=nowMs();
  persistAndBroadcast();
  $('gameArea').classList.add('hidden');
  $('finalArea').classList.remove('hidden');
  renderFinal();
}

function startLoop() {
  clearInterval(loop);
  loop=setInterval(()=>{
    if (!room) return;
    const now=nowMs();
    if (room.status==='countdown') {
      renderCountdown();
      if (now>=room.countdownEndAt) startQuestion(0);
    } else if (room.status==='playing') {
      renderTimer();
      if (now>=room.questionEndAt) endQuestion();
    } else if (room.status==='result') {
      renderTimer();
      if (now>=room.resultEndAt) {
        const next=room.questionIndex+1;
        if (next>=room.quiz.questions.length) finishGame();
        else startQuestion(next);
      }
    }
  },80);
}

function persistAndBroadcast() {
  if (!room||!bus) return;
  const pending = bus.saveRoom(room);
  if (pending?.catch) pending.catch((e) => console.error('room sync failed', e));
  if (bus.mode === 'local') broadcastState();
}

function broadcastState() {
  if (room&&bus?.mode === 'local') bus.send('state',{room:publicRoomState(room)});
}

function renderLobby() {
  if (!room) return;
  const players=Object.values(room.players);
  const demoCount=players.filter(p=>p.bot).length;
  $('playerCount').textContent=`${players.length}명`;
  $('startGameBtn').disabled=players.length===0;
  $('playerList').classList.toggle('empty-state',players.length===0);
  $('demoInfo').classList.toggle('hidden',demoCount===0);
  $('addDemoStudentsBtn').disabled=demoCount>=10;
  $('playerList').innerHTML=players.length
    ? players.map(p=>`<div class="player-chip ${p.bot?'demo-player':''}"><span class="avatar">${p.avatar}</span><strong>${escapeHtml(p.name)}</strong>${p.bot?'<span class="bot-tag">DEMO</span>':''}</div>`).join('')
    : '아직 입장한 학생이 없습니다.';
}

function renderCountdown() {
  if (!room||room.status!=='countdown') {
    $('countdownOverlay').classList.add('hidden');
    return;
  }
  const n=Math.max(1,Math.ceil((room.countdownEndAt-nowMs())/1000));
  if (n !== lastCountdownNumber) {
    lastCountdownNumber = n;
    audio.playCountdown(n);
  }
  $('countdownText').textContent=n;
  $('countdownOverlay').classList.remove('hidden');
}

function renderGame() {
  if (!room) return;
  renderCountdown();
  $('demoGameBadge').classList.toggle('hidden', !Object.values(room.players).some(p=>p.bot));
  if (room.questionIndex<0) return;
  const q=room.quiz.questions[room.questionIndex];
  $('questionCounter').textContent=`Q ${room.questionIndex+1}/${room.quiz.questions.length}`;
  $('directionBadge').textContent=directionLabel(q.direction);
  $('hostPrompt').textContent=q.prompt;
  $('hostOptions').innerHTML=q.options.map((v,i)=>`<div class="host-option ${room.status==='result'&&i===q.correctIndex?'correct-reveal':''}"><span class="option-number">${i+1}</span>${escapeHtml(v)}</div>`).join('');
  $('answeredCount').textContent=`${Object.keys(room.questionResults||{}).length}/${Object.keys(room.players).length} 제출`;
  $('hostResultLine').textContent=room.status==='result'?`정답: ${q.answer}`:'';
  const blind=room.config.blindMode && room.questionIndex>=Math.floor(room.quiz.questions.length*.8) && room.status!=='finished';
  $('blindCover').classList.toggle('hidden',!blind);
  $('blindBadge').classList.toggle('hidden',!blind);
  renderRanking();
  renderTimer();
}

function sortedPlayers() {
  return Object.values(room?.players||{}).sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name,'ko'));
}

function renderRanking() {
  const players=sortedPlayers();
  const top=players.slice(0,3);
  const order=top.length===3?[top[1],top[0],top[2]]:top;
  $('podium').innerHTML=order.map(p=>{
    const rank=players.indexOf(p)+1;
    return `<div class="podium-item rank${rank}"><div class="podium-avatar">${p.avatar}</div><div class="podium-name">${escapeHtml(p.name)}</div><div class="podium-step">${rank}위</div></div>`;
  }).join('');
  $('rankingList').innerHTML=players.map((p,i)=>`<div class="rank-row"><strong class="rank-number">${i+1}</strong><span class="rank-avatar">${p.avatar}</span><span class="rank-name">${escapeHtml(p.name)}${p.bot?' <em class="rank-demo">DEMO</em>':''}</span><strong class="rank-score">${p.score.toLocaleString()} pt</strong></div>`).join('');
}

function renderTimer() {
  if (!room||room.questionIndex<0) return;
  const duration=room.config.timeLimit*1000;
  let remain=room.status==='playing'?room.questionEndAt-nowMs():0;
  remain=Math.max(0,Math.min(duration,remain));
  $('hostTimerBar').style.width=`${(remain/duration)*100}%`;
  $('hostTimerText').textContent=(remain/1000).toFixed(1);
  if (room.status === 'playing') {
    const second = Math.ceil(remain / 1000);
    if (second > 0 && second <= 3 && second !== lastTimerTickSecond) {
      lastTimerTickSecond = second;
      audio.playTimerTick(second);
    }
  }
}

function renderFinal() {
  const players=sortedPlayers();
  const top=players.slice(0,3);
  const order=top.length===3?[top[1],top[0],top[2]]:top;
  $('finalPodium').innerHTML=order.map(p=>{
    const rank=players.indexOf(p)+1;
    return `<div class="podium-item rank${rank}"><div class="podium-avatar">${p.avatar}</div><div class="podium-name">${escapeHtml(p.name)}</div><div class="final-podium-score"><strong>${p.score.toLocaleString()} pt</strong></div><div class="podium-step">${rank}위</div></div>`;
  }).join('');
  $('finalRanking').innerHTML=players.map((p,i)=>`<div class="rank-row"><strong class="rank-number">${i+1}</strong><span class="rank-avatar">${p.avatar}</span><span class="rank-name">${escapeHtml(p.name)}${p.bot?' <em class="rank-demo">DEMO</em>':''}</span><strong class="rank-score">${p.score.toLocaleString()} pt</strong></div>`).join('');
}

function dropGift(points) {
  audio.playGift(points);

  // In fullscreen mode only descendants of the fullscreen element are visible.
  // Append the shower to that element so the gifts are never hidden behind it.
  const root = document.fullscreenElement || $('hostView') || document.body;
  const shower = document.createElement('div');
  shower.className = 'gift-shower';
  shower.setAttribute('aria-hidden', 'true');

  const score = Number(points) || 0;
  const count = score >= 850 ? 18 : score >= 700 ? 15 : 12;
  const icons = ['🎁','🎁','🎁','🎁','🎁','🎀','✨','⭐'];

  for (let i = 0; i < count; i++) {
    const gift = document.createElement('span');
    gift.className = 'gift';
    gift.textContent = icons[Math.floor(Math.random() * icons.length)];
    gift.style.setProperty('--gift-x', `${3 + Math.random() * 94}%`);
    gift.style.setProperty('--gift-size', `${30 + Math.random() * 30}px`);
    gift.style.setProperty('--gift-delay', `${Math.random() * 0.42}s`);
    gift.style.setProperty('--gift-duration', `${1.45 + Math.random() * 0.85}s`);
    gift.style.setProperty('--gift-drift', `${-150 + Math.random() * 300}px`);
    gift.style.setProperty('--gift-rotate', `${-420 + Math.random() * 840}deg`);
    shower.appendChild(gift);
  }

  root.appendChild(shower);
  setTimeout(() => shower.remove(), 3200);
}

function resetToSetup() {
  clearBotTimers();
  audio.stopAll();
  setGameFocus(false);
  if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});
  clearInterval(loop);
  loop=null;
  if (bus&&room) {
    if (bus.mode === 'local') bus.send('room-closed',{});
    const removing = bus.removeRoom();
    if (removing?.catch) removing.catch((e)=>console.error('room cleanup failed', e));
    bus.close();
  }
  bus=null;
  room=null;
  $('hostView').classList.add('hidden');
  $('setupView').classList.remove('hidden');
  refreshSummary();
}

function filterPreview() {
  renderPreview(previewFilteredItems());
}

fillCatalog();
applyPlatformLaunchParams();
setupAudioSettings();
updateBackendStatus();
updateSourceFields();
$('sourceType').addEventListener('change',()=>{updateSourceFields();syncPlatformContext();});
$('snuBook').addEventListener('change',()=>{fillLessons();refreshSummary();syncPlatformContext();});
$('snuLesson').addEventListener('change',()=>{refreshSummary();syncPlatformContext();});
$('collocationSet').addEventListener('change',refreshSummary);
$('direction').addEventListener('change',refreshSummary);
$('questionCount').addEventListener('change',()=>{
  const n=Math.max(1,Math.min(currentCapacity||1,Number($('questionCount').value)||1));
  $('questionCount').value=String(n);
});
$('allQuestionsBtn').addEventListener('click',()=>{if(currentCapacity>0)$('questionCount').value=String(currentCapacity);});
$('timeLimit').addEventListener('input',()=>{$('timeValue').textContent=`${$('timeLimit').value}초`;});
$('bgmEnabled').addEventListener('change',setupAudioSettings);
$('sfxEnabled').addEventListener('change',setupAudioSettings);
$('masterVolume').addEventListener('input',setupAudioSettings);
$('soundTestBtn').addEventListener('click',async()=>{
  setupAudioSettings();
  await audio.unlock();
  audio.preview();
});
$('gameBgmBtn').addEventListener('click',async()=>{
  await audio.unlock();
  applyLiveAudioSettings({ bgmEnabled: !audio.getSettings().bgmEnabled });
});
$('gameSfxBtn').addEventListener('click',async()=>{
  await audio.unlock();
  applyLiveAudioSettings({ sfxEnabled: !audio.getSettings().sfxEnabled });
});
$('gameVolume').addEventListener('input',()=>{
  applyLiveAudioSettings({ volume: Number($('gameVolume').value) / 100 });
});
$('fullscreenBtn').addEventListener('click',toggleFullscreen);
document.addEventListener('fullscreenchange',syncFullscreenButton);
syncFullscreenButton();
$('previewBtn').addEventListener('click',openPreview);
$('closePreviewBtn').addEventListener('click',()=> $('previewModal').classList.add('hidden'));
$('previewModal').addEventListener('click',(e)=>{if(e.target===$('previewModal'))$('previewModal').classList.add('hidden')});
$('previewSearch').addEventListener('input',filterPreview);
$('previewBody').addEventListener('change',(e)=>{
  const cb=e.target.closest('.vocab-check');
  if(!cb)return;
  cb.checked ? draftSelection.add(cb.dataset.id) : draftSelection.delete(cb.dataset.id);
  cb.closest('tr')?.classList.toggle('selected-row', cb.checked);
  updateDraftSelectionCount();
});
$('selectAllBtn').addEventListener('click',()=>setVisibleSelection(true));
$('clearAllBtn').addEventListener('click',()=>setVisibleSelection(false));
$('applySelectionBtn').addEventListener('click',applySelection);
$('soloBtn').addEventListener('click',startSolo);
$('demoBtn').addEventListener('click',()=>createRoom(true));
$('createRoomBtn').addEventListener('click',()=>createRoom(false));
$('addDemoStudentsBtn').addEventListener('click',()=>addDemoStudents(10,true));
$('startGameBtn').addEventListener('click',startGame);
$('backSetupBtn').addEventListener('click',resetToSetup);
$('endRoomBtn').addEventListener('click',resetToSetup);
$('newGameBtn').addEventListener('click',resetToSetup);
