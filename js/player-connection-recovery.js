// Shared student lifecycle recovery V2. Firebase owns transport reconnects.
// This module reads state and retries queued delivery; it never writes scores,
// signs out, changes player IDs, or reloads a game in progress.
export function startPlayerConnectionRecovery({ subscribe, read, apply, flush, isConnected, now: gameNow = () => Date.now() }) {
  let stopped = false, unsubscribe = null, retryNeeded = false;
  let revision = 0, readToken = 0, reading = false, timer = null, readTimeout = null;
  let lastSnapshotAt = Date.now(), lastReadAt = 0, latestState = null;
  let wakeLock = null, requestingWakeLock = false;
  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
  const active = () => latestState && !['lobby', 'finished', 'closed'].includes(latestState.status);
  const releaseWakeLock = () => {
    const lock = wakeLock; wakeLock = null;
    if (lock) Promise.resolve(lock.release()).catch(() => {});
  };
  const syncWakeLock = () => {
    if (stopped || !visible() || !active()) { releaseWakeLock(); return; }
    if (wakeLock || requestingWakeLock || typeof navigator === 'undefined' || !navigator.wakeLock?.request) return;
    requestingWakeLock = true;
    Promise.resolve().then(() => navigator.wakeLock.request('screen')).then(lock => {
      if (stopped || !visible() || !active()) { Promise.resolve(lock.release()).catch(() => {}); return; }
      wakeLock = lock;
      lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; }, { once:true });
    }).catch(() => {}).finally(() => { requestingWakeLock = false; });
  };
  const deliver = snapshot => {
    if (stopped) return;
    revision++; lastSnapshotAt = Date.now();
    if (snapshot.exists()) {
      latestState = snapshot.val();
      syncWakeLock();
      apply(latestState);
    }
  };
  const attach = () => {
    if (stopped || (unsubscribe && !retryNeeded)) return;
    if (unsubscribe) unsubscribe();
    retryNeeded = false;
    unsubscribe = subscribe(deliver, error => {
      if (stopped) return;
      retryNeeded = true;
      console.warn('Student state subscription cancelled; will check on return:', error);
    });
  };
  const recover = (foreground = false) => {
    if (stopped || !visible() || !isConnected()) return;
    // Permission cancellations retry only after reconnect/foreground, never
    // repeatedly from the watchdog. Existing Firebase rules remain authoritative.
    if (!retryNeeded || foreground) attach();
    if (retryNeeded) return;
    Promise.resolve().then(flush).catch(() => {});
    if (reading) return;
    reading = true; lastReadAt = Date.now();
    const token = ++readToken, before = revision;
    const timeout = setTimeout(() => {
      if (token === readToken) { readToken++; reading = false; readTimeout = null; }
    }, 8000);
    readTimeout = timeout;
    Promise.resolve().then(read).then(snapshot => {
      if (!stopped && token === readToken && before === revision && visible() && isConnected()) deliver(snapshot);
    }).catch(error => {
      if (!stopped) console.warn('Student state refresh deferred:', error);
    }).finally(() => {
      clearTimeout(timeout);
      if (readTimeout === timeout) readTimeout = null;
      if (token === readToken) reading = false;
    });
  };
  const schedule = () => {
    if (stopped) return;
    syncWakeLock();
    clearTimeout(timer);
    timer = setTimeout(() => recover(true), 120);
  };
  const deadline = () => {
    const state = latestState;
    if (!state) return 0;
    const field = {
      countdown:'countdownEndAt', preview:'previewEndAt',
      playing:state.unitEndAt ? 'unitEndAt' : state.roundEndAt ? 'roundEndAt' : 'questionEndAt',
      result:'resultEndAt', 'round-result':'roundResultEndAt', transition:'transitionEndAt'
    }[state.status];
    return field ? Number(state[field]) || 0 : 0;
  };
  attach();
  // No network request on every tick: read only after state silence or an
  // expired phase, with a six-second minimum between recovery reads.
  const watchdog = setInterval(() => {
    if (stopped || !visible() || !isConnected() || retryNeeded) return;
    const now = Date.now(), end = deadline();
    if (now - lastReadAt < 6000) return;
    if (now - lastSnapshotAt >= 12000 || (active() && end > 0 && gameNow() > end + 1500)) recover();
  }, 2000);
  if (typeof window !== 'undefined') {
    window.addEventListener('online', schedule);
    window.addEventListener('pageshow', schedule);
    window.addEventListener('focus', schedule);
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', schedule);
  return {
    recover: schedule,
    stop() {
      stopped = true; readToken++; clearTimeout(timer); clearTimeout(readTimeout); clearInterval(watchdog);
      releaseWakeLock();
      if (unsubscribe) unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', schedule);
        window.removeEventListener('pageshow', schedule);
        window.removeEventListener('focus', schedule);
      }
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', schedule);
    }
  };
}
