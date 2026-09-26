import { booksForSource, textbookName } from './catalog.js';

const $=id=>document.getElementById(id);
const els={gameGrid:$('gameGrid'),source:$('platformSource'),book:$('platformBook'),lesson:$('platformLesson'),bookField:$('platformBookField'),lessonField:$('platformLessonField'),guide:$('selectionGuide'),summary:$('selectionSummary'),launchTitle:$('launchTitle'),launchBtn:$('launchBtn')};
let selectedGame='word';

const SENTENCE_LESSON_OVERRIDES={
  '4B':[10,11,12,13,14,15,16]
};

const VOCAB_SOURCES=[
  {id:'preliminary',label:'예비편 어휘 40 · 자모음 학습'},
  {id:'snu',label:'서울대 한국어'},
  {id:'sejong',label:'세종한국어(개정판)'},
  {id:'topik1',label:'TOPIK 1 연어 표현'}
];
const SOURCES={
  word:VOCAB_SOURCES,
  sentence:[{id:'snu',label:'서울대 한국어'},{id:'sejong',label:'세종한국어(개정판)'}],
  combined:[{id:'snu',label:'서울대 한국어'},{id:'sejong',label:'세종한국어(개정판)'}],
  matching:VOCAB_SOURCES,
  memory:VOCAB_SOURCES,
  search:VOCAB_SOURCES
};

function fillSources(){
  const list=SOURCES[selectedGame]||SOURCES.word;
  const keep=els.source.value;
  els.source.innerHTML=list.map(s=>`<option value="${s.id}">${s.label}</option>`).join('');
  if(list.some(s=>s.id===keep))els.source.value=keep;
}
function fillBooks(){
  const books=booksForSource(els.source.value||'snu');
  const keep=els.book.value;
  els.book.innerHTML=books.map(b=>`<option value="${b.id}">${b.title}</option>`).join('');
  if(books.some(b=>b.id===keep))els.book.value=keep;
  fillLessons();
}
function fillLessons(){
  const source=els.source.value||'snu';
  const books=booksForSource(source);
  const book=books.find(b=>b.id===els.book.value)||books[0];
  const sentenceBased=(selectedGame==='sentence'||selectedGame==='combined');
  const lessons=(source==='snu'&&sentenceBased&&SENTENCE_LESSON_OVERRIDES[book.id])?SENTENCE_LESSON_OVERRIDES[book.id]:book.lessons;
  const keep=Number(els.lesson.value);
  els.lesson.innerHTML=lessons.map(n=>`<option value="${n}">${n}과</option>`).join('');
  if(lessons.includes(keep))els.lesson.value=String(keep);
}
function gameName(){
  return selectedGame==='sentence'?'문장 배틀':selectedGame==='matching'?'카드 매칭':selectedGame==='memory'?'기억력 배틀':selectedGame==='search'?'단어 찾기 배틀':selectedGame==='combined'?'종합 배틀':'어휘 배틀';
}
function render(){
  const source=els.source.value||'snu';
  const textbook=(source==='snu'||source==='sejong');
  els.bookField.classList.toggle('hidden',!textbook);
  els.lessonField.classList.toggle('hidden',!textbook);
  document.querySelectorAll('.game-card').forEach(b=>b.classList.toggle('active',b.dataset.game===selectedGame));
  const name=gameName();
  els.guide.textContent=selectedGame==='sentence'?'문장 배틀에서 사용할 교재와 과를 선택하세요.':selectedGame==='matching'?'카드 매칭에 사용할 한국어·몽골어 어휘 자료를 선택하세요.':selectedGame==='memory'?'기억력 배틀에 사용할 한국어·몽골어 어휘 자료를 선택하세요.':selectedGame==='search'?'몽골어 뜻을 보고 한국어 단어를 찾을 어휘 자료를 선택하세요.':selectedGame==='combined'?'세 게임을 연속 진행할 교재와 과를 선택하세요.':'어휘 배틀에서 사용할 자료를 선택하세요.';
  els.launchTitle.textContent=`${name} 설정으로 이동`;
  let detail='';
  if(source==='snu'||source==='sejong')detail=`${textbookName(source)} ${els.book.value} · ${els.lesson.value}과`;
  else if(source==='preliminary')detail='예비편 어휘 40';
  else detail='TOPIK 1 연어 표현';
  const note=selectedGame==='sentence'?' <span class="sample-warn">선택한 과의 어휘·문법·예문을 바탕으로 만든 문장 배틀 데이터가 자동으로 연결됩니다.</span>':selectedGame==='matching'?' <span class="sample-warn">한국어 카드와 몽골어 카드가 한 쌍으로 자동 구성됩니다.</span>':selectedGame==='memory'?' <span class="sample-warn">같은 뜻의 한국어·몽골어 카드가 뒤집힌 상태로 배치되어 기억력 대결을 진행합니다.</span>':selectedGame==='search'?' <span class="sample-warn">상단의 몽골어 뜻을 보고 글자판에서 한국어 단어를 손가락으로 찾아 연결합니다.</span>':selectedGame==='combined'?' <span class="sample-warn">공통 어휘 수정과 문장 추가 정답을 불러와 어휘 → 카드 매칭 → 문장 순서로 진행합니다.</span>':'';
  els.summary.innerHTML=`선택: <b>${name}</b> · <b>${detail}</b>${note}`;
}
function chooseGame(game){
  selectedGame=game;
  fillSources();
  fillBooks();
  render();
}
function launch(){
  const source=els.source.value;
  const params=new URLSearchParams();
  params.set('source',source);
  if(source==='snu'||source==='sejong'){
    params.set('book',els.book.value);
    params.set('lesson',els.lesson.value);
  }
  if(source==='topik1') params.set('collocation','1');
  if(selectedGame==='word') location.href=`word-battle.html?${params.toString()}`;
  else if(selectedGame==='sentence') location.href=`sentence-battle-sample/index.html?${params.toString()}`;
  else if(selectedGame==='matching') location.href=`matching-pairs.html?${params.toString()}`;
  else if(selectedGame==='memory') location.href=`memory-pairs.html?${params.toString()}`;
  else if(selectedGame==='search') location.href=`word-search.html?${params.toString()}`;
  else if(selectedGame==='combined') location.href=`combined-battle.html?${params.toString()}`;
}

els.gameGrid.addEventListener('click',e=>{const card=e.target.closest('.game-card');if(card&&!card.disabled)chooseGame(card.dataset.game);});
els.source.addEventListener('change',()=>{fillBooks();render();});
els.book.addEventListener('change',()=>{fillLessons();render();});
els.lesson.addEventListener('change',render);
els.launchBtn.addEventListener('click',launch);
fillBooks();fillSources();render();
