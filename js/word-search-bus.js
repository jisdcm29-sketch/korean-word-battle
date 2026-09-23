import { initializeApp,getApps,getApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getAuth,signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import { getDatabase,ref,get,set,update,push,onValue,onChildAdded,remove,onDisconnect,serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js';
import { firebaseConfig,isFirebaseConfigured } from './firebase-config.js?v=7.3';

const PENDING_MAX_AGE_MS=30*60*1000;
let shared=null;
function registerOfflineWorker(){try{if(!('serviceWorker' in navigator))return;const url=new URL('../sw.js',import.meta.url);navigator.serviceWorker.register(url).catch(()=>{});}catch{}}
function updateNetworkBadge(connected){if(typeof document==='undefined')return;let el=document.querySelector('.kwb-network-badge');if(!el){el=document.createElement('div');el.className='kwb-network-badge';Object.assign(el.style,{position:'fixed',left:'12px',bottom:'10px',zIndex:'99998',padding:'8px 12px',borderRadius:'999px',font:'800 12px/1.25 system-ui,sans-serif',boxShadow:'0 8px 24px rgba(0,0,0,.25)',pointerEvents:'none'});document.body?.appendChild(el);}if(!el)return;if(!connected){el.dataset.offline='1';el.textContent='⚠ 인터넷 연결 끊김 · 게임 계속 진행 · 답안 저장 중';el.style.background='rgba(117,72,0,.94)';el.style.color='#fff2bd';el.style.display='block';el.style.opacity='1';}else{delete el.dataset.offline;el.textContent='✓ 인터넷 연결 복구 · 자동 동기화 중';el.style.background='rgba(5,92,67,.94)';el.style.color='#d7fff1';el.style.display='block';el.style.opacity='1';setTimeout(()=>{if(el&&!el.dataset.offline)el.style.opacity='0';},2400);}}
registerOfflineWorker();

async function context(){
  if(!isFirebaseConfigured())throw new Error('Firebase 연결 설정이 필요합니다.');
  if(!shared)shared=(async()=>{const app=getApps().length?getApp():initializeApp(firebaseConfig);const auth=getAuth(app);if(typeof auth.authStateReady==='function')await auth.authStateReady();if(!auth.currentUser)await signInAnonymously(auth);return {auth,db:getDatabase(app)};})().catch(e=>{shared=null;throw e;});
  return shared;
}
function clean(value){return JSON.parse(JSON.stringify(value));}
export async function createSearchPin(){const {db}=await context();for(let i=0;i<50;i++){const pin=String(Math.floor(100000+Math.random()*900000));const s=await get(ref(db,`rooms/${pin}/ownerUid`));if(!s.exists())return pin;}throw new Error('사용 가능한 PIN을 만들지 못했습니다.');}

export class WordSearchBus{
  constructor(pin,role='player'){
    this.pin=String(pin);this.role=role;this.db=null;this.auth=null;this.uid=null;this.handlers=new Set();this.unsubs=[];this.offset=0;this.inboxReady=false;this.connected=true;this.closed=false;this.connectionReady=false;this.disconnectOp=null;this.latestState=null;this.resumeRoom=null;this.offlinePackage=null;this.flushingPending=false;this.pendingHostState=null;this.hostWriteInFlight=false;this.writeQueue=Promise.resolve();
  }
  now(){return Date.now()+this.offset;}
  on(fn){this.handlers.add(fn);return()=>this.handlers.delete(fn);}
  _emit(msg){this.handlers.forEach(fn=>{try{fn(msg);}catch(e){console.error(e);}});}
  _stateKey(){return this.uid?`kws_room_state_v2_${this.pin}_${this.uid}`:null;}
  _packageKey(){return this.uid?`kws_room_package_v3_${this.pin}_${this.uid}`:null;}
  _pendingKey(){return this.uid?`kws_pending_v2_${this.pin}_${this.uid}`:null;}
  _cacheState(state){if(!state)return;this.latestState=state;if(this.role==='host')return;this.offlinePackage=state.offlinePackage||this.offlinePackage;if(state.offlinePackage){try{localStorage.setItem(this._packageKey(),JSON.stringify(state.offlinePackage));}catch{}}try{const {offlinePackage,...light}=state;localStorage.setItem(this._stateKey(),JSON.stringify({savedAt:Date.now(),state:light}));}catch{}}
  _readCachedState(){try{const v=JSON.parse(localStorage.getItem(this._stateKey())||'null');if(!v?.state||Date.now()-Number(v.savedAt||0)>30*60*1000)return null;let pack=null;try{pack=JSON.parse(localStorage.getItem(this._packageKey())||'null');}catch{}return pack?{...v.state,offlinePackage:pack}:v.state;}catch{return null;}}
  _readPending(){try{const list=JSON.parse(localStorage.getItem(this._pendingKey())||'[]');if(!Array.isArray(list))return[];const fresh=list.filter(x=>x?.id&&Date.now()-Number(x.queuedAt||0)<=PENDING_MAX_AGE_MS);if(fresh.length!==list.length)this._writePending(fresh);return fresh;}catch{return[];}}
  _writePending(list){try{if(list.length)localStorage.setItem(this._pendingKey(),JSON.stringify(list));else localStorage.removeItem(this._pendingKey());}catch{}}
  _queue(type,payload={}){const at=this.now(),item={id:`${this.uid||'u'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`,type,at,queuedAt:Date.now(),payload:{...payload,uid:this.uid,clientAt:at}};const list=this._readPending();list.push(item);this._writePending(list.slice(-500));return item;}
  async _deliver(item){const node=ref(this.db,`rooms/${this.pin}/inbox/${item.id}`);await set(node,{type:item.type,uid:this.uid,payload:item.payload,at:Number(item.at)||this.now(),queuedAt:Number(item.queuedAt)||Date.now()});}
  async _flushPending(){if(this.role==='host'||!this.db||!this.connected||this.flushingPending||this.closed)return;this.flushingPending=true;try{let list=this._readPending();while(list.length&&this.connected&&!this.closed){const item=list[0];try{await this._deliver(item);list=this._readPending().filter(x=>x.id!==item.id);this._writePending(list);}catch{break;}}}finally{this.flushingPending=false;if(this.connected&&this._readPending().length&&!this.closed)setTimeout(()=>this._flushPending().catch(()=>{}),900);}}
  _hostCheckpointKey(){return `kws_host_checkpoint_v1_${this.pin}`;}
  _cacheHostState(state){try{localStorage.setItem(this._hostCheckpointKey(),JSON.stringify({savedAt:Date.now(),state}));}catch{}}
  _flushHostState(){if(this.role!=='host'||!this.db||!this.connected||this.closed||this.hostWriteInFlight||!this.pendingHostState)return Promise.resolve();const state=this.pendingHostState;this.pendingHostState=null;this.hostWriteInFlight=true;const task=update(ref(this.db,`rooms/${this.pin}/state`),state).catch(err=>{if(!this.pendingHostState)this.pendingHostState=state;console.warn('단어 찾기 상태 동기화 대기:',err);}).finally(()=>{this.hostWriteInFlight=false;if(this.connected&&this.pendingHostState&&!this.closed)setTimeout(()=>this._flushHostState(),0);});this.writeQueue=task;return task;}
  async _rearmHostMarker(){if(this.role!=='host'||!this.db||this.closed)return;try{if(this.disconnectOp)await this.disconnectOp.cancel();}catch{}await update(ref(this.db,`rooms/${this.pin}/state`),{hostDisconnectedAt:null,hostUpdatedAt:serverTimestamp()});const op=onDisconnect(ref(this.db,`rooms/${this.pin}/state/hostDisconnectedAt`));await op.set(serverTimestamp());this.disconnectOp=op;}
  _watchConnection(){if(!this.db||this.connectionReady)return;const u=onValue(ref(this.db,'.info/connected'),snap=>{const connected=snap.val()===true,changed=connected!==this.connected;this.connected=connected;if(changed||!connected)updateNetworkBadge(connected);if(changed)this._emit({type:'connection',connected,at:this.now()});if(connected&&this.role==='host'&&!this.closed)this.attachInbox().then(()=>this._rearmHostMarker()).then(()=>this._flushHostState()).catch(()=>{});if(connected&&this.role!=='host'&&!this.closed)this._flushPending().catch(()=>{});});this.unsubs.push(u);this.connectionReady=true;}
  async init(){const {db,auth}=await context();this.db=db;this.auth=auth;this.uid=auth.currentUser.uid;const off=onValue(ref(db,'.info/serverTimeOffset'),s=>{this.offset=Number(s.val())||0;});this.unsubs.push(off);this._watchConnection();if(this.role==='player'){const u=onValue(ref(db,`rooms/${this.pin}/state`),s=>{if(!s.exists())return;const room=s.val();this._cacheState(room);this._emit(room?.status==='closed'?{type:'room-closed'}:{type:'state',payload:{room}});},()=>{});this.unsubs.push(u);this._flushPending().catch(()=>{});}return this;}
  async createRoom(publicState){if(this.role!=='host')throw new Error('호스트 전용 기능입니다.');if(!this.db)await this.init();const owner=ref(this.db,`rooms/${this.pin}/ownerUid`),existing=await get(owner);if(existing.exists())throw new Error('이미 사용 중인 PIN입니다.');await set(owner,this.uid);await set(ref(this.db,`rooms/${this.pin}/createdAt`),serverTimestamp());const state={...clean(publicState),hostDisconnectedAt:null,hostUpdatedAt:serverTimestamp()};await set(ref(this.db,`rooms/${this.pin}/state`),state);this._cacheHostState(state);await this.attachInbox();await this._rearmHostMarker();}
  async attachInbox(){
    if(this.role!=='host'||this.inboxReady||!this.db||this.closed)return false;
    // Do not attach before createRoom() has established ownership. Firebase rules only
    // allow the room owner to read the inbox; attaching too early permanently cancels
    // the listener with PERMISSION_DENIED and students remain stuck at '입장 요청 중'.
    const owner=await get(ref(this.db,`rooms/${this.pin}/ownerUid`));
    if(!owner.exists()||owner.val()!==this.uid)return false;
    const u=onChildAdded(
      ref(this.db,`rooms/${this.pin}/inbox`),
      async snap=>{const msg=snap.val();if(msg)this._emit({...msg,id:snap.key});try{await remove(snap.ref);}catch{}},
      err=>{console.warn('단어 찾기 학생 메시지 수신기 재연결 대기:',err);this.inboxReady=false;}
    );
    this.unsubs.push(u);this.inboxReady=true;return true;
  }
  saveRoom(publicState){if(this.role!=='host'||!this.db||this.closed)return Promise.resolve();const state=clean(publicState);delete state.offlinePackage;state.hostDisconnectedAt=null;state.hostUpdatedAt=serverTimestamp();this._cacheHostState(state);this.pendingHostState=state;if(this.connected)this._flushHostState().catch(()=>{});return Promise.resolve({queued:!this.connected});}
  async loadRoom(){if(!this.db)await this.init();let state=null;try{const s=await get(ref(this.db,`rooms/${this.pin}/state`));if(s.exists())state=s.val();}catch(err){state=this._readCachedState();if(!state)throw err;}if(!state)return null;this._cacheState(state);if(this.role!=='host'&&state.status!=='closed'&&state.status!=='lobby'&&state.players?.[this.uid]){this.resumeRoom=state;return {...state,status:'lobby',__resumeStatus:state.status};}return state;}
  async send(type,payload={}){if(this.role==='host')return;if(!this.db)await this.init();const resume=this.resumeRoom||this.latestState;if(type==='join'&&resume?.status!=='closed'&&resume?.status!=='lobby'&&resume?.players?.[this.uid]){this.resumeRoom=null;setTimeout(()=>this._emit({type:'state',payload:{room:resume},resumed:true}),0);return{resumed:true};}const item=this._queue(type,payload);if(!this.connected)return{queued:true,id:item.id};this._flushPending().catch(()=>{});return{queued:false,id:item.id};}
  async closeRoom(){if(this.role!=='host'||!this.db||this.closed)return;this.closed=true;try{await update(ref(this.db,`rooms/${this.pin}/state`),{status:'closed',closedAt:serverTimestamp()});}catch{}try{await this.disconnectOp?.cancel?.();}catch{}}
  close(){try{this.disconnectOp?.cancel?.().catch?.(()=>{});}catch{}this.unsubs.splice(0).forEach(fn=>{try{fn();}catch{}});this.handlers.clear();this.connectionReady=false;}
}
