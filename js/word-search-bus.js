import { initializeApp,getApps,getApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getAuth,signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import { getDatabase,ref,get,set,update,push,onValue,onChildAdded,remove,serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js';
import { firebaseConfig,isFirebaseConfigured } from './firebase-config.js?v=7.3';

let shared=null;
async function context(){
  if(!isFirebaseConfigured())throw new Error('Firebase 연결 설정이 필요합니다.');
  if(!shared)shared=(async()=>{
    const app=getApps().length?getApp():initializeApp(firebaseConfig);
    const auth=getAuth(app);if(!auth.currentUser)await signInAnonymously(auth);
    return {auth,db:getDatabase(app)};
  })().catch(e=>{shared=null;throw e;});
  return shared;
}
function clean(value){return JSON.parse(JSON.stringify(value));}
export async function createSearchPin(){
  const {db}=await context();
  for(let i=0;i<50;i++){
    const pin=String(Math.floor(100000+Math.random()*900000));
    const s=await get(ref(db,`rooms/${pin}/ownerUid`));
    if(!s.exists())return pin;
  }
  throw new Error('사용 가능한 PIN을 만들지 못했습니다.');
}
export class WordSearchBus{
  constructor(pin,role='player'){
    this.pin=String(pin);this.role=role;this.db=null;this.auth=null;this.uid=null;this.handlers=new Set();this.unsubs=[];this.offset=0;this.inboxReady=false;
  }
  async init(){
    const {db,auth}=await context();this.db=db;this.auth=auth;this.uid=auth.currentUser.uid;
    const off=onValue(ref(db,'.info/serverTimeOffset'),s=>{this.offset=Number(s.val())||0;});this.unsubs.push(off);
    if(this.role==='player'){
      const u=onValue(ref(db,`rooms/${this.pin}/state`),s=>{if(!s.exists())return;const room=s.val();this._emit(room?.status==='closed'?{type:'room-closed'}:{type:'state',payload:{room}});});
      this.unsubs.push(u);
    }
    return this;
  }
  now(){return Date.now()+this.offset;}
  on(fn){this.handlers.add(fn);return()=>this.handlers.delete(fn);}
  _emit(msg){this.handlers.forEach(fn=>{try{fn(msg);}catch(e){console.error(e);}});}
  async createRoom(publicState){
    if(this.role!=='host')throw new Error('호스트 전용 기능입니다.');
    if(!this.db)await this.init();
    const owner=ref(this.db,`rooms/${this.pin}/ownerUid`),existing=await get(owner);
    if(existing.exists())throw new Error('이미 사용 중인 PIN입니다.');
    await set(owner,this.uid);
    await set(ref(this.db,`rooms/${this.pin}/createdAt`),serverTimestamp());
    await set(ref(this.db,`rooms/${this.pin}/state`),clean(publicState));
    await this.attachInbox();
  }
  async attachInbox(){
    if(this.role!=='host'||this.inboxReady)return;
    const u=onChildAdded(ref(this.db,`rooms/${this.pin}/inbox`),async snap=>{
      const msg=snap.val();if(msg)this._emit({...msg,id:snap.key});
      try{await remove(snap.ref);}catch{}
    });
    this.unsubs.push(u);this.inboxReady=true;
  }
  async saveRoom(publicState){
    if(this.role!=='host'||!this.db)return;
    await set(ref(this.db,`rooms/${this.pin}/state`),clean(publicState));
  }
  async loadRoom(){
    if(!this.db)await this.init();
    const s=await get(ref(this.db,`rooms/${this.pin}/state`));return s.exists()?s.val():null;
  }
  async send(type,payload={}){
    if(this.role!=='player')return;
    if(!this.db)await this.init();
    const node=push(ref(this.db,`rooms/${this.pin}/inbox`));
    const fullPayload={...payload,uid:this.uid};
    await set(node,{type,uid:this.uid,payload:clean(fullPayload),at:Date.now()});
  }
  async closeRoom(){
    if(this.role!=='host'||!this.db)return;
    try{await update(ref(this.db,`rooms/${this.pin}/state`),{status:'closed'});}catch{}
  }
  close(){this.unsubs.splice(0).forEach(fn=>{try{fn();}catch{}});this.handlers.clear();}
}
