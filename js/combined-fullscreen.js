// The three stage screens are same-origin iframes. Request fullscreen directly
// inside the button's click handler so the browser retains user activation.
export function bindCombinedFullscreen(button) {
  const hostDocument = window.parent === window ? document : window.parent.document;
  const normalText = button.textContent;
  let messageTimer;

  function sync() {
    clearTimeout(messageTimer);
    const active = Boolean(hostDocument.fullscreenElement);
    document.body.classList.toggle('combined-fullscreen', active);
    button.textContent = active ? '⛶ 전체 화면 종료' : normalText;
    button.title = active ? '전체 화면 종료 (Esc)' : '전체 화면으로 전환';
    button.setAttribute('aria-pressed', String(active));
  }

  button.addEventListener('click', () => {
    try {
      const operation = hostDocument.fullscreenElement
        ? hostDocument.exitFullscreen()
        : hostDocument.documentElement.requestFullscreen();
      Promise.resolve(operation).catch(() => {
        button.textContent = '전체 화면을 사용할 수 없습니다';
        messageTimer = setTimeout(sync, 2500);
      });
    } catch {
      button.textContent = '전체 화면을 사용할 수 없습니다';
      messageTimer = setTimeout(sync, 2500);
    }
  });
  hostDocument.addEventListener('fullscreenchange', sync);
  sync();
}
