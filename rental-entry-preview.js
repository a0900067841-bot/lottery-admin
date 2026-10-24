/* lottery-admin: Yuan-only rental placeholder (UI only; no API, no device enforcement). */
(() => {
  'use strict';
  const nav = document.querySelector('nav');
  const main = document.querySelector('main');
  if (!nav || !main || document.getElementById('rentalPlaceholderTab')) return;

  const tab = document.createElement('button');
  tab.id = 'rentalPlaceholderTab';
  tab.type = 'button';
  tab.dataset.tab = 'rentalPlaceholder';
  tab.textContent = '門市租借管理（預留）';
  tab.hidden = true;
  tab.style.display = 'none';

  const panel = document.createElement('section');
  panel.id = 'rentalPlaceholder';
  panel.className = 'panel';
  panel.hidden = true;
  panel.innerHTML = '<h1>門市租借管理</h1><div class="card"><h2>功能尚未開放</h2><p>此處僅預留未來門市設備租借管理入口。</p><p class="muted">目前不設定租期、不停用門市、不建立租借資料，也不限定標籤機品牌或型號。</p></div>';
  nav.append(tab);
  main.append(panel);

  function hide() {
    tab.hidden = true;
    tab.style.display = 'none';
    panel.hidden = true;
    panel.classList.remove('active');
    tab.classList.remove('active');
  }

  // Auth code owns the session and may not expose the current username to this script.
  // Fail closed: never show a Yuan-only menu without verified identity integration.
  hide();
  window.lotteryRentalPreview = Object.freeze({
    showForVerifiedYuan(isVerifiedYuan) {
      if (isVerifiedYuan !== true) { hide(); return; }
      tab.hidden = false;
      tab.style.display = '';
    },
    hide
  });

  tab.addEventListener('click', () => {
    if (tab.hidden) return;
    nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === tab));
    main.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p === panel));
    panel.hidden = false;
  });
  nav.addEventListener('click', event => {
    if (event.target.closest('button') === tab) return;
    panel.classList.remove('active');
  });
})();
