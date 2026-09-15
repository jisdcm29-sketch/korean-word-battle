import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  getDatabase, ref, get, set, update, push, remove,
  onValue, onChildAdded, onDisconnect, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js';
import { firebaseConfig, isFirebaseConfigured } from '../../js/firebase-config.js?v=7.4';

let ctxPromise = null;
let serverOffset = 0;
let offsetUnsub = null;

async function context(){
  if(!isFirebaseConfigured()) throw new Error('Firebase 설정을 확인할 수 없습니다. 상위 js/firebase-config.js를 확인해 주세요.');
  if(!ctxPromise){
    ctxPromise=(async()=>{
      const app=getApps().length?getApp():initializeApp(firebaseConfig);
      const auth=getAuth(app);
      if(typeof auth.authStateReady==='function') await auth.authStateReady();
      if(!auth.currentUser) await signInAnonymously(auth);
      const db=getDatabase(app);
      if(!offsetUnsub){
        offsetUnsub=onValue(ref(db,'.info/serverTimeOffset'),snap=>{
          serverOffset=Number(snap.val())||0;
        });
      }
      return {app,auth,db};
    })().catch(err=>{ctxPromise=null; throw err;});
  }
  return ctxPromise;
}

export function serverNow(){ return Date.now()+serverOffset; }
export function firebaseReady(){ return isFirebaseConfigured(); }

function safeTeacherPathSegment(value){
  return String(value??'').trim().replace(/[.#$\[\]\/]/g,'_')||'_';
}
function sentenceTeacherStorePath(book,lesson){
  const lessonCode=String(Math.max(1,Number(lesson)||1)).padStart(2,'0');
  return `teacherContent/sentence/v1/${safeTeacherPathSegment(book)}/lesson${lessonCode}`;
}

export async function loadSentenceTeacherStore(book,lesson){
  const {db}=await context();
  const snap=await get(ref(db,sentenceTeacherStorePath(book,lesson)));
  return snap.exists()?snap.val():null;
}
export async function saveSentenceTeacherStore(book,lesson,store){
  const {db,auth}=await context();
  const payload={
    version:2,
    updatedAt:Number(store?.updatedAt)||Date.now(),
    overrides:store?.overrides&&typeof store.overrides==='object'?store.overrides:{},
    customQuestions:Array.isArray(store?.customQuestions)?store.customQuestions:[],
    updatedBy:auth.currentUser?.uid||null,
    firebaseWrittenAt:serverTimestamp()
  };
  await set(ref(db,sentenceTeacherStorePath(book,lesson)),payload);
  return payload;
}

export async function createUniquePin(){
  const {db}=await context();
  for(let i=0;i<50;i++){
    const pin=String(Math.floor(100000+Math.random()*900000));
    const snap=await get(ref(db,`rooms/${pin}/ownerUid`));
    if(!snap.exists()) return pin;
  }
  throw new Error('사용 가능한 PIN을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
}

export class SentenceHostBus{
  constructor(pin){
    this.pin=String(pin);
    this.db=null;
    this.auth=null;
    this.uid=null;
    this.handlers=new Set();
    this.unsubs=[];
    this.writeQueue=Promise.resolve();
    this.closed=false;
    this.disconnectOp=null;
    this.connected=true;
  }
  on(fn){this.handlers.add(fn);return()=>this.handlers.delete(fn);}
  emit(msg){this.handlers.forEach(fn=>fn(msg));}
  now(){return serverNow();}
  async _rearmDisconnectMarker(){
    if(!this.db||this.closed)return;
    const owner=await get(ref(this.db,`rooms/${this.pin}/ownerUid`));
    if(!owner.exists()||owner.val()!==this.uid)return;
    try{if(this.disconnectOp)await this.disconnectOp.cancel();}catch{}
    await update(ref(this.db,`rooms/${this.pin}/state`),{hostDisconnectedAt:null,hostUpdatedAt:serverTimestamp()});
    this.disconnectOp=onDisconnect(ref(this.db,`rooms/${this.pin}/state/hostDisconnectedAt`));
    await this.disconnectOp.set(serverTimestamp());
  }
  async init(){
    const {db,auth}=await context();
    this.db=db;this.auth=auth;this.uid=auth.currentUser.uid;
    const connectedRef=ref(db,'.info/connected');
    const unsub=onValue(connectedRef,snap=>{
      const next=snap.val()===true;
      if(next!==this.connected){this.connected=next;this.emit({type:'connection',connected:next,at:this.now()});}
      if(next&&!this.closed)this._rearmDisconnectMarker().catch(err=>console.warn('문장 배틀 호스트 재연결 복구 실패:',err));
    });
    this.unsubs.push(unsub);
    return this;
  }
  async createRoom(state){
    if(!this.db) await this.init();
    const ownerRef=ref(this.db,`rooms/${this.pin}/ownerUid`);
    const existing=await get(ownerRef);
    if(existing.exists()) throw new Error('이미 사용 중인 PIN입니다.');
    await set(ownerRef,this.uid);
    try{
      await set(ref(this.db,`rooms/${this.pin}/createdAt`),serverTimestamp());
      await set(ref(this.db,`rooms/${this.pin}/state`),{...state,hostDisconnectedAt:null,hostUpdatedAt:serverTimestamp()});
      const inboxRef=ref(this.db,`rooms/${this.pin}/inbox`);
      const unsub=onChildAdded(inboxRef,async snap=>{
        const msg=snap.val();
        if(msg) this.emit({...msg,id:snap.key});
        try{await remove(snap.ref);}catch{}
      });
      this.unsubs.push(unsub);

      // 통신 단절을 게임 종료로 처리하지 않습니다.
      // 서버에는 호스트 연결이 끊긴 시각만 기록합니다.
      await this._rearmDisconnectMarker();
    }catch(err){
      try{await remove(ownerRef);}catch{}
      throw err;
    }
  }
  saveState(state){
    if(!this.db||this.closed) return Promise.resolve();
    const resilientState={...state,hostDisconnectedAt:null,hostUpdatedAt:serverTimestamp()};
    // 사전 다운로드 패키지는 createRoom에서 한 번 저장하고 이후에는 유지합니다.
    delete resilientState.offlinePackage;
    this.writeQueue=this.writeQueue.catch(()=>{}).then(()=>update(ref(this.db,`rooms/${this.pin}/state`),resilientState));
    return this.writeQueue;
  }
  async closeRoom(){
    if(!this.db||this.closed) return;
    this.closed=true;
    try{await this.writeQueue.catch(()=>{});}catch{}
    try{
      await update(ref(this.db,`rooms/${this.pin}/state`),{status:'closed',closedAt:serverTimestamp()});
      await new Promise(resolve=>setTimeout(resolve,500));
    }catch{}
    try{if(this.disconnectOp) await this.disconnectOp.cancel();}catch{}
    for(const path of ['inbox','state','createdAt','ownerUid']){
      try{await remove(ref(this.db,`rooms/${this.pin}/${path}`));}catch{}
    }
    this.close();
  }
  close(){
    try{this.disconnectOp?.cancel?.().catch?.(()=>{});}catch{}
    this.unsubs.forEach(fn=>{try{fn();}catch{}});
    this.unsubs=[];
  }
}

export class SentencePlayerBus{
  constructor(pin){
    this.pin=String(pin);
    this.db=null;
    this.auth=null;
    this.uid=null;
    this.handlers=new Set();
    this.unsubs=[];
    this.connected=true;
    this.latestState=null;
    this.flushingPending=false;
    this.hostDisconnected=false;
    this.offlinePackage=null;
    this.packageCached=false;
  }
  on(fn){this.handlers.add(fn);return()=>this.handlers.delete(fn);}
  emit(msg){this.handlers.forEach(fn=>fn(msg));}
  now(){return serverNow();}
  _domEvent(name,detail={}){try{window.dispatchEvent(new CustomEvent(name,{detail:{pin:this.pin,role:'player',...detail}}));}catch{}}
  _stateKey(){return this.uid?`sentence_room_state_v2_${this.pin}_${this.uid}`:null;}
  _packageKey(){return this.uid?`sentence_room_package_v3_${this.pin}_${this.uid}`:null;}
  _readPackage(){if(this.offlinePackage)return this.offlinePackage;const key=this._packageKey();if(!key)return null;try{const p=JSON.parse(localStorage.getItem(key)||'null');if(p?.version>=3){this.offlinePackage=p;this.packageCached=true;return p;}}catch{}return null;}
  _pendingKey(){return this.uid?`sentence_pending_v2_${this.pin}_${this.uid}`:null;}
  _cacheState(state){
    if(!state)return;this.latestState=state;
    const disconnected=Boolean(state.hostDisconnectedAt);
    if(disconnected!==this.hostDisconnected){this.hostDisconnected=disconnected;this._domEvent('kwb-host-connection',{connected:!disconnected});}
    if(state.offlinePackage?.version>=3){const p=state.offlinePackage;this.offlinePackage=p;if(!this.packageCached){try{const pk=this._packageKey();if(pk)localStorage.setItem(pk,JSON.stringify(p));this.packageCached=true;}catch{}}this._domEvent('kwb-preload',{ready:true,kind:p.kind||'sentence',itemCount:Number(p.questions?.length)||0});}
    const key=this._stateKey();if(!key)return;
    try{const{offlinePackage,...lightState}=state;localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),state:lightState}));}catch{}
  }
  _readCachedState(){
    const key=this._stateKey();if(!key)return null;
    try{const p=JSON.parse(localStorage.getItem(key)||'null');if(!p?.state)return null;if(Date.now()-Number(p.savedAt||0)>30*60*1000){localStorage.removeItem(key);return null;}const pack=this._readPackage();return pack?{...p.state,offlinePackage:pack}:p.state;}catch{return null;}
  }
  _readPending(){
    const key=this._pendingKey();if(!key)return[];
    try{const list=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(list))return[];const fresh=list.filter(x=>x?.id&&Date.now()-Number(x.queuedAt||0)<=10*60*1000);if(fresh.length!==list.length)localStorage.setItem(key,JSON.stringify(fresh));return fresh;}catch{return[];}
  }
  _writePending(list){const key=this._pendingKey();if(!key)return;try{if(list.length)localStorage.setItem(key,JSON.stringify(list));else localStorage.removeItem(key);}catch{}}
  _queue(type,payload={}){
    const at=this.now(),id=`${this.uid||'u'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
    const item={id,type,at,queuedAt:Date.now(),payload:{...payload,uid:this.uid,clientAt:at}};
    const list=this._readPending();list.push(item);this._writePending(list.slice(-80));return item;
  }
  async _deliver(item){
    const msgRef=ref(this.db,`rooms/${this.pin}/inbox/${item.id}`);
    await set(msgRef,{type:item.type,uid:this.uid,payload:item.payload,at:Number(item.at)||this.now(),queuedAt:Number(item.queuedAt)||Date.now()});
  }
  async _flush(){
    if(!this.db||!this.connected||this.flushingPending)return;this.flushingPending=true;
    try{
      let list=this._readPending();
      while(list.length&&this.connected){
        const item=list[0];
        try{await this._deliver(item);list=this._readPending().filter(x=>x.id!==item.id);this._writePending(list);this._domEvent('kwb-delivery',{status:'sent',messageType:item.type});}
        catch(err){console.warn('문장 배틀 대기 제출 전송이 일시 중단되었습니다.',err);break;}
      }
    }finally{this.flushingPending=false;if(this.connected&&this._readPending().length)setTimeout(()=>this._flush().catch(()=>{}),900);}
  }
  async init(){
    const {db,auth}=await context();
    this.db=db;this.auth=auth;this.uid=auth.currentUser.uid;
    const connectedRef=ref(db,'.info/connected');
    const connUnsub=onValue(connectedRef,snap=>{
      const next=snap.val()===true;
      if(next!==this.connected){this.connected=next;this.emit({type:'connection',connected:next,at:this.now()});this._domEvent('kwb-connection',{connected:next});}
      if(next)this._flush().catch(()=>{});
    });
    this.unsubs.push(connUnsub);

    const stateRef=ref(db,`rooms/${this.pin}/state`);
    const unsub=onValue(stateRef,snap=>{
      if(!snap.exists())return;
      const state=snap.val();this._cacheState(state);
      if(state?.status==='closed'){try{const k=this._stateKey(),pk=this._packageKey(),qk=this._pendingKey();if(k)localStorage.removeItem(k);if(pk)localStorage.removeItem(pk);if(qk)localStorage.removeItem(qk);this.offlinePackage=null;this.packageCached=false;}catch{}this.emit({type:'closed'});}
      else this.emit({type:'state',state});
    },err=>{console.warn('문장 배틀 상태 수신이 일시 중단되었습니다. Firebase가 자동 재연결합니다.',err);});
    this.unsubs.push(unsub);
    this._flush().catch(()=>{});
    return this;
  }
  async exists(){
    if(!this.db)await this.init();
    try{
      const snap=await get(ref(this.db,`rooms/${this.pin}/state`));const state=snap.val();
      if(snap.exists())this._cacheState(state);
      return Boolean(snap.exists()&&state?.status!=='closed'&&state?.kind==='sentence-sample');
    }catch(err){
      const state=this._readCachedState();if(state?.status!=='closed'&&state?.kind==='sentence-sample'){this.latestState=state;return true;}throw err;
    }
  }
  async send(type,payload={}){
    if(!this.db)await this.init();
    const resume=this.latestState;
    if(type==='join'&&resume?.status!=='closed'&&resume?.status!=='lobby'&&resume?.players?.[this.uid]){
      setTimeout(()=>this.emit({type:'state',state:resume,resumed:true}),0);return{resumed:true};
    }
    if(type==='leave'&&!this.connected)return{skipped:true};
    const item=this._queue(type,payload);
    if(!this.connected){this._domEvent('kwb-delivery',{status:'queued',messageType:type});return{queued:true,id:item.id};}
    this._flush().catch(()=>{});return{queued:false,id:item.id};
  }
  close(){this.unsubs.forEach(fn=>{try{fn();}catch{}});this.unsubs=[];}
}
