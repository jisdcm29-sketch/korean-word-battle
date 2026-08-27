export class LocalBus {
  constructor(pin) {
    this.pin = String(pin);
    this.channelName = `kwb-${this.pin}`;
    this.channel = 'BroadcastChannel' in window ? new BroadcastChannel(this.channelName) : null;
    this.eventKey = `kwb_event_${this.pin}`;
    this.roomKey = `kwb_room_${this.pin}`;
    this.handlers = new Set();
    this.seen = new Set();
    if (this.channel) this.channel.onmessage = (e) => this._dispatch(e.data);
    this.storageHandler = (e) => {
      if (e.key !== this.eventKey || !e.newValue) return;
      try { this._dispatch(JSON.parse(e.newValue)); } catch {}
    };
    window.addEventListener('storage', this.storageHandler);
  }
  _dispatch(msg) {
    if (!msg?.id || this.seen.has(msg.id)) return;
    this.seen.add(msg.id);
    if (this.seen.size > 300) this.seen.clear();
    this.handlers.forEach(fn => fn(msg));
  }
  on(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
  send(type, payload = {}) {
    const msg = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, type, payload, at: Date.now() };
    if (this.channel) this.channel.postMessage(msg);
    localStorage.setItem(this.eventKey, JSON.stringify(msg));
    this._dispatch(msg);
  }
  saveRoom(room) {
    localStorage.setItem(this.roomKey, JSON.stringify(room));
  }
  loadRoom() {
    try { return JSON.parse(localStorage.getItem(this.roomKey) || 'null'); } catch { return null; }
  }
  removeRoom() { localStorage.removeItem(this.roomKey); }
  close() {
    if (this.channel) this.channel.close();
    window.removeEventListener('storage', this.storageHandler);
  }
}

export function publicRoomState(room) {
  const q = room.quiz?.questions?.[room.questionIndex] || null;
  return {
    pin: room.pin,
    status: room.status,
    config: { timeLimit: room.config.timeLimit, questionCount: room.config.questionCount, blindMode: room.config.blindMode },
    players: Object.fromEntries(Object.entries(room.players || {}).map(([uid,p]) => [uid, { uid, name:p.name, avatar:p.avatar, score:p.score }])),
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
