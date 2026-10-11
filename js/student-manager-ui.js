import { getClassContext } from './class-manager.js?v=1.0';
import { listStudents, saveStudent, deleteStudent, resolveStudentName, resolveNameCandidate } from './student-registry.js?v=1.1';

let overlay=null;
let currentData={students:[],candidates:[]};
let editingId='';

function esc(v){return String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}
function splitNames(v){return String(v??'').split(/[\n,;|]+/).map(x=>x.trim()).filter(Boolean);}
function joinNames(v){return Array.isArray(v)?v.join(', '):String(v||'');}
function msg(text,type='info'){const el=overlay?.querySelector('#studentRegistryMessage');if(el){el.textContent=text||'';el.dataset.type=type;}}

function ensureOverlay(){
  if(overlay)return overlay;
  overlay=document.createElement('div');
  overlay.className='student-manager-backdrop hidden';
  overlay.innerHTML=`<section class="student-manager" role="dialog" aria-modal="true" aria-labelledby="studentManagerTitle">
    <div class="student-manager-head"><div><h2 id="studentManagerTitle">학생 관리</h2><p id="studentManagerClass"></p></div><button class="student-manager-close" type="button">닫기</button></div>
    <div class="student-manager-grid">
      <div class="student-registry-card"><h3>등록 학생</h3><div id="studentList" class="student-list"></div></div>
      <div class="student-registry-card"><h3 id="studentFormTitle">학생 추가</h3>
        <form id="studentForm" class="student-form">
          <label>대표 이름<input id="studentDisplayName" maxlength="60" placeholder="예: Бат-Эрдэнэ" required /></label>
          <label>확정 별칭<textarea id="studentAliases" placeholder="예: Бат, Bat, 바트&#10;같은 학생으로 확정된 이름만 입력"></textarea></label>
          <label>동일인 가능성 이름<textarea id="studentPossibleNames" placeholder="예: Bataa, 바타&#10;아직 확정하지 않은 이름"></textarea></label>
          <div class="student-form-actions"><button class="student-save-btn" type="submit">저장</button><button id="studentCancelEdit" class="student-cancel-btn hidden" type="button">수정 취소</button></div>
        </form>
        <p id="studentRegistryMessage" class="student-registry-message" aria-live="polite"></p>
      </div>
    </div>
    <div class="student-registry-card student-name-test-card" style="margin-top:16px">
      <h3>게임 입장 이름 확인</h3>
      <p class="student-test-guide">학생이 실제 게임에서 입력할 이름을 넣어 보세요. 대표 이름 또는 확정 별칭이면 즉시 같은 학생으로 확인되고, 미확정 이름은 아래 확인 목록에 자동 등록됩니다.</p>
      <form id="studentNameTestForm" class="student-name-test-form">
        <input id="studentNameTestInput" maxlength="60" placeholder="예: 노밍 / Бат / 바트" autocomplete="off" required />
        <button id="studentNameTestBtn" type="submit">이름 확인</button>
      </form>
      <div id="studentNameTestResult" class="student-name-test-result hidden" aria-live="polite"></div>
    </div>
    <div class="student-registry-card" style="margin-top:16px"><h3>동일인 확인이 필요한 이름</h3><div id="candidateList" class="candidate-list"></div></div>
  </section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.student-manager-close').addEventListener('click',closeManager);
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeManager();});
  overlay.querySelector('#studentForm').addEventListener('submit',saveForm);
  overlay.querySelector('#studentNameTestForm').addEventListener('submit',testEnteredName);
  overlay.querySelector('#studentCancelEdit').addEventListener('click',resetForm);
  overlay.querySelector('#studentList').addEventListener('click',e=>{const b=e.target.closest('button[data-student-id]');if(!b)return;if(b.classList.contains('student-edit-btn'))startEdit(b.dataset.studentId);else if(b.classList.contains('student-delete-btn'))deleteStudentRecord(b.dataset.studentId);});
  overlay.querySelector('#candidateList').addEventListener('click',handleCandidateAction);
  return overlay;
}

function openManager(){
  const ctx=getClassContext();
  if(!ctx||ctx.mode!=='CLASS'||!ctx.classId){return;}
  ensureOverlay();overlay.classList.remove('hidden');
  overlay.querySelector('#studentManagerClass').textContent=`${ctx.className} · 대표 이름과 별칭을 관리합니다.`;
  resetForm();setNameTestResult('');const testInput=overlay.querySelector('#studentNameTestInput');if(testInput)testInput.value='';loadData();
}
function closeManager(){overlay?.classList.add('hidden');}

async function loadData(){
  const ctx=getClassContext();if(!ctx||ctx.mode!=='CLASS')return;
  msg('학생 목록을 불러오는 중입니다…');
  try{
    const r=await listStudents(ctx.classId);
    if(!r.ok){msg(r.message||'학생 목록을 불러오지 못했습니다.','error');return;}
    currentData={students:r.students||[],candidates:r.candidates||[]};renderStudents();renderCandidates();msg('');
  }catch(err){console.error('[KWB students]',err);msg('학생 관리 서버에 연결하지 못했습니다.','error');}
}


function setNameTestResult(html,type='info'){
  const el=overlay?.querySelector('#studentNameTestResult');if(!el)return;
  if(!html){el.innerHTML='';el.classList.add('hidden');el.removeAttribute('data-type');return;}
  el.innerHTML=html;el.dataset.type=type;el.classList.remove('hidden');
}

async function testEnteredName(e){
  e.preventDefault();const ctx=getClassContext();if(!ctx||ctx.mode!=='CLASS')return;
  const input=overlay.querySelector('#studentNameTestInput'),btn=overlay.querySelector('#studentNameTestBtn');
  const enteredName=input.value.trim();if(!enteredName)return;
  btn.disabled=true;setNameTestResult('이름을 확인하는 중입니다…');
  try{
    const r=await resolveStudentName(ctx.classId,enteredName);
    if(!r.ok){setNameTestResult(esc(r.message||'이름을 확인하지 못했습니다.'),'error');return;}
    if(r.status==='RESOLVED'&&r.student){
      const aliasText=(r.student.aliases||[]).length?`<small>확정 별칭: ${(r.student.aliases||[]).map(esc).join(', ')}</small>`:'';
      setNameTestResult(`<strong>✓ 동일 학생 확인</strong><span><b>${esc(enteredName)}</b> → ${esc(r.student.displayName)}</span>${aliasText}`,'success');
      return;
    }
    if(r.status==='POSSIBLE'){
      const suggested=r.suggestedStudent?.displayName||r.candidate?.suggestedDisplayName||'';
      setNameTestResult(`<strong>△ 동일인 가능성</strong><span><b>${esc(enteredName)}</b>${suggested?` → ${esc(suggested)} 가능성 있음`:''}</span><small>자동 합산하지 않았습니다. 아래 목록에서 교사가 같은 학생인지 확인해 주세요.</small>`,'warning');
    }else if(r.status==='AMBIGUOUS'){
      setNameTestResult(`<strong>! 교사 확인 필요</strong><span><b>${esc(enteredName)}</b> 이름이 여러 학생과 충돌합니다.</span><small>아래 확인 목록에서 연결 대상을 결정해 주세요.</small>`,'warning');
    }else{
      setNameTestResult(`<strong>?</strong><span><b>${esc(enteredName)}</b>은(는) 아직 등록되지 않은 이름입니다.</span><small>아래 확인 목록에 후보로 추가했습니다. 같은 학생으로 연결하거나 새 학생으로 등록하세요.</small>`,'warning');
    }
    await loadData();
  }catch(err){console.error('[KWB student name test]',err);setNameTestResult('학생 이름 확인 서버에 연결하지 못했습니다.','error');}
  finally{btn.disabled=false;}
}

function renderStudents(){
  const box=overlay.querySelector('#studentList');
  if(!currentData.students.length){box.innerHTML='<div class="student-empty">등록된 학생이 없습니다. 오른쪽에서 첫 학생을 추가하세요.</div>';return;}
  box.innerHTML=currentData.students.map(s=>{
    const a=(s.aliases||[]).length?`확정 별칭: ${(s.aliases||[]).map(esc).join(', ')}`:'확정 별칭 없음';
    const p=(s.possibleNames||[]).length?`동일인 가능성: ${(s.possibleNames||[]).map(esc).join(', ')}`:'동일인 가능성 이름 없음';
    return `<div class="student-item"><div><strong>${esc(s.displayName)}</strong><small>${a}<br>${p}</small></div><div class="student-item-actions"><button class="student-edit-btn" type="button" data-student-id="${esc(s.studentId)}">수정</button><button class="student-delete-btn" type="button" data-student-id="${esc(s.studentId)}">삭제</button></div></div>`;
  }).join('');
}

function studentOptions(selected=''){
  return '<option value="">연결할 학생 선택</option>'+currentData.students.map(s=>`<option value="${esc(s.studentId)}" ${s.studentId===selected?'selected':''}>${esc(s.displayName)}</option>`).join('');
}
function renderCandidates(){
  const box=overlay.querySelector('#candidateList');
  if(!currentData.candidates.length){box.innerHTML='<div class="student-empty">현재 확인이 필요한 이름 후보가 없습니다.</div>';return;}
  box.innerHTML=currentData.candidates.map(c=>`<div class="candidate-row" data-candidate-id="${esc(c.candidateId)}">
    <div class="candidate-row-head"><strong>${esc(c.enteredName)}</strong><small>${Number(c.seenCount)||1}회 입력</small></div>
    <select class="candidate-student-select">${studentOptions(c.suggestedStudentId||'')}</select>
    <div class="candidate-actions"><button class="candidate-link" type="button" data-decision="LINK">같은 학생으로 연결</button><button class="candidate-new" type="button" data-decision="NEW">새 학생으로 등록</button><button class="candidate-reject" type="button" data-decision="REJECT">후보 제외</button></div>
  </div>`).join('');
}

function startEdit(studentId){
  const s=currentData.students.find(x=>x.studentId===studentId);if(!s)return;
  editingId=studentId;overlay.querySelector('#studentFormTitle').textContent='학생 수정';
  overlay.querySelector('#studentDisplayName').value=s.displayName||'';
  overlay.querySelector('#studentAliases').value=joinNames(s.aliases);
  overlay.querySelector('#studentPossibleNames').value=joinNames(s.possibleNames);
  overlay.querySelector('#studentCancelEdit').classList.remove('hidden');
  overlay.querySelector('#studentDisplayName').focus();msg('');
}
function resetForm(){
  if(!overlay)return;editingId='';overlay.querySelector('#studentFormTitle').textContent='학생 추가';overlay.querySelector('#studentForm').reset();overlay.querySelector('#studentCancelEdit').classList.add('hidden');msg('');
}

async function deleteStudentRecord(studentId){
  const ctx=getClassContext();if(!ctx||ctx.mode!=='CLASS')return;
  const student=currentData.students.find(x=>x.studentId===studentId);if(!student)return;
  if(!confirm(`'${student.displayName}' 학생 정보를 삭제할까요?

대표 이름과 확정 별칭은 현재 반의 학생 목록에서 제거됩니다. 과거 기록을 보호하기 위해 서버에서는 비활성 상태로 보존합니다.`))return;
  msg(`'${student.displayName}' 학생 정보를 삭제하는 중입니다…`);
  overlay.querySelectorAll(`button[data-student-id="${CSS.escape(studentId)}"]`).forEach(b=>b.disabled=true);
  try{
    const r=await deleteStudent(ctx.classId,studentId);
    if(!r.ok){msg(r.message||'학생 정보를 삭제하지 못했습니다.','error');return;}
    currentData={students:r.students||[],candidates:r.candidates||[]};
    if(editingId===studentId)resetForm();
    renderStudents();renderCandidates();msg(r.message||`'${student.displayName}' 학생 정보를 삭제했습니다.`,'success');
  }catch(err){console.error('[KWB student delete]',err);msg('학생 삭제 서버에 연결하지 못했습니다.','error');}
}

async function saveForm(e){
  e.preventDefault();const ctx=getClassContext();if(!ctx||ctx.mode!=='CLASS')return;
  const displayName=overlay.querySelector('#studentDisplayName').value.trim();
  if(!displayName){msg('대표 이름을 입력하세요.','error');return;}
  const btn=overlay.querySelector('.student-save-btn');btn.disabled=true;msg('저장 중입니다…');
  try{
    const r=await saveStudent(ctx.classId,{studentId:editingId,displayName,aliases:splitNames(overlay.querySelector('#studentAliases').value),possibleNames:splitNames(overlay.querySelector('#studentPossibleNames').value)});
    if(!r.ok){msg(r.message||'학생을 저장하지 못했습니다.','error');return;}
    currentData={students:r.students||[],candidates:r.candidates||[]};renderStudents();renderCandidates();resetForm();msg(`'${r.student?.displayName||displayName}' 학생 정보를 저장했습니다.`,'success');
  }catch(err){console.error('[KWB student save]',err);msg('학생 저장 서버에 연결하지 못했습니다.','error');}
  finally{btn.disabled=false;}
}

async function handleCandidateAction(e){
  const btn=e.target.closest('button[data-decision]');if(!btn)return;
  const row=btn.closest('.candidate-row'),ctx=getClassContext();if(!row||!ctx||ctx.mode!=='CLASS')return;
  const decision=btn.dataset.decision;const studentId=row.querySelector('.candidate-student-select')?.value||'';
  if(decision==='LINK'&&!studentId){msg('연결할 학생을 먼저 선택하세요.','error');return;}
  row.querySelectorAll('button').forEach(x=>x.disabled=true);msg('이름 후보를 처리하는 중입니다…');
  try{
    const r=await resolveNameCandidate(ctx.classId,{candidateId:row.dataset.candidateId,decision,studentId});
    if(!r.ok){msg(r.message||'이름 후보를 처리하지 못했습니다.','error');return;}
    currentData={students:r.students||[],candidates:r.candidates||[]};renderStudents();renderCandidates();msg(r.message||'이름 후보 처리가 완료되었습니다.','success');
  }catch(err){console.error('[KWB candidate]',err);msg('이름 후보 처리 서버에 연결하지 못했습니다.','error');}
}

document.querySelectorAll('.student-manage-btn').forEach(btn=>btn.addEventListener('click',openManager));
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay&&!overlay.classList.contains('hidden'))closeManager();});
