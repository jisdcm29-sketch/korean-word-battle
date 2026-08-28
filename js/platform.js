import { CATALOG } from './catalog.js';

const $=id=>document.getElementById(id);
const els={gameGrid:$('gameGrid'),source:$('platformSource'),book:$('platformBook'),lesson:$('platformLesson'),bookField:$('platformBookField'),lessonField:$('platformLessonField'),guide:$('selectionGuide'),summary:$('selectionSummary'),launchTitle:$('launchTitle'),launchBtn:$('launchBtn')};
let selectedGame='word';

const SOURCES={
  word:[
    {id:'preliminary',label:'예비편 어휘 40 · 자모음 학습'},
    {id:'snu',label:'서울대 한국어'},
    {id:'topik1',label:'TOPIK 1 연어 표현'}
  ],
  sentence:[{id:'snu',label:'서울대 한국어'}]
};

function fillSources(){
  const list=SOURCES[selectedGame]||SOURCES.word;
  const keep=els.source.value;
  els.source.innerHTML=list.map(s=>`<option value="${s.id}">${s.label}</option>`).join('');
  if(list.some(s=>s.id===keep))els.source.value=keep;
}
function fillBooks(){
  els.book.innerHTML=CATALOG.snuBooks.map(b=>`<option value="${b.id}">${b.title}</option>`).join('');
  fillLessons();
}
function fillLessons(){
  const book=CATALOG.snuBooks.find(b=>b.id===els.book.value)||CATALOG.snuBooks[0];
  els.lesson.innerHTML=book.lessons.map(n=>`<option value="${n}">${n}과</option>`).join('');
}
function render(){
  const source=els.source.value||'snu';
  const snu=source==='snu';
  els.bookField.classList.toggle('hidden',!snu);
  els.lessonField.classList.toggle('hidden',!snu);
  document.querySelectorAll('.game-card').forEach(b=>b.classList.toggle('active',b.dataset.game===selectedGame));
  const gameName=selectedGame==='sentence'?'문장 배틀':'어휘 배틀';
  els.guide.textContent=selectedGame==='sentence'?'문장 배틀에서 사용할 서울대 한국어 교재와 과를 선택하세요.':'어휘 배틀에서 사용할 자료를 선택하세요.';
  els.launchTitle.textContent=`${gameName} 설정으로 이동`;
  let detail='';
  if(source==='snu')detail=`서울대 ${els.book.value} · ${els.lesson.value}과`;
  else if(source==='preliminary')detail='예비편 어휘 40';
  else detail='TOPIK 1 연어 표현';
  const note=selectedGame==='sentence'?' <span class="sample-warn">현재 문장 배틀은 기능 샘플 문장으로 연결되며, 실제 교재 문장 데이터는 다음 단계에서 과별로 연결합니다.</span>':'';
  els.summary.innerHTML=`선택: <b>${gameName}</b> · <b>${detail}</b>${note}`;
}
function chooseGame(game){
  if(game==='speed')return;
  selectedGame=game;
  fillSources();
  render();
}
function launch(){
  const source=els.source.value;
  const params=new URLSearchParams();
  params.set('source',source);
  if(source==='snu'){
    params.set('book',els.book.value);
    params.set('lesson',els.lesson.value);
  }
  if(selectedGame==='word'){
    location.href=`word-battle.html?${params.toString()}`;
  }else if(selectedGame==='sentence'){
    location.href=`sentence-battle-sample/index.html?${params.toString()}`;
  }
}

els.gameGrid.addEventListener('click',e=>{const card=e.target.closest('.game-card');if(card&&!card.disabled)chooseGame(card.dataset.game);});
els.source.addEventListener('change',render);
els.book.addEventListener('change',()=>{fillLessons();render();});
els.lesson.addEventListener('change',render);
els.launchBtn.addEventListener('click',launch);
fillBooks();fillSources();render();
