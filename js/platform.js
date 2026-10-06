import { booksForSource, textbookName } from './catalog.js';
import { getClassContext, setClassContext, clearClassContext, listClasses, saveClass, deleteClass, teacherId } from './class-manager.js?v=1.1';

const $=id=>document.getElementById(id);
const SOURCE_KEY='kwb_arena_source_v1';
const SOURCES={preliminary:'예비편 어휘 40 · 자모음 학습',snu:'서울대 한국어',sejong:'세종한국어(개정판)',topik1:'TOPIK 1 연어 표현'};
const GAME_NAMES={word:'어휘 배틀',sentence:'문장 배틀',matching:'카드 매칭',memory:'기억력 배틀',search:'단어 찾기 배틀',combined:'종합 배틀'};
const SENTENCE_LESSON_OVERRIDES={'4B':[10,11,12,13,14,15,16,17,18]};
const els={
  classView:$('classView'),classList:$('classList'),classNameInput:$('classNameInput'),classMessage:$('classMessage'),
  sourceView:$('sourceView'),gameView:$('gameView'),gameGrid:$('gameGrid'),selectionArea:$('selectionArea'),selectionRow:$('selectionLaunchRow'),
  book:$('platformBook'),lesson:$('platformLesson'),bookField:$('platformBookField'),lessonField:$('platformLessonField'),guide:$('selectionGuide'),summary:$('selectionSummary'),launchTitle:$('launchTitle'),launchBtn:$('launchBtn')
};
let selectedSource=null;
let selectedGame='word';
let classContext=null;
let classReady=false;
let classLoading=false;
try{const saved=localStorage.getItem(SOURCE_KEY);if(Object.hasOwn(SOURCES,saved))selectedSource=saved;}catch{}

function classLabel(){return classContext?.mode==='CLASS'?`수업 반 · ${classContext.className}`:'오늘 게임만 · 주간 누적 안 함';}
function updateClassBars(){
  document.documentElement.dataset.classMode=classContext?.mode||'';
  const label=classLabel();
  ['selectedClassLabel','selectedClassLabelGame'].forEach(id=>{const el=$(id);if(el)el.textContent=label;});
}
function showStep(){
  els.classView.classList.toggle('hidden',classReady);
  els.sourceView.classList.toggle('hidden',!classReady||!!selectedSource);
  els.gameView.classList.toggle('hidden',!classReady||!selectedSource);
  if(selectedSource)$('selectedSourceName').textContent=SOURCES[selectedSource];
  if(classReady)updateClassBars();
}
function classMsg(text,type='info'){els.classMessage.textContent=text||'';els.classMessage.dataset.type=type;}
function renderClassList(classes=[]){
  if(!classes.length){els.classList.innerHTML='<div class="class-empty">등록된 반이 없습니다. 아래에서 첫 반을 추가하세요.</div>';return;}
  els.classList.innerHTML=classes.map(c=>`<div class="class-item" data-class-id="${escapeHtml(c.classId)}" data-class-name="${escapeHtml(c.className)}">
    <button type="button" class="class-choice" data-class-id="${escapeHtml(c.classId)}" data-class-name="${escapeHtml(c.className)}"><strong>${escapeHtml(c.className)}</strong><small>주간 점수 누적 사용</small></button>
    <div class="class-item-actions">
      <button type="button" class="class-edit-btn" data-class-id="${escapeHtml(c.classId)}" data-class-name="${escapeHtml(c.className)}" aria-label="${escapeHtml(c.className)} 반 이름 수정">수정</button>
      <button type="button" class="class-delete-btn" data-class-id="${escapeHtml(c.classId)}" data-class-name="${escapeHtml(c.className)}" aria-label="${escapeHtml(c.className)} 반 삭제">삭제</button>
    </div>
  </div>`).join('');
}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}
async function loadClassStep(){
  if(classReady||classLoading)return;
  if(!teacherId()){classMsg('교사 식별 정보를 확인할 수 없습니다. 다시 로그인해 주세요.','error');return;}
  const stored=getClassContext();
  if(stored){classContext=stored;classReady=true;showStep();return;}
  classReady=false;classLoading=true;showStep();classMsg('반 목록을 불러오는 중입니다…');
  try{
    const r=await listClasses();
    if(!r.ok){classMsg(r.message||'반 목록을 불러오지 못했습니다.','error');return;}
    renderClassList(r.classes||[]);classMsg('반을 선택하거나 새 반을 추가하세요.');
  }catch(err){console.error('[KWB classes]',err);classMsg('반 목록 서버에 연결하지 못했습니다.','error');}
  finally{classLoading=false;}
}
function chooseClass(classId,className){classContext=setClassContext({mode:'CLASS',classId,className});classReady=true;classMsg('');showStep();}
function chooseDailyOnly(){classContext=setClassContext({mode:'DAILY_ONLY',classId:'',className:''});classReady=true;classMsg('');showStep();}
function changeClass(){clearClassContext();classContext=null;classReady=false;document.documentElement.dataset.classMode='';loadClassStep();}

function gameSupported(game){return (selectedSource==='snu'||selectedSource==='sejong')||!['sentence','combined'].includes(game);}
function refreshGames(){
  els.gameGrid.querySelectorAll('.game-card').forEach(card=>{const supported=gameSupported(card.dataset.game);card.disabled=card.dataset.accessDenied==='true'||!supported;if(!supported)card.title='문장 배틀과 종합 배틀은 서울대·세종한국어 교재에서 사용할 수 있습니다.';else if(card.dataset.accessDenied!=='true')card.removeAttribute('title');});
  const current=els.gameGrid.querySelector(`.game-card[data-game="${selectedGame}"]`);if(!current||current.disabled){selectedGame=els.gameGrid.querySelector('.game-card:not(:disabled)')?.dataset.game||null;}els.launchBtn.disabled=!selectedGame;
}
function fillBooks(){const books=booksForSource(selectedSource||'snu'),keep=els.book.value;els.book.innerHTML=books.map(b=>`<option value="${b.id}">${b.title}</option>`).join('');if(books.some(b=>b.id===keep))els.book.value=keep;fillLessons();}
function fillLessons(){const books=booksForSource(selectedSource||'snu');const book=books.find(b=>b.id===els.book.value)||books[0];const sentenceBased=selectedGame==='sentence'||selectedGame==='combined';const lessons=selectedSource==='snu'&&sentenceBased&&SENTENCE_LESSON_OVERRIDES[book.id]?SENTENCE_LESSON_OVERRIDES[book.id]:book.lessons;const keep=Number(els.lesson.value);els.lesson.innerHTML=lessons.map(n=>`<option value="${n}">${n}과</option>`).join('');if(lessons.includes(keep))els.lesson.value=String(keep);}
function render(){const textbook=selectedSource==='snu'||selectedSource==='sejong';els.selectionArea.classList.toggle('hidden',!textbook);els.selectionRow.classList.toggle('single-action',!textbook);els.bookField.classList.toggle('hidden',!textbook);els.lessonField.classList.toggle('hidden',!textbook);els.gameGrid.querySelectorAll('.game-card').forEach(b=>b.classList.toggle('active',b.dataset.game===selectedGame));const name=GAME_NAMES[selectedGame]||'게임';els.guide.textContent=textbook?`${name}에서 사용할 교재 단계와 과를 선택하세요.`:`${name}에서 ${SOURCES[selectedSource]||'자료'}를 사용합니다.`;els.launchTitle.textContent=`${name} 설정으로 이동`;let detail=textbook?`${textbookName(selectedSource)} ${els.book.value} · ${els.lesson.value}과`:SOURCES[selectedSource]||'';els.summary.textContent=`선택: ${name} · ${detail}`;}
function selectSource(source){if(!Object.hasOwn(SOURCES,source))return;selectedSource=source;try{localStorage.setItem(SOURCE_KEY,source);}catch{}showStep();refreshGames();fillBooks();render();}
function launch(){if(!selectedSource||!selectedGame||!classReady)return;const params=new URLSearchParams({source:selectedSource});if(selectedSource==='snu'||selectedSource==='sejong'){params.set('book',els.book.value);params.set('lesson',els.lesson.value);}if(selectedSource==='topik1')params.set('collocation','1');const pages={word:'word-battle.html',sentence:'sentence-battle-sample/index.html',matching:'matching-pairs.html',memory:'memory-pairs.html',search:'word-search.html',combined:'combined-battle.html'};if(pages[selectedGame])location.href=`${pages[selectedGame]}?${params}`;}

document.querySelector('.source-card-grid').addEventListener('click',e=>{const card=e.target.closest('.source-card[data-source]');if(card)selectSource(card.dataset.source);});
$('changeSourceBtn').addEventListener('click',()=>{selectedSource=null;showStep();});
els.gameGrid.addEventListener('click',e=>{const card=e.target.closest('.game-card');if(card&&!card.disabled){selectedGame=card.dataset.game;fillLessons();render();}});
els.book.addEventListener('change',()=>{fillLessons();render();});els.lesson.addEventListener('change',render);els.launchBtn.addEventListener('click',launch);
els.classList.addEventListener('click',async e=>{
  const editBtn=e.target.closest('.class-edit-btn[data-class-id]');
  if(editBtn){
    e.preventDefault();e.stopPropagation();
    const classId=editBtn.dataset.classId,className=editBtn.dataset.className||'';
    const nextName=prompt('수정할 반 이름을 입력하세요.',className);
    if(nextName===null)return;
    const name=nextName.trim();
    if(!name){classMsg('반 이름을 입력하세요.','error');return;}
    editBtn.disabled=true;classMsg('반 이름을 수정하는 중입니다…');
    try{
      const r=await saveClass(name,classId);
      if(!r.ok){classMsg(r.message||'반 이름을 수정하지 못했습니다.','error');return;}
      renderClassList(r.classes||[]);classMsg(`'${className}' → '${r.classItem?.className||name}'으로 수정했습니다.`,'success');
    }catch(err){console.error('[KWB class rename]',err);classMsg('반 이름 수정 서버에 연결하지 못했습니다.','error');}
    finally{if(document.body.contains(editBtn))editBtn.disabled=false;}
    return;
  }
  const deleteBtn=e.target.closest('.class-delete-btn[data-class-id]');
  if(deleteBtn){
    e.preventDefault();e.stopPropagation();
    const classId=deleteBtn.dataset.classId,className=deleteBtn.dataset.className||'';
    if(!confirm(`'${className}' 반을 목록에서 삭제할까요?\n\n학생/점수 기록은 삭제하지 않고 보관되며, 반만 비활성화됩니다.`))return;
    deleteBtn.disabled=true;classMsg('반을 삭제하는 중입니다…');
    try{
      const r=await deleteClass(classId);
      if(!r.ok){classMsg(r.message||'반을 삭제하지 못했습니다.','error');return;}
      renderClassList(r.classes||[]);classMsg(`'${className}' 반을 삭제했습니다. 기존 학생/점수 기록은 보관됩니다.`,'success');
    }catch(err){console.error('[KWB class delete]',err);classMsg('반 삭제 서버에 연결하지 못했습니다.','error');}
    finally{if(document.body.contains(deleteBtn))deleteBtn.disabled=false;}
    return;
  }
  const btn=e.target.closest('.class-choice[data-class-id]');if(btn)chooseClass(btn.dataset.classId,btn.dataset.className);
});
$('skipClassBtn').addEventListener('click',chooseDailyOnly);
$('changeClassBtn').addEventListener('click',changeClass);$('changeClassBtnGame').addEventListener('click',changeClass);
$('addClassBtn').addEventListener('click',async()=>{
  const name=els.classNameInput.value.trim();if(!name){classMsg('반 이름을 입력하세요.','error');els.classNameInput.focus();return;}
  $('addClassBtn').disabled=true;classMsg('반을 등록하는 중입니다…');
  try{const r=await saveClass(name);if(!r.ok){classMsg(r.message||'반을 등록하지 못했습니다.','error');return;}els.classNameInput.value='';renderClassList(r.classes||[]);classMsg(`'${r.classItem?.className||name}' 반을 등록했습니다.`,'success');}
  catch(err){console.error('[KWB class save]',err);classMsg('반 등록 서버에 연결하지 못했습니다.','error');}
  finally{$('addClassBtn').disabled=false;}
});
els.classNameInput.addEventListener('keydown',e=>{if(e.key==='Enter')$('addClassBtn').click();});
window.addEventListener('arena-access-ready',()=>{refreshGames();fillLessons();render();loadClassStep();});
showStep();refreshGames();fillBooks();render();
if(teacherId())loadClassStep();
