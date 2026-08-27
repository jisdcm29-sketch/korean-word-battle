import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  getDatabase, ref, get, set, update, push, remove,
  onValue, onChildAdded, onDisconnect, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js?v=7.3';

let contextPromise = null;
let serverOffset = 0;
let offsetUnsubscribe = null;

function configError() {
  return new Error('Firebase 연결 정보가 아직 설정되지 않았습니다. js/firebase-config.js에 Firebase 웹앱 설정값을 입력해 주세요.');
}

async function waitForInitialAuthState(auth) {
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
    return auth.currentUser;
  }
  return await new Promise((resolve, reject) => {
    let unsub = null;
    unsub = onAuthStateChanged(auth, (user) => {
      if (unsub) unsub();
      resolve(user || null);
    }, (err) => {
      if (unsub) unsub();
      reject(err);
    });
  });
}

async function firebaseContext() {
  if (!isFirebaseConfigured()) throw configError();
  if (!contextPromise) {
    contextPromise = (async () => {
      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      const auth = getAuth(app);
      // 새 탭이 열릴 때 기존 익명 로그인 복원이 끝나기 전에
      // 또 signInAnonymously()를 호출하면 호스트의 UID가 바뀔 수 있습니다.
      // 먼저 기존 인증 상태 복원을 기다린 뒤, 정말 사용자 정보가 없을 때만 익명 로그인합니다.
      await waitForInitialAuthState(auth);
      if (!auth.currentUser) await signInAnonymously(auth);
      const db = getDatabase(app);
      if (!offsetUnsubscribe) {
        offsetUnsubscribe = onValue(ref(db, '.info/serverTimeOffset'), (snapshot) => {
          serverOffset = Number(snapshot.val()) || 0;
        });
      }
      return { app, auth, db };
    })().catch((err) => {
      contextPromise = null;
      throw err;
    });
  }
  return contextPromise;
}

export function firebaseNow() {
  return Date.now() + serverOffset;
}

export function publicRoomState(room) {
  const q = room.quiz?.questions?.[room.questionIndex] || null;
  return {
    pin: room.pin,
    status: room.status,
    config: {
      timeLimit: room.config.timeLimit,
      questionCount: room.config.questionCount,
      blindMode: room.config.blindMode
    },
    players: Object.fromEntries(Object.entries(room.players || {}).map(([uid,p]) => [uid, {
      uid, name:p.name, avatar:p.avatar, score:p.score
    }])),
    questionIndex: room.questionIndex,
    questionTotal: room.quiz?.questions?.length || 0,
    questionStartAt: room.questionStartAt || 0,
    questionEndAt: room.questionEndAt || 0,
    countdownEndAt: room.countdownEndAt || 0,
    resultEndAt: room.resultEndAt || 0,
    currentQuestion: q ? { id:q.id, direction:q.direction, prompt:q.prompt, options:q.options } : null,
    answeredUids: Object.keys(room.questionResults || {}),
    myResults: room.questionResults || {},
    revealAnswer: room.status === 'result' && q ? q.answer : null,
    finishedAt: room.finishedAt || 0
  };
}

export async function createUniqueFirebasePin() {
  const { db } = await firebaseContext();
  for (let i = 0; i < 40; i++) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const snapshot = await get(ref(db, `rooms/${pin}/ownerUid`));
    if (!snapshot.exists()) return pin;
  }
  throw new Error('사용 가능한 게임 PIN을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
}

export class FirebaseBus {
  constructor(pin, role = 'player') {
    this.pin = String(pin);
    this.role = role;
    this.mode = 'firebase';
    this.handlers = new Set();
    this.unsubscribers = [];
    this.db = null;
    this.auth = null;
    this.uid = null;
    this.writeQueue = Promise.resolve();
    this.closed = false;
    this.seen = new Set();
  }

  on(fn) {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  _dispatch(msg) {
    if (!msg) return;
    const key = msg.id || `${msg.type || 'event'}-${msg.at || ''}`;
    if (key && this.seen.has(key)) return;
    if (key) {
      this.seen.add(key);
      if (this.seen.size > 500) this.seen.clear();
    }
    this.handlers.forEach((fn) => fn(msg));
  }

  now() {
    return firebaseNow();
  }

  async _attachHostInboxListener() {
    if (this.role !== 'host' || !this.db || this.hostInboxAttached) return;

    // IMPORTANT: Realtime Database security rules allow the host to read inbox
    // only after rooms/{pin}/ownerUid has been created. If the listener is
    // attached before ownerUid exists, Firebase rejects the listener once and
    // it will not automatically recover later. Therefore attach it only after
    // createRoom() has written ownerUid/state successfully.
    const ownerSnapshot = await get(ref(this.db, `rooms/${this.pin}/ownerUid`));
    if (!ownerSnapshot.exists() || ownerSnapshot.val() !== this.uid) {
      throw new Error('게임방 소유자 확인에 실패했습니다. 새 방을 다시 만들어 주세요.');
    }

    const inboxRef = ref(this.db, `rooms/${this.pin}/inbox`);
    const unsub = onChildAdded(
      inboxRef,
      async (snapshot) => {
        const msg = snapshot.val();
        if (!msg) return;
        this._dispatch({ ...msg, id: snapshot.key });
        try { await remove(snapshot.ref); } catch (err) {
          console.warn('Firebase inbox cleanup failed:', err);
        }
      },
      (err) => {
        console.error('Firebase host inbox listener failed:', err);
        this.hostInboxAttached = false;
      }
    );
    this.unsubscribers.push(unsub);
    this.hostInboxAttached = true;
  }

  async init() {
    const { db, auth } = await firebaseContext();
    this.db = db;
    this.auth = auth;
    this.uid = auth.currentUser.uid;

    if (this.role !== 'host') {
      const stateRef = ref(db, `rooms/${this.pin}/state`);
      let hadState = false;
      const unsub = onValue(stateRef, (snapshot) => {
        if (snapshot.exists()) {
          hadState = true;
          const state = snapshot.val();
          if (state?.status === 'closed') {
            this._dispatch({ type:'room-closed', at:this.now() });
          } else {
            this._dispatch({ type:'state', payload:{ room:state }, at:this.now() });
          }
        } else if (hadState) {
          this._dispatch({ type:'room-closed', at:this.now() });
        }
      });
      this.unsubscribers.push(unsub);
    }
    return this;
  }

  async exists() {
    if (!this.db) await this.init();
    const snapshot = await get(ref(this.db, `rooms/${this.pin}/state`));
    return snapshot.exists() && snapshot.val()?.status !== 'closed';
  }

  async loadRoom() {
    if (!this.db) await this.init();
    const snapshot = await get(ref(this.db, `rooms/${this.pin}/state`));
    return snapshot.exists() ? snapshot.val() : null;
  }

  async createRoom(room) {
    if (this.role !== 'host') throw new Error('호스트만 방을 만들 수 있습니다.');
    if (!this.db) await this.init();

    const ownerRef = ref(this.db, `rooms/${this.pin}/ownerUid`);
    const currentOwner = await get(ownerRef);
    if (currentOwner.exists()) throw new Error('이미 사용 중인 PIN입니다. 다시 방을 만들어 주세요.');

    // 보안 규칙이 ownerUid 생성 시 기존 값이 없어야만 허용하도록 구성되어 있습니다.
    await set(ownerRef, this.uid);
    try {
      await set(ref(this.db, `rooms/${this.pin}/createdAt`), serverTimestamp());
      await set(ref(this.db, `rooms/${this.pin}/state`), publicRoomState(room));
      await this._attachHostInboxListener();
      const disconnectOp = onDisconnect(ref(this.db, `rooms/${this.pin}/state/status`));
      await disconnectOp.set('closed');
      this.disconnectOp = disconnectOp;
    } catch (e) {
      try { await remove(ownerRef); } catch {}
      throw e;
    }
  }

  saveRoom(room) {
    if (!this.db || this.closed) return Promise.resolve();
    const state = publicRoomState(room);
    this.writeQueue = this.writeQueue
      .catch(() => {})
      .then(() => set(ref(this.db, `rooms/${this.pin}/state`), state));
    return this.writeQueue;
  }

  async send(type, payload = {}) {
    if (!this.db) await this.init();
    if (this.role === 'host') return;
    const cleanPayload = { ...payload, uid: this.uid };
    const msgRef = push(ref(this.db, `rooms/${this.pin}/inbox`));
    await set(msgRef, {
      type,
      uid: this.uid,
      payload: cleanPayload,
      at: serverTimestamp()
    });
  }

  async removeRoom() {
    if (!this.db || this.role !== 'host' || this.closed) return;
    this.closed = true;
    try { await this.writeQueue.catch(() => {}); } catch {}
    try {
      await update(ref(this.db, `rooms/${this.pin}/state`), { status:'closed', closedAt:serverTimestamp() });
      await new Promise((resolve) => setTimeout(resolve, 350));
    } catch {}
    try { if (this.disconnectOp) await this.disconnectOp.cancel(); } catch {}
    // ownerUid는 마지막에 지웁니다. 다른 경로의 쓰기 권한이 ownerUid를 기준으로 하기 때문입니다.
    for (const path of ['inbox', 'state', 'createdAt', 'ownerUid']) {
      try { await remove(ref(this.db, `rooms/${this.pin}/${path}`)); } catch {}
    }
  }

  close() {
    this.unsubscribers.forEach((unsub) => { try { unsub(); } catch {} });
    this.unsubscribers = [];
    this.hostInboxAttached = false;
    this.handlers.clear();
  }
}

export { isFirebaseConfigured };
