// Shared student lifecycle recovery. Firebase remains responsible for transport reconnects.
// Never signs out, changes player IDs, reloads the page, or writes game/score state.
export function startPlayerConnectionRecovery({ subscribe, read, apply, flush, isConnected }) {
  let stopped = false, unsubscribe = null, retryNeeded = false;
  let revision = 0, readToken = 0, reading = false, timer = null;
  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
  const deliver = snapshot => {
    if (stopped) return;
    revision++;
    if (snapshot.exists()) apply(snapshot.val());
  };
  const attach = () => {
    if (stopped || (unsubscribe && !retryNeeded)) return;
    if (unsubscribe) unsubscribe();
    retryNeeded = false;
    unsubscribe = subscribe(deliver, error => {
      if (stopped) return;
      // A cancelled permission listener is not an ordinary transport disconnect.
      // Retry only on the next reconnect/foreground event, retaining Firebase rules.
      retryNeeded = true;
      console.warn('Student state subscription cancelled; will check on return:', error);
    });
  };
  const recover = () => {
    if (stopped || !visible() || !isConnected()) return;
    attach();
    Promise.resolve().then(flush).catch(() => {});
    if (reading) return;
    reading = true;
    const token = ++readToken, before = revision;
    // Limit the recovery check, without cancelling the SDK connection or its writes.
    const timeout = setTimeout(() => {
      if (token === readToken) { readToken++; reading = false; }
    }, 8000);
    Promise.resolve().then(read).then(snapshot => {
      if (!stopped && token === readToken && before === revision && isConnected()) deliver(snapshot);
    }).catch(error => {
      if (!stopped) console.warn('Student state refresh deferred:', error);
    }).finally(() => {
      clearTimeout(timeout);
      if (token === readToken) reading = false;
    });
  };
  const schedule = () => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(recover, 120);
  };
  attach();
  if (typeof window !== 'undefined') {
    window.addEventListener('online', schedule);
    window.addEventListener('pageshow', schedule);
    window.addEventListener('focus', schedule);
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', schedule);
  return {
    recover: schedule,
    stop() {
      stopped = true; readToken++; clearTimeout(timer);
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
