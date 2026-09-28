import { getClassContext } from './class-manager.js?v=1.0';
import { getWeeklyRanking } from './student-registry.js?v=1.4';

let overlay=null;
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function ensureOverlay(){
  if(overlay)return overlay;
  overlay=document.createElement('div');
  overlay.className='weekly-ranking-backdrop hidden';
  overlay.innerHTML=`<section class="weekly-ranking-modal" role="dialog" aria-modal="true" aria-labelledby="weeklyRankingTitle">
    <div class="weekly-ranking-head"><div><h2 id="weeklyRankingTitle">이번 주 순위</h2><p id="weeklyRankingClass"></p></div><button type="button" class="weekly-ranking-close">닫기</button></div>
    <div id="weeklyRankingMeta" class="weekly-ranking-meta"></div>
    <div id="weeklyRankingBody" class="weekly-ranking-body"><div class="weekly-ranking-empty">불러오는 중…</div></div>
  </section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.weekly-ranking-close').addEventListener('click',closeRanking);
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeRanking();});
  return overlay;
}
function closeRanking(){overlay?.classList.add('hidden');}
function render(r){
  const body=overlay.querySelector('#weeklyRankingBody'),meta=overlay.querySelector('#weeklyRankingMeta');
  const rows=Array.isArray(r?.ranking)?r.ranking:[];
  const pending=Number(r?.pendingCount)||0;
  meta.innerHTML=`<span>${esc(r?.weekId||'')}</span>${pending?`<b>이름 확인 ${pending}건</b>`:''}`;
  if(!rows.length){body.innerHTML='<div class="weekly-ranking-empty">이번 주 저장 결과가 없습니다.</div>';return;}
  body.innerHTML=`<div class="weekly-ranking-table-head"><span>순위</span><span>이름</span><span>누적</span><span>참여</span></div>`+rows.map(x=>`<div class="weekly-ranking-row ${Number(x.rank)<=3?'top-rank':''}"><strong>${esc(x.rank)}</strong><span>${esc(x.studentName)}</span><b>${Number(x.weeklyPointTotal||0).toLocaleString()}점</b><small>${Number(x.gamesPlayed||0)}회</small></div>`).join('');
}
async function openRanking(){
  const ctx=getClassContext();
  if(!ctx||ctx.mode!=='CLASS'||!ctx.classId)return;
  ensureOverlay();overlay.classList.remove('hidden');
  overlay.querySelector('#weeklyRankingClass').textContent=ctx.className||ctx.classId;
  overlay.querySelector('#weeklyRankingMeta').textContent='';
  overlay.querySelector('#weeklyRankingBody').innerHTML='<div class="weekly-ranking-empty">불러오는 중…</div>';
  try{
    const r=await getWeeklyRanking(ctx.classId);
    if(!r?.ok)throw new Error(r?.message||'주간 순위를 불러오지 못했습니다.');
    render(r);
  }catch(err){console.error('[KWB weekly ranking]',err);overlay.querySelector('#weeklyRankingBody').innerHTML=`<div class="weekly-ranking-empty error">${esc(err?.message||'주간 순위를 불러오지 못했습니다.')}</div>`;}
}
function syncButtons(){
  const ctx=getClassContext(),show=!!(ctx&&ctx.mode==='CLASS'&&ctx.classId);
  document.querySelectorAll('.weekly-ranking-btn').forEach(btn=>{btn.hidden=!show;});
}
document.querySelectorAll('.weekly-ranking-btn').forEach(btn=>btn.addEventListener('click',openRanking));
window.addEventListener('pageshow',syncButtons);
setInterval(syncButtons,1000);
syncButtons();
