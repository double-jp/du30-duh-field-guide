/* 앱 설치 버튼, 오프라인 저장 안내, 새 버전 알림 */
(() => {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const btn = document.getElementById('pwa-install');

  let box;
  function note(msg, action, onAction, sticky) {
    if (!box) {
      box = document.createElement('div');
      box.className = 'pwa-note';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    box.innerHTML = '';
    const p = document.createElement('span');
    p.textContent = msg;
    box.appendChild(p);
    if (action) {
      const b = document.createElement('button');
      b.textContent = action;
      b.addEventListener('click', onAction);
      box.appendChild(b);
    }
    const x = document.createElement('button');
    x.className = 'x';
    x.setAttribute('aria-label', '알림 닫기');
    x.textContent = '×';
    x.addEventListener('click', () => box.classList.remove('show'));
    box.appendChild(x);
    box.classList.add('show');
    clearTimeout(note.t);
    if (!sticky) note.t = setTimeout(() => box.classList.remove('show'), 6000);
  }

  // ── 설치 ──
  let deferred = null;
  const showBtn = () => { if (btn && !standalone) btn.hidden = false; };
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    showBtn();
  });
  window.addEventListener('appinstalled', () => {
    if (btn) btn.hidden = true;
    deferred = null;
    note('앱으로 설치했습니다. 홈 화면에서 바로 여세요.');
  });
  if (ios && !standalone) showBtn();
  btn && btn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice.catch(() => {});
      deferred = null;
      btn.hidden = true;
    } else if (ios) {
      note('Safari 아래쪽 공유 버튼(□↑)을 누르고 ‘홈 화면에 추가’를 선택하세요.', null, null, true);
    } else {
      note('브라우저 메뉴(⋮)에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요.', null, null, true);
    }
  });

  // ── 오프라인 캐시 / 업데이트 ──
  if (!('serviceWorker' in navigator)) return;
  let applying = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) location.reload();
  });
  const offerUpdate = w => note('가이드 새 버전이 있습니다.', '지금 적용', () => {
    applying = true;
    w.postMessage('SKIP_WAITING');
  }, true);

  window.addEventListener('load', async () => {
    let reg;
    try { reg = await navigator.serviceWorker.register('./sw.js'); } catch (e) { return; }
    const track = w => w && w.addEventListener('statechange', () => {
      if (w.state !== 'installed') return;
      if (navigator.serviceWorker.controller) offerUpdate(w);
      else note('오프라인 저장 완료 — 이제 인터넷 없이도 열립니다.');
    });
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    track(reg.installing);
    reg.addEventListener('updatefound', () => track(reg.installing));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {});
    });
  });
})();
