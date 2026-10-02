/* LifeCalc Budget — line icons (24×24, stroke = currentColor). Categories store an icon key from this set. */
(function (root) {
  'use strict';
  var P = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
    food: '<path d="M7 3v8"/><path d="M4.5 3v5a2.5 2.5 0 0 0 5 0V3"/><path d="M7 11v10"/><path d="M17 21V3c-2 1.5-3 4-3 7v3h3"/>',
    education: '<path d="m2.5 9 9.5-4.5L21.5 9 12 13.5Z"/><path d="M6.5 11v4.5c1.5 1.5 3.3 2.2 5.5 2.2s4-.7 5.5-2.2V11"/><path d="M21.5 9v5"/>',
    kids: '<circle cx="8" cy="7" r="2.5"/><circle cx="16.5" cy="8.5" r="2"/><path d="M3.5 20v-2.5A4.5 4.5 0 0 1 8 13a4.5 4.5 0 0 1 4.5 4.5V20"/><path d="M13.5 15.2a3.6 3.6 0 0 1 6.5 2.1V20"/>',
    car: '<path d="M5 16.5V12l2-5h10l2 5v4.5"/><path d="M3.5 12h17v4.5h-17z"/><circle cx="7.5" cy="16.5" r="1.6"/><circle cx="16.5" cy="16.5" r="1.6"/><path d="M5 18v2M19 18v2"/>',
    bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6Z"/>',
    shield: '<path d="M12 3 5 6v5.5c0 4.3 2.9 8 7 9.5 4.1-1.5 7-5.2 7-9.5V6Z"/><path d="m9 12 2 2 4-4"/>',
    bag: '<path d="M5 8h14l-1 13H6Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
    health: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/>',
    scissors: '<circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M8.3 15.8 18 4M15.7 15.8 6 4"/>',
    tv: '<rect x="3" y="5.5" width="18" height="12" rx="2.5"/><path d="M8 21h8"/><path d="m10.5 9.5 4 2-4 2Z"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19"/><path d="M6.5 15h3"/>',
    bank: '<path d="M3 9.5 12 4l9 5.5"/><path d="M4 21h16"/><path d="M5.5 10v8M10 10v8M14 10v8M18.5 10v8"/>',
    piggy: '<path d="M19 11.5c0-3.6-3.1-6-7-6s-7 2.4-7 6c0 1.9.9 3.6 2.5 4.7V19h3v-1.5h3V19h3v-2.8c1-.6 1.7-1.3 2.1-2.2H21v-3h-1.6a5 5 0 0 0-.4-1"/><path d="M15.5 10h.01"/><path d="M10 5.7A2.5 2.5 0 0 1 12.5 3"/>',
    laptop: '<rect x="4.5" y="5" width="15" height="10.5" rx="1.5"/><path d="M2.5 19h19"/>',
    pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
    wallet: '<path d="M4 7.5h15a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V6A2 2 0 0 1 5.5 4h11"/><path d="M16 14h.01"/>',
    transfer: '<path d="M4 8h14l-3.5-3.5"/><path d="M20 16H6l3.5 3.5"/>',
    chart: '<path d="M3 20h18"/><path d="m4.5 15.5 4.5-5 4 3 6.5-7.5"/><path d="M15 6h4.5v4.5"/>',
    coins: '<ellipse cx="9" cy="7" rx="5.5" ry="2.5"/><path d="M3.5 7v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7"/><path d="M9.5 16.3c.9 1 2.9 1.7 5 1.7 3 0 5.5-1.1 5.5-2.5v-4c0-1.2-1.8-2.2-4.3-2.4"/>',
    tag: '<path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8L21 12l-9 9Z"/><circle cx="8" cy="8" r="1.4"/>',
    cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v5M18 9.5v5"/>',
    crypto: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 8h4a2 2 0 0 1 0 4h-4h4.5a2 2 0 0 1 0 4h-4.5Z"/><path d="M11 6.5V8M11 16v1.5M13 6.5V8M13 16v1.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    upload: '<path d="M12 15V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M4 15v4.5h16V15"/>',
    download: '<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 15v4.5h16V15"/>',
    restore: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v4.5H8"/>',
    report: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17h.01"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.6-.9 1.2-1.8-.5-1.1.2-2.2 1.4-2.2h2.2a3.7 3.7 0 0 0 3.7-3.7c0-5.1-3.8-9.3-8.5-9.3Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="8" r="1"/>',
    reset: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.5 4v4.5H16"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="m15 6-6 6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    grip: '<circle cx="9" cy="6" r=".9"/><circle cx="15" cy="6" r=".9"/><circle cx="9" cy="12" r=".9"/><circle cx="15" cy="12" r=".9"/><circle cx="9" cy="18" r=".9"/><circle cx="15" cy="18" r=".9"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    pie: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
    arrowUp: '<path d="M7 17 17 7"/><path d="M9 7h8v8"/>',
    arrowDown: '<path d="M7 7l10 10"/><path d="M17 9v8H9"/>',
    calc: '<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><path d="M8 6.5h8v3H8z"/><path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'
  };

  // Keys offered when picking a category icon.
  var CATEGORY_ICONS = ['home', 'food', 'education', 'kids', 'car', 'bolt', 'shield', 'bag', 'health', 'scissors', 'tv', 'card', 'bank',
    'piggy', 'laptop', 'pin', 'wallet', 'transfer', 'chart', 'coins', 'cash', 'crypto', 'tag'];

  function icon(key, size, extra) {
    var p = P[key];
    if (!p) return key ? '<span class="emoji-glyph" aria-hidden="true">' + String(key).replace(/[<>&"]/g, '') + '</span>' : icon('tag', size, extra);
    return '<svg class="ic' + (extra ? ' ' + extra : '') + '" width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }

  root.HF = Object.assign(root.HF || {}, { icon: icon, ICON_KEYS: Object.keys(P), CATEGORY_ICONS: CATEGORY_ICONS });
})(typeof window !== 'undefined' ? window : globalThis);
