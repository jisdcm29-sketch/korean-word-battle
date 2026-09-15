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
  async init(){
    const {db,auth}=await context();
    this.db=db;this.auth=auth;this.uid=auth.currentUser.uid;
    const connectedRef=ref(db,'.info/connected');
    const unsub=onValue(connectedRef,snap=>{
      const next=snap.val()===true;
      if(next!==this.connected){this.connected=next;this.emit({type:'connection',connected:next,at:this.now()});}
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
      this.disconnectOp=onDisconnect(ref(this.db,`rooms/${this.pin}/state/hostDisconnectedAt`));
      await this.disconnectOp.set(serverTimestamp());
    }catch(err){
      try{await remove(ownerRef);}catch{}
      throw err;
    }
  }
  saveState(state){
    if(!this.db||this.closed) return Promise.resolve();
    const resilientState={...state,hostDisconnectedAt:null,hostUpdatedAt:serverTimestamp()};
    this.writeQueue=this.writeQueue.catch(()=>{}).then(()=>set(ref(this.db,`rooms/${this.pin}/state`),resilientState));
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
  }
  on(fn){this.handlers.add(fn);return()=>this.handlers.delete(fn);}
  emit(msg){this.handlers.forEach(fn=>fn(msg));}
  now(){return serverNow();}
  async init(){
    const {db,auth}=await context();
    this.db=db;this.auth=auth;this.uid=auth.currentUser.uid;
    const connectedRef=ref(db,'.info/connected');
    const connUnsub=onValue(connectedRef,snap=>{
      const next=snap.val()===true;
      if(next!==this.connected){this.connected=next;this.emit({type:'connection',connected:next,at:this.now()});}
    });
    this.unsubs.push(connUnsub);

    const stateRef=ref(db,`rooms/${this.pin}/state`);
    const unsub=onValue(stateRef,snap=>{
      // 일시적인 연결 문제나 캐시 전환 중 state가 비어 보여도 즉시 방 종료로 간주하지 않습니다.
      if(!snap.exists()) return;
      const state=snap.val();
      if(state?.status==='closed') this.emit({type:'closed'});
      else this.emit({type:'state',state});
    },err=>{
      console.warn('문장 배틀 상태 수신이 일시 중단되었습니다. Firebase가 자동 재연결합니다.',err);
    });
    this.unsubs.push(unsub);
    return this;
  }
  async exists(){
    if(!this.db) await this.init();
    const snap=await get(ref(this.db,`rooms/${this.pin}/state`));
    const state=snap.val();
    return Boolean(snap.exists()&&state?.status!=='closed'&&state?.kind==='sentence-sample');
  }
  async send(type,payload={}){
    if(!this.db) await this.init();
    const msgRef=push(ref(this.db,`rooms/${this.pin}/inbox`));
    await set(msgRef,{type,uid:this.uid,payload:{...payload,uid:this.uid},at:serverTimestamp()});
  }
  close(){
    this.unsubs.forEach(fn=>{try{fn();}catch{}});
    this.unsubs=[];
  }
}
