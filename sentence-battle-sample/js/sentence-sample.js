(() => {
  'use strict';

  // 샘플 판정 원칙:
  // acceptedOrders에 '자연스럽고 학습 범위에 맞는' 정답 어순만 명시적으로 등록합니다.
  // 한국어에서 가능하다는 이유만으로 모든 순열을 자동 정답 처리하지 않습니다.
  const SAMPLE_QUESTIONS = [
    {
      id: 'S01',
      tokens: [
        ['jeo','저'], ['topic','는'], ['oneul','오늘'], ['hakgyo','학교'], ['loc','에'], ['ganda','갑니다']
      ],
      acceptedOrders: [
        ['jeo','topic','oneul','hakgyo','loc','ganda'],
        ['oneul','jeo','topic','hakgyo','loc','ganda']
      ],
      time: 18,
      note: '시간 부사어의 자연스러운 이동을 허용한 예 · 동사 종결형은 한 카드'
    },
    {
      id: 'S02',
      tokens: [
        ['maria','마리아 씨'], ['topic','는'], ['doctor','의사'], ['copula','입니다']
      ],
      acceptedOrders: [
        ['maria','topic','doctor','copula'],
        ['doctor','topic','maria','copula']
      ],
      time: 14,
      note: '주제 위치가 바뀌어도 자연스러운 명사 서술문이면 정답 인정'
    },
    {
      id: 'S03',
      tokens: [
        ['friend','친구'], ['subj','가'], ['library','도서관'], ['at','에서'], ['korean','한국어'], ['obj','를'], ['study','공부합니다']
      ],
      acceptedOrders: [
        ['friend','subj','library','at','korean','obj','study'],
        ['library','at','friend','subj','korean','obj','study']
      ],
      time: 20,
      note: '장소 부사어를 문두에 놓는 자연스러운 어순도 인정 · 동사 종결형은 한 카드'
    },
    {
      id: 'S04',
      tokens: [
        ['jeo','저'], ['topic','는'], ['usa','미국'], ['person','사람'], ['subj','이'], ['not','아닙니다']
      ],
      acceptedOrders: [
        ['jeo','topic','usa','person','subj','not']
      ],
      time: 17,
      note: '부정 명사문은 학습 문형을 명확하게 유지'
    },
    {
      id: 'S05',
      tokens: [
        ['bag','가방'], ['loc','에'], ['book','책'], ['and','하고'], ['pencil','연필'], ['subj','이'], ['exist','있어요']
      ],
      acceptedOrders: [
        ['bag','loc','book','and','pencil','subj','exist'],
        ['book','and','pencil','subj','bag','loc','exist']
      ],
      time: 19,
      note: '장소구가 앞/뒤로 이동할 수 있는 자연스러운 두 어순 인정'
    },
    {
      id: 'S06',
      tokens: [
        ['today','오늘'], ['jeo','저'], ['topic','는'], ['friend','친구'], ['obj','를'], ['meet','만나요']
      ],
      acceptedOrders: [
        ['today','jeo','topic','friend','obj','meet'],
        ['jeo','topic','today','friend','obj','meet']
      ],
      time: 17,
      note: '시간 표현을 문두 또는 주제 뒤에 둘 수 있음 · 동사 종결형은 한 카드'
    }
  ];

  const teacherQuestions = SAMPLE_QUESTIONS.map(q => ({
    ...q,
    tokens: q.tokens.map(t => [...t]),
    acceptedOrders: q.acceptedOrders.map(o => [...o]),
    enabled: true,
    edited: false
  }));

  const bots = [
    {name:'Бат', avatar:'🦊', score:0},
    {name:'Солонго', avatar:'🐰', score:0},
    {name:'Тэмүүжин', avatar:'🐯', score:0},
    {name:'Номин', avatar:'🐼', score:0}
  ];

  const BOUND_PARTICLE_IDS = new Set(['topic','subj','obj','loc','at','and','copula']);
  const SENTENCE_ENDING_IDS = new Set(['copula','not','exist','ganda','study','meet']);
  const BOUND_CARD_TEXTS = new Set(['은','는','이','가','을','를','에','에서','에게','한테','께','하고','와','과','도','만','부터','까지','으로','로','의','보다','처럼','입니다','입니까','이에요','예요']);

  const $ = (id) => document.getElementById(id);
  const els = {
    introView:$('introView'), gameView:$('gameView'), finalView:$('finalView'),
    startBtn:$('startBtn'), restartBtn:$('restartBtn'), soundBtn:$('soundBtn'),
    homeBtn:$('homeBtn'), finalHomeBtn:$('finalHomeBtn'), fullscreenBtn:$('fullscreenBtn'), fullscreenBtnText:$('fullscreenBtnText'),
    volumeSlider:$('volumeSlider'), volumeValue:$('volumeValue'),
    questionLabel:$('questionLabel'), scoreText:$('scoreText'), streakText:$('streakText'),
    timerBar:$('timerBar'), timerText:$('timerText'), cardPool:$('cardPool'), answerStage:$('answerStage'),
    undoBtn:$('undoBtn'), resetBtn:$('resetBtn'), submitBtn:$('submitBtn'), feedback:$('feedback'),
    rankList:$('rankList'), countdown:$('countdown'), variantHint:$('variantHint'), giftRain:$('giftRain'),
    finalScore:$('finalScore'), finalMessage:$('finalMessage'), timeInput:$('timeInput'),
    openQuestionManagerBtn:$('openQuestionManagerBtn'), selectedQuestionBadge:$('selectedQuestionBadge'),
    questionManager:$('questionManager'), closeQuestionManagerBtn:$('closeQuestionManagerBtn'),
    selectAllQuestionsBtn:$('selectAllQuestionsBtn'), clearAllQuestionsBtn:$('clearAllQuestionsBtn'),
    managerSelectedCount:$('managerSelectedCount'), managerTotalCount:$('managerTotalCount'),
    questionList:$('questionList'), applyQuestionManagerBtn:$('applyQuestionManagerBtn'),
    addQuestionBtn:$('addQuestionBtn'), newQuestionEditor:$('newQuestionEditor'),
    closeNewQuestionBtn:$('closeNewQuestionBtn'), cancelNewQuestionBtn:$('cancelNewQuestionBtn'),
    saveNewQuestionBtn:$('saveNewQuestionBtn'), autoCardsBtn:$('autoCardsBtn'),
    newSentenceInput:$('newSentenceInput'), newCardsInput:$('newCardsInput'),
    newAnswersInput:$('newAnswersInput'), newQuestionError:$('newQuestionError')
  };

  let state = null;
  let audioCtx = null;
  let muted = false;
  let masterVolume = 0.8;
  let timerHandle = null;
  const timeChips = [...document.querySelectorAll('.time-chip')];
  let editingQuestionIndex = null;

  function shuffle(arr){
    const a = [...arr];
    for(let i=a.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  }

  function newState(){
    return {
      index:0, score:0, streak:0, selected:[], available:[],
      startedAt:0, deadline:0, locked:true, answers:[],
      bots:bots.map(b=>({...b,score:0})), timeLimit:20, questions:[], roundBots:[]
    };
  }

  function initAudio(){
    if(muted) return;
    if(!audioCtx){
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(Ctx) audioCtx=new Ctx();
    }
    if(audioCtx?.state==='suspended') audioCtx.resume();
  }

  function tone(freq=440,duration=.08,type='sine',gain=.05,delay=0){
    if(muted) return;
    initAudio();
    if(!audioCtx) return;
    const now=audioCtx.currentTime+delay;
    const osc=audioCtx.createOscillator();
    const g=audioCtx.createGain();
    osc.type=type; osc.frequency.setValueAtTime(freq,now);
    g.gain.setValueAtTime(.0001,now);
    const adjustedGain=Math.max(.0001,gain*masterVolume);
    g.gain.exponentialRampToValueAtTime(adjustedGain,now+.012);
    g.gain.exponentialRampToValueAtTime(.0001,now+duration);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(now); osc.stop(now+duration+.03);
  }

  function sfx(kind){
    if(kind==='drop') tone(260+Math.random()*170,.055,'triangle',.025);
    if(kind==='click') tone(560,.045,'sine',.03);
    if(kind==='correct'){
      tone(520,.11,'triangle',.06,0); tone(660,.12,'triangle',.06,.08); tone(820,.17,'triangle',.07,.16);
    }
    if(kind==='wrong'){
      tone(190,.16,'sawtooth',.035,0); tone(145,.2,'sawtooth',.03,.08);
    }
    if(kind==='go'){
      tone(470,.09,'square',.035,0); tone(620,.12,'square',.04,.09);
    }
  }

  function setView(name){
    els.introView.classList.toggle('hidden',name!=='intro');
    els.gameView.classList.toggle('hidden',name!=='game');
    els.finalView.classList.toggle('hidden',name!=='final');
  }

  async function countdown(){
    els.countdown.classList.remove('hidden');
    for(const text of ['3','2','1','GO!']){
      els.countdown.innerHTML=`<span>${text}</span>`;
      if(text==='GO!') sfx('go'); else tone(310,.08,'square',.03);
      await wait(text==='GO!'?450:650);
    }
    els.countdown.classList.add('hidden');
  }

  function wait(ms){return new Promise(r=>setTimeout(r,ms));}
  function current(){return state.questions[state.index];}
  function currentTimeLimit(){return Math.max(5,Math.min(60,Number(state?.timeLimit)||20));}

  function renderHeader(){
    els.questionLabel.textContent=`Q ${state.index+1}/${state.questions.length}`;
    els.scoreText.textContent=state.score.toLocaleString();
    els.streakText.textContent=state.streak;
  }

  function tokenMap(question=current()){
    return new Map(question.tokens);
  }

  function endsWithHangulSyllable(text){
    if(!text) return false;
    const ch=[...text].pop();
    const code=ch?.charCodeAt(0);
    return code>=0xAC00 && code<=0xD7A3;
  }

  function addBatchimB(syllable){
    if(!syllable) return syllable;
    const code=syllable.charCodeAt(0);
    if(code<0xAC00 || code>0xD7A3) return syllable;
    const offset=code-0xAC00;
    const jong=offset%28;
    if(jong!==0) return syllable;
    return String.fromCharCode(code+17); // 종성 ㅂ
  }

  function combineFinalEnding(stem, endingText){
    if(!stem) return endingText;
    if(endingText==='요') return `${stem}요`;
    if(endingText==='ㅂ니다'){
      if(stem.endsWith('하')) return `${stem.slice(0,-1)}합니다`;
      if(endsWithHangulSyllable(stem)){
        const chars=[...stem];
        const last=chars.pop();
        return `${chars.join('')}${addBatchimB(last)}니다`;
      }
      return `${stem}${endingText}`;
    }
    return `${stem}${endingText}`;
  }

  function attachBoundWord(prevWord, boundText, boundId){
    if(boundId==='end') return combineFinalEnding(prevWord, boundText);
    return `${prevWord}${boundText}`;
  }

  function shouldBindToPrevious(id,text){
    return BOUND_PARTICLE_IDS.has(id) || id==='end' || BOUND_CARD_TEXTS.has(text);
  }

  function assembleWordsFromIds(ids, question=current()){
    const map=tokenMap(question);
    const words=[];
    ids.forEach((id)=>{
      const text=map.get(id) || '';
      if(!words.length || !shouldBindToPrevious(id,text)){
        words.push(text);
        return;
      }
      words[words.length-1]=attachBoundWord(words[words.length-1], text, id);
    });
    return words;
  }

  function selectedIds(){return state.selected.map(t=>t[0]);}

  function looksLikeSentenceEnding(id,text){
    if(SENTENCE_ENDING_IDS.has(id)) return true;
    return /(입니다|입니까|아닙니다|이에요|예요|어요|아요|해요|있어요|없어요|습니다|ㅂ니다|습니까|ㅂ니까|까요|나요|죠)$/.test(text||'');
  }

  function assembleSentenceFromIds(ids, punctuate=false, question=current()){
    const map=tokenMap(question);
    const words=assembleWordsFromIds(ids, question).filter(Boolean);
    let sentence=words.join(' ').replace(/\s+/g,' ').trim();
    if(punctuate && sentence && !/[.!?]$/.test(sentence)){
      const lastId=ids[ids.length-1];
      const lastText=map.get(lastId) || '';
      if(looksLikeSentenceEnding(lastId,lastText)){
        sentence += /(입니까|습니까|ㅂ니까|까요|나요)$/.test(lastText) ? '?' : '.';
      }
    }
    return sentence;
  }

  function makeCard(token, i, selected=false){
    const [id,text]=token;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='sentence-card';
    btn.dataset.id=id;
    btn.textContent=text;
    if(selected) btn.classList.add('selected');
    else{
      btn.classList.add('card-drop');
      const startX=(Math.random()*440-220).toFixed(0)+'px';
      const rot=(Math.random()*34-17).toFixed(0)+'deg';
      btn.style.setProperty('--start-x',startX);
      btn.style.setProperty('--rot',rot);
      btn.style.setProperty('--delay',`${i*72}ms`);
      setTimeout(()=>sfx('drop'),i*72+60);
    }
    return btn;
  }

  function renderCards(animatePool=false){
    els.cardPool.innerHTML='';
    state.available.forEach((tok,i)=>{
      const card=makeCard(tok,animatePool?i:0,false);
      if(!animatePool) card.classList.remove('card-drop');
      card.addEventListener('click',()=>chooseCard(tok[0]));
      els.cardPool.append(card);
    });

    els.answerStage.innerHTML='';
    if(!state.selected.length){
      els.answerStage.classList.add('empty');
      els.answerStage.classList.remove('active');
      els.answerStage.innerHTML='<span class="empty-copy">카드를 순서대로 눌러 주세요</span>';
    } else {
      els.answerStage.classList.remove('empty');
      els.answerStage.classList.add('active');

      const preview=document.createElement('div');
      preview.className='assembled-preview';
      preview.textContent=assembleSentenceFromIds(selectedIds(), true);
      els.answerStage.append(preview);

      const guide=document.createElement('div');
      guide.className='assembled-guide';
      guide.textContent='띄어쓰기와 활용이 자동 반영된 완성 문장입니다.';
      els.answerStage.append(guide);

      const row=document.createElement('div');
      row.className='answer-card-row';
      state.selected.forEach(tok=>{
        const card=makeCard(tok,0,true);
        card.addEventListener('click',()=>returnCard(tok[0]));
        row.append(card);
      });
      els.answerStage.append(row);
    }
    els.submitBtn.disabled=state.locked||state.available.length!==0;
    els.undoBtn.disabled=state.locked||state.selected.length===0;
    els.resetBtn.disabled=state.locked||state.selected.length===0;
  }

  function chooseCard(id){
    if(state.locked) return;
    const idx=state.available.findIndex(t=>t[0]===id);
    if(idx<0) return;
    sfx('click');
    const [tok]=state.available.splice(idx,1);
    state.selected.push(tok);
    renderCards(false);
  }

  function returnCard(id){
    if(state.locked) return;
    const idx=state.selected.findIndex(t=>t[0]===id);
    if(idx<0) return;
    sfx('click');
    const [tok]=state.selected.splice(idx,1);
    state.available.push(tok);
    renderCards(false);
  }

  function undo(){
    if(state.locked||!state.selected.length) return;
    const tok=state.selected.pop();
    state.available.push(tok);
    renderCards(false);
  }

  function resetCards(){
    if(state.locked) return;
    state.available=shuffle([...current().tokens]);
    state.selected=[];
    renderCards(true);
  }

  function sameOrder(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i]);}

  function isCorrect(){
    const ids=selectedIds();
    return current().acceptedOrders.some(order=>sameOrder(ids,order));
  }

  function remainingMs(){return Math.max(0,state.deadline-performance.now());}

  const PLACEMENT_POINTS=[1200,1050,950,875,800,750,700,650,625,600];

  function pointsForPlace(place){
    if(!Number.isInteger(place) || place<1) return 0;
    if(place<=PLACEMENT_POINTS.length) return PLACEMENT_POINTS[place-1];
    return Math.max(300,600-(place-PLACEMENT_POINTS.length)*20);
  }

  function placeLabel(place){
    if(place===1) return '🥇 1등';
    if(place===2) return '🥈 2등';
    if(place===3) return '🥉 3등';
    return `${place}등`;
  }

  function prepareRoundBots(){
    const total=currentTimeLimit()*1000;
    const accuracy=[.86,.79,.73,.67];
    const centers=[.30,.38,.47,.56];
    state.roundBots=state.bots.map((b,i)=>{
      const correct=Math.random()<accuracy[i];
      const jitter=(Math.random()-.5)*total*.22;
      const finishMs=Math.max(1400,Math.min(total*.94,total*centers[i]+jitter));
      return {botIndex:i,correct,finishMs};
    });
  }

  function settleRound(playerCorrect,playerElapsedMs){
    const finishers=[];
    state.roundBots.forEach(r=>{
      if(r.correct) finishers.push({kind:'bot',botIndex:r.botIndex,finishMs:r.finishMs});
    });
    if(playerCorrect) finishers.push({kind:'me',finishMs:playerElapsedMs});
    finishers.sort((a,b)=>a.finishMs-b.finishMs || (a.kind==='me'?-1:1));

    let myPlace=null;
    let myPoints=0;
    finishers.forEach((f,index)=>{
      const place=index+1;
      const points=pointsForPlace(place);
      if(f.kind==='me'){
        myPlace=place;
        myPoints=points;
      } else {
        state.bots[f.botIndex].score+=points;
      }
    });
    return {myPlace,myPoints,finishers};
  }

  function prettyOrder(order, question=current()){
    return assembleSentenceFromIds(order, true, question);
  }

  async function submit(autoTimeout=false){
    if(state.locked) return;
    if(!autoTimeout&&state.available.length) return;
    state.locked=true;
    clearTimer();
    const elapsedMs=Math.min(currentTimeLimit()*1000,Math.max(0,performance.now()-state.startedAt));
    const correct=!autoTimeout&&isCorrect();
    const round=settleRound(correct,elapsedMs);
    let gained=0;

    if(correct){
      state.streak+=1;
      gained=round.myPoints;
      state.score+=gained;
      setFeedback(`정답! ${placeLabel(round.myPlace)} · +${gained}점 · ${(elapsedMs/1000).toFixed(1)}초`,'good');
      sfx('correct'); giftRain();
    } else {
      state.streak=0;
      const answer=current().acceptedOrders.map(prettyOrder).join('  /  ');
      setFeedback(autoTimeout?`시간 종료! 0점 · 가능한 정답: ${answer}`:`오답! 0점 · 가능한 정답: ${answer}`,'bad');
      sfx('wrong');
    }

    state.answers.push({id:current().id,correct,gained,place:round.myPlace,elapsedMs,order:selectedIds()});
    renderHeader(); renderRank(true); renderCards(false);
    await wait(correct?1700:2200);
    nextQuestion();
  }

  function setFeedback(text,kind='info'){
    els.feedback.className=`feedback ${kind} pop`;
    els.feedback.textContent=text;
    setTimeout(()=>els.feedback.classList.remove('pop'),400);
  }

  function rankData(){
    return [
      {name:'나',avatar:'⚡',score:state.score,me:true},
      ...state.bots.map(b=>({...b,me:false}))
    ].sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
  }

  function renderRank(animate=false){
    els.rankList.innerHTML='';
    rankData().forEach((p,i)=>{
      const row=document.createElement('div');
      row.className='rank-row'+(p.me?' me':'')+(animate?' jump':'');
      row.innerHTML=`<span class="rank-pos">${i+1}</span><span class="rank-avatar">${p.avatar}</span><span class="rank-name">${p.name}</span><span class="rank-score">${p.score.toLocaleString()}</span>`;
      els.rankList.append(row);
    });
  }

  function giftRain(){
    const icons=['🎁','⭐','💎','🎉','🏆','⚡'];
    for(let i=0;i<28;i++){
      const el=document.createElement('span');
      el.className='gift'; el.textContent=icons[Math.floor(Math.random()*icons.length)];
      el.style.left=`${Math.random()*100}%`;
      el.style.setProperty('--dur',`${1.35+Math.random()*1.25}s`);
      el.style.setProperty('--spin',`${Math.random()*720-360}deg`);
      el.style.animationDelay=`${Math.random()*.28}s`;
      els.giftRain.append(el);
      setTimeout(()=>el.remove(),3100);
    }
  }

  function clearTimer(){
    if(timerHandle){cancelAnimationFrame(timerHandle);timerHandle=null;}
  }

  function runTimer(){
    clearTimer();
    const total=currentTimeLimit()*1000;
    const frame=()=>{
      if(state.locked) return;
      const left=remainingMs();
      const ratio=left/total;
      els.timerBar.style.width=`${Math.max(0,ratio*100)}%`;
      els.timerText.textContent=(left/1000).toFixed(1);
      if(left<=0){ submit(true); return; }
      timerHandle=requestAnimationFrame(frame);
    };
    timerHandle=requestAnimationFrame(frame);
  }

  async function loadQuestion(){
    state.locked=true;
    renderHeader();
    els.feedback.className='feedback'; els.feedback.textContent='';
    els.timerBar.style.width='100%'; els.timerText.textContent=currentTimeLimit().toFixed(1);
    els.variantHint.textContent=current().acceptedOrders.length>1
      ? `↔ 자연스러운 ${current().acceptedOrders.length}가지 어순을 정답으로 인정하고, 선택 즉시 완성 문장으로 보여 줍니다.`
      : '✓ 이 문제는 기본 문형의 한 어순을 정답으로 사용하며, 띄어쓰기와 활용을 자동 표시합니다.';
    state.selected=[];
    state.available=shuffle([...current().tokens]);
    renderCards(true);
    await wait(Math.min(900,260+current().tokens.length*72));
    state.locked=false;
    state.startedAt=performance.now();
    state.deadline=state.startedAt+currentTimeLimit()*1000;
    prepareRoundBots();
    renderCards(false);
    runTimer();
  }

  function nextQuestion(){
    clearTimer();
    state.index+=1;
    if(state.index>=state.questions.length){finish();return;}
    loadQuestion();
  }

  function finish(){
    clearTimer();
    setView('final');
    els.finalScore.textContent=state.score.toLocaleString();
    const correct=state.answers.filter(a=>a.correct).length;
    const rank=rankData().findIndex(p=>p.me)+1;
    els.finalMessage.innerHTML=`<b>${state.questions.length}문제 중 ${correct}문제 정답</b><br>가상 실시간 순위 ${rank}위 · 같은 문장을 동시에 풀고 정답 제출 순위로 차등 점수를 계산했습니다.`;
    giftRain();
  }

  async function start(){
    const selectedQuestions=teacherQuestions.filter(q=>q.enabled);
    if(!selectedQuestions.length){
      openQuestionManager();
      return;
    }
    initAudio();
    const selectedTime=Math.max(5,Math.min(60,Number(els.timeInput?.value)||20));
    if(els.timeInput) els.timeInput.value=String(selectedTime);
    state=newState();
    state.timeLimit=selectedTime;
    state.questions=selectedQuestions.map(q=>({
      ...q,
      tokens:q.tokens.map(t=>[...t]),
      acceptedOrders:q.acceptedOrders.map(o=>[...o])
    }));
    setView('game');
    renderHeader(); renderRank(false);
    await countdown();
    await loadQuestion();
  }

  function escapeHtml(value){
    return String(value??'').replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }

  function normalizeForCardMatch(text){
    return String(text||'')
      .replace(/[\s\u00a0]+/g,'')
      .replace(/[.!?。！？]+$/g,'')
      .trim();
  }

  function orderFromSentence(cardLabels, sentence){
    const target=normalizeForCardMatch(sentence);
    const normalized=cardLabels.map(normalizeForCardMatch);
    const used=new Array(cardLabels.length).fill(false);
    const path=[];

    function dfs(pos){
      if(path.length===cardLabels.length) return pos===target.length ? [...path] : null;
      for(let i=0;i<normalized.length;i++){
        if(used[i]) continue;
        const piece=normalized[i];
        if(!piece || !target.startsWith(piece,pos)) continue;
        used[i]=true; path.push(i);
        const result=dfs(pos+piece.length);
        if(result) return result;
        path.pop(); used[i]=false;
      }
      return null;
    }
    return dfs(0);
  }

  function questionSentence(question,orderIndex=0){
    const order=question.acceptedOrders[orderIndex] || question.acceptedOrders[0] || [];
    return assembleSentenceFromIds(order,true,question);
  }

  function updateQuestionSelectionUI(){
    const selected=teacherQuestions.filter(q=>q.enabled).length;
    const total=teacherQuestions.length;
    if(els.selectedQuestionBadge) els.selectedQuestionBadge.textContent=`${selected}/${total}`;
    if(els.managerSelectedCount) els.managerSelectedCount.textContent=String(selected);
    if(els.managerTotalCount) els.managerTotalCount.textContent=String(total);
    if(els.startBtn){
      els.startBtn.disabled=selected===0;
      els.startBtn.textContent=selected ? `⚡ 선택한 ${selected}문제 배틀 시작` : '⚠ 출제 문장을 선택하세요';
    }
  }

  function renderQuestionManager(){
    if(!els.questionList) return;
    els.questionList.innerHTML='';
    teacherQuestions.forEach((q,index)=>{
      const item=document.createElement('article');
      item.className='question-item'+(q.enabled?'':' excluded');
      item.dataset.index=String(index);
      const canonical=questionSentence(q,0);
      const cards=q.tokens.map(t=>t[1]).join(' · ');
      const acceptedPreview=q.acceptedOrders.map((order,i)=>`${i+1}) ${assembleSentenceFromIds(order,true,q)}`).join(' / ');
      const editedMark=q.edited?'<span>수정됨</span>':'';
      const customMark=q.custom?'<span>직접 추가</span>':'';
      item.innerHTML=`
        <div class="question-item-main">
          <label class="question-check" title="출제 여부">
            <input type="checkbox" class="question-enable" data-index="${index}" ${q.enabled?'checked':''} aria-label="${index+1}번 문항 출제" />
          </label>
          <div>
            <div class="question-no">Q ${index+1} · ${escapeHtml(q.id)}</div>
            <div class="question-preview">${escapeHtml(canonical)}</div>
            <div class="question-meta">
              <span>카드 ${q.tokens.length}개</span>
              <span>허용 어순 ${q.acceptedOrders.length}개</span>
              ${editedMark}${customMark}
              <span>${escapeHtml(cards)}</span>
            </div>
            <div class="accepted-preview"><b>정답 인정:</b> ${escapeHtml(acceptedPreview)}</div>
          </div>
          <div class="question-action-buttons">
            <button type="button" class="question-edit-btn" data-action="edit" data-index="${index}">${editingQuestionIndex===index?'수정 닫기':'✎ 문장 수정'}</button>
            ${q.custom?`<button type="button" class="question-delete-btn" data-action="delete" data-index="${index}">삭제</button>`:''}
          </div>
        </div>`;

      if(editingQuestionIndex===index){
        const editor=document.createElement('div');
        editor.className='question-editor';
        const alternateLines=q.acceptedOrders.slice(1).map(order=>assembleSentenceFromIds(order,true,q)).join('\n');
        editor.innerHTML=`
          <div class="editor-field">
            <label for="editSentence-${index}">대표 문장</label>
            <input id="editSentence-${index}" class="edit-sentence" data-index="${index}" value="${escapeHtml(canonical)}" />
            <small>이 문장이 문항 목록에 대표 문장으로 표시됩니다.</small>
          </div>
          <div class="editor-field">
            <div class="editor-label-row"><label for="editCards-${index}">카드 구성</label><button type="button" class="mini-action-btn" data-action="auto-cards-edit" data-index="${index}">대표 문장에서 카드 자동 만들기</button></div>
            <input id="editCards-${index}" class="edit-cards" data-index="${index}" value="${escapeHtml(q.tokens.map(t=>t[1]).join(' | '))}" />
            <small>카드는 | 로 구분합니다. 조사만 분리하고, 동사·형용사의 종결형은 하나의 카드로 입력하세요.</small>
          </div>
          <div class="editor-field">
            <label for="editAnswers-${index}">추가로 인정할 문장</label>
            <textarea id="editAnswers-${index}" class="edit-answers" data-index="${index}" rows="${Math.max(3,q.acceptedOrders.length)}">${escapeHtml(alternateLines)}</textarea>
            <small>대표 문장 외에 자연스러운 다른 어순이 있으면 한 줄에 하나씩 입력하세요.</small>
          </div>
          <div class="editor-preview-box"><b>수정 방식</b><span>대표 문장 + 카드 구성 + 추가 정답을 저장하면 즉시 문항에 반영됩니다.</span></div>
          <div id="editError-${index}" class="edit-error"></div>
          <div class="editor-actions">
            <button type="button" class="btn btn-secondary" data-action="cancel-edit" data-index="${index}">취소</button>
            <button type="button" class="btn btn-submit" data-action="save-edit" data-index="${index}">✓ 수정 저장</button>
          </div>`;
        item.append(editor);
      }
      els.questionList.append(item);
    });
    updateQuestionSelectionUI();
  }

  function openQuestionManager(){
    renderQuestionManager();
    els.questionManager?.classList.remove('hidden');
    els.questionManager?.setAttribute('aria-hidden','false');
    document.body.classList.add('manager-open');
  }

  function closeQuestionManager(){
    editingQuestionIndex=null;
    closeNewQuestionEditor();
    els.questionManager?.classList.add('hidden');
    els.questionManager?.setAttribute('aria-hidden','true');
    document.body.classList.remove('manager-open');
    updateQuestionSelectionUI();
  }

  function parseCardLabels(value){
    return String(value||'').split('|').map(s=>s.trim()).filter(Boolean);
  }

  function uniqueAnswerLines(primary,extraText){
    const lines=[primary,...String(extraText||'').split(/\r?\n/)]
      .map(s=>s.trim()).filter(Boolean);
    const seen=new Set();
    return lines.filter(line=>{
      const key=normalizeForCardMatch(line);
      if(!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function buildQuestionParts(qId,cardLabels,answerLines){
    if(cardLabels.length<2) return {error:'카드는 2개 이상 입력해야 합니다.'};
    if(!answerLines.length) return {error:'대표 문장을 입력해야 합니다.'};
    const tokens=cardLabels.map((label,i)=>[`${qId}_card_${i}`,label]);
    const orders=[];
    for(const line of answerLines){
      const indexes=orderFromSentence(cardLabels,line);
      if(!indexes) return {error:`“${line}” 문장은 입력한 카드를 모두 한 번씩 사용해 만들 수 없습니다.`};
      orders.push(indexes.map(i=>tokens[i][0]));
    }
    return {tokens,orders};
  }

  function saveQuestionEdit(index){
    const q=teacherQuestions[index];
    const sentenceInput=document.getElementById(`editSentence-${index}`);
    const cardsInput=document.getElementById(`editCards-${index}`);
    const answersInput=document.getElementById(`editAnswers-${index}`);
    const errorEl=document.getElementById(`editError-${index}`);
    if(!q || !sentenceInput || !cardsInput || !answersInput) return;

    const primary=sentenceInput.value.trim();
    const cardLabels=parseCardLabels(cardsInput.value);
    const answerLines=uniqueAnswerLines(primary,answersInput.value);
    const result=buildQuestionParts(q.id,cardLabels,answerLines);
    if(result.error){ if(errorEl) errorEl.textContent=result.error; return; }

    q.tokens=result.tokens;
    q.acceptedOrders=result.orders;
    q.edited=true;
    editingQuestionIndex=null;
    renderQuestionManager();
  }

  const AUTO_PARTICLES=['에서','에게','한테','께','부터','까지','으로','보다','처럼','하고','은','는','이','가','을','를','에','도','만','와','과','로','의'];
  const AUTO_COPULAS=['입니다','입니까','이에요','예요'];

  function suggestCardsFromSentence(sentence){
    const clean=String(sentence||'').trim().replace(/[.!?。！？]+$/g,'');
    if(!clean) return [];
    const chunks=clean.split(/\s+/).filter(Boolean);
    const cards=[];
    chunks.forEach(chunk=>{
      let matched=false;
      for(const suffix of AUTO_COPULAS){
        if(chunk.length>suffix.length && chunk.endsWith(suffix)){
          const base=chunk.slice(0,-suffix.length);
          if(base) cards.push(base);
          cards.push(suffix);
          matched=true;
          break;
        }
      }
      if(matched) return;
      for(const suffix of AUTO_PARTICLES){
        if(chunk.length>suffix.length && chunk.endsWith(suffix)){
          const base=chunk.slice(0,-suffix.length);
          if(base==='씨' && cards.length && !BOUND_CARD_TEXTS.has(cards[cards.length-1])){
            cards[cards.length-1]=`${cards[cards.length-1]} 씨`;
          } else if(base){
            cards.push(base);
          }
          cards.push(suffix);
          matched=true;
          break;
        }
      }
      if(!matched) cards.push(chunk);
    });
    return cards;
  }

  function openNewQuestionEditor(){
    editingQuestionIndex=null;
    renderQuestionManager();
    els.newQuestionEditor?.classList.remove('hidden');
    if(els.newQuestionError) els.newQuestionError.textContent='';
    els.newSentenceInput?.focus();
  }

  function closeNewQuestionEditor(){
    els.newQuestionEditor?.classList.add('hidden');
    if(els.newQuestionError) els.newQuestionError.textContent='';
  }

  function nextCustomId(){
    let n=teacherQuestions.filter(q=>q.custom).length+1;
    let id='';
    do{ id=`CUSTOM-${String(n++).padStart(3,'0')}`; }
    while(teacherQuestions.some(q=>q.id===id));
    return id;
  }

  function saveNewQuestion(){
    const primary=els.newSentenceInput?.value.trim()||'';
    const cardLabels=parseCardLabels(els.newCardsInput?.value||'');
    const answerLines=uniqueAnswerLines(primary,els.newAnswersInput?.value||'');
    const id=nextCustomId();
    const result=buildQuestionParts(id,cardLabels,answerLines);
    if(result.error){ if(els.newQuestionError) els.newQuestionError.textContent=result.error; return; }

    teacherQuestions.push({
      id,
      tokens:result.tokens,
      acceptedOrders:result.orders,
      time:20,
      note:'교사가 직접 추가한 문장',
      enabled:true,
      edited:true,
      custom:true
    });
    if(els.newSentenceInput) els.newSentenceInput.value='';
    if(els.newCardsInput) els.newCardsInput.value='';
    if(els.newAnswersInput) els.newAnswersInput.value='';
    closeNewQuestionEditor();
    renderQuestionManager();
    const last=els.questionList?.lastElementChild;
    last?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  els.openQuestionManagerBtn?.addEventListener('click',openQuestionManager);
  els.closeQuestionManagerBtn?.addEventListener('click',closeQuestionManager);
  els.applyQuestionManagerBtn?.addEventListener('click',closeQuestionManager);
  els.questionManager?.addEventListener('click',(e)=>{
    if(e.target===els.questionManager) closeQuestionManager();
  });
  els.addQuestionBtn?.addEventListener('click',openNewQuestionEditor);
  els.closeNewQuestionBtn?.addEventListener('click',closeNewQuestionEditor);
  els.cancelNewQuestionBtn?.addEventListener('click',closeNewQuestionEditor);
  els.autoCardsBtn?.addEventListener('click',()=>{
    const cards=suggestCardsFromSentence(els.newSentenceInput?.value||'');
    if(els.newCardsInput) els.newCardsInput.value=cards.join(' | ');
    if(!cards.length && els.newQuestionError) els.newQuestionError.textContent='먼저 대표 문장을 입력하세요.';
    else if(els.newQuestionError) els.newQuestionError.textContent='';
  });
  els.saveNewQuestionBtn?.addEventListener('click',saveNewQuestion);
  els.selectAllQuestionsBtn?.addEventListener('click',()=>{
    teacherQuestions.forEach(q=>q.enabled=true);
    renderQuestionManager();
  });
  els.clearAllQuestionsBtn?.addEventListener('click',()=>{
    teacherQuestions.forEach(q=>q.enabled=false);
    renderQuestionManager();
  });
  els.questionList?.addEventListener('change',(e)=>{
    const input=e.target.closest('.question-enable');
    if(!input) return;
    const index=Number(input.dataset.index);
    if(!Number.isInteger(index) || !teacherQuestions[index]) return;
    teacherQuestions[index].enabled=input.checked;
    input.closest('.question-item')?.classList.toggle('excluded',!input.checked);
    updateQuestionSelectionUI();
  });
  els.questionList?.addEventListener('click',(e)=>{
    const btn=e.target.closest('[data-action]');
    if(!btn) return;
    const index=Number(btn.dataset.index);
    if(btn.dataset.action==='edit'){
      closeNewQuestionEditor();
      editingQuestionIndex=editingQuestionIndex===index?null:index;
      renderQuestionManager();
    } else if(btn.dataset.action==='cancel-edit'){
      editingQuestionIndex=null;
      renderQuestionManager();
    } else if(btn.dataset.action==='save-edit'){
      saveQuestionEdit(index);
    } else if(btn.dataset.action==='auto-cards-edit'){
      const sentenceInput=document.getElementById(`editSentence-${index}`);
      const cardsInput=document.getElementById(`editCards-${index}`);
      const errorEl=document.getElementById(`editError-${index}`);
      const cards=suggestCardsFromSentence(sentenceInput?.value||'');
      if(cardsInput) cardsInput.value=cards.join(' | ');
      if(errorEl) errorEl.textContent=cards.length?'':'먼저 대표 문장을 입력하세요.';
    } else if(btn.dataset.action==='delete'){
      if(!teacherQuestions[index]?.custom) return;
      teacherQuestions.splice(index,1);
      editingQuestionIndex=null;
      renderQuestionManager();
    }
  });
  document.addEventListener('keydown',(e)=>{
    if(e.key==='Escape' && els.questionManager && !els.questionManager.classList.contains('hidden')) closeQuestionManager();
  });

  els.startBtn.addEventListener('click',start);
  els.restartBtn.addEventListener('click',start);
  els.undoBtn.addEventListener('click',undo);
  els.resetBtn.addEventListener('click',resetCards);
  els.submitBtn.addEventListener('click',()=>submit(false));
  els.soundBtn.addEventListener('click',()=>{
    muted=!muted;
    updateVolumeUI();
    if(!muted){initAudio();sfx('click');}
  });
  els.volumeSlider?.addEventListener('input',()=>{
    masterVolume=Math.max(0,Math.min(1,Number(els.volumeSlider.value)/100));
    if(masterVolume>0) muted=false;
    updateVolumeUI();
  });
  els.volumeSlider?.addEventListener('change',()=>{
    if(masterVolume>0){initAudio();sfx('click');}
  });
  els.homeBtn?.addEventListener('click',()=>goHome(false));
  els.finalHomeBtn?.addEventListener('click',()=>goHome(true));
  els.fullscreenBtn?.addEventListener('click',toggleFullscreen);
  document.addEventListener('fullscreenchange',syncFullscreenUI);

  function updateVolumeUI(){
    const pct=Math.round(masterVolume*100);
    if(els.volumeSlider && Number(els.volumeSlider.value)!==pct) els.volumeSlider.value=String(pct);
    if(els.volumeValue) els.volumeValue.textContent=`${pct}%`;
    if(els.soundBtn) els.soundBtn.textContent=(muted||pct===0)?'🔇':(pct<50?'🔉':'🔊');
  }

  function goHome(force=false){
    const inBattle=els.gameView && !els.gameView.classList.contains('hidden');
    if(inBattle && !force){
      const ok=window.confirm('진행 중인 문장 배틀을 중단하고 홈으로 돌아가시겠습니까?');
      if(!ok) return;
    }
    clearTimer();
    if(state) state.locked=true;
    setView('intro');
    updateQuestionSelectionUI();
  }

  async function toggleFullscreen(){
    try{
      if(!document.fullscreenElement){
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    }catch(err){
      console.warn('Fullscreen unavailable',err);
    }
  }

  function syncFullscreenUI(){
    const active=Boolean(document.fullscreenElement);
    els.fullscreenBtn?.classList.toggle('active',active);
    if(els.fullscreenBtnText) els.fullscreenBtnText.textContent=active?'전체화면 종료':'전체화면';
    if(els.fullscreenBtn) els.fullscreenBtn.setAttribute('aria-label',active?'전체화면 종료':'전체화면');
  }

  function syncTimeChips(){
    const value=Number(els.timeInput?.value)||20;
    timeChips.forEach(chip=>chip.classList.toggle('active',Number(chip.dataset.time)===value));
  }
  timeChips.forEach(chip=>chip.addEventListener('click',()=>{
    if(els.timeInput) els.timeInput.value=chip.dataset.time;
    syncTimeChips();
    sfx('click');
  }));
  els.timeInput?.addEventListener('input',syncTimeChips);
  els.timeInput?.addEventListener('change',()=>{
    const value=Math.max(5,Math.min(60,Number(els.timeInput.value)||20));
    els.timeInput.value=String(value);
    syncTimeChips();
  });
  syncTimeChips();
  updateVolumeUI();
  syncFullscreenUI();
  renderQuestionManager();
  updateQuestionSelectionUI();

  setView('intro');
})();
