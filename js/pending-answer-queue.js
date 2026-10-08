// Keep the live queue authoritative even if browser storage cannot be written.
export class PendingAnswerQueue {
  constructor({key, maxAge, storage, now = Date.now, onStorageChange = () => {}}) {
    Object.assign(this, {key, maxAge, storage, now, onStorageChange});
    this.items = null;
    this.failed = false;
  }
  read() {
    if (this.items === null) {
      try {
        const value = JSON.parse((this.storage || globalThis.localStorage).getItem(this.key()) || '[]');
        this.items = Array.isArray(value) ? value : [];
      } catch {
        this.items = [];
        this.notify(true);
      }
    }
    const fresh = this.items.filter(x => x?.id && this.now() - Number(x.queuedAt || 0) <= this.maxAge);
    if (fresh.length !== this.items.length) this.write(fresh);
    return [...this.items];
  }
  write(items) {
    // Never reread stale disk contents after a failed acknowledgement write.
    this.items = [...items];
    try {
      const key = this.key();
      if (!key) throw new Error('Queue identity unavailable');
      const storage = this.storage || globalThis.localStorage;
      if (items.length) storage.setItem(key, JSON.stringify(items));
      else storage.removeItem(key);
      this.notify(false);
      return true;
    } catch {
      this.notify(true);
      return false;
    }
  }
  notify(failed) {
    if (failed === this.failed) return;
    this.failed = failed;
    this.onStorageChange(failed);
  }
}

export function showAnswerStorageWarning(failed) {
  if (typeof document === 'undefined') return;
  let el = document.querySelector('.kwb-answer-storage-warning');
  if (!failed) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.className = 'kwb-answer-storage-warning';
    el.setAttribute('role', 'alert');
    Object.assign(el.style, {position:'fixed',left:'10px',right:'10px',top:'10px',zIndex:'100001',padding:'10px',borderRadius:'12px',background:'#743b00',color:'#fff',font:'700 14px/1.4 system-ui',textAlign:'center'});
    document.body?.appendChild(el);
  }
  el.textContent = '⚠ 기기 저장 실패 · 답안은 현재 화면에 보관 중입니다. 전송될 때까지 새로고침하거나 화면을 닫지 마세요.';
}
