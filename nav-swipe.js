// Swipe between the calculator and Budget (like moving between pages on iPhone).
// Calculator: swipe left → Budget. Budget: swipe right → back one page, or to the calculator from a main screen.
(function () {
  'use strict';
  var inBudget = location.pathname.indexOf('/budget') >= 0;
  // Areas with their own sideways gestures or scrolling keep them.
  var IGNORE = inBudget
    ? '.sheet, .scrim, input, select, textarea, .chips, .grip, .seg, .app-menu, #pop'
    : '#displayPanel, .history-panel.open, #modeMenu, .paste-overlay, .clip-menu, input, select, textarea, .cat-row';
  var s = null;
  window.__lcNavSwipe = false;

  document.addEventListener('touchstart', function (e) {
    window.__lcNavSwipe = false;
    if (e.touches.length !== 1 || (e.target.closest && e.target.closest(IGNORE))) { s = null; return; }
    var t = e.touches[0];
    s = { x: t.clientX, y: t.clientY, t: Date.now(), on: false };
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!s) return;
    var t = e.touches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (!s.on && Math.abs(dy) > 30 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }   // scrolling
    if (!s.on && Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 2) { s.on = true; window.__lcNavSwipe = true; }
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    if (!s) return;
    var t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
    var ok = s.on && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2 && Date.now() - s.t < 900;
    s = null;
    setTimeout(function () { window.__lcNavSwipe = false; }, 0);
    if (!ok) return;
    if (!inBudget && dx < 0) go('./budget/#budget', 'left');
    if (inBudget && dx > 0) {
      if (window.LCBudget && window.LCBudget.back && window.LCBudget.back()) return;   // sub-page: go back
      go('../', 'right');
    }
  });

  function go(url, dir) {
    try { sessionStorage.setItem('lc_slide', dir); } catch (err) {}
    var b = document.body;
    b.style.transition = 'transform .2s ease-in, opacity .2s ease-in';
    b.style.transform = 'translateX(' + (dir === 'left' ? '-35%' : '35%') + ')';
    b.style.opacity = '0';
    setTimeout(function () { location.href = url; }, 170);
  }

  // Slide the new page in from the side it came from.
  function arrive() {
    var dir = null;
    try { dir = sessionStorage.getItem('lc_slide'); sessionStorage.removeItem('lc_slide'); } catch (err) {}
    var b = document.body;
    if (!dir) { b.style.transform = ''; b.style.opacity = ''; return; }
    b.style.transition = 'none';
    b.style.transform = 'translateX(' + (dir === 'left' ? '35%' : '-35%') + ')';
    b.style.opacity = '0';
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      b.style.transition = 'transform .24s cubic-bezier(.2,.8,.2,1), opacity .2s ease-out';
      b.style.transform = ''; b.style.opacity = '';
    }); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrive); else arrive();
  window.addEventListener('pageshow', function (e) { if (e.persisted) { document.body.style.transform = ''; document.body.style.opacity = ''; } });
})();
