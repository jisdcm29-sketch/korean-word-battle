import { getStoredAccess, setHostGameActivityProbe } from './access-control.js?v=1.6';

const ACTIVE = new Set(['transition','countdown','preview','playing','result','round-result']);
const MAX_AGE = 30 * 60 * 1000;

export function createHostGameRecovery({getSnapshot, restore}) {
  const access = getStoredAccess();
  const teacher = String(access?.teacherId || access?.deviceId || '');
  // Query parameters distinguish different textbooks/lessons on the same page.
  const key = `kwb_host_resume_v2_${teacher}_${location.pathname}_${location.search}`;
  let candidate = null, started = false, recovering = false, lastText = '', lastSavedAt = 0, banner = null;
  let releaseHostLock = null, lockedPin = null;
  let wakeLock = null, wakePending = false, wasActive = false;
  try { candidate = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
  if (candidate?.version !== 2 || Date.now() - Number(candidate.savedAt || 0) > MAX_AGE) candidate = null;
  // A throttled background tab may have missed heartbeats when it becomes visible.
  setHostGameActivityProbe(() => ACTIVE.has(getSnapshot()?.room?.status));

  async function claimHost(pin) {
    if (lockedPin === pin) return;
    if (releaseHostLock) { releaseHostLock(); releaseHostLock = null; lockedPin = null; }
    if (!navigator.locks?.request) return;
    await new Promise((resolve, reject) => {
      navigator.locks.request(`kwb-host-room-${pin}`, {ifAvailable:true}, async lock => {
        if (!lock) { reject(new Error('이 방이 다른 교사 탭에서 진행 중입니다. 해당 탭을 닫고 다시 복원해 주세요.')); return; }
        lockedPin = pin;
        await new Promise(release => { releaseHostLock = release; resolve(); });
      }).catch(reject);
    });
  }

  function pulse() {
    if (recovering) return;
    const snapshot = getSnapshot();
    const active = Boolean(snapshot && ACTIVE.has(snapshot.room?.status));
    window.dispatchEvent(new CustomEvent('kwb-host-progress', {detail:{active}}));
    if (active && document.visibilityState === 'visible' && !wakeLock && !wakePending && navigator.wakeLock?.request) {
      wakePending = true;
      navigator.wakeLock.request('screen').then(lock => {
        if (!wasActive || document.visibilityState !== 'visible') { lock.release().catch(() => {}); return; }
        wakeLock = lock;
        lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
      }).catch(() => {}).finally(() => { wakePending = false; });
    }
    wasActive = active;
    if (!active && wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    if (!snapshot) {
      if (started) { try { localStorage.removeItem(key); } catch {} started = false; lastText = ''; }
      if (releaseHostLock) { releaseHostLock(); releaseHostLock = null; lockedPin = null; }
      return;
    }
    if (!lockedPin) claimHost(snapshot.room.pin).catch(() => {});
    started = true;
    banner?.remove(); banner = null;
    const text = JSON.stringify(snapshot);
    // Refresh timestamp even when the phase is unchanged (e.g. long lobby).
    if (text === lastText && Date.now() - lastSavedAt < 10000) return;
    try {
      localStorage.setItem(key, JSON.stringify({version:2,savedAt:Date.now(),snapshot}));
      lastText = text; lastSavedAt = Date.now();
      document.querySelector('.kwb-host-checkpoint-warning')?.remove();
    }
    catch { showCheckpointWarning(); }
  }

  function showCheckpointWarning() {
    if (document.querySelector('.kwb-host-checkpoint-warning')) return;
    const el = document.createElement('div');
    el.className = 'kwb-host-checkpoint-warning';
    el.textContent = '⚠ 이 브라우저에 게임 복원 정보를 저장하지 못했습니다. 진행 중 새로고침하거나 탭을 닫지 마세요.';
    Object.assign(el.style,{position:'fixed',top:'8px',left:'8px',right:'8px',zIndex:'99999',padding:'10px',background:'#743b00',color:'#fff',font:'700 14px system-ui'});
    document.body.appendChild(el);
  }

  if (candidate?.snapshot?.room?.pin && candidate.snapshot.room.status !== 'closed') {
    banner = document.createElement('div');
    Object.assign(banner.style,{position:'fixed',top:'8px',left:'8px',right:'8px',zIndex:'99999',padding:'14px',background:'#102b52',color:'#fff',borderRadius:'12px',font:'700 15px/1.5 system-ui',textAlign:'center'});
    const label = document.createElement('span');
    label.textContent = `이전 게임 PIN ${candidate.snapshot.room.pin} · `;
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = '이전 게임 복원';
    button.style.cssText = 'padding:10px 16px;margin:4px;cursor:pointer';
    button.onclick = async () => {
      button.disabled = true; button.textContent = '복원 중…';
      recovering = true;
      try {
        if (Date.now() - candidate.savedAt > MAX_AGE) throw new Error('복원 가능 시간(30분)이 지났습니다. 새 방을 만들어 주세요.');
        await claimHost(candidate.snapshot.room.pin);
        await restore(candidate.snapshot);
        recovering = false;
        pulse();
      } catch (err) {
        recovering = false;
        if (releaseHostLock) { releaseHostLock(); releaseHostLock = null; lockedPin = null; }
        label.textContent = `${err?.message || '게임 복원 실패'} · `;
        button.disabled = false; button.textContent = '다시 복원';
      }
    };
    const dismiss = document.createElement('button');
    dismiss.type='button'; dismiss.textContent='닫기';
    dismiss.onclick=()=>{banner?.remove();banner=null;};
    banner.append(label,button,dismiss); document.body.appendChild(banner);
  }
  setInterval(pulse, 1000);
  window.addEventListener('pagehide', () => {
    pulse();
    if (releaseHostLock) { releaseHostLock(); releaseHostLock = null; lockedPin = null; }
  });
  window.addEventListener('beforeunload', pulse);
  document.addEventListener('visibilitychange', pulse);
  return {capture:pulse};
}
