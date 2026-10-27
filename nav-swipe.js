// One page carousel for LifeCalc:  Calculator  ‹›  Budget  ‹›  Ariel's HQ
// The page follows your finger the whole way, with the next page joined to its edge, then glides home
// at the speed of your flick. Calculator ↔ Budget are separate pages (the other one waits, preloaded, in a
// hidden frame); Budget ↔ HQ live on the same page (the other tab is drawn alongside while you drag).
// Swiping past either end gives a soft rubber-band. Budget sub-pages and an open café still swipe right to go back.
(function () {
  'use strict';
  if (/[?&]preview=1/.test(location.search)) return;          // the preloaded copy behind the page doesn't swipe
  var inBudget = location.pathname.indexOf('/budget') >= 0;
  var DOC_TARGET = inBudget ? '../' : './budget/#budget';
  var PREVIEW = inBudget ? '../?preview=1' : './budget/?preview=1#budget';
  // Areas with their own sideways gestures or scrolling keep them.
  var IGNORE = inBudget
    ? '.sheet, .scrim, input, select, textarea, .chips, .grip, .seg, .app-menu, #pop, .reorder'
    : '#displayPanel, .history-panel.open, #modeMenu, .paste-overlay, .clip-menu, input, select, textarea, .cat-row';
  var GLIDE = 'cubic-bezier(.22,.9,.32,1)';                     // fast start, long soft landing
  var REDUCE = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var s = null, peek = null, frame = null, ready = false, busy = false, ghost = null, dots = null, dotsTimer = null;
  var inflight = null, leaving = false, lastG = null;       // the glide in progress (a new touch finishes it at once); leaving = page is changing
  window.__lcNavSwipe = false;

  function app() { return document.querySelector('.app'); }
  function W() { return window.innerWidth; }
  function B() { return window.LCBudget; }
  function tab() { return inBudget && B() ? B().get().settings.tab : 'calc'; }
  function now() { return window.performance && performance.now ? performance.now() : Date.now(); }
  function bg() { return getComputedStyle(document.body).backgroundColor; }

  // Where a swipe can go from here. dir -1 = finger moves left (next page), +1 = finger moves right (previous).
  // Returns { kind: 'doc' | 'tab' | 'back', to } or null (end of the carousel → rubber-band).
  function route(dir) {
    if (!inBudget) return dir < 0 ? { kind: 'doc' } : null;
    var b = B(); if (!b) return null;
    var t = tab();
    if (b.canBack && b.canBack()) return dir > 0 ? { kind: 'back' } : null;
    if (t === 'hq' && window.HF && HF.hq && HF.hq.hasDetail && HF.hq.hasDetail()) return dir > 0 ? { kind: 'back', hq: true } : null;
    if (t === 'budget') return dir < 0 ? { kind: 'tab', to: 'hq' } : { kind: 'doc' };
    if (t === 'hq') return dir > 0 ? { kind: 'tab', to: 'budget' } : null;
    return dir > 0 ? { kind: 'doc' } : null;          // Transactions, Debts, Settings: right → calculator
  }
  function pageIndex() { if (!inBudget) return 0; var t = tab(); return t === 'budget' ? 1 : t === 'hq' ? 2 : -1; }

  // ---------- Safe-area spacing for the preloaded frame (an iframe gets none of its own) ----------
  function insets() {
    var p = document.createElement('div');
    p.style.cssText = 'position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    document.body.appendChild(p);
    var cs = getComputedStyle(p), r = { top: cs.paddingTop, bottom: cs.paddingBottom };
    p.remove(); return r;
  }
  function shareInsets() {
    try {
      var d = frame.contentDocument; if (!d) return;
      var i = insets();
      d.documentElement.style.setProperty('--lc-sat', i.top);
      d.documentElement.style.setProperty('--lc-sab', i.bottom);
    } catch (err) {}
  }

  // ---------- The other page, preloaded behind this one ----------
  function preload() {
    if (peek) return;
    peek = document.createElement('div');
    peek.className = 'lc-peek';
    peek.setAttribute('aria-hidden', 'true');
    peek.style.cssText = 'position:fixed;inset:0;z-index:0;visibility:hidden;pointer-events:none;overflow:hidden;contain:strict;background:' + bg();
    frame = document.createElement('iframe');
    frame.src = PREVIEW; frame.tabIndex = -1; frame.title = '';
    frame.style.cssText = 'border:0;width:100%;height:100%;display:block;background:transparent;will-change:transform';
    frame.addEventListener('load', function () { shareInsets(); ready = true; });
    peek.appendChild(frame);
    document.body.appendChild(peek);
  }
  // The other Budget tab, drawn alongside (same page, so it is ready instantly).
  function makeGhost(to) {
    ghost = document.createElement('main');
    ghost.className = 'app lc-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    try { ghost.innerHTML = B().tabHTML(to); } catch (err) { ghost = null; return false; }
    Array.prototype.forEach.call(ghost.querySelectorAll('[id]'), function (el) { el.removeAttribute('id'); });
    ghost.style.cssText = 'position:fixed;top:0;left:0;right:0;height:100vh;height:100dvh;overflow:hidden;z-index:2;' +
      'pointer-events:none;will-change:transform;background:' + bg();
    document.body.appendChild(ghost);
    return true;
  }

  function lift(on) {
    var a = app(); if (!a) return;
    if (on) {
      a.style.position = 'relative'; a.style.zIndex = '1';
      a.style.background = bg();
      a.style.willChange = 'transform';
    } else {
      a.style.transform = ''; a.style.transition = ''; a.style.willChange = '';
      a.style.zIndex = ''; a.style.position = ''; a.style.background = '';
      if (peek) { peek.style.visibility = 'hidden'; frame.style.transform = ''; frame.style.transition = ''; }
      if (ghost) { ghost.remove(); ghost = null; }
    }
  }
  function other(g) { return g.r && g.r.kind === 'doc' ? frame : ghost; }
  // x = how far this page has moved (px). The incoming page is joined to its edge.
  function paint(g, x, ms) {
    var a = app(), o = other(g), t = ms ? 'transform ' + ms + 'ms ' + GLIDE : 'none';
    a.style.transition = t;
    a.style.transform = x ? 'translate3d(' + x + 'px,0,0)' : '';
    if (o) { o.style.transition = t; o.style.transform = 'translate3d(' + (x - g.dir * W()) + 'px,0,0)'; }
    if (g.r) showDots(g, Math.abs(x) / W());
  }
  // Past the end: moves less the further you pull, like iOS.
  function rubber(dx) { var w = W(), d = Math.abs(dx); return (dx < 0 ? -1 : 1) * (w * 0.18) * (1 - 1 / (d / (w * 0.45) + 1)); }

  // ---------- Page dots (Calculator · Budget · HQ), shown while swiping ----------
  function showDots(g, p) {
    var i = pageIndex(); if (i < 0) return;
    if (!dots) {
      dots = document.createElement('div');
      dots.setAttribute('aria-hidden', 'true');
      dots.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 10px);transform:translateX(-50%);z-index:80;' +
        'display:flex;gap:7px;padding:7px 10px;border-radius:999px;background:rgba(60,60,67,.30);-webkit-backdrop-filter:blur(12px);' +
        'backdrop-filter:blur(12px);opacity:0;transition:opacity .2s ease;pointer-events:none';
      for (var k = 0; k < 3; k++) {
        var d = document.createElement('span');
        d.style.cssText = 'width:7px;height:7px;border-radius:50%;background:#fff;opacity:.45;transition:opacity .12s linear,transform .12s linear';
        dots.appendChild(d);
      }
      document.body.appendChild(dots);
    }
    var target = g.r && g.r.kind === 'tab' ? (g.r.to === 'hq' ? 2 : 1) : (g.r && g.r.kind === 'doc' ? (inBudget ? 0 : 1) : i);
    Array.prototype.forEach.call(dots.children, function (d, k) {
      var on = k === i ? 1 - p : k === target ? p : 0;
      d.style.opacity = String(0.45 + 0.55 * on);
      d.style.transform = 'scale(' + (1 + 0.18 * on) + ')';
    });
    dots.style.opacity = '1';
    clearTimeout(dotsTimer);
  }
  function hideDots(delay) {
    if (!dots) return;
    clearTimeout(dotsTimer);
    dotsTimer = setTimeout(function () { if (dots) dots.style.opacity = '0'; }, delay || 0);
  }
  function dotsAt(i) {      // after arriving, show the new position for a moment
    if (i < 0) return;
    showDots({ r: null }, 0);
    Array.prototype.forEach.call(dots.children, function (d, k) { d.style.opacity = k === i ? '1' : '.45'; d.style.transform = k === i ? 'scale(1.18)' : ''; });
    hideDots(650);
  }

  // ---------- Gesture ----------
  document.addEventListener('touchstart', function (e) {
    window.__lcNavSwipe = false;
    if (busy && inflight && !leaving) inflight();          // touching mid-glide: land it now and start fresh
    if (busy || e.touches.length !== 1 || (e.target.closest && e.target.closest(IGNORE))) { s = null; return; }
    var t = e.touches[0];
    s = { x: t.clientX, y: t.clientY, x0: t.clientX, t0: now(), on: false, row: !!(e.target.closest && e.target.closest('.swipe')), hist: [{ x: t.clientX, t: now() }] };
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!s) return;
    var t = e.touches[0], dx = t.clientX - s.x, dy = t.clientY - s.y, at = now();
    if (!s.on) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }      // scrolling
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      s.dir = dx < 0 ? -1 : 1;
      if (s.row && s.dir < 0) { s = null; return; }                                     // a row's swipe-to-delete
      s.r = route(s.dir);
      s.on = true; window.__lcNavSwipe = true;
      Array.prototype.forEach.call(document.querySelectorAll('.key.pressed'), function (k) { k.classList.remove('pressed'); });
      s.x = t.clientX - s.dir * 1;                                                      // no jump when the drag picks up
      if (s.r && s.r.kind === 'doc') { preload(); s.live = ready; if (s.live) peek.style.visibility = 'visible'; }
      else if (s.r && s.r.kind === 'tab') s.live = makeGhost(s.r.to);
      else s.live = false;
      lift(true);
    }
    e.preventDefault();
    s.hist.push({ x: t.clientX, t: at }); if (s.hist.length > 6) s.hist.shift();
    dx = t.clientX - s.x;
    if (s.r && s.live) {
      var x = s.dir < 0 ? Math.max(-W(), Math.min(0, dx)) : Math.max(0, Math.min(W(), dx));
      paint(s, x, 0);
    } else {
      paint({ r: null, dir: s.dir }, s.r && s.r.kind === 'back' ? Math.max(0, dx) * 0.35 : rubber(dx), 0);  // end of the line
    }
  }, { passive: false });

  function velocity(g) {           // px per ms over the last ~80 ms, in the swipe's direction
    var h = g.hist, last = h[h.length - 1], i = h.length - 1;
    while (i > 0 && last.t - h[i - 1].t < 80) i--;
    var first = h[i]; if (!first || last.t === first.t) return 0;
    return ((last.x - first.x) / (last.t - first.t)) * g.dir;
  }
  function settle(el, ms, done) {
    var fired = false;
    function fin() { if (fired) return; fired = true; inflight = null; el.removeEventListener('transitionend', onEnd); done(); }
    inflight = function () { var o = other(lastG || {}); el.style.transition = 'none'; if (o) o.style.transition = 'none'; fin(); };
    function onEnd(ev) { if (ev.target === el && ev.propertyName === 'transform') fin(); }
    el.addEventListener('transitionend', onEnd);
    setTimeout(fin, ms + 80);
  }

  function end(e, cancelled) {
    if (!s) return;
    var g = s; s = null; lastG = g;
    setTimeout(function () { window.__lcNavSwipe = false; }, 0);
    if (!g.on) return;
    var t = e.changedTouches && e.changedTouches[0];
    var dist = t ? (t.clientX - g.x) * g.dir : 0, v = velocity(g), w = W();
    var whole = t ? (t.clientX - g.x0) * g.dir : 0, quick = now() - g.t0 < 300 && whole > 36;   // a short, fast flick always counts
    var go = !cancelled && g.r && (dist + v * 160 > w * 0.4 || (dist > 24 && v > 0.35) || quick) && v > -0.2;
    busy = true;

    if (!g.r || !g.live) {        // rubber-band or sub-page back: spring home, then act
      paint({ r: null, dir: g.dir }, 0, REDUCE ? 0 : 340);
      settle(app(), 340, function () {
        lift(false); busy = false; hideDots(200);
        if (go && g.r && g.r.kind === 'back') { if (g.r.hq) HF.hq.back(); else if (B().back) B().back(); }
        else if (go && g.r && g.r.kind === 'doc') fallback();
      });
      if (REDUCE) { lift(false); busy = false; }
      return;
    }
    var from = Math.min(1, Math.max(0, dist / w));
    var remaining = (go ? 1 - from : from) * w;
    var ms = REDUCE ? 0 : Math.round(Math.max(200, Math.min(380, remaining / Math.max(Math.abs(v), 1.1) * 1.6)));
    paint(g, go ? g.dir * w : 0, ms);
    var finish = function () {
      if (!go) { lift(false); busy = false; hideDots(250); return; }
      if (g.r.kind === 'doc') {
        leaving = true;
        try { sessionStorage.setItem('lc_slide', 'peek'); } catch (err) {}
        location.href = DOC_TARGET;
        return;
      }
      // Same page: switch tab underneath, then drop the drawn copy in the same frame (no flicker).
      history.pushState(null, '', '#' + g.r.to);
      B().showTab(g.r.to);
      lift(false); busy = false;
      dotsAt(pageIndex());
    };
    if (ms) settle(app(), ms, finish); else finish();
  }
  document.addEventListener('touchend', function (e) { end(e, false); });
  document.addEventListener('touchcancel', function (e) { end(e, true); });

  // Before the preview has loaded: slide out, then open the page.
  function fallback() {
    var d = inBudget ? 1 : -1;
    leaving = true; busy = true;
    try { sessionStorage.setItem('lc_slide', inBudget ? 'right' : 'left'); } catch (err) {}
    var b = document.body;
    b.style.transition = 'transform .2s ease-in, opacity .2s ease-in';
    b.style.transform = 'translateX(' + (d * 35) + '%)'; b.style.opacity = '0';
    setTimeout(function () { location.href = DOC_TARGET; }, 170);
  }

  // Arriving: after a live swipe the page is already in place; after the fallback it slides in.
  function arrive() {
    var how = null;
    try { how = sessionStorage.getItem('lc_slide'); sessionStorage.removeItem('lc_slide'); } catch (err) {}
    var b = document.body;
    if (how === 'left' || how === 'right') {
      b.style.transition = 'none';
      b.style.transform = 'translateX(' + (how === 'left' ? '35%' : '-35%') + ')'; b.style.opacity = '0';
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        b.style.transition = 'transform .26s ' + GLIDE + ', opacity .2s ease-out';
        b.style.transform = ''; b.style.opacity = '';
      }); });
    }
    if (how) setTimeout(function () { dotsAt(pageIndex()); }, 60);
    setTimeout(preload, 500);   // get the other page ready for the next swipe
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrive); else arrive();
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) { document.body.style.transform = ''; document.body.style.opacity = ''; lift(false); busy = false; leaving = false; inflight = null; s = null; }
  });
  window.addEventListener('resize', function () { if (frame && ready) shareInsets(); });
  // The page-change cross-fade is a nicety: if the browser skips it (e.g. the toolbar resizes), carry on quietly.
  function quiet(e) { var vt = e.viewTransition; if (vt) { vt.ready.catch(function () {}); vt.finished.catch(function () {}); vt.updateCallbackDone && vt.updateCallbackDone.catch(function () {}); } }
  window.addEventListener('pagereveal', quiet);
  window.addEventListener('pageswap', quiet);
})();
