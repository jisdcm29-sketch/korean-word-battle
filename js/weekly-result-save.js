import { getClassContext } from './class-manager.js?v=1.0';
import { saveDailyResults } from './student-registry.js?v=1.5';

const STYLE_URL=new URL('../css/weekly-results.css?v=1.1',import.meta.url).href;
const PATH=location.pathname.replace(/\\/g,'/').toLowerCase();
const ADAPTERS=[
  {test:/\/word-battle\.html$/,gameId:'word-battle',finalId:'finalArea',rowSelector:'#finalRanking .rank-row'},
  {test:/\/matching-pairs\.html$/,gameId:'matching-pairs',finalId:'finalView',rowSelector:'#finalRanking .rank-row'},
  {test:/\/memory-pairs\.html$/,gameId:'memory-pairs',finalId:'finalView',rowSelector:'#finalRanking .rank-row'},
  {test:/\/word-search\.html$/,gameId:'word-search',finalId:'finalView',rowSelector:'#finalRanking .rank-row'},
  {test:/\/sentence-battle-sample\/index\.html$/,gameId:'sentence-battle',finalId:'finalView',rowSelector:'#finalRanking .final-rank-row,#finalRanking .rank-row'},
  {test:/\/combined-battle\.html$/,gameId:'combined-battle',finalId:'finalView',rowSelector:'#finalRanking .final-row'}
];
const adapter=ADAPTERS.find(a=>a.test.test(PATH))||null;
let finalObserver=null;
let finalEl=null;
let wasVisible=false;
let pageSessionId='';

function ensureStyle(){if(document.querySelector('link[data-weekly-results-style]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href=STYLE_URL;link.dataset.weeklyResultsStyle='1';document.head.append(link);}
function clean(v){return String(v??'').replace(/\s+/g,' ').trim();}
function scoreNumber(text){const n=Number(String(text||'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.max(0,Math.round(n)):0;}
function fallbackClassContext(){try{const x=JSON.parse(sessionStorage.getItem('kwb_arena_class_context_v1')||'null');return x&&x.mode==='CLASS'&&x.classId?x:null;}catch{return null;}}
function currentContext(){const c=getClassContext()||fallbackClassContext();return c&&c.mode==='CLASS'&&c.classId?c:null;}
function visible(el){return !!el&&!el.classList.contains('hidden')&&!el.hasAttribute('hidden');}
function makeSessionId(){return `G-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,9).toUpperCase()}`;}
function isDemoInfoActive(){const el=document.getElementById('demoInfo');return !!el&&!el.classList.contains('hidden');}
function roomPin(){return clean(document.getElementById('roomPin')?.textContent).replace(/\D/g,'');}
function pageIsDemo(rows){
  if(document.body.classList.contains('demo-mode'))return true;
  if(isDemoInfoActive())return true;
  if(adapter?.gameId==='combined-battle'&&roomPin().length<4)return true;
  if(rows.length&&rows.every(row=>row.querySelector('.rank-demo')||/\bDEMO\b/i.test(row.textContent||'')))return true;
  return false;
}
function rowIsDemo(row){return !!row.querySelector('.rank-demo')||/\bDEMO\b/i.test(row.textContent||'');}
function nameFromRow(row){
  const selectors=['.rank-name','.rank-copy strong','.name','strong'];
  for(const s of selectors){const el=row.querySelector(s);const t=clean(el?.childNodes?.[0]?.textContent||el?.textContent);if(t)return t.replace(/\s*·?\s*DEMO\s*$/i,'').trim();}
  return '';
}
function scoreFromRow(row){
  const selectors=['.rank-score','.total','em'];
  for(const s of selectors){const el=row.querySelector(s);if(el)return scoreNumber(el.textContent);}
  return scoreNumber(row.textContent);
}
function rankingRows(){if(!adapter)return[];return [...document.querySelectorAll(adapter.rowSelector)];}
function realRanking(){
  const rows=rankingRows();
  if(pageIsDemo(rows))return[];
  return rows.filter(row=>!rowIsDemo(row)).map((row,index)=>({enteredName:nameFromRow(row),rawScore:scoreFromRow(row),dailyRank:index+1})).filter(x=>x.enteredName);
}
function luckyState(){
  const root=finalEl||document;
  const card=root.querySelector?.('.lucky-award-card')||document.querySelector('.lucky-award-card');
  if(!card)return {required:false,revealed:true,name:''};
  return {required:true,revealed:card.classList.contains('revealed'),name:clean(card.querySelector('.lucky-name')?.textContent)};
}
function ensureCard(){
  if(!finalEl)return null;
  let card=document.getElementById('weeklyDailySaveCard');
  if(card&&finalEl.contains(card))return card;
  card?.remove();
  card=document.createElement('section');card.id='weeklyDailySaveCard';card.className='weekly-save-card';
  card.innerHTML=`<div class="weekly-save-head"><strong>📅 오늘 결과 저장</strong><span class="weekly-save-class" data-weekly-class></span></div><div class="weekly-save-actions"><button type="button" class="btn primary weekly-save-btn" data-weekly-save>저장</button><span class="weekly-save-status" data-weekly-status></span></div>`;
  const actions=finalEl.querySelector('.action-row,.final-actions,.actions,.game-actions,.final-buttons');
  if(actions)actions.insertAdjacentElement('beforebegin',card);else finalEl.append(card);
  card.querySelector('[data-weekly-save]')?.addEventListener('click',()=>saveNow(card,false));
  return card;
}
function setStatus(card,text,type=''){const el=card.querySelector('[data-weekly-status]');if(!el)return;const nextText=text||'',nextClass=`weekly-save-status${type?' '+type:''}`;if(el.textContent!==nextText)el.textContent=nextText;if(el.className!==nextClass)el.className=nextClass;}
function refreshCard(){
  if(!adapter||!visible(finalEl))return;
  const ctx=currentContext(),card=ensureCard();if(!card)return;
  if(!ctx){card.classList.add('hidden');return;}card.classList.remove('hidden');
  const rows=rankingRows(),demo=pageIsDemo(rows),players=demo?[]:realRanking();
  if(card.dataset.sessionId!==pageSessionId){card.dataset.sessionId=pageSessionId;const btn=card.querySelector('[data-weekly-save]');if(btn){btn.disabled=false;btn.textContent='저장';}setStatus(card,'');}
  const classLabel=card.querySelector('[data-weekly-class]');if(classLabel){const text=clean(ctx.className||ctx.classId);if(classLabel.textContent!==text)classLabel.textContent=text;}
  const btn=card.querySelector('[data-weekly-save]');
  if(demo){if(btn)btn.disabled=true;setStatus(card,'데모 게임 · 저장 안 함','warning');return;}
  if(!players.length){if(btn)btn.disabled=true;setStatus(card,'저장할 학생 결과 없음','warning');return;}
  if(btn&&card.dataset.state!=='saved')btn.disabled=false;
}
async function saveNow(card,overwrite){
  const ctx=currentContext();if(!ctx){setStatus(card,'반 선택 필요','warning');return;}
  const rows=rankingRows();if(pageIsDemo(rows)){setStatus(card,'데모 게임 · 저장 안 함','warning');return;}
  const players=realRanking();if(!players.length){setStatus(card,'저장할 학생 결과 없음','warning');return;}
  const lucky=luckyState();if(lucky.required&&!lucky.revealed){setStatus(card,'행운상 추첨 후 저장','warning');return;}
  const btn=card.querySelector('[data-weekly-save]');if(btn){btn.disabled=true;btn.textContent='저장 중…';}setStatus(card,'저장 중…');
  try{
    const result=await saveDailyResults(ctx.classId,{gameSessionId:pageSessionId,gameId:adapter.gameId,players,dailyLuckyName:lucky.name,overwrite});
    if(!result?.ok&&result?.code==='DUPLICATE_SESSION'&&!overwrite){
      if(confirm('이 게임 결과는 이미 저장되어 있습니다. 기존 결과를 현재 결과로 덮어쓸까요?')){if(btn){btn.disabled=false;btn.textContent='저장';}return saveNow(card,true);}
      setStatus(card,'기존 결과 유지','warning');if(btn){btn.disabled=false;btn.textContent='저장';}return;
    }
    if(!result?.ok)throw new Error(result?.message||'결과를 저장하지 못했습니다.');
    card.dataset.state='saved';if(btn){btn.disabled=true;btn.textContent='✓ 저장 완료';}
    const pending=Number(result.pendingCount)||0;setStatus(card,pending?`저장 완료 · 이름 확인 ${pending}명`:'저장 완료',pending?'warning':'success');
  }catch(err){console.error('[KWB daily results]',err);setStatus(card,err?.message||'저장 오류','error');if(btn){btn.disabled=false;btn.textContent='저장';}}
}
function syncVisibility(){
  if(!finalEl)return;
  const nowVisible=visible(finalEl);
  if(nowVisible&&!wasVisible){pageSessionId=makeSessionId();const old=document.getElementById('weeklyDailySaveCard');old?.remove();requestAnimationFrame(refreshCard);}
  wasVisible=nowVisible;
  if(nowVisible)refreshCard();
}
function attach(){
  if(!adapter)return;
  const found=document.getElementById(adapter.finalId);if(!found)return;
  if(finalEl===found)return;
  finalObserver?.disconnect();finalEl=found;wasVisible=visible(finalEl);if(wasVisible)pageSessionId=makeSessionId();
  finalObserver=new MutationObserver(syncVisibility);finalObserver.observe(finalEl,{attributes:true,attributeFilter:['class','hidden']});
  syncVisibility();
}

if(adapter){
  ensureStyle();
  attach();
  const discovery=new MutationObserver(()=>attach());discovery.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('pageshow',()=>{attach();syncVisibility();});
  setInterval(()=>{attach();if(visible(finalEl))refreshCard();},1200);
}
