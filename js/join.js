import { FirebaseBus, isFirebaseConfigured } from './firebase-bus.js?v=8.2';

const $=(id)=>document.getElementById(id);
const entryParams=new URLSearchParams(location.search);
const previewMode=entryParams.get('preview')==='1';
const ROUTES={
  'word-battle':{path:'play.html',label:'어휘 배틀'},
  'matching-pairs':{path:'matching-play.html',label:'카드 매칭'},
  'memory-pairs':{path:'memory-play.html',label:'기억력 배틀'},
  'word-search':{path:'word-search-play.html',label:'단어 찾기 배틀'},
  'combined':{path:'combined-play.html',label:'종합 배틀'},
  'sentence-sample':{path:'sentence-battle-sample/play.html',label:'문장 배틀'}
};
let activeBus=null;

function cleanPin(value){return String(value||'').replace(/\D/g,'').slice(0,6);}
function setStatus(text,type=''){const box=$('statusBox');box.className=`status ${type}`.trim();$('statusText').textContent=text;}
function routeFromState(state){
  const direct=String(state?.config?.gameType||'');
  if(ROUTES[direct])return ROUTES[direct];
  if(state?.kind==='sentence-sample')return ROUTES['sentence-sample'];
  const kind=String(state?.offlinePackage?.kind||'');
  if(kind==='word')return ROUTES['word-battle'];
  if(kind==='matching')return ROUTES['matching-pairs'];
  if(kind==='memory')return ROUTES['memory-pairs'];
  if(kind==='combined')return ROUTES['combined'];
  if(kind==='sentence')return ROUTES['sentence-sample'];
  return null;
}
async function enter(pin){
  const value=cleanPin(pin);
  $('pinInput').value=value;
  if(!/^\d{6}$/.test(value)){setStatus('6자리 PIN을 입력해 주세요. · 6 оронтой PIN оруулна уу.','error');$('pinInput').focus();return;}
  if(!isFirebaseConfigured()){setStatus('게임 연결 설정을 확인할 수 없습니다. 선생님에게 알려 주세요.','error');return;}
  $('joinBtn').disabled=true;setStatus('게임방을 확인하고 있습니다…','loading');
  try{
    activeBus?.close();
    activeBus=new FirebaseBus(value,'player');
    await activeBus.init();
    const state=await activeBus.loadRoom();
    if(!state||state.status==='closed')throw new Error('게임방을 찾을 수 없습니다. PIN을 다시 확인해 주세요.');
    const route=routeFromState(state);
    if(!route)throw new Error('이 PIN의 게임 종류를 확인할 수 없습니다. 선생님 화면에서 새 게임방을 만들어 주세요.');
    setStatus(`${route.label} 게임방을 찾았습니다. 이동합니다…`,'good');
    const target=new URL(route.path,location.href);target.searchParams.set('pin',value);if(previewMode)target.searchParams.set('preview','1');
    activeBus.close();activeBus=null;
    setTimeout(()=>location.replace(target.href),180);
  }catch(err){activeBus?.close();activeBus=null;setStatus(err?.message||'게임방에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.','error');$('joinBtn').disabled=false;$('pinInput').focus();}
}

$('pinInput').addEventListener('input',e=>{e.target.value=cleanPin(e.target.value);if($('statusBox').classList.contains('error'))setStatus('PIN을 입력하면 게임을 자동으로 찾아 연결합니다.');});
$('joinForm').addEventListener('submit',e=>{e.preventDefault();enter($('pinInput').value);});
window.addEventListener('beforeunload',()=>activeBus?.close());

const queryPin=cleanPin(entryParams.get('pin'));
if(queryPin){$('pinInput').value=queryPin;enter(queryPin);}else{$('pinInput').focus();}
