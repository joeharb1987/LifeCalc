// LifeCalc colour themes — shared by the calculator and Budget. One choice colours the whole app.
(function () {
  'use strict';
  var KEY = 'lifecalc_accent_v1';
  // accent, accent text, soft fill (light) · accent text, soft fill (dark) · calculator operator key
  var THEMES = {
    sand:  { name: 'Sand',  accent: '#B58A5A', ink: '#8A6236', soft: '#F1E8DC', dInk: '#D2AA7C', dSoft: '#2B2620', op: '#FF9F0A' },
    sage:  { name: 'Sage',  accent: '#5E8C6A', ink: '#3F6B4B', soft: '#E3EEE5', dInk: '#9BC7A6', dSoft: '#1F2A23', op: '#3FA466' },
    ocean: { name: 'Ocean', accent: '#3F78A8', ink: '#2C5D88', soft: '#E1ECF5', dInk: '#93BBDF', dSoft: '#1C2733', op: '#2F8FE0' },
    plum:  { name: 'Plum',  accent: '#8A5A8C', ink: '#6E4170', soft: '#F0E4F0', dInk: '#CDA2CF', dSoft: '#2A2030', op: '#A35EC0' },
    rose:  { name: 'Rose',  accent: '#B5636E', ink: '#924652', soft: '#F6E3E5', dInk: '#E3A2AA', dSoft: '#2E1F22', op: '#E0566B' },
    slate: { name: 'Slate', accent: '#4A5568', ink: '#2F3A4C', soft: '#E5E8EE', dInk: '#AEB8C8', dSoft: '#222831', op: '#6B7A90' }
  };
  function get() { try { var k = localStorage.getItem(KEY); return THEMES[k] ? k : 'sand'; } catch (e) { return 'sand'; } }
  function lighten(hex, f) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function m(c) { return Math.round(c + (255 - c) * f); }
    return 'rgb(' + m(r) + ',' + m(g) + ',' + m(b) + ')';
  }
  function apply(key) {
    var t = THEMES[key] || THEMES.sand, el = document.getElementById('lcAccent');
    if (!el) { el = document.createElement('style'); el.id = 'lcAccent'; document.head.appendChild(el); }
    var dark = '--accent-ink:' + t.dInk + ';--accent-soft:' + t.dSoft + ';';
    var css = ':root{--accent:' + t.accent + ';--accent-ink:' + t.ink + ';--accent-soft:' + t.soft + ';--series-b:' + t.accent + ';}' +
      '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){' + dark + '}}' +
      ':root[data-theme="dark"]{' + dark + '}';
    // Calculator: Sand keeps Apple's orange keys; other themes recolour the operator keys.
    if (key !== 'sand') {
      css += ':root,body.dark,body{--op:' + t.op + ';--op-active-text:' + t.op + ';--op-press:' + lighten(t.op, .35) + ';--amber:' + t.op + ';}' +
        '.k-op,.k-eq{background:linear-gradient(180deg,' + lighten(t.op, .12) + ',' + t.op + ')!important;}';
    }
    el.textContent = css;
  }
  function set(key) { try { localStorage.setItem(KEY, key); } catch (e) {} apply(key); }
  apply(get());
  window.LCTheme = { THEMES: THEMES, get: get, set: set };
})();
