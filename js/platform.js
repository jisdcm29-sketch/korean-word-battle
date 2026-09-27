import { booksForSource, textbookName } from './catalog.js';

const $=id=>document.getElementById(id);
const SOURCE_KEY='kwb_arena_source_v1';
const SOURCES={
  preliminary:'예비편 어휘 40 · 자모음 학습',
  snu:'서울대 한국어',
  sejong:'세종한국어(개정판)',
  topik1:'TOPIK 1 연어 표현'
};
const GAME_NAMES={word:'어휘 배틀',sentence:'문장 배틀',matching:'카드 매칭',memory:'기억력 배틀',search:'단어 찾기 배틀',combined:'종합 배틀'};
const SENTENCE_LESSON_OVERRIDES={'4B':[10,11,12,13,14,15,16,17,18]};
const els={sourceView:$('sourceView'),gameView:$('gameView'),gameGrid:$('gameGrid'),selectionArea:$('selectionArea'),selectionRow:$('selectionLaunchRow'),book:$('platformBook'),lesson:$('platformLesson'),bookField:$('platformBookField'),lessonField:$('platformLessonField'),guide:$('selectionGuide'),summary:$('selectionSummary'),launchTitle:$('launchTitle'),launchBtn:$('launchBtn')};
let selectedSource=null;
let selectedGame='word';
try{const saved=localStorage.getItem(SOURCE_KEY);if(Object.hasOwn(SOURCES,saved))selectedSource=saved;}catch{}

function showStep(){
  els.sourceView.classList.toggle('hidden',!!selectedSource);
  els.gameView.classList.toggle('hidden',!selectedSource);
  if(selectedSource)$('selectedSourceName').textContent=SOURCES[selectedSource];
}
function gameSupported(game){return (selectedSource==='snu'||selectedSource==='sejong')||!['sentence','combined'].includes(game);}
function refreshGames(){
  els.gameGrid.querySelectorAll('.game-card').forEach(card=>{
    const supported=gameSupported(card.dataset.game);
    card.disabled=card.dataset.accessDenied==='true'||!supported;
    if(!supported)card.title='문장 배틀과 종합 배틀은 서울대·세종한국어 교재에서 사용할 수 있습니다.';
    else if(card.dataset.accessDenied!=='true')card.removeAttribute('title');
  });
  const current=els.gameGrid.querySelector(`.game-card[data-game="${selectedGame}"]`);
  if(!current||current.disabled){selectedGame=els.gameGrid.querySelector('.game-card:not(:disabled)')?.dataset.game||null;}
  els.launchBtn.disabled=!selectedGame;
}
function fillBooks(){
  const books=booksForSource(selectedSource||'snu'),keep=els.book.value;
  els.book.innerHTML=books.map(b=>`<option value="${b.id}">${b.title}</option>`).join('');
  if(books.some(b=>b.id===keep))els.book.value=keep;
  fillLessons();
}
function fillLessons(){
  const books=booksForSource(selectedSource||'snu');
  const book=books.find(b=>b.id===els.book.value)||books[0];
  const sentenceBased=selectedGame==='sentence'||selectedGame==='combined';
  const lessons=selectedSource==='snu'&&sentenceBased&&SENTENCE_LESSON_OVERRIDES[book.id]?SENTENCE_LESSON_OVERRIDES[book.id]:book.lessons;
  const keep=Number(els.lesson.value);
  els.lesson.innerHTML=lessons.map(n=>`<option value="${n}">${n}과</option>`).join('');
  if(lessons.includes(keep))els.lesson.value=String(keep);
}
function render(){
  const textbook=selectedSource==='snu'||selectedSource==='sejong';
  els.selectionArea.classList.toggle('hidden',!textbook);
  els.selectionRow.classList.toggle('single-action',!textbook);
  els.bookField.classList.toggle('hidden',!textbook);
  els.lessonField.classList.toggle('hidden',!textbook);
  els.gameGrid.querySelectorAll('.game-card').forEach(b=>b.classList.toggle('active',b.dataset.game===selectedGame));
  const name=GAME_NAMES[selectedGame]||'게임';
  els.guide.textContent=textbook?`${name}에서 사용할 교재 단계와 과를 선택하세요.`:`${name}에서 ${SOURCES[selectedSource]||'자료'}를 사용합니다.`;
  els.launchTitle.textContent=`${name} 설정으로 이동`;
  let detail=textbook?`${textbookName(selectedSource)} ${els.book.value} · ${els.lesson.value}과`:SOURCES[selectedSource]||'';
  els.summary.textContent=`선택: ${name} · ${detail}`;
}
function selectSource(source){
  if(!Object.hasOwn(SOURCES,source))return;
  selectedSource=source;
  try{localStorage.setItem(SOURCE_KEY,source);}catch{}
  showStep();refreshGames();fillBooks();render();
}
function launch(){
  if(!selectedSource||!selectedGame)return;
  const params=new URLSearchParams({source:selectedSource});
  if(selectedSource==='snu'||selectedSource==='sejong'){
    params.set('book',els.book.value);params.set('lesson',els.lesson.value);
  }
  if(selectedSource==='topik1')params.set('collocation','1');
  const pages={word:'word-battle.html',sentence:'sentence-battle-sample/index.html',matching:'matching-pairs.html',memory:'memory-pairs.html',search:'word-search.html',combined:'combined-battle.html'};
  if(pages[selectedGame])location.href=`${pages[selectedGame]}?${params}`;
}

document.querySelector('.source-card-grid').addEventListener('click',e=>{
  const card=e.target.closest('.source-card[data-source]');if(card)selectSource(card.dataset.source);
});
$('changeSourceBtn').addEventListener('click',()=>{
  selectedSource=null;showStep();
});
els.gameGrid.addEventListener('click',e=>{
  const card=e.target.closest('.game-card');
  if(card&&!card.disabled){selectedGame=card.dataset.game;fillLessons();render();}
});
els.book.addEventListener('change',()=>{fillLessons();render();});
els.lesson.addEventListener('change',render);
els.launchBtn.addEventListener('click',launch);
window.addEventListener('arena-access-ready',()=>{refreshGames();fillLessons();render();});
showStep();refreshGames();fillBooks();render();
