import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  getDatabase, ref, get, set, update, push, remove,
  onValue, onChildAdded, onDisconnect, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js?v=7.3';

export { isFirebaseConfigured };

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

const VOCABULARY_TEACHER_STORE_PATH = 'teacherContent/vocabulary/v1';

export async function loadVocabularyTeacherStore() {
  const { db } = await firebaseContext();
  const snapshot = await get(ref(db, VOCABULARY_TEACHER_STORE_PATH));
  return snapshot.exists() ? snapshot.val() : null;
}

export async function saveVocabularyTeacherStore(store) {
  const { db, auth } = await firebaseContext();
  const payload = {
    version: 1,
    updatedAt: Number(store?.updatedAt) || Date.now(),
    overrides: store?.overrides && typeof store.overrides === 'object' ? store.overrides : {},
    updatedBy: auth.currentUser?.uid || null,
    firebaseWrittenAt: serverTimestamp()
  };
  await set(ref(db, VOCABULARY_TEACHER_STORE_PATH), payload);
  return payload;
}

function phase3HashSeed(value) {
  let h = 2166136261;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function phase3ShuffleTokens(tokens, seedText) {
  const out = (tokens || []).map((t) => [String(t[0]), String(t[1])]);
  let seed = phase3HashSeed(seedText) || 1;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function phase3PublicWordQuestion(q) {
  return q ? { id:q.id, direction:q.direction, prompt:q.prompt, options:[...(q.options || [])] } : null;
}

function phase3PublicMatchingRound(r) {
  if (!r) return null;
  return {
    id:r.id,
    number:r.number,
    cards:(r.cards || []).map((card) => ({ id:card.id, pairId:card.pairId, lang:card.lang, text:card.text })),
    pairCount:(r.pairs || []).length,
    vocabulary:(r.pairs || []).map((pair) => ({ ko:pair.ko, mn:pair.mn }))
  };
}

function phase3OfflinePackage(room) {
  const gameType = room?.config?.gameType;
  if (gameType === 'combined') {
    return {
      version:3,
      kind:'combined',
      wordQuestions:(room.quiz?.questions || []).map(phase3PublicWordQuestion).filter(Boolean),
      matchingRounds:(room.matching?.rounds || []).map(phase3PublicMatchingRound).filter(Boolean),
      sentenceQuestions:(room.sentenceSet || []).map((q, i) => ({
        id:q.id,
        tokens:phase3ShuffleTokens(q.tokens || [], `${room.pin}:${q.id}:${i}`)
      })),
      timing:{ transitionMs:2450, firstCountdownMs:3000, nextCountdownMs:1600, unitStartDelayMs:150, resultMs:2500 }
    };
  }
  if (gameType === 'memory-pairs') {
    return {
      version:3,
      kind:'memory',
      rounds:(room.memory?.rounds || []).map(phase3PublicMatchingRound).filter(Boolean),
      timing:{ initialCountdownMs:3200, previewMs:Number(room.config?.previewTime || 0) * 1000, roundStartDelayMs:150, resultMs:3000 }
    };
  }
  if (gameType === 'matching-pairs') {
    return {
      version:3,
      kind:'matching',
      rounds:(room.matching?.rounds || []).map(phase3PublicMatchingRound).filter(Boolean),
      timing:{ initialCountdownMs:3200, roundStartDelayMs:260, resultMs:2800 }
    };
  }
  if (room?.quiz?.questions) {
    return {
      version:3,
      kind:'word',
      questions:(room.quiz.questions || []).map(phase3PublicWordQuestion).filter(Boolean),
      timing:{ initialCountdownMs:3200, questionStartDelayMs:250, resultMs:1900 }
    };
  }
  return null;
}

export function publicRoomState(room) {
  if (room?.config?.gameType === 'combined') {
    const blind = Boolean(room.blindActive) && room.status !== 'finished';
    const stageIndex = Number(room.stageIndex ?? -1);
    const stageType = ['word','matching','sentence'][stageIndex] || null;
    const players = Object.fromEntries(Object.entries(room.players || {}).map(([uid, p]) => [uid, {
      uid,
      name: p.name,
      avatar: p.avatar,
      score: blind ? null : (Number(p.score) || 0),
      scores: blind ? null : {
        word: Math.round(Number(p.scores?.word) || 0),
        matching: Math.round(Number(p.scores?.matching) || 0),
        sentence: Math.round(Number(p.scores?.sentence) || 0)
      },
      matchedPairIds: Array.isArray(p.matchedPairIds) ? p.matchedPairIds : [],
      matchingMistakes: Number(p.matchingMistakes) || 0,
      matchingCombo: Number(p.matchingCombo) || 0
    }]));

    let currentQuestion = null;
    let currentRound = null;
    let revealAnswer = null;
    let revealSentence = null;
    if (stageType === 'word' && room.currentWordQuestion) {
      const q = room.currentWordQuestion;
      currentQuestion = { id:q.id, direction:q.direction, prompt:q.prompt, options:q.options };
      if (room.status === 'result') revealAnswer = q.answer || null;
    }
    if (stageType === 'matching' && room.currentMatchingRound) {
      const r = room.currentMatchingRound;
      currentRound = {
        id: r.id,
        number: r.number,
        cards: (r.cards || []).map(card => ({ id:card.id, pairId:card.pairId, lang:card.lang, text:card.text })),
        pairCount: (r.pairs || []).length
      };
    }
    if (stageType === 'sentence' && room.currentSentenceQuestion) {
      const q = room.currentSentenceQuestion;
      currentQuestion = {
        id: q.id,
        tokens: (q.shuffledTokens || q.tokens || []).map(t => [String(t[0]), String(t[1])])
      };
      if (room.status === 'result') revealSentence = q.displaySentence || null;
    }

    return {
      pin: room.pin,
      title: room.title || '종합 배틀',
      status: room.status,
      config: {
        gameType: 'combined',
        wordCount: Number(room.config.wordCount) || 5,
        wordTime: Number(room.config.wordTime) || 10,
        matchRounds: Number(room.config.matchRounds) || 1,
        pairsPerRound: Number(room.config.pairsPerRound) || 6,
        matchTime: Number(room.config.matchTime) || 45,
        sentenceCount: Number(room.config.sentenceCount) || 5,
        sentenceTime: Number(room.config.sentenceTime) || 20,
        blindAt: Number(room.config.blindAt) || 0.70
      },
      players,
      stageIndex,
      stageType,
      unitIndex: Number(room.unitIndex ?? -1),
      unitTotal: Number(room.unitTotal) || 0,
      completedSteps: Number(room.completedSteps) || 0,
      totalSteps: Number(room.totalSteps) || 1,
      blindActive: blind,
      countdownEndAt: Number(room.countdownEndAt) || 0,
      transitionEndAt: Number(room.transitionEndAt) || 0,
      unitStartAt: Number(room.unitStartAt) || 0,
      unitEndAt: Number(room.unitEndAt) || 0,
      resultEndAt: Number(room.resultEndAt) || 0,
      currentQuestion,
      currentRound,
      answeredUids: Object.keys(room.unitResults || {}),
      unitResults: room.unitResults || {},
      revealAnswer,
      revealSentence,
      luckyAward: room.luckyAward || null,
      finishedAt: Number(room.finishedAt) || 0,
      offlinePackage: phase3OfflinePackage(room)
    };
  }

  if (room?.config?.gameType === 'memory-pairs') {
    const currentRound = room.memory?.rounds?.[room.roundIndex] || null;
    const blind = Boolean(room.blindActive) && room.status !== 'finished';
    return {
      pin: room.pin,
      title: room.title || '한·몽 기억력 배틀',
      status: room.status,
      config: {
        gameType: 'memory-pairs',
        roundTime: Number(room.config.roundTime) || 60,
        roundCount: Number(room.config.roundCount) || room.memory?.roundCount || 1,
        pairsPerRound: Number(room.config.pairsPerRound) || room.memory?.pairsPerRound || 6,
        previewTime: Number(room.config.previewTime) || 0,
        blindAt: 0.70
      },
      players: Object.fromEntries(Object.entries(room.players || {}).map(([uid, p]) => [uid, {
        uid,
        name: p.name,
        avatar: p.avatar,
        score: blind ? null : (Number(p.score) || 0),
        matchedPairIds: Array.isArray(p.matchedPairIds) ? p.matchedPairIds : [],
        matchedCount: Number(p.matchedCount) || 0,
        mistakes: Number(p.mistakes) || 0,
        totalMistakes: Number(p.totalMistakes) || 0,
        combo: Number(p.combo) || 0,
        missStreak: Number(p.missStreak) || 0,
        roundFinishedAt: Number(p.roundFinishedAt) || 0,
        completionRank: Number(p.completionRank) || 0,
        lastGain: blind ? 0 : (Number(p.lastGain) || 0),
        lastGainAt: Number(p.lastGainAt) || 0
      }])),
      roundIndex: Number(room.roundIndex) || 0,
      roundTotal: Number(room.memory?.roundCount || room.config.roundCount || 1),
      previewEndAt: Number(room.previewEndAt) || 0,
      roundStartAt: Number(room.roundStartAt) || 0,
      roundEndAt: Number(room.roundEndAt) || 0,
      countdownEndAt: Number(room.countdownEndAt) || 0,
      roundResultEndAt: Number(room.roundResultEndAt) || 0,
      currentRound: currentRound ? {
        id: currentRound.id,
        number: currentRound.number,
        cards: (currentRound.cards || []).map((card) => ({
          id: card.id,
          pairId: card.pairId,
          lang: card.lang,
          text: card.text
        })),
        vocabulary: (currentRound.pairs || []).map((pair) => ({ ko: pair.ko, mn: pair.mn }))
      } : null,
      blindActive: blind,
      luckyAward: room.luckyAward || null,
      finishedAt: Number(room.finishedAt) || 0,
      offlinePackage: phase3OfflinePackage(room)
    };
  }

  if (room?.config?.gameType === 'matching-pairs') {
    const currentRound = room.matching?.rounds?.[room.roundIndex] || null;
    const blind = Boolean(room.blindActive) && room.status !== 'finished';
    return {
      pin: room.pin,
      title: room.title || '한·몽 카드 매칭',
      status: room.status,
      config: {
        gameType: 'matching-pairs',
        roundTime: Number(room.config.roundTime) || 45,
        roundCount: Number(room.config.roundCount) || room.matching?.roundCount || 1,
        pairsPerRound: Number(room.config.pairsPerRound) || room.matching?.pairsPerRound || 6,
        blindAt: 0.70
      },
      players: Object.fromEntries(Object.entries(room.players || {}).map(([uid, p]) => [uid, {
        uid,
        name: p.name,
        avatar: p.avatar,
        score: blind ? null : (Number(p.score) || 0),
        matchedPairIds: Array.isArray(p.matchedPairIds) ? p.matchedPairIds : [],
        matchedCount: Number(p.matchedCount) || 0,
        mistakes: Number(p.mistakes) || 0,
        combo: Number(p.combo) || 0,
        roundFinishedAt: Number(p.roundFinishedAt) || 0,
        lastGain: blind ? 0 : (Number(p.lastGain) || 0),
        lastGainAt: Number(p.lastGainAt) || 0
      }])),
      roundIndex: Number(room.roundIndex) || 0,
      roundTotal: Number(room.matching?.roundCount || room.config.roundCount || 1),
      roundStartAt: Number(room.roundStartAt) || 0,
      roundEndAt: Number(room.roundEndAt) || 0,
      countdownEndAt: Number(room.countdownEndAt) || 0,
      roundResultEndAt: Number(room.roundResultEndAt) || 0,
      currentRound: currentRound ? {
        id: currentRound.id,
        number: currentRound.number,
        cards: (currentRound.cards || []).map((card) => ({
          id: card.id,
          pairId: card.pairId,
          lang: card.lang,
          text: card.text
        })),
        vocabulary: (currentRound.pairs || []).map((pair) => ({ ko: pair.ko, mn: pair.mn }))
      } : null,
      blindActive: blind,
      luckyAward: room.luckyAward || null,
      finishedAt: Number(room.finishedAt) || 0,
      offlinePackage: phase3OfflinePackage(room)
    };
  }

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
    luckyAward: room.luckyAward || null,
    finishedAt: room.finishedAt || 0,
    offlinePackage: phase3OfflinePackage(room)
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
    this.hostInboxAttached = false;
    this.disconnectOp = null;
    this.connected = true;
    this.connectionListenerAttached = false;
    this.latestState = null;
    this.resumeRoom = null;
    this.flushingPending = false;
    this.hostDisconnected = false;
    this.offlinePackage = null;
    this.packageCached = false;
  }

  on(fn) {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  _dispatch(msg) {
    if (!msg) return;
    const key = msg.id || null;
    if (key && this.seen.has(key)) return;
    if (key) {
      this.seen.add(key);
      if (this.seen.size > 500) this.seen.clear();
    }
    this.handlers.forEach((fn) => fn(msg));
  }

  _domEvent(name, detail = {}) {
    try {
      if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent(name, { detail:{ pin:this.pin, role:this.role, ...detail } }));
      }
    } catch {}
  }

  now() {
    return firebaseNow();
  }

  _stateCacheKey() {
    return this.uid ? `kwb_room_state_v2_${this.pin}_${this.uid}` : null;
  }

  _packageCacheKey() {
    return this.uid ? `kwb_room_package_v3_${this.pin}_${this.uid}` : null;
  }

  _readCachedPackage() {
    if (this.offlinePackage) return this.offlinePackage;
    const key = this._packageCacheKey();
    if (!key) return null;
    try {
      const pack = JSON.parse(localStorage.getItem(key) || 'null');
      if (pack?.version >= 3) { this.offlinePackage = pack; this.packageCached = true; return pack; }
    } catch {}
    return null;
  }

  _pendingKey() {
    return this.uid ? `kwb_pending_v2_${this.pin}_${this.uid}` : null;
  }

  _cacheState(state) {
    if (!state) return;
    this.latestState = state;
    if (this.role !== 'host') {
      const disconnected = Boolean(state.hostDisconnectedAt);
      if (disconnected !== this.hostDisconnected) {
        this.hostDisconnected = disconnected;
        this._domEvent('kwb-host-connection', { connected:!disconnected });
      }
      if (state.offlinePackage?.version >= 3) {
        const pack = state.offlinePackage;
        const itemCount = Number(pack.questions?.length || pack.rounds?.length || 0)
          + Number(pack.wordQuestions?.length || 0)
          + Number(pack.matchingRounds?.length || 0)
          + Number(pack.sentenceQuestions?.length || 0);
        this._domEvent('kwb-preload', { ready:true, kind:pack.kind || 'game', itemCount });
      }
    }
    if (this.role === 'host') return;
    if (state.offlinePackage?.version >= 3) {
      this.offlinePackage = state.offlinePackage;
      if (!this.packageCached) {
        try { const pk=this._packageCacheKey(); if(pk)localStorage.setItem(pk,JSON.stringify(state.offlinePackage)); this.packageCached=true; } catch {}
      }
    }
    const key = this._stateCacheKey();
    if (!key) return;
    try {
      const { offlinePackage, ...lightState } = state;
      localStorage.setItem(key, JSON.stringify({ savedAt:Date.now(), state:lightState }));
    } catch {}
  }

  _readCachedState() {
    const key = this._stateCacheKey();
    if (!key) return null;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      if (!parsed?.state) return null;
      if (Date.now() - Number(parsed.savedAt || 0) > 30 * 60 * 1000) {
        localStorage.removeItem(key);
        return null;
      }
      const pack = this._readCachedPackage();
      return pack ? { ...parsed.state, offlinePackage:pack } : parsed.state;
    } catch {
      return null;
    }
  }

  _clearPlayerCache() {
    if (this.role === 'host') return;
    try {
      const stateKey = this._stateCacheKey();
      const pendingKey = this._pendingKey();
      const packageKey = this._packageCacheKey();
      if (stateKey) localStorage.removeItem(stateKey);
      if (pendingKey) localStorage.removeItem(pendingKey);
      if (packageKey) localStorage.removeItem(packageKey);
      this.offlinePackage=null;this.packageCached=false;
    } catch {}
  }

  _readPending() {
    const key = this._pendingKey();
    if (!key) return [];
    try {
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(list)) return [];
      const fresh = list.filter((item) => item?.id && Date.now() - Number(item.queuedAt || 0) <= 10 * 60 * 1000);
      if (fresh.length !== list.length) localStorage.setItem(key, JSON.stringify(fresh));
      return fresh;
    } catch {
      return [];
    }
  }

  _writePending(list) {
    const key = this._pendingKey();
    if (!key) return;
    try {
      if (list.length) localStorage.setItem(key, JSON.stringify(list));
      else localStorage.removeItem(key);
    } catch {}
  }

  _queueMessage(type, payload = {}) {
    const at = this.now();
    const id = `${this.uid || 'u'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
    const item = {
      id,
      type,
      at,
      queuedAt: Date.now(),
      payload: { ...payload, uid:this.uid, clientAt:at }
    };
    const list = this._readPending();
    list.push(item);
    this._writePending(list.slice(-80));
    return item;
  }

  async _deliverPendingItem(item) {
    const msgRef = ref(this.db, `rooms/${this.pin}/inbox/${item.id}`);
    await set(msgRef, {
      type:item.type,
      uid:this.uid,
      payload:item.payload,
      // Phase 2: 연결이 끊긴 동안 눌렀던 시각을 보존합니다.
      // 호스트의 기존 채점 로직은 msg.at을 사용하므로 짧은 단절 후에도 원래 제출 시각으로 처리됩니다.
      at:Number(item.at) || this.now(),
      queuedAt:Number(item.queuedAt) || Date.now()
    });
  }

  async _flushPending() {
    if (this.role === 'host' || !this.db || !this.connected || this.flushingPending || this.closed) return;
    this.flushingPending = true;
    try {
      let list = this._readPending();
      while (list.length && this.connected && !this.closed) {
        const item = list[0];
        try {
          await this._deliverPendingItem(item);
          list = this._readPending().filter((x) => x.id !== item.id);
          this._writePending(list);
          this._domEvent('kwb-delivery', { status:'sent', messageType:item.type });
        } catch (err) {
          console.warn('Firebase queued message delivery paused; will retry after reconnect:', err);
          break;
        }
      }
    } finally {
      this.flushingPending = false;
      if (this.connected && this._readPending().length && !this.closed) {
        setTimeout(() => this._flushPending().catch(() => {}), 900);
      }
    }
  }

  async _rearmHostDisconnectMarker() {
    if (this.role !== 'host' || !this.db || this.closed) return;
    const ownerSnapshot = await get(ref(this.db, `rooms/${this.pin}/ownerUid`));
    if (!ownerSnapshot.exists() || ownerSnapshot.val() !== this.uid) return;
    try { if (this.disconnectOp) await this.disconnectOp.cancel(); } catch {}
    await update(ref(this.db, `rooms/${this.pin}/state`), { hostDisconnectedAt:null, hostUpdatedAt:serverTimestamp() });
    const op = onDisconnect(ref(this.db, `rooms/${this.pin}/state/hostDisconnectedAt`));
    await op.set(serverTimestamp());
    this.disconnectOp = op;
  }

  _watchConnection() {
    if (!this.db || this.connectionListenerAttached) return;
    const connectedRef = ref(this.db, '.info/connected');
    const unsub = onValue(connectedRef, (snapshot) => {
      const connected = snapshot.val() === true;
      const changed = connected !== this.connected;
      this.connected = connected;
      if (changed) {
        this._dispatch({ type:'connection', connected, at:this.now() });
        this._domEvent('kwb-connection', { connected });
      }
      if (connected && this.role === 'host' && !this.closed) {
        this._attachHostInboxListener()
          .then(() => this._rearmHostDisconnectMarker())
          .catch((err) => {
            console.warn('Firebase host reconnect recovery failed:', err);
          });
      }
      if (connected && this.role !== 'host' && !this.closed) {
        this._flushPending().catch(() => {});
      }
    });
    this.unsubscribers.push(unsub);
    this.connectionListenerAttached = true;
  }

  async _attachHostInboxListener() {
    if (this.role !== 'host' || !this.db || this.hostInboxAttached || this.closed) return;
    const ownerSnapshot = await get(ref(this.db, `rooms/${this.pin}/ownerUid`));
    if (!ownerSnapshot.exists() || ownerSnapshot.val() !== this.uid) return;

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
    this._watchConnection();

    if (this.role !== 'host') {
      const stateRef = ref(db, `rooms/${this.pin}/state`);
      const unsub = onValue(stateRef, (snapshot) => {
        if (!snapshot.exists()) return;
        const state = snapshot.val();
        this._cacheState(state);
        if (state?.status === 'closed') {
          this._clearPlayerCache();
          this._dispatch({ type:'room-closed', at:this.now() });
        } else {
          this._dispatch({ type:'state', payload:{ room:state }, at:this.now() });
        }
      }, (err) => {
        console.warn('Firebase room state listener paused; SDK will retry automatically:', err);
      });
      this.unsubscribers.push(unsub);
      this._flushPending().catch(() => {});
    }
    return this;
  }

  async exists() {
    if (!this.db) await this.init();
    try {
      const snapshot = await get(ref(this.db, `rooms/${this.pin}/state`));
      if (snapshot.exists()) {
        const state = snapshot.val();
        this._cacheState(state);
        return state?.status !== 'closed';
      }
      return false;
    } catch (err) {
      const cached = this._readCachedState();
      if (cached && cached.status !== 'closed') {
        this.latestState = cached;
        return true;
      }
      throw err;
    }
  }

  async loadRoom() {
    if (!this.db) await this.init();
    let state = null;
    try {
      const snapshot = await get(ref(this.db, `rooms/${this.pin}/state`));
      if (snapshot.exists()) state = snapshot.val();
    } catch (err) {
      state = this._readCachedState();
      if (!state) throw err;
    }
    if (!state) return null;
    this._cacheState(state);

    // 기존 참가자가 새로고침한 경우 플레이어 코드의 "lobby에서만 입장" 검사를 통과시킨 뒤,
    // send('join')에서 실제 최신 상태를 즉시 복원합니다.
    if (this.role !== 'host' && state.status !== 'closed' && state.status !== 'lobby' && state.players?.[this.uid]) {
      this.resumeRoom = state;
      return { ...state, status:'lobby', __resumeStatus:state.status };
    }
    return state;
  }

  async createRoom(room) {
    if (this.role !== 'host') throw new Error('호스트만 방을 만들 수 있습니다.');
    if (!this.db) await this.init();

    const ownerRef = ref(this.db, `rooms/${this.pin}/ownerUid`);
    const currentOwner = await get(ownerRef);
    if (currentOwner.exists()) throw new Error('이미 사용 중인 게임 PIN입니다. 새 방을 다시 만들어 주세요.');

    await set(ownerRef, this.uid);
    try {
      await set(ref(this.db, `rooms/${this.pin}/createdAt`), serverTimestamp());
      const initialState = publicRoomState(room);
      initialState.hostDisconnectedAt = null;
      initialState.hostUpdatedAt = serverTimestamp();
      await set(ref(this.db, `rooms/${this.pin}/state`), initialState);
      await this._attachHostInboxListener();

      await this._rearmHostDisconnectMarker();
    } catch (e) {
      try { await remove(ownerRef); } catch {}
      throw e;
    }
  }

  saveRoom(room) {
    if (!this.db || this.closed) return Promise.resolve();
    const state = publicRoomState(room);
    // Phase 3 패키지는 방 생성 시 한 번만 저장하고 이후 상태 갱신 때는 다시 쓰지 않습니다.
    // RTDB의 update()를 사용하면 state/offlinePackage는 그대로 유지되어 통신량이 크게 줄어듭니다.
    delete state.offlinePackage;
    state.hostDisconnectedAt = null;
    state.hostUpdatedAt = serverTimestamp();
    this.writeQueue = this.writeQueue
      .catch(() => {})
      .then(() => update(ref(this.db, `rooms/${this.pin}/state`), state));
    return this.writeQueue;
  }

  async send(type, payload = {}) {
    if (!this.db) await this.init();
    if (this.role === 'host') return;

    // 새로고침 후 이미 참가 중인 학생은 새 참가 요청을 보내지 않고 곧바로 마지막 상태로 복원합니다.
    const resume = this.resumeRoom || this.latestState;
    if (type === 'join' && resume?.status !== 'closed' && resume?.status !== 'lobby' && resume?.players?.[this.uid]) {
      this.resumeRoom = null;
      setTimeout(() => this._dispatch({ type:'state', payload:{ room:resume }, at:this.now(), resumed:true }), 0);
      return { resumed:true };
    }

    // 페이지를 닫은 순간 오프라인이면 leave를 나중에 보내지 않습니다.
    // 늦게 도착한 leave가 복귀한 학생을 다시 제거하는 것을 방지합니다.
    if (type === 'leave' && !this.connected) return { skipped:true };

    const item = this._queueMessage(type, payload);
    if (!this.connected) {
      this._domEvent('kwb-delivery', { status:'queued', messageType:type });
      return { queued:true, id:item.id };
    }
    this._flushPending().catch(() => {});
    return { queued:false, id:item.id };
  }

  async removeRoom() {
    if (!this.db || this.role !== 'host' || this.closed) return;
    this.closed = true;
    try { await this.writeQueue.catch(() => {}); } catch {}
    try {
      await update(ref(this.db, `rooms/${this.pin}/state`), { status:'closed', closedAt:serverTimestamp() });
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch {}
    try { if (this.disconnectOp) await this.disconnectOp.cancel(); } catch {}
    for (const path of ['inbox', 'state', 'createdAt', 'ownerUid']) {
      try { await remove(ref(this.db, `rooms/${this.pin}/${path}`)); } catch {}
    }
  }

  close() {
    try { this.disconnectOp?.cancel?.().catch?.(() => {}); } catch {}
    this.unsubscribers.forEach((unsub) => { try { unsub(); } catch {} });
    this.unsubscribers = [];
    this.hostInboxAttached = false;
    this.connectionListenerAttached = false;
    this.handlers.clear();
  }
}
