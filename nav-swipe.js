// Swipe between the calculator and Budget, iOS style: the page follows your finger, the other page
// is revealed underneath (preloaded in a hidden frame), and on release it snaps across or springs back.
// Calculator: swipe left → Budget. Budget: swipe right → back one page, or to the calculator from a main screen.
(function () {
  'use strict';
  if (/[?&]preview=1/.test(location.search)) return;          // the preloaded copy behind the page doesn't swipe
  var inBudget = location.pathname.indexOf('/budget') >= 0;
  var TARGET = inBudget ? '../' : './budget/#budget';
  var PREVIEW = inBudget ? '../?preview=1' : './budget/?preview=1#budget';
  var DIR = inBudget ? 1 : -1;                                   // finger direction that changes page
  // Areas with their own sideways gestures or scrolling keep them.
  var IGNORE = inBudget
    ? '.sheet, .scrim, input, select, textarea, .chips, .grip, .seg, .app-menu, #pop'
    : '#displayPanel, .history-panel.open, #modeMenu, .paste-overlay, .clip-menu, input, select, textarea, .cat-row';
  var EASE = 'cubic-bezier(.2,.8,.2,1)';
  var s = null, peek = null, frame = null, shade = null, ready = false, busy = false;
  window.__lcNavSwipe = false;

  function app() { return document.querySelector('.app'); }
  function W() { return window.innerWidth; }

  // ---------- The other page, preloaded behind this one ----------
  function preload() {
    if (peek) return;
    peek = document.createElement('div');
    peek.className = 'lc-peek';
    peek.setAttribute('aria-hidden', 'true');
    peek.style.cssText = 'position:fixed;inset:0;z-index:0;visibility:hidden;pointer-events:none;overflow:hidden;background:' + getComputedStyle(document.body).backgroundColor;
    frame = document.createElement('iframe');
    frame.src = PREVIEW; frame.tabIndex = -1; frame.title = '';
    frame.style.cssText = 'border:0;width:100%;height:100%;display:block;background:transparent';
    frame.addEventListener('load', function () { ready = true; });
    shade = document.createElement('div');
    shade.style.cssText = 'position:absolute;inset:0;background:#000;opacity:.25;pointer-events:none';
    peek.appendChild(frame); peek.appendChild(shade);
    document.body.appendChild(peek);
  }
  function lift(on) {
    var a = app(); if (!a) return;
    if (on) {
      a.style.position = 'relative'; a.style.zIndex = '1';
      a.style.background = getComputedStyle(document.body).backgroundColor;
      a.style.boxShadow = '0 0 28px rgba(0,0,0,.28)'; a.style.willChange = 'transform';
      peek.style.visibility = 'visible';
    } else {
      a.style.transform = ''; a.style.transition = ''; a.style.boxShadow = ''; a.style.willChange = '';
      a.style.zIndex = ''; a.style.position = ''; a.style.background = '';
      if (peek) { peek.style.visibility = 'hidden'; frame.style.transform = ''; frame.style.transition = ''; }
    }
  }
  // p: 0 = this page in place, 1 = fully swiped away.
  function paint(p, animate) {
    var a = app(), w = W();
    var t = animate ? 'transform .26s ' + EASE : 'none';
    a.style.transition = t; frame.style.transition = t; shade.style.transition = animate ? 'opacity .26s ' + EASE : 'none';
    a.style.transform = 'translateX(' + (DIR * p * w) + 'px)';
    frame.style.transform = 'translateX(' + (-DIR * (1 - p) * w * 0.3) + 'px)';   // gentle parallax underneath
    shade.style.opacity = String(0.25 * (1 - p));
  }

  // ---------- Gesture ----------
  document.addEventListener('touchstart', function (e) {
    window.__lcNavSwipe = false;
    if (busy || e.touches.length !== 1 || (e.target.closest && e.target.closest(IGNORE))) { s = null; return; }
    var t = e.touches[0];
    // On a Budget sub-page, swiping right goes back a step instead of to the calculator.
    var sub = inBudget && window.LCBudget && window.LCBudget.canBack && window.LCBudget.canBack();
    s = { x: t.clientX, y: t.clientY, t: Date.now(), on: false, sub: sub, lx: t.clientX, lt: Date.now(), v: 0 };
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!s) return;
    var t = e.touches[0], dx = t.clientX - s.x, dy = t.clientY - s.y, now = Date.now();
    if (!s.on) {
      if (Math.abs(dy) > 30 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }      // scrolling
      if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.8 && dx * DIR > 0) {
        s.on = true; window.__lcNavSwipe = true;
        Array.prototype.forEach.call(document.querySelectorAll('.key.pressed'), function (k) { k.classList.remove('pressed'); });
        s.live = !s.sub && ready;                                                     // follow the finger
        if (s.live) lift(true);
      } else return;
    }
    e.preventDefault();
    s.v = (t.clientX - s.lx) / Math.max(1, now - s.lt); s.lx = t.clientX; s.lt = now;
    if (s.live) paint(Math.max(0, Math.min(1, (dx * DIR) / W())), false);
  }, { passive: false });

  function end(e, cancelled) {
    if (!s) return;
    var g = s; s = null;
    setTimeout(function () { window.__lcNavSwipe = false; }, 0);
    if (!g.on) return;
    var t = e.changedTouches && e.changedTouches[0], dx = t ? (t.clientX - g.x) * DIR : 0;
    var go = !cancelled && (dx > W() * 0.33 || (dx > 40 && g.v * DIR > 0.45));      // far enough, or a quick flick
    if (g.sub) { if (go && window.LCBudget.back) window.LCBudget.back(); return; }
    if (!g.live) { if (go) fallback(); return; }
    busy = true;
    paint(go ? 1 : 0, true);
    setTimeout(function () {
      if (go) {
        try { sessionStorage.setItem('lc_slide', 'peek'); } catch (err) {}
        location.href = TARGET;
      } else { lift(false); busy = false; }
    }, 270);
  }
  document.addEventListener('touchend', function (e) { end(e, false); });
  document.addEventListener('touchcancel', function (e) { end(e, true); });

  // Before the preview has loaded: slide out, then open the page.
  function fallback() {
    try { sessionStorage.setItem('lc_slide', inBudget ? 'right' : 'left'); } catch (err) {}
    var b = document.body;
    b.style.transition = 'transform .2s ease-in, opacity .2s ease-in';
    b.style.transform = 'translateX(' + (DIR * 35) + '%)'; b.style.opacity = '0';
    setTimeout(function () { location.href = TARGET; }, 170);
  }

  // Arriving: after a live swipe the page is already in place; after the fallback it slides in.
  function arrive() {
    var dir = null;
    try { dir = sessionStorage.getItem('lc_slide'); sessionStorage.removeItem('lc_slide'); } catch (err) {}
    var b = document.body;
    if (dir === 'left' || dir === 'right') {
      b.style.transition = 'none';
      b.style.transform = 'translateX(' + (dir === 'left' ? '35%' : '-35%') + ')'; b.style.opacity = '0';
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        b.style.transition = 'transform .24s ' + EASE + ', opacity .2s ease-out';
        b.style.transform = ''; b.style.opacity = '';
      }); });
    }
    setTimeout(preload, 600);   // get the other page ready for the next swipe
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrive); else arrive();
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) { document.body.style.transform = ''; document.body.style.opacity = ''; lift(false); busy = false; }
  });
})();
