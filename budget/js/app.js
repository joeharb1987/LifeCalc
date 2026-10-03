/* LifeCalc Budget — UI. Renders from a single state object (S) and persists on every change. */
(function () {
  'use strict';
  var HF = window.HF, IM = HF.importer, icon = HF.icon;
  var S = HF.load() || HF.seed();
  S.settings.includeBusiness = true;
  S.settings.mode = 'budget';   // one budget view (the Actual switch was removed)
  var ui = {
    page: null,               // sub-page over a tab: { name: 'category'|'networth'|'reports', id, from }
    open: {}, ovOpen: {}, ovMode: 'amount', actualOffset: 0,
    stack: [], edit: {}, showOff: {}, txView: 'monthly', txOffset: 0, txFilter: 'all', txSearch: '',
    histView: 'monthly', catTab: 'items', nwRange: '6M', debtTab: 'active', importRows: null
  };
  var $app = document.getElementById('app');
  var money = HF.money;

  // ---------- Utilities ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function persist() {
    HF.recordNetWorth(S);
    if (!HF.save(S)) toast('Could not save — storage is full or blocked');
    if (HF.sync) HF.sync.changed();   // live sharing: send the change to the other phone
  }
  function commit(msg) { persist(); render(); if (msg) toast(msg); }
  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function cat(id) { return HF.catById(S, id); }
  // Section header: title (+ optional total) with + Add on the right. Rows drag by their grips at any time.
  function secHead(title, key, opts) {
    opts = opts || {};
    return '<div class="section-head"><h2>' + title + (opts.total ? ' <span class="sec-total num">' + opts.total + '</span>' : '') + '</h2><div class="sec-acts">' +
      (opts.add || '') + '</div></div>';
  }
  function secOpen(key, cls) { return '<section class="section' + (cls ? ' ' + cls : '') + (ui.edit[key] ? ' reorder' : '') + '">'; }
  function addBtn(attrs) { return '<button class="link" ' + attrs + '>' + icon('plus', 16) + ' Add</button>'; }
  function swipeDel(kind, id) { return '<button type="button" class="swipe-del" data-act="del-' + kind + '" data-id="' + id + '">Delete</button>'; }
  // Cancelled = switched off, or its end date has passed. Hidden behind "Show cancelled".
  function isCancelled(it) { return !it.active || (it.endDate && it.endDate < todayISO()); }
  function cancelledLink(key, n) {
    return n ? '<button class="link muted-link" data-act="show-off" data-id="' + key + '">' + (ui.showOff[key] ? 'Hide cancelled' : 'Show cancelled (' + n + ')') + '</button>' : '';
  }
  function visibleItems(list, key) { return ui.showOff[key] ? list : list.filter(function (it) { return !isCancelled(it); }); }
  function grip() { return '<span class="grip" aria-label="Drag to reorder">' + icon('grip', 18) + '</span>'; }
  // Sort by the order the user dragged things into (unsorted ones keep their original order, after).
  function byOrder(list) {
    return list.map(function (x, i) { return { x: x, i: i }; })
      .sort(function (a, b) { return (a.x.order != null ? a.x.order : 1e6 + a.i) - (b.x.order != null ? b.x.order : 1e6 + b.i); })
      .map(function (o) { return o.x; });
  }
  function catItems(catId) { return byOrder(S.items.filter(function (it) { return it.direction === 'out' && it.categoryId === catId; })); }
  function sortedCats() { return S.categories.slice().sort(function (a, b) { return a.order - b.order; }); }
  function expenseCats() { return sortedCats().filter(function (c) { return c.type !== 'income' && c.type !== 'transfer' && c.type !== 'investment'; }); }
  function num(v) { var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
  function todayISO() { return HF.toISO(new Date()); }
  function conv(it, view) { return HF.convert(it.amount, it.frequency, it.customWeeks, view || S.settings.view); }
  function toAnnual(v, view) { return view === 'weekly' ? v * 52 : view === 'monthly' ? v * 12 : v; }
  function initials(name) { return String(name || '').split(/[\s&]+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join(''); }
  var VIEW_WORD = { weekly: 'week', monthly: 'month', yearly: 'year' };
  var VIEW_SHORT = { weekly: '/wk', monthly: '/mo', yearly: '/yr' };
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function dayLabel(iso) { return DAYS[HF.parseISO(iso).getDay()] + ', ' + HF.fmtDate(iso, true); }
  var AVG_LABEL = 'Statement average Jan–Sep 2026, bank-only';
  var SOURCE_LABEL = { statement: 'Statement', statement_avg: 'Statement avg', cash: 'Manual cash', manual: 'Manual', imported: 'Imported', calculated: 'Calculated', assumption: 'Assumption' };

  function badge(text, cls) { return '<span class="badge ' + (cls || '') + '">' + esc(text) + '</span>'; }
  // Source badges: one pill style, colour by kind. Tap one for what it means.
  var SOURCE_TONE = { statement: 'stmt', statement_avg: 'stmt', imported: 'stmt', calculated: 'stmt', cash: 'sand', manual: '', assumption: 'flag' };
  var SOURCE_INFO = {
    statement: 'Taken from your bank statements.',
    statement_avg: AVG_LABEL + '. Your average spend from bank statements.',
    imported: 'Imported from a bank statement.',
    calculated: 'Worked out from other figures.',
    cash: 'Cash you entered by hand. It isn’t in your bank statements.',
    manual: 'A figure you entered by hand.',
    assumption: 'An estimate. Update it when you know the real number.'
  };
  function srcBadge(src) {
    return '<button type="button" class="badge ' + (SOURCE_TONE[src] || '') + '" data-act="src-info" data-src="' + esc(src) + '">' + esc(SOURCE_LABEL[src] || src) + '</button>';
  }
  function catIcon(c, cls) { return '<div class="ico ' + (cls || '') + '">' + icon(c ? c.icon : 'tag', 20) + '</div>'; }
  function seg(key, options, current, cls) {
    return '<div class="seg ' + (cls || '') + '" role="tablist">' + options.map(function (o) {
      var on = String(o[0]) === String(current);
      return '<button role="tab" aria-selected="' + on + '" class="' + (on ? 'on' : '') + '" data-act="set" data-key="' + key + '" data-val="' + o[0] + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function top(title, opts) {
    opts = opts || {};
    return '<header class="top">' + (opts.back ? '<button class="icon-btn" data-act="back" aria-label="Back">' + icon('back', 22) + '</button>' : '') +
      '<div style="flex:1;min-width:0"><h1>' + esc(title) + '</h1>' + (opts.sub ? '<div class="sub">' + opts.sub + '</div>' : '') + '</div>' + (opts.actions || '') +
      '<button class="icon-btn" data-act="app-menu" aria-label="Menu" aria-haspopup="menu">' + icon('calc', 22) + '</button></header>';
  }
  function emptyBlock(ic, title, text, actions) {
    return '<div class="empty"><div class="ico">' + icon(ic, 22) + '</div><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p>' + (actions || '') + '</div>';
  }

  // ---------- Render ----------
  var TABS = ['budget', 'transactions', 'debts', 'more'];
  var PAGE_TAB = { category: 'budget', networth: 'budget', assets: 'budget', debts: 'budget', reports: 'more' };
  function render() {
    var th = S.settings.theme || 'auto';
    if (th === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', th);
    var tab = TABS.indexOf(S.settings.tab) >= 0 ? S.settings.tab : 'budget';
    var html;
    if (ui.page) html = { category: renderCategory, networth: renderNetWorth, assets: renderAssets, debts: renderDebts, reports: renderReports }[ui.page.name]();
    else html = { budget: renderBudget, transactions: renderTransactions, debts: renderDebts, more: renderMore }[tab]();
    $app.innerHTML = html;
    if (location.hash.slice(1) !== tab) history.replaceState(null, '', '#' + tab);
  }
  // Top-right menu (same on the calculator): calculator modes, then Budget, Debts, Settings.
  function closeAppMenu(){ var m = document.getElementById('appMenu'); if (m) m.remove(); }
  function openAppMenu(btn){
    closeAppMenu();
    var tab = ui.page ? (ui.page.from || PAGE_TAB[ui.page.name]) : S.settings.tab;
    var item = function(label, mi, attrs, on){ return '<' + (attrs.href ? 'a' : 'button') + ' role="menuitem" class="' + (on ? 'on' : '') + '" ' +
      Object.keys(attrs).map(function(k){ return k + '="' + attrs[k] + '"'; }).join(' ') + '><span class="tick">✓</span><span class="mi">' + mi + '</span>' + label + '</' + (attrs.href ? 'a' : 'button') + '>'; };
    var m = document.createElement('div');
    m.id = 'appMenu'; m.className = 'app-menu'; m.setAttribute('role', 'menu');
    m.innerHTML = item('Basic', '±÷', { href: '../#basic' }) + item('Scientific', '<i>f</i>(x)', { href: '../#sci' }) + item('Convert', '⇆', { href: '../#convert' }) +
      '<div class="sep"></div>' +
      item('Budget', icon('pie', 18), { 'data-act': 'tab', 'data-val': 'budget' }, tab === 'budget') +
      item('Settings', icon('gear', 18), { 'data-act': 'tab', 'data-val': 'more' }, tab === 'more' || tab === 'transactions');
    document.body.appendChild(m);
    var r = btn.getBoundingClientRect();
    m.style.top = (r.bottom + 6) + 'px';
    m.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  }
  document.addEventListener('click', function(e){
    var m = document.getElementById('appMenu');
    if (m && !m.contains(e.target) && !e.target.closest('[data-act="app-menu"]')) closeAppMenu();
  }, true);

  function go(page) {
    page.from = ui.page ? ui.page.from : (S.settings.tab || 'budget');
    if (ui.page) ui.stack.push(ui.page);
    ui.page = page; render(); window.scrollTo(0, 0);
  }

  // ===================== SHARED SUMMARY =====================
  function greeting() { var h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
  function statTrio(income, expenses, left, w) {
    return '<div class="stats">' +
      '<div class="stat"><div class="lbl">Income</div><div class="val num">' + money(income, { dp: 0 }) + '</div><div class="per">per ' + w + '</div></div>' +
      '<button class="stat" data-act="overview"><div class="lbl">Expenses</div><div class="val num">' + money(expenses, { dp: 0 }) + '</div><div class="per">per ' + w + '</div></button>' +
      '<div class="stat left ' + (left < 0 ? 'negative' : '') + '"><div class="lbl">Left over</div><div class="val num">' + money(left, { dp: 0 }) + '</div><div class="per">per ' + w + '</div></div></div>';
  }
  // ===================== BUDGET =====================
  function renderBudget() {
    var s = S.settings;
    var h = top('Budget', { sub: greeting() + ', ' + esc(s.userName || 'there'), actions: '<button class="icon-btn" data-act="overview" aria-label="Expense overview">' + icon('dots', 22) + '</button>' });
    h += '<div class="controls">' + seg('view', [['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']], s.view) + '</div>';

    var sum = HF.budgetSummary(S, s.view), w = VIEW_WORD[s.view];
    h += statTrio(sum.income, sum.expenses, sum.available, w);
    // Assets, debts and net worth — one combined picture, each tile opens its detail.
    var nw = HF.netWorth(S);
    h += '<div class="stats mt12">' +
      '<button class="stat" data-act="page" data-val="assets"><div class="lbl">Assets</div><div class="val num">' + money(nw.assets, { dp: 0 }) + '</div><div class="per">' + S.assets.length + ' accounts</div></button>' +
      '<button class="stat" data-act="page" data-val="debts"><div class="lbl">Debts</div><div class="val num neg">' + money(nw.liabilities, { dp: 0 }) + '</div><div class="per">' + (nw.missing.length ? nw.missing.length + ' need balance' : 'all debts') + '</div></button>' +
      '<button class="stat" data-act="page" data-val="networth"><div class="lbl">Net worth</div><div class="val num ' + (nw.net < 0 ? 'neg' : '') + '">' + money(nw.net, { dp: 0 }) + '</div><div class="per">assets − debts</div></button></div>';


    // Earnings first, then Expenses, then One-offs (listed, never counted).
    var view = s.view, incomes = byOrder(S.items.filter(function (i) { return i.direction === 'in'; }));
    var incShown = visibleItems(incomes, 'earn'), incOff = incomes.filter(isCancelled).length;
    h += secOpen('earn') + secHead('Earnings', 'earn', { total: money(sum.income, { dp: 0 }) + VIEW_SHORT[view], add: addBtn('data-act="add-item" data-dir="in"') });
    h += incShown.length ? '<div class="list" data-sort-list="items:in">' + incShown.map(function (it) { return itemRow(it, { sortable: true }); }).join('') + '</div>' : '<div class="card">' + emptyBlock('wallet', 'No earnings yet', 'Add your income sources.') + '</div>';
    h += incOff ? '<div class="sec-foot">' + cancelledLink('earn', incOff) + '</div>' : '';
    h += '</section>';

    h += secOpen('exp') + secHead('Expenses', 'exp', { add: addBtn('data-act="add-item" data-dir="out"') });
    h += renderCategoryList(sum) + '</section>';

    var ones = byOrder(S.items.filter(function (i) { return i.direction === 'out' && HF.isOneOff(S, i); }));
    if (ones.length) {
      var oneShown = visibleItems(ones, 'one'), oneOff = ones.filter(isCancelled).length;
      var oneTotal = ones.reduce(function (a, i) { return a + (isCancelled(i) ? 0 : Number(i.amount) || 0); }, 0);
      h += secOpen('one') + secHead('One-offs', 'one', { total: money(oneTotal, { dp: 0 }), add: addBtn('data-act="add-item" data-dir="out" data-cat="' + oneoffCatId() + '"') });
      h += '<div class="list" data-sort-list="items:oneoff">' + oneShown.map(function (it) { return itemRow(it, { sortable: true }); }).join('') + '</div>';
      h += '<div class="sec-foot"><span class="muted small">Listed so nothing is hidden. Not counted in Expenses.</span>' + cancelledLink('one', oneOff) + '</div></section>';
    }
    return h;
  }
  function oneoffCatId() { var c = S.categories.filter(function (c) { return c.type === 'oneoff'; })[0]; return c ? c.id : ''; }

  // ---------- Runway: how long the cash reserve lasts at recent spending ----------
  function bankWindow() {
    if (!S.transactions.length) return null;
    var last = S.transactions.reduce(function (m, t) { return t.date > m ? t.date : m; }, ''), first = S.transactions.reduce(function (m, t) { return t.date < m ? t.date : m; }, last);
    var end = HF.parseISO(last), start = new Date(end); start.setDate(start.getDate() - 13 * 7 + 1);
    var startISO = HF.toISO(start) < first ? first : HF.toISO(start);
    var weeks = Math.max(1, Math.min(13, Math.ceil(((end - HF.parseISO(startISO)) / 864e5 + 1) / 7)));
    return { start: startISO, end: last, weeks: weeks };
  }
  function runwayLine() {
    var reserve = assetsIn('cash').reduce(function (a, x) { return a + (Number(x.value) || 0); }, 0);
    var win = bankWindow(), rate = 0, basis;
    if (win) {
      S.transactions.forEach(function (t) { if (t.date >= win.start && t.date <= win.end && t.amount < 0 && !HF.txExcluded(S, t)) rate -= t.amount; });
      rate = rate / win.weeks; basis = 'last ' + win.weeks + ' weeks’ rate';
    }
    if (!rate) { rate = HF.budgetSummary(S, 'weekly').expenses; basis = 'budgeted rate'; }
    var body;
    if (!reserve) body = '<b>Runway</b><span>Add your bank balances in Assets to see how long your reserve lasts.</span>';
    else {
      var wks = rate ? reserve / rate : 0;
      body = '<b>Reserve lasts ~' + (wks >= 10 ? Math.round(wks) : wks.toFixed(1)) + ' week' + (wks === 1 ? '' : 's') + ' at ' + basis + '</b>' +
        '<span class="num">' + money(reserve, { dp: 0 }) + ' cash ÷ ' + money(rate, { dp: 0 }) + '/wk spending</span>';
    }
    return '<button class="runway" data-act="page" data-val="assets">' + icon('umbrella', 20) + '<div>' + body + '</div>' + icon('chev', 16, 'chev') + '</button>';
  }
  // Bank average for a manual line: matching transactions in the same category over the last 13 weeks.
  var STOP = { 'and': 1, 'the': 1, 'with': 1, 'from': 1, 'for': 1, 'payment': 1, 'repayment': 1, 'weekly': 1, 'monthly': 1 };
  function bankAvgWeekly(it) {
    var win = bankWindow(); if (!win) return null;
    var words = [it.provider || ''].concat(String(it.name).split(/[\s\-—–\/,()·&']+/)).map(function (w) { return w.toLowerCase(); })
      .filter(function (w) { return w.length >= 4 && !STOP[w]; });
    var alone = S.items.filter(function (x) { return x.active && x.direction === it.direction && x.categoryId === it.categoryId; }).length === 1;
    var total = 0, hits = 0;
    S.transactions.forEach(function (t) {
      if (t.date < win.start || t.date > win.end || HF.txExcluded(S, t) || (t.amount < 0) !== (it.direction === 'out')) return;
      if (t.category_id !== it.categoryId) return;
      var text = ((t.merchant || '') + ' ' + (t.description_raw || '')).toLowerCase();
      if (alone || words.some(function (w) { return text.indexOf(w) >= 0; })) { total += Math.abs(t.amount); hits++; }
    });
    return hits ? total / win.weeks : null;
  }
  var MANUAL_SOURCES = { manual: 1, cash: 1, assumption: 1 };
  function bankCompare(it, v) {
    if (!MANUAL_SOURCES[it.source] || it.frequency === 'oneoff') return '';
    var avg = bankAvgWeekly(it); if (avg == null) return '';
    return 'Budget ' + money(v, { dp: 0 }) + ' · Bank avg ' + money(HF.convert(avg, 'weekly', null, S.settings.view), { dp: 0 });
  }

  function renderCategoryList(sum) {
    var rows = [];
    expenseCats().forEach(function (c) {
      if (c.type === 'oneoff') return;
      var items = catItems(c.id).filter(function (i) { return !HF.isOneOff(S, i); });
      if (!items.length) return;
      rows.push({ c: c, v: sum.byCat[c.id] || 0, items: items });
    });
    if (!rows.length) return '<div class="card">' + emptyBlock('tag', 'No expenses yet', 'Add your first expense.') + '</div>';
    var max = Math.max.apply(null, rows.map(function (r) { return r.v; }).concat([1]));
    // Each category is its own card. Tap to open in place; Edit (section header) shows the drag grips.
    return '<div class="cat-stack" data-sort-list="cats">' + rows.map(function (r) {
      var pct = sum.expenses ? r.v / sum.expenses * 100 : 0, key = 'c_' + r.c.id, open = ui.open[key];
      var shown = visibleItems(r.items, key), off = r.items.filter(isCancelled).length;
      var h = '<div class="grp' + (open ? ' open' : '') + '" data-sort-id="' + r.c.id + '"><div class="row cat-row" role="button" tabindex="0" aria-expanded="' + !!open + '" data-act="toggle" data-id="' + key + '">' + grip() + catIcon(r.c) +
        '<div class="main"><div class="top-line"><span class="name">' + esc(r.c.name) + '</span><span class="amt num">' + money(r.v, { dp: 0 }) + '</span></div>' +
        '<div class="top-line"><div class="bar"><span style="width:' + (r.v / max * 100).toFixed(1) + '%"></span></div><span class="pct num">' + pct.toFixed(0) + '%</span></div></div>' +
        icon('chev', 18, 'chev') + '</div>';
      if (open) {
        h += '<div class="grp-body" data-sort-list="items:' + r.c.id + '">' + shown.map(function (it) { return itemRow(it, { sortable: true }); }).join('') + '</div>' +
          '<div class="grp-foot"><button class="link" data-act="add-item" data-dir="out" data-cat="' + r.c.id + '">' + icon('plus', 16) + ' Add</button>' + cancelledLink(key, off) +
          '<button class="link" data-act="page" data-val="category" data-id="' + r.c.id + '">Details ' + icon('chev', 14) + '</button></div>';
      }
      return h + '</div>';
    }).join('') + '</div>';
  }

  // One budget line. Tap to edit, swipe left to delete; the grip shows only in reorder mode.
  function itemRow(it, opts) {
    opts = opts || {};
    var view = S.settings.view, reason = HF.excludedReason(S, it), isOne = it.frequency === 'oneoff';
    var v = isOne ? Number(it.amount) || 0 : conv(it, view);
    var c = cat(it.categoryId), bits = [srcBadge(it.source)];
    if (it.review) bits.push(badge('Review', 'flag'));
    if (reason && reason !== 'Business' && reason !== 'One-off') bits.push(badge(reason));
    if (it.endDate && !reason) bits.push(badge('Ends ' + HF.fmtDate(it.endDate, true)));
    bits.push('<span>' + esc((Number(it.amount) ? money(it.amount, { dp: 2 }) : '—') + ' ' + HF.freqLabel(it)) + (opts.showCat && c ? ' · ' + esc(c.name) : '') + '</span>');
    var cmp = bankCompare(it, v);
    return '<div class="row item-row swipe' + (reason && reason !== 'One-off' ? ' dim' : '') + (isCancelled(it) ? ' off' : '') + '" role="button" tabindex="0" data-act="edit-item" data-id="' + it.id + '"' + (opts.sortable ? ' data-sort-id="' + it.id + '">' + grip() : '>') +
      '<div class="main"><div class="name">' + esc(it.name) + '</div><div class="sub">' + bits.join('') + '</div>' + (cmp ? '<div class="cmp num">' + cmp + '</div>' : '') + '</div>' +
      '<div class="amt num ' + (it.direction === 'in' && !reason ? 'pos' : '') + '">' + (Number(it.amount) ? money(v, { dp: 2 }) : '—') + '<small>' + (isOne ? 'once' : VIEW_SHORT[view]) + '</small></div>' +
      swipeDel('item', it.id) + '</div>';
  }


  // ---------- Category detail ----------
  function renderCategory() {
    var c = cat(ui.page.id);
    if (!c) { ui.page = null; return renderBudget(); }
    var view = S.settings.view, sum = HF.budgetSummary(S, view);
    var items = S.items.filter(function (i) { return i.categoryId === c.id && i.direction === 'out'; });
    var v = sum.byCat[c.id] || 0, pct = sum.expenses ? v / sum.expenses * 100 : 0;
    var h = top('', { back: true, actions: '<button class="icon-btn" data-act="edit-cat" data-id="' + c.id + '" aria-label="Edit category">' + icon('dots', 22) + '</button>' });
    h += '<div style="display:flex;align-items:center;gap:14px;margin:-4px 2px 14px"><div class="ico" style="width:52px;height:52px;border-radius:50%">' + icon(c.icon, 26) + '</div><h1 class="h2" style="font-size:26px">' + esc(c.name) + '</h1></div>';
    h += '<div class="card hero"><div class="hero-top"><div><div class="big num">' + money(v) + '</div><div class="per">per ' + VIEW_WORD[view] + (c.type === 'oneoff' ? ' · one-offs aren\'t counted' : '') + '</div></div>' +
      '<div class="pill"><b>' + pct.toFixed(0) + '%</b><small>of total expenses</small></div></div>';
    var months = monthlyCategory(c.id, 9);
    if (months.some(function (m) { return m.value > 0; })) {
      var nz = months.filter(function (m) { return m.value > 0; });
      var avg = nz.reduce(function (a, m) { return a + m.value; }, 0) / nz.length;
      h += '<div class="mt16">' + barChart('catBars', months.map(function (m) { return m.label; }), [{ name: c.name, color: 'var(--series-b)', values: months.map(function (m) { return m.value; }) }], { avg: avg }) + '</div>' +
        '<p class="muted small" style="margin:6px 0 0">Actual monthly spend from statements · avg ' + money(avg, { dp: 0 }) + '</p>';
    } else h += '<p class="muted small" style="margin:14px 0 0">The monthly chart fills in once statements with ' + esc(c.name) + ' transactions are imported.</p>';
    h += '</div>';
    h += '<div class="mt16">' + seg('catTab', [['items', 'Items'], ['insight', 'Insight']], ui.catTab, 'sm') + '</div>';
    if (ui.catTab === 'items') {
      h += items.length ? secOpen('catpage', 'mt12') + secHead('Items', 'catpage') + '<div class="list" data-sort-list="items:' + c.id + '">' + catItems(c.id).map(function (it) { return itemRow(it, { sortable: true }); }).join('') + '</div></section>' : '<div class="card mt12">' + emptyBlock(c.icon, 'Nothing here yet', 'Add an expense to this category.') + '</div>';
      var tx = S.transactions.filter(function (t) { return t.category_id === c.id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 8);
      if (tx.length) h += '<div class="section-head mt16"><h2>Recent transactions</h2></div><div class="list">' + tx.map(txRow).join('') + '</div>';
    } else h += categoryInsight(c, items, v);
    h += '<button class="btn soft block mt16" data-act="add-item" data-dir="out" data-cat="' + c.id + '">' + icon('plus', 18) + ' Add expense</button>';
    return h;
  }
  function monthlyCategory(catId, n) {
    var now = new Date(), out = [];
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ key: HF.toISO(d).slice(0, 7), label: HF.MONTHS[d.getMonth()], value: 0 });
    }
    S.transactions.forEach(function (t) {
      if (t.category_id !== catId || t.amount >= 0 || HF.txExcluded(S, t)) return;
      var m = out.filter(function (o) { return o.key === t.date.slice(0, 7); })[0];
      if (m) m.value += -t.amount;
    });
    return out;
  }
  function categoryInsight(c, items, v) {
    var view = S.settings.view, fixed = 0, variable = 0, counted = 0, bySrc = {}, yr = toAnnual(v, view);
    items.forEach(function (i) {
      if (HF.excludedReason(S, i)) return;
      counted++;
      var x = conv(i, view);
      if (i.kind === 'variable') variable += x; else fixed += x;
      bySrc[i.source] = (bySrc[i.source] || 0) + 1;
    });
    var h = '<div class="card pad mt12">' +
      '<div class="kv"><span>Per week</span><b class="num">' + money(yr / 52) + '</b></div>' +
      '<div class="kv"><span>Per month</span><b class="num">' + money(yr / 12) + '</b></div>' +
      '<div class="kv"><span>Per year</span><b class="num">' + money(yr) + '</b></div>' +
      '<div class="kv"><span>Fixed recurring</span><b class="num">' + money(fixed) + VIEW_SHORT[view] + '</b></div>' +
      '<div class="kv"><span>Statement averages</span><b class="num">' + money(variable) + VIEW_SHORT[view] + '</b></div>' +
      '<div class="kv"><span>Items counted</span><b>' + counted + ' of ' + items.length + '</b></div>' +
      '<div class="kv"><span>Sources</span><b style="text-align:right">' + (Object.keys(bySrc).map(function (k) { return SOURCE_LABEL[k] + ' ×' + bySrc[k]; }).join(', ') || '—') + '</b></div></div>';
    var notes = [];
    if (items.some(function (i) { return i.source === 'statement_avg'; })) notes.push(AVG_LABEL + '. Cash spending is only included when you add it.');
    if (c.type === 'savings') notes.push('Family savings leave the adult account but aren\'t consumption — they\'re counted in net worth.');
    if (c.type === 'oneoff') notes.push('One-offs are listed so nothing is hidden, but never count toward recurring spending.');
    var tx = S.transactions.filter(function (t) { return t.category_id === c.id && t.amount < 0 && !HF.txExcluded(S, t); });
    if (tx.length) notes.push(tx.length + ' imported transaction' + (tx.length > 1 ? 's' : '') + ' in this category.');
    return h + (notes.length ? '<div class="note">' + notes.join('<br>') + '</div>' : '');
  }

  // ---------- Expense overview (deep sheet) ----------
  function openOverview() {
    var s = S.settings, view = s.view, total, cats = [];
    var actual = s.mode === 'actual' && s.tab === 'budget' && !ui.page && S.transactions.length;
    if (actual) {
      var range = HF.periodRange(view, new Date(), ui.actualOffset), a = HF.actualSummary(S, range, view);
      total = a.expenses;
      Object.keys(a.byCat).forEach(function (k) {
        var lines = {};
        S.transactions.forEach(function (t) {
          if (!HF.txInRange(t, range, view) || t.amount >= 0 || HF.txExcluded(S, t) || (t.category_id || 'uncategorised') !== k) return;
          var n = t.merchant || t.description_raw; lines[n] = (lines[n] || 0) - t.amount;
        });
        cats.push({ id: k, c: cat(k) || { name: 'Uncategorised', icon: 'tag' }, v: a.byCat[k], lines: Object.keys(lines).map(function (n) { return [n, lines[n]]; }) });
      });
    } else {
      var sum = HF.budgetSummary(S, view);
      total = sum.expenses;
      Object.keys(sum.byCat).forEach(function (k) {
        cats.push({ id: k, c: cat(k), v: sum.byCat[k], lines: S.items.filter(function (i) { return i.categoryId === k && i.direction === 'out' && HF.itemIncluded(S, i); }).map(function (i) { return [i.name, conv(i, view)]; }) });
      });
    }
    cats.sort(function (x, y) { return y.v - x.v; });
    var max = cats.length ? cats[0].v : 1;
    function body() {
      return '<div class="ov-total"><div class="lbl muted">Total expenses · ' + (actual ? 'actual · ' : '') + VIEW_WORD[view] + 'ly</div><div class="big num">' + money(total, { dp: 2 }) + '</div></div>' +
        '<div style="margin-bottom:12px">' + seg('ovMode', [['amount', 'Amount'], ['pct', 'Percentage']], ui.ovMode) + '</div>' +
        cats.map(function (x) {
          var pct = total ? x.v / total * 100 : 0;
          x.lines.sort(function (p, q) { return q[1] - p[1]; });
          return '<div class="ov-row ' + (ui.ovOpen[x.id] ? 'open' : '') + '"><button class="ov-head" data-ov="' + x.id + '">' + catIcon(x.c, 'sm') + '<div class="main">' +
            '<div style="display:flex;justify-content:space-between;gap:8px;font-weight:600"><span>' + esc(x.c.name) + '</span><span class="num">' + (ui.ovMode === 'pct' ? pct.toFixed(1) + '%' : money(x.v)) + '</span></div>' +
            '<div style="display:flex;align-items:center;gap:10px"><div class="bar" style="flex:1"><span style="width:' + (x.v / max * 100).toFixed(1) + '%"></span></div><span class="pct small num">' + (ui.ovMode === 'pct' ? money(x.v, { dp: 0 }) : pct.toFixed(0) + '%') + '</span></div></div></button>' +
            '<div class="ov-lines">' + x.lines.map(function (l) { return '<div><span>' + esc(l[0]) + '</span><span class="num">' + money(l[1]) + '</span></div>'; }).join('') + '</div></div>';
        }).join('');
    }
    openSheet('Expense Overview', body(), function (el) {
      // Captured here so these clicks don't reach the page-level handlers.
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-ov]');
        if (b) { e.stopPropagation(); ui.ovOpen[b.dataset.ov] = !ui.ovOpen[b.dataset.ov]; b.parentNode.classList.toggle('open'); return; }
        var m = e.target.closest('[data-key="ovMode"]');
        if (m) { e.stopPropagation(); ui.ovMode = m.dataset.val; el.querySelector('.sheet-body').innerHTML = body(); }
      }, true);
    }, { deep: true });
  }

  // ===================== TRANSACTIONS =====================
  function txRow(t) {
    var c = cat(t.category_id), acct = byId(S.accounts, t.account_id), excl = HF.txExcluded(S, t);
    var bits = ['<span>' + esc(c ? c.name : 'Uncategorised') + '</span>'];
    if (t.source === 'cash') bits.push(badge('Manual cash'));
    if (t.internal_transfer) bits.push(badge('Transfer', 'outline'));
    if (t.cash_deposit) bits.push(badge('Cash deposit', 'outline'));
    if (t.one_off) bits.push(badge('One-off', 'outline'));
    if (!t.category_id || t.sign_guessed) bits.push(badge(!t.category_id ? 'Uncategorised' : 'Check sign', 'flag'));
    return '<button class="row ' + (excl ? 'dim' : '') + '" data-act="edit-tx" data-id="' + t.id + '"><div class="ico round">' + icon(c ? c.icon : 'tag', 20) + '</div>' +
      '<div class="main"><div class="name">' + esc(t.merchant || t.description_raw) + '</div><div class="sub">' + bits.join('') + '</div></div>' +
      '<div class="amt num ' + (excl ? '' : t.amount > 0 ? 'pos' : 'neg') + '">' + (t.amount > 0 ? '+' : '−') + money(Math.abs(t.amount), { dp: 2 }) + '<small>' + esc(acct ? acct.name : '') + '</small></div></button>';
  }
  function renderTransactions() {
    var h = top('Transactions', { actions: '<button class="icon-btn" data-act="import" aria-label="Import statement">' + icon('upload', 21) + '</button><button class="icon-btn" data-act="add-tx" aria-label="Add cash entry">' + icon('plus', 22) + '</button>' });
    if (!S.transactions.length) {
      return h + '<div class="card">' + emptyBlock('upload', 'No transactions yet', 'Import a CSV bank statement or paste lines copied from internet banking. Merchant rules categorise everything, and transfers between your own accounts are excluded.',
        '<div class="btn-row"><button class="btn accent" data-act="import">Import statement</button><button class="btn" data-act="add-tx">Cash entry</button></div>') + '</div>';
    }
    h += '<div class="search">' + icon('search', 18) + '<input type="search" placeholder="Search transactions" value="' + esc(ui.txSearch) + '" data-act="tx-search" aria-label="Search transactions"></div>';
    var f = ui.txFilter;
    h += '<div class="chips">' + [['all', 'All'], ['in', 'Income'], ['out', 'Expenses'], ['transfer', 'Transfers'], ['uncat', 'Uncategorised'], ['cash', 'Manual cash'], ['oneoff', 'One-offs'], ['sign', 'Check sign']].map(function (c) {
      return '<button class="chip ' + (f === c[0] ? 'on' : '') + '" data-act="tx-filter" data-val="' + c[0] + '">' + c[1] + '</button>';
    }).join('') + '</div>';
    h += '<div class="controls">' + seg('txView', [['weekly', 'Week'], ['monthly', 'Month'], ['yearly', 'Year'], ['all', 'All']], ui.txView, 'sm') + '</div>';
    var range = ui.txView === 'all' ? null : HF.periodRange(ui.txView, new Date(), ui.txOffset);
    if (range) h += '<div class="period"><button data-act="tx-shift" data-val="-1" aria-label="Previous">' + icon('back', 18) + '</button><b>' + HF.periodLabel(ui.txView, range) + '</b><button data-act="tx-shift" data-val="1" aria-label="Next">' + icon('chev', 18) + '</button></div>';
    var q = ui.txSearch.toLowerCase();
    var list = S.transactions.filter(function (t) {
      if (range && !HF.txInRange(t, range, ui.txView)) return false;
      if (q && (t.merchant + ' ' + t.description_raw).toLowerCase().indexOf(q) < 0) return false;
      var tr = t.internal_transfer || t.cash_deposit;
      if (f === 'in') return t.amount > 0 && !tr;
      if (f === 'out') return t.amount < 0 && !tr;
      if (f === 'transfer') return tr;
      if (f === 'uncat') return !t.category_id;
      if (f === 'cash') return t.source === 'cash';
      if (f === 'oneoff') return t.one_off;
      if (f === 'sign') return t.sign_guessed;
      return true;
    }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    var tin = 0, tout = 0;
    list.forEach(function (t) { if (HF.txExcluded(S, t)) return; if (t.amount > 0) tin += t.amount; else tout -= t.amount; });
    h += '<div class="stats"><div class="stat"><div class="lbl">In</div><div class="val num pos" style="font-size:17px">' + money(tin, { dp: 0 }) + '</div></div><div class="stat"><div class="lbl">Out</div><div class="val num neg" style="font-size:17px">' + money(tout, { dp: 0 }) + '</div></div>' +
      '<div class="stat"><div class="lbl">Left</div><div class="val num" style="font-size:17px">' + money(tin - tout, { dp: 0 }) + '</div></div></div>';
    if (!list.length) return h + '<div class="card pad muted mt12">No transactions match.</div>';
    var shown = list.slice(0, 400), last = null, grp = '';
    shown.forEach(function (t) {
      if (t.date !== last) { if (grp) h += grp + '</div>'; h += '<div class="day">' + dayLabel(t.date) + '</div>'; grp = '<div class="list">'; last = t.date; }
      grp += txRow(t);
    });
    h += grp + '</div>';
    if (list.length > shown.length) h += '<p class="muted small right">Showing 400 of ' + list.length + ' — narrow the period or search.</p>';
    return h;
  }

  // ===================== REPORTS =====================
  function renderReports() {
    var v = ui.histView, hist = HF.history(S, v, v === 'yearly' ? 6 : 12);
    var h = top('Reports', { back: true, sub: 'Actual money in and out, from statements' });
    h += '<div class="controls">' + seg('histView', [['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']], v) + '</div>';
    if (!hist.length) return h + '<div class="card">' + emptyBlock('report', 'No data yet', 'Reports are built from imported statements and manual cash entries.', '<button class="btn accent" data-act="import">Import statement</button>') + '</div>';
    var labels = hist.map(function (b) { return HF.periodShortLabel(v, b.key); });
    h += '<div class="card pad"><div style="font-weight:700">Left over each ' + VIEW_WORD[v] + '</div><div class="muted small" style="margin-bottom:8px">' + (v === 'weekly' ? 'Monday–Sunday budget weeks' : 'Calendar ' + VIEW_WORD[v] + 's') + '</div>' +
      lineChart('repTrend', hist.map(function (b, i) { return { label: labels[i], value: b.available }; }), { height: 130 }) + '</div>';
    h += '<div class="card pad"><div style="font-weight:700;margin-bottom:6px">Money in vs money out</div><div class="legend"><span><i class="dot" style="background:var(--series-a)"></i>In</span><span><i class="dot" style="background:var(--series-b)"></i>Out</span></div>' +
      barChart('rep1', labels, [{ name: 'In', color: 'var(--series-a)', values: hist.map(function (b) { return b.income; }) }, { name: 'Out', color: 'var(--series-b)', values: hist.map(function (b) { return b.expenses; }) }]) + '</div>';
    h += '<div class="card pad" style="overflow-x:auto"><table class="tbl num"><thead><tr><th>' + (v === 'weekly' ? 'Week (Mon)' : v === 'monthly' ? 'Month' : 'Year') + '</th><th>In</th><th>Out</th><th>Left</th><th>Savings</th></tr></thead><tbody>' +
      hist.slice().reverse().map(function (b) {
        return '<tr><td>' + HF.periodShortLabel(v, b.key) + '</td><td>' + money(b.income, { dp: 0 }) + '</td><td>' + money(b.expenses, { dp: 0 }) + '</td><td>' + money(b.available, { dp: 0 }) + '</td><td>' + money(b.savings, { dp: 0 }) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return h;
  }

  // ---------- Charts ----------
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function shortMoney(v) {
    var a = Math.abs(v), s = a >= 1e6 ? (a / 1e6).toFixed(1) + 'm' : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k' : a.toFixed(0);
    return (v < 0 ? '−' : '') + '$' + s;
  }
  // Grouped bars on one shared axis; optional dashed average line.
  function barChart(id, labels, series, opts) {
    opts = opts || {};
    var W = 340, H = opts.height || 170, padL = 40, padB = 22, padT = 8;
    var all = []; series.forEach(function (s) { all = all.concat(s.values); });
    var hi = niceMax(Math.max.apply(null, all.concat([0, opts.avg || 0]))), lo = Math.min.apply(null, all.concat([0]));
    lo = lo < 0 ? -niceMax(-lo) : 0;
    var plotH = H - padB - padT, plotW = W - padL - 4;
    function y(v) { return padT + (hi - v) / (hi - lo) * plotH; }
    var n = labels.length, gw = plotW / n, bw = Math.max(3, Math.min(18, (gw - 6) / series.length - 2));
    var ticks = [hi, hi / 2, 0]; if (lo < 0) ticks.push(lo);
    ticks = ticks.filter(function (t, i) { return i === 0 || y(t) - y(ticks[i - 1]) >= 14; });
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Bar chart">';
    svg += '<g class="grid">' + ticks.map(function (t) { return '<line x1="' + padL + '" x2="' + W + '" y1="' + y(t) + '" y2="' + y(t) + '"/>'; }).join('') + '</g>';
    svg += '<g class="axis">' + ticks.map(function (t) { return '<text x="' + (padL - 6) + '" y="' + (y(t) + 3) + '" text-anchor="end">' + shortMoney(t) + '</text>'; }).join('') + '</g>';
    var step = Math.ceil(n / 9), hits = '';
    labels.forEach(function (l, i) {
      var gx = padL + i * gw, total = series.length * (bw + 2) - 2, x0 = gx + (gw - total) / 2;
      series.forEach(function (s, j) {
        var v = s.values[i]; if (!v) return;
        var top = y(Math.max(v, 0)), bot = y(Math.min(v, 0)), hgt = Math.max(1, bot - top), x = x0 + j * (bw + 2), r = Math.min(4, bw / 2, hgt);
        // Rounded at the data end, square at the baseline.
        var d = v >= 0
          ? 'M' + x + ',' + bot + 'V' + (top + r) + 'Q' + x + ',' + top + ' ' + (x + r) + ',' + top + 'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + top + ' ' + (x + bw) + ',' + (top + r) + 'V' + bot + 'Z'
          : 'M' + x + ',' + top + 'V' + (bot - r) + 'Q' + x + ',' + bot + ' ' + (x + r) + ',' + bot + 'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + bot + ' ' + (x + bw) + ',' + (bot - r) + 'V' + top + 'Z';
        svg += '<path d="' + d + '" fill="' + s.color + '"/>';
      });
      if (i % step === 0 || i === n - 1) svg += '<g class="axis"><text x="' + (gx + gw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(l) + '</text></g>';
      var tip = '<b>' + esc(l) + '</b>' + series.map(function (s) { return esc(s.name) + ' ' + money(s.values[i], { dp: 0 }); }).join('<br>');
      hits += '<rect x="' + gx + '" y="0" width="' + gw + '" height="' + (H - padB) + '" fill="transparent" data-tip="' + esc(tip) + '" data-cx="' + ((gx + gw / 2) / W) + '"/>';
    });
    if (opts.avg) svg += '<line class="avg" x1="' + padL + '" x2="' + W + '" y1="' + y(opts.avg) + '" y2="' + y(opts.avg) + '"/><text class="avg-lbl" x="' + W + '" y="' + (y(opts.avg) - 4) + '" text-anchor="end">Avg ' + shortMoney(opts.avg) + '</text>';
    if (lo < 0) svg += '<line class="zero" x1="' + padL + '" x2="' + W + '" y1="' + y(0) + '" y2="' + y(0) + '"/>';
    svg += hits + '</svg>';
    return '<div class="chart" id="' + id + '">' + svg + '<div class="tip"></div></div>';
  }
  // Single-series area line (home trend, net worth).
  function lineChart(id, pts, opts) {
    opts = opts || {};
    var W = 340, H = opts.height || 150, padL = 40, padB = 22, padT = 10;
    var vals = pts.map(function (p) { return p.value; });
    var hiRaw = Math.max.apply(null, vals), loRaw = Math.min.apply(null, vals);
    var spread = hiRaw - loRaw || Math.abs(hiRaw) || 1;
    var hi = hiRaw + spread * .15, lo = loRaw - spread * .15;
    if (loRaw >= 0 && lo < 0) lo = 0;
    var plotH = H - padB - padT, plotW = W - padL - 8, n = pts.length;
    function x(i) { return padL + (n === 1 ? plotW / 2 : i / (n - 1) * plotW); }
    function y(v) { return padT + (hi - v) / (hi - lo) * plotH; }
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.value).toFixed(1); }).join('');
    var area = line + 'L' + x(n - 1).toFixed(1) + ',' + (H - padB) + 'L' + x(0).toFixed(1) + ',' + (H - padB) + 'Z';
    var ticks = [hi, (hi + lo) / 2, lo];
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Line chart"><defs><linearGradient id="g_' + id + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>';
    svg += '<g class="grid">' + ticks.map(function (t) { return '<line x1="' + padL + '" x2="' + W + '" y1="' + y(t) + '" y2="' + y(t) + '"/>'; }).join('') + '</g>';
    svg += '<g class="axis">' + ticks.map(function (t) { return '<text x="' + (padL - 6) + '" y="' + (y(t) + 3) + '" text-anchor="end">' + shortMoney(t) + '</text>'; }).join('') + '</g>';
    if (lo < 0 && hi > 0) svg += '<line class="zero" x1="' + padL + '" x2="' + W + '" y1="' + y(0) + '" y2="' + y(0) + '"/>';
    svg += '<path d="' + area + '" fill="url(#g_' + id + ')"/><path d="' + line + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    svg += '<circle cx="' + x(n - 1) + '" cy="' + y(vals[n - 1]) + '" r="4" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/>';
    var step = Math.ceil(n / 5);
    pts.forEach(function (p, i) { if (i % step === 0 || i === n - 1) svg += '<g class="axis"><text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="' + (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle') + '">' + esc(p.label) + '</text></g>'; });
    var gw = plotW / Math.max(1, n - 1);
    pts.forEach(function (p, i) {
      svg += '<rect x="' + (x(i) - gw / 2) + '" y="0" width="' + gw + '" height="' + (H - padB) + '" fill="transparent" data-tip="' + esc('<b>' + esc(p.label) + '</b>' + money(p.value, { dp: 0 })) + '" data-cx="' + (x(i) / W) + '"/>';
    });
    return '<div class="chart" id="' + id + '">' + svg + '</svg><div class="tip"></div></div>';
  }
  function chartHover(e) {
    var r = e.target.closest && e.target.closest('rect[data-tip]');
    document.querySelectorAll('.chart .tip.show').forEach(function (t) { if (!r || !t.parentNode.contains(r)) t.classList.remove('show'); });
    if (!r) return;
    var chart = r.closest('.chart'), tip = chart.querySelector('.tip');
    tip.innerHTML = r.getAttribute('data-tip');
    tip.style.left = Math.min(Math.max(Number(r.dataset.cx) * chart.clientWidth, 60), chart.clientWidth - 60) + 'px';
    tip.style.top = '6px';
    tip.classList.add('show');
  }

  // ===================== DEBTS =====================
  function debtMonthly(d) { return HF.convert(d.payment, d.frequency, null, 'monthly'); }
  function renderDebts() {
    var h = top('Debts', { back: !!ui.page, actions: '<button class="icon-btn" data-act="add-debt" aria-label="Add debt">' + icon('plus', 22) + '</button>' });
    var inScope = S.debts;
    var active = inScope.filter(function (d) { return d.active !== false; });
    var bal = 0, pay = 0, interest = 0, missing = 0;
    active.forEach(function (d) {
      if (d.balance == null || d.balance === '') missing++; else bal += Number(d.balance);
      pay += debtMonthly(d);
      if (d.rate && d.balance) interest += d.balance * d.rate / 100 / 12;
    });
    h += '<div class="card hero"><div class="hero-top"><div><div class="lbl">Total debt balance</div><div class="big num">' + money(bal, { dp: 0 }) + '</div>' +
      '<div class="per">All active debts</div></div>' +
      '<div class="pill"><b class="num">' + money(pay, { dp: 0 }) + '</b><small>repayments / month</small></div></div>' +
      '<div class="split" style="grid-template-columns:1fr 1fr"><div><small>Est. interest / month</small><b class="num">' + money(interest, { dp: 0 }) + '</b></div><div><small>Balances not set</small><b>' + missing + '</b></div></div></div>';
    h += '<div class="mt16">' + seg('debtTab', [['active', 'Active'], ['paid', 'Paid off']], ui.debtTab, 'sm') + '</div>';
    var list = byOrder(inScope).filter(function (d) { return ui.debtTab === 'active' ? d.active !== false : d.active === false; });
    h += secOpen('debts', 'mt12') + secHead(ui.debtTab === 'active' ? 'Active' : 'Paid off', list.length > 1 ? 'debts' : '', { add: addBtn('data-act="add-debt"') });
    h += list.length ? '<div class="list" data-sort-list="debts">' + list.map(debtRow).join('') + '</div></section>' : '</section><div class="card mt12">' + emptyBlock('card', ui.debtTab === 'active' ? 'No active debts' : 'Nothing paid off yet', ui.debtTab === 'active' ? 'Add one to track it.' : 'Turn a debt off when it\'s paid and it moves here.') + '</div>';
    h += '<div class="note">Repayments are targets. What actually left the bank is in Transactions under Debt Repayments.</div>';
    return h;
  }
  function debtRow(d) {
    var bal = d.balance == null || d.balance === '' ? null : Number(d.balance);
    var months = bal != null ? HF.payoffMonths(bal, d.rate, debtMonthly(d)) : null;
    var payoff = d.endDate ? 'ends ' + HF.fmtDate(d.endDate, true) : bal == null ? '' : months === null ? (debtMonthly(d) ? 'interest > repayment' : 'no repayment set') : months === 0 ? 'paid off' : 'payoff ~' + (months < 12 ? months + ' mo' : (months / 12).toFixed(1) + ' yrs');
    var bits = [];
    if (d.rate != null && d.rate !== '') bits.push('<span>' + d.rate + '%</span>');
    if (payoff) bits.push('<span>' + payoff + '</span>');
    if (d.limit && bal > d.limit) bits.push('<span class="neg" style="font-weight:600">over limit by ' + money(bal - d.limit, { dp: 2 }) + '</span>');
    var util = d.limit && bal != null ? Math.min(100, bal / d.limit * 100) : null;
    return '<div class="row swipe" role="button" tabindex="0" data-act="edit-debt" data-id="' + d.id + '" data-sort-id="' + d.id + '">' + grip() + '<div class="ico">' + icon('card', 20) + '</div><div class="main"><div class="name">' + esc(d.name) + '</div><div class="sub">' + bits.join('<span>·</span>') + '</div>' +
      (util != null ? '<div class="bar ' + (bal > d.limit ? 'over' : '') + '"><span style="width:' + util.toFixed(1) + '%"></span></div>' : '') + '</div>' +
      '<div class="amt num">' + (bal == null ? '<span class="muted" style="font-weight:600;font-size:13px">Balance not set</span>' : money(bal, { dp: 2 })) +
      '<small>' + (Number(d.payment) ? money(d.payment, { dp: 2 }) + ' / ' + ({ weekly: 'week', fortnightly: 'fortnight', monthly: 'month', quarterly: 'quarter' }[d.frequency] || d.frequency) : 'no repayment set') + '</small></div>' + swipeDel('debt', d.id) + '</div>';
  }

  // ===================== NET WORTH =====================
  function assetCats() { return byOrder(S.assetCats); }
  function assetCat(id) { return byId(S.assetCats, id) || byId(S.assetCats, 'other') || { id: 'other', name: 'Other assets', icon: 'tag' }; }
  function assetsIn(catId) {
    var known = S.assetCats.map(function (c) { return c.id; });
    return byOrder(S.assets.filter(function (a) { return a.type === catId || (catId === 'other' && known.indexOf(a.type) < 0); }));
  }
  function renderNetWorth() {
    var nw = HF.netWorth(S);
    var h = top('Net Worth', { back: true });
    var hist = (S.nwHistory || []).map(function (p) { return { date: p.date, value: p.all != null ? p.all : p.household }; });
    var monthAgo = HF.toISO(new Date(Date.now() - 30 * 864e5)), base = null;
    hist.forEach(function (p) { if (p.date <= monthAgo) base = p; });
    var change = base && base.value ? (nw.net - base.value) / Math.abs(base.value) * 100 : null;
    h += '<div class="card hero"><div class="hero-top"><div><div class="lbl">Total net worth</div><div class="big num">' + money(nw.net, { dp: 0 }) + '</div><div class="per">Assets − all debts</div></div>' +
      (change != null ? '<div class="pill"><b class="num ' + (change >= 0 ? 'pos' : 'neg') + '">' + icon(change >= 0 ? 'arrowUp' : 'arrowDown', 16) + Math.abs(change).toFixed(1) + '%</b><small>vs last month</small></div>' : '') + '</div>';
    var days = { '1M': 31, '3M': 92, '6M': 183, '1Y': 366, All: 1e5 }[ui.nwRange];
    var from = HF.toISO(new Date(Date.now() - days * 864e5));
    var pts = hist.filter(function (p) { return p.date >= from; }).map(function (p) { return { label: HF.fmtDate(p.date), value: p.value }; });
    h += pts.length >= 2 ? '<div class="mt12">' + lineChart('nwChart', pts) + '</div>' : '<p class="muted small" style="margin:12px 0 0">The chart builds up as you update balances — one point per day something changes.</p>';
    h += '<div class="range">' + ['1M', '3M', '6M', '1Y', 'All'].map(function (r) { return '<button class="' + (ui.nwRange === r ? 'on' : '') + '" data-act="nw-range" data-val="' + r + '">' + r + '</button>'; }).join('') + '</div></div>';

    var activeDebts = byOrder(S.debts).filter(function (d) { return d.active !== false; });
    h += secOpen('nw', 'mt16') + secHead('Breakdown', 'nw') + '<div class="list">' +
      nwSection('nw_a', 'bank', 'Assets', S.assets.length + ' accounts &amp; holdings', money(nw.assets, { dp: 0 }), '',
        '<div class="grp-body" data-sort-list="assetcats">' + assetGroups() + '</div>',
        '<button class="link" data-act="add-asset">' + icon('plus', 16) + ' Add asset</button>') +
      nwSection('nw_d', 'card', 'Debts', activeDebts.length + ' active' + (nw.missing.length ? ' · ' + nw.missing.length + ' without balance' : ''), '−' + money(nw.liabilities, { dp: 0 }), 'neg',
        '<div class="grp-body" data-sort-list="debts">' + activeDebts.map(debtRow).join('') + '</div>',
        '<button class="link" data-act="add-debt">' + icon('plus', 16) + ' Add debt</button>') +
      '<div class="row nw-total"><div class="main"><div class="name">Net worth</div><div class="sub">Assets − debts</div></div><div class="amt num ' + (nw.net < 0 ? 'neg' : '') + '">' + money(nw.net, { dp: 0 }) + '</div></div></div></section>';
    if (nw.missing.length) h += '<div class="note"><b>Not yet subtracted:</b> ' + nw.missing.map(function (d) { return esc(d.name); }).join(', ') + ' — no balance set yet. Tap Debts to add them.</div>';
    return h;
  }
  // A collapsible Net Worth section (tap to open in place).
  function nwSection(key, ic, name, sub, amt, cls, body, foot) {
    var open = ui.open[key];
    return '<div class="grp' + (open ? ' open' : '') + '"><div class="row cat-row" role="button" tabindex="0" aria-expanded="' + !!open + '" data-act="toggle" data-id="' + key + '"><div class="ico">' + icon(ic, 20) + '</div>' +
      '<div class="main"><div class="name">' + name + '</div><div class="sub">' + sub + '</div></div><div class="amt num ' + cls + '">' + amt + '</div>' + icon('chev', 18, 'chev') + '</div>' +
      (open ? body + '<div class="grp-foot">' + foot + '</div>' : '') + '</div>';
  }
  function renderAssets() {
    var nw = HF.netWorth(S);
    var h = top('Assets', { back: true, actions: '<button class="icon-btn" data-act="add-asset" aria-label="Add asset">' + icon('plus', 22) + '</button>' });
    h += '<div class="card hero"><div class="lbl">Total assets</div><div class="big num">' + money(nw.assets, { dp: 0 }) + '</div><div class="per">' + S.assets.length + ' accounts &amp; holdings</div></div>';
    h += secOpen('assets', 'mt16') + secHead('By category', 'assets', { add: addBtn('data-act="add-asset"') });
    h += '<div class="cat-stack" data-sort-list="assetcats">' + assetGroups() + '</div></section>';
    h += '<p class="muted small" style="margin:10px 4px">Market values change — update them when you check.</p>';
    return h;
  }
  function assetGroups() {
    var h = '';
    assetCats().forEach(function (g) {
      var list = assetsIn(g.id);
      if (!list.length) return;
      // Groups start closed; tap a header to open it. Edit shows the drag grips.
      var tot = list.reduce(function (s, a) { return s + (Number(a.value) || 0); }, 0), key = 'asx_' + g.id, open = ui.open[key];
      h += '<div class="grp' + (open ? ' open' : '') + '" data-sort-id="' + g.id + '"><div class="row cat-row" role="button" tabindex="0" data-act="toggle" data-id="' + key + '">' + grip() + '<div class="ico">' + icon(g.icon, 20) + '</div><div class="main"><div class="name">' + esc(g.name) + '</div><div class="sub">' + list.length + ' item' + (list.length === 1 ? '' : 's') + '</div></div><div class="amt num">' + money(tot, { dp: 0 }) + '</div>' + icon('chev', 18, 'chev') + '</div>' +
        (open ? '<div class="grp-body" data-sort-list="assets:' + g.id + '">' + list.map(assetRow).join('') + '</div>' +
          '<div class="grp-foot"><button class="link" data-act="add-asset" data-type="' + g.id + '">' + icon('plus', 16) + ' Add</button><button class="link" data-act="edit-assetcat" data-id="' + g.id + '">' + icon('edit', 14) + ' Edit category</button></div>' : '') + '</div>';
    });
    return h;
  }
  function assetRow(a) {
    return '<div class="row swipe" role="button" tabindex="0" data-act="edit-asset" data-id="' + a.id + '" data-sort-id="' + a.id + '">' + grip() + '<div class="main"><div class="name">' + esc(a.name) + '</div><div class="sub">' + '' +
      '<span>Updated ' + (a.updated ? HF.fmtDate(a.updated, true) : '—') + '</span>' + (a.notes ? '<span>· ' + esc(a.notes) + '</span>' : '') + '</div></div><div class="amt num">' + money(a.value, { dp: 2 }) + '</div>' + swipeDel('asset', a.id) + '</div>';
  }

  // ===================== MORE =====================
  function moreRow(act, ic, title, sub, extra) {
    return '<button class="row" data-act="' + act + '"' + (extra || '') + '><div class="ico plain sm">' + icon(ic, 18) + '</div><div class="main"><div class="name" style="font-weight:500">' + title + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>' + icon('chev', 18, 'chev') + '</button>';
  }
  function renderMore() {
    var s = S.settings;
    var h = top('Settings');
    h += '<button class="card profile" data-act="profile" style="width:100%;text-align:left"><div class="avatar">' + esc(initials(s.householdName || s.userName)) + '</div><div style="flex:1"><b>' + esc(s.householdName || 'Household') + '</b><span class="muted small">Household account · ' + esc(s.userName || '') + '</span></div>' + icon('chev', 18, 'chev') + '</button>';
    h += '<div class="list mt12">' + moreRow('sync', 'kids', 'Live sharing', HF.sync ? HF.sync.label() : 'Needs internet') + '</div>';
    h += '<div class="list mt12">' +
      moreRow('tab', 'transfer', 'Transactions', S.transactions.length + ' imported and cash entries', ' data-val="transactions"') +
      moreRow('settings', 'gear', 'Household settings', 'Manual cash in totals') +
      moreRow('page', 'chart', 'Net Worth', 'Assets minus all debts', ' data-val="networth"') +
      moreRow('page', 'report', 'Reports', 'Actual in vs out over time', ' data-val="reports"') +
      moreRow('manage-cats', 'grid', 'Categories', S.categories.length + ' categories') +
      moreRow('manage-rules', 'tag', 'Merchant rules', S.rules.length + ' rules') +
      moreRow('manage-accounts', 'bank', 'Accounts', S.accounts.length + ' accounts') +
      moreRow('import', 'upload', 'Import statement', 'CSV or pasted lines') +
      moreRow('share-data', 'upload', 'Send a copy', 'One-off copy by AirDrop, Messages or email') +
      moreRow('export', 'download', 'Export data', 'Download a JSON backup') +
      moreRow('restore', 'restore', 'Restore backup', 'Replaces current data') + '</div>';
    h += '<div class="list mt12">' + moreRow('appearance', 'palette', 'Appearance', { auto: 'Automatic', light: 'Light', dark: 'Dark' }[s.theme || 'auto'] + (window.LCTheme ? ' · ' + LCTheme.THEMES[LCTheme.get()].name : '')) +
      moreRow('help', 'help', 'How the numbers work') +
      moreRow('reset', 'reset', 'Reset to starting figures', 'Replaces everything with the original seed data') + '</div>';
    h += '<input type="file" id="restoreFile" accept=".json,application/json" class="sr-only">';
    h += '<p class="muted small" style="margin:12px 4px">Data is stored on this device only. Export a backup now and then.</p>';
    return h;
  }
  function toggleHtml(name, label, hint, checked, act) {
    return '<label class="toggle"><span class="t-text"><b>' + label + '</b>' + (hint ? '<small>' + hint + '</small>' : '') + '</span><span class="switch"><input type="checkbox" name="' + name + '"' + (act ? ' data-act="setting" data-key="' + name + '"' : '') + (checked ? ' checked' : '') + '><i></i></span></label>';
  }
  function openSettings() {
    var s = S.settings;
    openSheet('Household settings',
      toggleHtml('includeCash', 'Include manual cash', 'Off = bank-derived totals only. On = bank + manual cash', s.includeCash, true));
  }
  function openAppearance() {
    var cur = window.LCTheme ? LCTheme.get() : 'sand';
    var swatches = window.LCTheme ? '<div class="field mt16"><span>Colour</span><div class="swatches" id="accentPick">' + Object.keys(LCTheme.THEMES).map(function (k) {
      var t = LCTheme.THEMES[k];
      return '<label><input type="radio" name="accent" value="' + k + '"' + (k === cur ? ' checked' : '') + '><span style="--sw:' + t.accent + '"><i></i>' + t.name + '</span></label>';
    }).join('') + '</div><div class="hint">Colours Budget and the calculator keys. Sand keeps Apple’s orange keys.</div></div>' : '';
    openSheet('Appearance', '<div class="field"><span>Mode</span></div><div class="choice" id="themePick">' + [['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
      return '<label><input type="radio" name="theme" value="' + o[0] + '"' + ((S.settings.theme || 'auto') === o[0] ? ' checked' : '') + '><span>' + o[1] + '</span></label>';
    }).join('') + '</div>' + swatches, function (el) {
      el.querySelector('#themePick').addEventListener('change', function (e) { S.settings.theme = e.target.value; commit(); });
      var ap = el.querySelector('#accentPick');
      if (ap) ap.addEventListener('change', function (e) { LCTheme.set(e.target.value); render(); });
    });
  }
  function openHelp() {
    openSheet('How the numbers work', '<div class="card pad" style="font-size:14px;line-height:1.55">' +
      '<p style="margin-top:0"><b>Budget</b> = recurring costs + statement-average variable spending (' + AVG_LABEL + '). One-offs are listed but not counted.</p>' +
      '<p><b>Conversions:</b> weekly ×52, fortnightly ×26, monthly ×12, quarterly ×4, per term ×4, every X weeks ×52/X. Weekly = yearly ÷ 52, monthly = yearly ÷ 12.</p>' +
      '<p><b>Dates:</b> items with an end date (e.g. AGL arrears, Feb 2027) stop counting after it.</p>' +
      '<p><b>Weeks</b> run Monday → Sunday. In Actual, weekly figures group by each transaction\'s budget week, so a split payment can be moved into the week it belongs to.</p>' +
      '<p><b>Excluded from cash flow:</b> internal transfers between your own accounts, cash deposits (already counted as manual cash) and investment buys/sells.</p>' +
      '<p><b>Kids savings</b> leave the adult account as Family Savings: shown in expenses so Left over is honest, excluded from lifestyle, counted in net worth.</p>' +
      '<p style="margin-bottom:0"><b>Net worth</b> = assets − every active debt in scope. Debts with no balance are listed until you add one.</p></div>');
  }
  function openProfile() {
    var s = S.settings;
    openForm('Profile', '<label class="field"><span>Your name</span><input name="userName" value="' + esc(s.userName || '') + '"></label>' +
      '<label class="field"><span>Household name</span><input name="householdName" value="' + esc(s.householdName || '') + '"></label>', function (form) {
      s.userName = form.userName.value.trim(); s.householdName = form.householdName.value.trim();
      closeSheet(); commit('Saved');
    });
  }

  // ===================== FORMS =====================
  function opts(list, cur) { return list.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join(''); }
  function catOptions(cur, types) {
    return sortedCats().filter(function (c) { return !types || types.indexOf(c.type) >= 0; }).map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === cur ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
  }
  function choice(name, list, cur) {
    return '<div class="choice">' + list.map(function (o) {
      return '<label><input type="radio" name="' + name + '" value="' + o[0] + '"' + (String(o[0]) === String(cur) ? ' checked' : '') + '><span>' + o[1] + '</span></label>';
    }).join('') + '</div>';
  }
  function iconPick(name, cur) {
    return '<div class="icon-pick">' + HF.CATEGORY_ICONS.map(function (k) {
      return '<label><input type="radio" name="' + name + '" value="' + k + '"' + (cur === k ? ' checked' : '') + ' aria-label="' + k + '"><span>' + icon(k, 20) + '</span></label>';
    }).join('') + '</div>';
  }
  function openAssetCatForm(id) {
    var c = byId(S.assetCats, id); if (!c) return;
    var used = S.assets.filter(function (a) { return a.type === c.id; }).length;
    openForm('Edit Category', '<label class="field"><span>Name</span><input name="name" required value="' + esc(c.name) + '"></label>' +
      '<div class="field"><span>Icon</span>' + iconPick('icon', c.icon) + '</div>' +
      '<button type="button" class="btn danger-text block" id="acDel">' + icon('trash', 18) + ' Delete category</button>' +
      (used ? '<p class="muted small" style="text-align:center">Its ' + used + ' asset' + (used > 1 ? 's move' : ' moves') + ' to Other assets.</p>' : ''), function (form) {
      c.name = form.name.value.trim() || c.name; c.icon = radio(form, 'icon') || c.icon;
      closeSheet(); commit('Saved');
    }, function (el) {
      el.querySelector('#acDel').addEventListener('click', function () {
        if (c.id === 'other') { toast('Other assets can’t be deleted'); return; }
        if (!confirmDel('“' + c.name + '”')) return;
        S.assets.forEach(function (a) { if (a.type === c.id) a.type = 'other'; });
        S.assetCats = S.assetCats.filter(function (x) { return x.id !== c.id; });
        closeSheet(); commit('Deleted');
      });
    });
  }
  function radio(form, name) { var el = form.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : null; }
  function freqOptions(cur) { return HF.FREQUENCIES.map(function (f) { return '<option value="' + f.id + '"' + (f.id === cur ? ' selected' : '') + '>' + f.label + '</option>'; }).join(''); }

  function openItemForm(id, dir, catId) {
    var it = id ? byId(S.items, id) : {
      id: null, direction: dir || 'out', name: '', categoryId: dir === 'in' ? 'c_income' : (catId || 'c_housing'), amount: '', frequency: 'weekly', customWeeks: '',
      source: 'manual', kind: 'fixed', active: true, scope: 'personal', review: false, provider: '', notes: '', startDate: null, endDate: null
    };
    var isIn = it.direction === 'in';
    var b = choice('direction', [['out', 'Expense'], ['in', 'Earnings']], it.direction) + '<div style="height:14px"></div>' +
      '<label class="field"><span>Name</span><input name="name" required value="' + esc(it.name) + '" placeholder="' + (isIn ? "e.g. Ariel's" : 'e.g. House cleaner') + '"></label>' +
      '<label class="field" id="catField"' + (isIn ? ' style="display:none"' : '') + '><span>Category</span><select name="categoryId">' + catOptions(it.categoryId, ['living', 'debt', 'tax', 'savings', 'business', 'oneoff']) + '</select></label>' +
      '<div class="grid2"><label class="field"><span>Amount</span><div class="money-input"><input name="amount" inputmode="decimal" value="' + esc(it.amount) + '" placeholder="0.00"></div></label>' +
      '<label class="field"><span>Frequency</span><select name="frequency">' + freqOptions(it.frequency) + '</select></label></div>' +
      '<label class="field" id="xField"' + (it.frequency === 'everyX' ? '' : ' style="display:none"') + '><span>Every how many weeks?</span><input name="customWeeks" inputmode="decimal" value="' + esc(it.customWeeks || '') + '" placeholder="e.g. 3.5"></label>' +
      '<div class="preview" id="convPreview"></div>' +
      '<div class="grid2"><label class="field"><span>Start date</span><input type="date" name="startDate" value="' + esc(it.startDate || '') + '"></label>' +
      '<label class="field"><span>End date</span><input type="date" name="endDate" value="' + esc(it.endDate || '') + '"></label></div>' +
      '<div class="field"><span>Source</span>' + choice('source', [['statement', 'Statement'], ['statement_avg', 'Statement avg'], ['cash', 'Manual cash'], ['manual', 'Manual'], ['assumption', 'Assumption'], ['calculated', 'Calculated']], it.source) + '</div>' +
      '<div class="field"><span>Behaviour</span>' + choice('kind', [['fixed', 'Recurring'], ['variable', 'Variable'], ['oneoff', 'One-off']], it.kind) + '</div>' +
      toggleHtml('active', 'Active', 'Inactive items are kept but not counted', it.active) +
      toggleHtml('review', 'Needs review', 'Flag to check against statements', it.review) +
      '<label class="field mt12"><span>Provider</span><input name="provider" value="' + esc(it.provider) + '" placeholder="Optional"></label>' +
      '<label class="field"><span>Notes</span><textarea name="notes" placeholder="Optional">' + esc(it.notes) + '</textarea></label>' +
      (it.id ? '<button type="button" class="btn danger-text block" data-act="del-item" data-id="' + it.id + '">' + icon('trash', 18) + ' Delete ' + (isIn ? 'earnings' : 'expense') + '</button>' : '');
    openForm(it.id ? 'Edit ' + (isIn ? 'Earnings' : 'Expense') : 'Add ' + (isIn ? 'Earnings' : 'Expense'), b, function (form) {
      var d = {
        name: form.name.value.trim() || 'Untitled', direction: radio(form, 'direction'),
        amount: Math.round(num(form.amount.value) * 100) / 100, frequency: form.frequency.value,
        customWeeks: form.frequency.value === 'everyX' ? num(form.customWeeks.value) || null : null,
        source: radio(form, 'source'), kind: radio(form, 'kind'), scope: it.scope || 'personal',
        provider: form.provider.value.trim(), active: form.active.checked, review: form.review.checked, notes: form.notes.value.trim(),
        startDate: form.startDate.value || null, endDate: form.endDate.value || null
      };
      d.categoryId = d.direction === 'in' ? 'c_income' : form.categoryId.value;
      if (d.frequency === 'oneoff') d.kind = 'oneoff';
      if (d.kind === 'oneoff') d.frequency = 'oneoff';
      if (d.startDate && d.endDate && d.endDate < d.startDate) { toast('End date is before start date'); return; }
      if (it.id) Object.assign(it, d); else S.items.push(Object.assign({ id: HF.uid('i') }, d));
      closeSheet(); commit(it.id ? 'Saved' : 'Added');
    }, function (el) {
      var form = el.querySelector('form');
      function preview() {
        var a = num(form.amount.value), fr = form.frequency.value, x = num(form.customWeeks.value);
        el.querySelector('#xField').style.display = fr === 'everyX' ? '' : 'none';
        el.querySelector('#catField').style.display = radio(form, 'direction') === 'in' ? 'none' : '';
        if (fr === 'oneoff') { el.querySelector('#convPreview').innerHTML = 'One-off: <b>' + money(a) + '</b> once — kept out of recurring totals.'; return; }
        var yr = HF.annualise(a, fr, x);
        el.querySelector('#convPreview').innerHTML = '= <b class="num">' + money(yr / 52) + '</b>/wk · <b class="num">' + money(yr / 12) + '</b>/mo · <b class="num">' + money(yr) + '</b>/yr';
      }
      form.addEventListener('input', preview); form.addEventListener('change', preview); preview();
    });
  }

  function openTxForm(id) {
    var t = id ? byId(S.transactions, id) : HF.newTransaction({ account_id: 'a_cash', category_id: 'c_food', source: 'cash', amount: '' });
    var isNew = !id, editableAmt = isNew || t.source !== 'imported';
    var dir = t.direction || (t.amount > 0 ? 'in' : 'out');
    var b = (t.description_raw && !isNew ? '<div class="note" style="margin:0 0 14px"><b>Statement text:</b> ' + esc(t.description_raw) + (t.date_raw && t.date_raw !== t.date ? '<br><b>Statement date:</b> ' + esc(t.date_raw) : '') + '</div>' : '') +
      '<label class="field"><span>' + (isNew ? 'Description' : 'Merchant name') + '</span><input name="merchant" required value="' + esc(t.merchant || t.description_raw) + '" placeholder="e.g. House cleaner"></label>' +
      (editableAmt ? '<div class="field"><span>Money</span>' + choice('dir', [['out', 'Out (spent)'], ['in', 'In (received)']], dir) + '</div>' : '') +
      '<div class="grid2"><label class="field"><span>Amount</span><div class="money-input"><input name="amount" inputmode="decimal" value="' + (t.amount === '' ? '' : Math.abs(t.amount)) + '"' + (editableAmt ? '' : ' readonly') + '></div></label>' +
      '<label class="field"><span>Date</span><input type="date" name="date" value="' + esc(t.date) + '"' + (editableAmt ? '' : ' readonly') + '></label></div>' +
      (editableAmt ? '' : '<p class="muted small" style="margin:-6px 2px 14px">Imported amounts and dates stay as the statement shows them.</p>') +
      '<div class="grid2"><label class="field"><span>Category</span><select name="category_id"><option value="">Uncategorised</option>' + catOptions(t.category_id) + '</select></label>' +
      '<label class="field"><span>Subcategory</span><input name="subcategory" value="' + esc(t.subcategory || '') + '" placeholder="Optional"></label></div>' +
      '<div class="grid2"><label class="field"><span>Budget week (Mon)</span><input type="date" name="budget_week" value="' + esc(t.budget_week || '') + '"></label>' +
      '<label class="field"><span>Recurring group</span><input name="recurring_group" value="' + esc(t.recurring_group || '') + '" placeholder="e.g. Ariana Dance"></label></div>' +
      '<p class="muted small" style="margin:-6px 2px 14px">Move a split payment into the budget week it belongs to.</p>' +
      (isNew ? '' : toggleHtml('internal_transfer', 'Internal transfer', 'Between your own accounts — not income or expense', t.internal_transfer) +
        toggleHtml('cash_deposit', 'Cash deposit', 'Cash already counted manually — don\'t double count', t.cash_deposit)) +
      toggleHtml('recurring', 'Recurring', 'A normal repeating payment', t.recurring) +
      toggleHtml('one_off', 'One-off', 'Keep out of normal recurring spending', t.one_off) +
      (!isNew && t.source === 'imported' ? '<label class="field mt12"><span>Make a rule (optional)</span><input name="rulePattern" placeholder="e.g. ' + esc(String(t.description_raw).split(/\s+/).slice(0, 2).join(' ').toUpperCase()) + '"><div class="hint">Future imports containing this text get this name & category.</div></label>' : '') +
      '<label class="field mt12"><span>Notes</span><textarea name="notes">' + esc(t.notes) + '</textarea></label>' +
      (isNew ? '' : '<button type="button" class="btn danger-text block" data-act="del-tx" data-id="' + t.id + '">' + icon('trash', 18) + ' Delete transaction</button>');
    openForm(isNew ? 'Cash Entry' : 'Transaction', b, function (form) {
      var d = {
        merchant: form.merchant.value.trim(), category_id: form.category_id.value || null, subcategory: form.subcategory.value.trim() || null,
        recurring_group: form.recurring_group.value.trim() || null, recurring: form.recurring.checked, one_off: form.one_off.checked, notes: form.notes.value.trim()
      };
      if (editableAmt) {
        var a = Math.abs(num(form.amount.value)), dr = radio(form, 'dir');
        d.amount = dr === 'in' ? a : -a; d.direction = dr;
        if (form.date.value && form.date.value !== t.date) { d.date = form.date.value; d.date_raw = form.date.value; }
      }
      var date = d.date || t.date || todayISO();
      d.budget_week = HF.toISO(HF.weekStart(HF.parseISO(form.budget_week.value || date)));
      if (!isNew) { d.internal_transfer = form.internal_transfer.checked; d.cash_deposit = form.cash_deposit.checked; d.user_edited = true; d.sign_guessed = false; }
      if (d.internal_transfer) d.category_id = 'c_transfer';
      if (isNew) S.transactions.push(HF.newTransaction(Object.assign({ description_raw: d.merchant, account_id: 'a_cash', source: 'cash', date: date }, d)));
      else Object.assign(t, d);
      var pat = form.rulePattern && form.rulePattern.value.trim();
      if (pat) {
        S.rules.unshift({ id: HF.uid('r'), pattern: pat.toUpperCase(), merchant: d.merchant, categoryId: d.category_id, flag: d.internal_transfer ? 'internal' : d.cash_deposit ? 'cashDeposit' : null });
        var n = IM.reapplyRules(S);
        closeSheet(); commit('Rule added' + (n ? ' · ' + n + ' updated' : ''));
        return;
      }
      closeSheet(); commit(isNew ? 'Cash entry added' : 'Saved');
    });
  }

  function openDebtForm(id) {
    var d = id ? byId(S.debts, id) : { id: null, name: '', balance: '', limit: '', rate: '', payment: '', frequency: 'monthly', scope: 'personal', endDate: null, active: true, notes: '' };
    function v(x) { return x == null ? '' : x; }
    var b = '<label class="field"><span>Name</span><input name="name" required value="' + esc(d.name) + '"></label>' +
      '<div class="grid2"><label class="field"><span>Balance owing</span><div class="money-input"><input name="balance" inputmode="decimal" value="' + esc(v(d.balance)) + '" placeholder="Unknown"></div></label>' +
      '<label class="field"><span>Interest rate % p.a.</span><input name="rate" inputmode="decimal" value="' + esc(v(d.rate)) + '" placeholder="Optional"></label></div>' +
      '<div class="grid2"><label class="field"><span>Repayment</span><div class="money-input"><input name="payment" inputmode="decimal" value="' + esc(d.payment || '') + '" placeholder="Target"></div></label>' +
      '<label class="field"><span>Frequency</span><select name="frequency">' + opts([['weekly', 'Weekly'], ['fortnightly', 'Fortnightly'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly']], d.frequency) + '</select></label></div>' +
      '<div class="grid2"><label class="field"><span>End date</span><input type="date" name="endDate" value="' + esc(d.endDate || '') + '"></label>' +
      '<label class="field"><span>Credit limit</span><div class="money-input"><input name="limit" inputmode="decimal" value="' + esc(v(d.limit)) + '" placeholder="Optional"></div></label></div>' +
      toggleHtml('active', 'Active', 'Turn off when paid off — it moves to Paid off', d.active !== false) +
      '<label class="field mt12"><span>Notes</span><textarea name="notes">' + esc(d.notes) + '</textarea></label>' +
      (d.id ? '<button type="button" class="btn danger-text block" data-act="del-debt" data-id="' + d.id + '">' + icon('trash', 18) + ' Delete debt</button>' : '');
    openForm(d.id ? 'Edit Debt' : 'Add Debt', b, function (form) {
      function optNum(x) { return String(x).trim() === '' ? null : num(x); }
      var val = { name: form.name.value.trim() || 'Debt', balance: optNum(form.balance.value), limit: optNum(form.limit.value), rate: optNum(form.rate.value),
        payment: num(form.payment.value), frequency: form.frequency.value, scope: d.scope || 'personal', endDate: form.endDate.value || null, active: form.active.checked, notes: form.notes.value.trim() };
      if (d.id) Object.assign(d, val); else S.debts.push(Object.assign({ id: HF.uid('d') }, val));
      closeSheet(); commit('Saved');
    });
  }

  function openAssetForm(id, type) {
    var a = id ? byId(S.assets, id) : { id: null, name: '', type: type || 'cash', value: '', scope: 'household', updated: todayISO(), notes: '' };
    var curType = assetCat(a.type).id;
    var b = '<label class="field"><span>Name</span><input name="name" required value="' + esc(a.name) + '"></label>' +
      '<div class="grid2"><label class="field"><span>Value</span><div class="money-input"><input name="value" inputmode="decimal" value="' + esc(a.value) + '"></div></label>' +
      '<label class="field"><span>Value as at</span><input type="date" name="updated" value="' + esc(a.updated || todayISO()) + '"></label></div>' +
      '<div class="field"><span>Category</span><div class="choice icon-choice">' + assetCats().map(function (c) {
        return '<label><input type="radio" name="type" value="' + c.id + '"' + (c.id === curType ? ' checked' : '') + '><span>' + icon(c.icon, 16) + esc(c.name) + '</span></label>';
      }).join('') + '<label><input type="radio" name="type" value="__new"><span>' + icon('plus', 16) + 'Custom…</span></label></div></div>' +
      '<div id="newCat" hidden><label class="field"><span>New category name</span><input name="newCatName" placeholder="e.g. Boat, Jewellery, Super fund"></label>' +
      '<div class="field"><span>Icon</span>' + iconPick('newCatIcon', 'star') + '</div></div>' +
      '<label class="field"><span>Notes</span><textarea name="notes">' + esc(a.notes) + '</textarea></label>' +
      (a.id ? '<button type="button" class="btn danger-text block" data-act="del-asset" data-id="' + a.id + '">' + icon('trash', 18) + ' Delete asset</button>' : '');
    openForm(a.id ? 'Edit Asset' : 'Add Asset', b, function (form) {
      var t = radio(form, 'type') || 'other';
      if (t === '__new') {
        var nm = form.newCatName.value.trim();
        if (!nm) { toast('Name the new category'); return; }
        t = HF.uid('ac');
        S.assetCats.push({ id: t, name: nm, icon: radio(form, 'newCatIcon') || 'tag', order: S.assetCats.length });
      }
      var val = { name: form.name.value.trim() || 'Asset', type: t, value: Math.round(num(form.value.value) * 100) / 100, scope: a.scope || 'household', updated: form.updated.value, notes: form.notes.value.trim() };
      if (a.id) Object.assign(a, val); else S.assets.push(Object.assign({ id: HF.uid('as') }, val));
      closeSheet(); commit('Saved');
    }, function (el) {
      var f = el.querySelector('form');
      f.value.addEventListener('input', function () { f.updated.value = todayISO(); });
      el.querySelector('.icon-choice').addEventListener('change', function () { el.querySelector('#newCat').hidden = radio(f, 'type') !== '__new'; });
    });
  }

  // ---------- Import (CSV / paste) ----------
  function openImport() {
    var accts = S.accounts.filter(function (a) { return a.type !== 'cash'; });
    var b = '<div id="imp"><label class="field"><span>Which account is this statement for?</span><select name="account">' + accts.map(function (a) { return '<option value="' + a.id + '">' + esc(a.name) + '</option>'; }).join('') +
      '<option value="__new">＋ New account…</option></select></label>' +
      '<label class="field" id="newAcct" style="display:none"><span>New account name</span><input name="newAccount" placeholder="e.g. CommBank Everyday"></label>' +
      '<div class="field"><span>Statement file (CSV)</span><input type="file" name="file" accept=".csv,.txt,text/csv"><div class="hint">Export CSV from internet banking. PDF statements aren\'t supported — paste the lines instead.</div></div>' +
      '<label class="field"><span>…or paste transactions</span><textarea name="paste" placeholder="12/03/2026  WOOLWORTHS 1234 WOLLONGONG  -45.20&#10;13/03/2026  CENTRELINK FTB  956.40"></textarea><div class="hint">One per line: date, description, amount.</div></label>' +
      '<label class="field"><span>Year for dates without one</span><input name="year" inputmode="numeric" value="' + new Date().getFullYear() + '"></label>' +
      '<button class="btn accent block" id="parseBtn">Read transactions</button><div id="impResult"></div></div>';
    openSheet('Import statement', b, function (el) {
      var acctSel = el.querySelector('[name=account]');
      acctSel.addEventListener('change', function () { el.querySelector('#newAcct').style.display = acctSel.value === '__new' ? '' : 'none'; });
      el.querySelector('#parseBtn').addEventListener('click', function () {
        var accountId = acctSel.value;
        if (accountId === '__new') {
          var name = el.querySelector('[name=newAccount]').value.trim();
          if (!name) { toast('Name the new account'); return; }
          var acc = { id: HF.uid('a'), name: name, type: 'bank', owned: true, transferAs: 'internal', match: '', active: true };
          S.accounts.push(acc); persist(); accountId = acc.id;
        }
        var file = el.querySelector('[name=file]').files[0], paste = el.querySelector('[name=paste]').value;
        var year = Number(el.querySelector('[name=year]').value) || new Date().getFullYear(), res = el.querySelector('#impResult');
        var p;
        if (file && /\.pdf$/i.test(file.name)) { res.innerHTML = '<div class="note"><b>PDF isn\'t supported.</b> Use the CSV export, or copy the lines from the PDF and paste them.</div>'; return; }
        if (file) p = file.text().then(function (txt) { var r = IM.parseCSV(txt); return r.length ? r : IM.parseText(txt, year); });
        else if (paste.trim()) p = Promise.resolve(/,/.test(paste.split('\n')[0]) && IM.parseCSV(paste).length ? IM.parseCSV(paste) : IM.parseText(paste, year));
        else { res.innerHTML = '<p class="muted">Choose a file or paste some lines first.</p>'; return; }
        res.innerHTML = '<p class="muted">Reading…</p>';
        p.then(function (rows) { ui.importRows = IM.prepare(S, rows, accountId); res.innerHTML = importPreview(); })
          .catch(function (err) { res.innerHTML = '<div class="note"><b>Couldn\'t read that.</b> ' + esc(err.message || err) + '</div>'; });
      });
      el.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-imp]');
        if (!btn) return;
        var rows = ui.importRows, i = Number(btn.dataset.i);
        if (btn.dataset.imp === 'flip') {
          var r = rows[i];
          r.amount = -r.amount; r.direction = r.amount > 0 ? 'in' : 'out'; r.sign_guessed = false;
          Object.assign(r, IM.classify(S, { description: r.description_raw, amount: r.amount, account_id: r.account_id }));
        }
        if (btn.dataset.imp === 'skip') rows[i].skip = !rows[i].skip;
        if (btn.dataset.imp === 'confirm') {
          var add = rows.filter(function (r) { return !r.skip && !r.duplicate; });
          add.forEach(function (r) { delete r.skip; delete r.duplicate; S.transactions.push(r); });
          var pairs = IM.detectTransferPairs(S);
          ui.importRows = null; ui.page = null; closeSheet(); S.settings.tab = 'transactions';
          commit(add.length + ' imported' + (pairs ? ' · ' + pairs + ' transfer pair' + (pairs > 1 ? 's' : '') + ' found' : ''));
          return;
        }
        el.querySelector('#impResult').innerHTML = importPreview();
      });
    });
  }
  function importPreview() {
    var rows = ui.importRows;
    if (!rows.length) return '<div class="note mt12"><b>No transactions found.</b> Check the CSV has date, description and amount columns, or paste lines from internet banking.</div>';
    function count(f) { return rows.filter(f).length; }
    var guess = count(function (r) { return r.sign_guessed; }), n = count(function (r) { return !r.skip && !r.duplicate; });
    var h = '<div class="card pad mt12"><div class="kv"><span>Found</span><b>' + rows.length + '</b></div><div class="kv"><span>Already imported (skipped)</span><b>' + count(function (r) { return r.duplicate; }) + '</b></div>' +
      '<div class="kv"><span>Internal transfers</span><b>' + count(function (r) { return r.internal_transfer; }) + '</b></div><div class="kv"><span>Uncategorised</span><b>' + count(function (r) { return !r.category_id; }) + '</b></div>' +
      (guess ? '<div class="kv"><span>In/out guessed from text</span><b>' + guess + '</b></div>' : '') + '</div>';
    if (guess) h += '<div class="note">Rows marked <b>±?</b> had no sign on the statement. Tap <b>±</b> to flip any that are wrong.</div>';
    h += '<div class="list mt12">' + rows.slice(0, 300).map(function (r, i) {
      var c = cat(r.category_id);
      return '<div class="row" style="' + (r.skip || r.duplicate ? 'opacity:.45' : '') + '"><div class="main"><div class="name" style="font-size:14px">' + esc(r.merchant) + '</div>' +
        '<div class="sub"><span>' + HF.fmtDate(r.date, true) + '</span>' + (c ? '<span>· ' + esc(c.name) + '</span>' : badge('Uncategorised', 'flag')) + (r.internal_transfer ? badge('Transfer', 'outline') : '') + (r.duplicate ? badge('Duplicate', 'outline') : '') + '</div></div>' +
        '<div class="amt num ' + (r.amount > 0 ? 'pos' : '') + '" style="font-size:14px">' + money(r.amount, { dp: 2 }) + (r.sign_guessed ? '<small>±?</small>' : '') + '</div>' +
        '<div class="mini-btns"><button class="mini" data-imp="flip" data-i="' + i + '" aria-label="Flip in/out">±</button>' + (r.duplicate ? '' : '<button class="mini" data-imp="skip" data-i="' + i + '" aria-label="Skip">' + (r.skip ? '↺' : '✕') + '</button>') + '</div></div>';
    }).join('') + '</div>';
    if (rows.length > 300) h += '<p class="muted small">Previewing 300 of ' + rows.length + '; all will be imported.</p>';
    return h + '<button class="btn accent block mt12" data-imp="confirm"' + (n ? '' : ' disabled') + '>Import ' + n + ' transaction' + (n === 1 ? '' : 's') + '</button>';
  }

  // ---------- Managers (categories, rules, accounts) ----------
  var CAT_TYPES = [['living', 'Lifestyle spending'], ['debt', 'Debt repayment'], ['tax', 'Tax & government'], ['savings', 'Savings'], ['business', 'Business'], ['oneoff', 'One-off'], ['income', 'Income'], ['transfer', 'Internal transfer (excluded)'], ['investment', 'Investment movement (excluded)']];
  function openCats() {
    var list = sortedCats();
    openSheet('Categories', '<button class="btn soft block" data-act="add-cat">' + icon('plus', 18) + ' New category</button><div class="list mt12">' + list.map(function (c, i) {
      var n = S.items.filter(function (it) { return it.categoryId === c.id; }).length + S.transactions.filter(function (t) { return t.category_id === c.id; }).length;
      return '<div class="row">' + catIcon(c, 'sm') + '<div class="main" data-act="edit-cat" data-id="' + c.id + '" style="cursor:pointer"><div class="name">' + esc(c.name) + '</div><div class="sub">' + esc(HF.TYPE_LABELS[c.type] || c.type) + ' · ' + n + ' uses</div></div>' +
        '<div class="mini-btns"><button class="mini" data-act="cat-move" data-id="' + c.id + '" data-val="-1" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>' + icon('up', 15) + '</button><button class="mini" data-act="cat-move" data-id="' + c.id + '" data-val="1" aria-label="Move down"' + (i === list.length - 1 ? ' disabled' : '') + '>' + icon('down', 15) + '</button>' +
        '<button class="mini" data-act="edit-cat" data-id="' + c.id + '" aria-label="Edit">' + icon('edit', 15) + '</button></div></div>';
    }).join('') + '</div>');
  }
  function openCatForm(id) {
    var c = id ? cat(id) : { id: null, name: '', icon: 'tag', type: 'living' };
    var others = sortedCats().filter(function (x) { return x.id !== c.id; });
    var b = '<label class="field"><span>Name</span><input name="name" required value="' + esc(c.name) + '"></label>' +
      '<div class="field"><span>Icon</span><div class="icon-pick">' + HF.CATEGORY_ICONS.map(function (k) {
        return '<label><input type="radio" name="icon" value="' + k + '"' + (c.icon === k ? ' checked' : '') + ' aria-label="' + k + '"><span>' + icon(k, 20) + '</span></label>';
      }).join('') + '</div></div>' +
      '<label class="field"><span>Counts as</span><select name="type">' + opts(CAT_TYPES, c.type) + '</select><div class="hint">Which total it rolls into: lifestyle, debt, savings, business, or excluded.</div></label>' +
      (c.id ? '<label class="field"><span>If deleting, move its items to</span><select name="moveTo">' + others.map(function (o) { return '<option value="' + o.id + '">' + esc(o.name) + '</option>'; }).join('') + '</select></label>' +
        '<button type="button" class="btn danger-text block" id="catDel">' + icon('trash', 18) + ' Delete category</button>' : '');
    var fromPage = !!ui.page;
    openForm(c.id ? 'Edit Category' : 'New Category', b, function (form) {
      var v = { name: form.name.value.trim() || 'Category', icon: radio(form, 'icon') || 'tag', type: form.type.value };
      if (c.id) Object.assign(c, v); else S.categories.push(Object.assign({ id: HF.uid('c'), order: S.categories.length }, v));
      persist(); render(); if (fromPage) closeSheet(); else openCats(); toast('Saved');
    }, function (el) {
      var del = el.querySelector('#catDel');
      if (del) del.addEventListener('click', function () {
        var form = el.querySelector('form'), to = form.moveTo.value;
        if (!confirm('Delete “' + c.name + '”? Its items, transactions and rules move to “' + cat(to).name + '”.')) return;
        S.items.forEach(function (i) { if (i.categoryId === c.id) i.categoryId = to; });
        S.transactions.forEach(function (t) { if (t.category_id === c.id) t.category_id = to; });
        S.rules.forEach(function (r) { if (r.categoryId === c.id) r.categoryId = to; });
        S.categories = S.categories.filter(function (x) { return x.id !== c.id; });
        if (ui.page && ui.page.id === c.id) ui.page = null;
        persist(); render(); openCats(); toast('Deleted');
      });
    });
  }
  function openRules() {
    openSheet('Merchant rules', '<div class="btn-row"><button class="btn soft" data-act="add-rule">' + icon('plus', 18) + ' New rule</button><button class="btn" data-act="reapply-rules">Re-apply</button></div>' +
      '<div class="note">Checked top to bottom; the first match wins. Matching ignores case. Transactions you edited by hand are never overwritten.</div>' +
      '<div class="list mt12">' + S.rules.map(function (r) {
        var c = cat(r.categoryId);
        return '<div class="row swipe" role="button" tabindex="0" data-act="edit-rule" data-id="' + r.id + '"><div class="main"><div class="name" style="font-family:ui-monospace,Menlo,monospace;font-size:13.5px">' + esc(r.pattern) + '</div>' +
          '<div class="sub"><span>→ ' + esc(r.merchant || '(keep name)') + (c ? ' · ' + esc(c.name) : '') + '</span>' + (r.flag === 'internal' ? badge('Transfer', 'outline') : r.flag === 'cashDeposit' ? badge('Cash deposit', 'outline') : '') + '</div></div>' + swipeDel('rule', r.id) + '</div>';
      }).join('') + '</div>');
  }
  function openRuleForm(id) {
    var r = id ? byId(S.rules, id) : { id: null, pattern: '', merchant: '', categoryId: '', flag: null };
    var b = '<label class="field"><span>When the statement text contains</span><input name="pattern" required value="' + esc(r.pattern) + '" placeholder="e.g. DFJW PTY LTD" style="text-transform:uppercase"></label>' +
      '<label class="field"><span>Show as</span><input name="merchant" value="' + esc(r.merchant) + '" placeholder="e.g. Ariana Dance"></label>' +
      '<label class="field"><span>Category</span><select name="categoryId"><option value="">Leave uncategorised</option>' + catOptions(r.categoryId) + '</select></label>' +
      '<div class="field"><span>Special handling</span>' + choice('flag', [['', 'None'], ['internal', 'Internal transfer'], ['cashDeposit', 'Cash deposit']], r.flag || '') + '</div>' +
      (r.id ? '<button type="button" class="btn danger-text block" data-act="del-rule" data-id="' + r.id + '">' + icon('trash', 18) + ' Delete rule</button>' : '');
    openForm(r.id ? 'Edit Rule' : 'New Rule', b, function (form) {
      var v = { pattern: form.pattern.value.trim().toUpperCase(), merchant: form.merchant.value.trim(), categoryId: form.categoryId.value || null, flag: radio(form, 'flag') || null };
      if (r.id) Object.assign(r, v); else S.rules.unshift(Object.assign({ id: HF.uid('r') }, v));
      var n = IM.reapplyRules(S);
      persist(); render(); openRules(); toast('Rule saved' + (n ? ' · ' + n + ' transactions updated' : ''));
    });
  }
  function openAccounts() {
    openSheet('Accounts', '<button class="btn soft block" data-act="add-account">' + icon('plus', 18) + ' New account</button>' +
      '<div class="note">Mark accounts you own. A transfer mentioning an owned account\'s keywords — or equal and opposite amounts between two owned accounts within 3 days — is an internal transfer. Kids accounts can count transfers as Family Savings instead.</div>' +
      '<div class="list mt12">' + S.accounts.map(function (a) {
        return '<div class="row swipe" role="button" tabindex="0" data-act="edit-account" data-id="' + a.id + '"><div class="main"><div class="name">' + esc(a.name) + '</div><div class="sub">' + badge(a.owned ? 'Owned' : 'External', 'outline') +
          (a.transferAs === 'savings' ? badge('Transfers = savings') : '') + '<span>' + esc(a.match ? 'matches “' + a.match + '”' : 'no keywords') + '</span></div></div>' + swipeDel('account', a.id) + '</div>';
      }).join('') + '</div>');
  }
  function openAccountForm(id) {
    var a = id ? byId(S.accounts, id) : { id: null, name: '', type: 'bank', owned: true, transferAs: 'internal', match: '', active: true };
    var b = '<label class="field"><span>Name</span><input name="name" required value="' + esc(a.name) + '"></label>' +
      '<label class="field"><span>Type</span><select name="type">' + opts([['bank', 'Bank account'], ['savings', 'Savings / reserve'], ['kids', 'Kids savings'], ['business', 'Business / trust'], ['credit', 'Credit card'], ['cash', 'Cash']], a.type) + '</select></label>' +
      toggleHtml('owned', 'Owned by Joe / Zhila', 'Transfers to/from it are not income or expenses', a.owned) +
      '<div class="field mt12"><span>Money sent to this account counts as</span>' + choice('transferAs', [['internal', 'Internal transfer'], ['savings', 'Family Savings']], a.transferAs) + '</div>' +
      '<label class="field"><span>Keywords in transfer descriptions</span><input name="match" value="' + esc(a.match) + '" placeholder="e.g. JZD, 062000 1234"><div class="hint">Comma separated — names, BSB/account numbers, nicknames.</div></label>' +
      (a.id ? '<button type="button" class="btn danger-text block" data-act="del-account" data-id="' + a.id + '">' + icon('trash', 18) + ' Delete account</button>' : '');
    openForm(a.id ? 'Edit Account' : 'New Account', b, function (form) {
      var v = { name: form.name.value.trim() || 'Account', type: form.type.value, owned: form.owned.checked, transferAs: radio(form, 'transferAs'), match: form.match.value.trim() };
      if (a.id) Object.assign(a, v); else S.accounts.push(Object.assign({ id: HF.uid('a'), active: true }, v));
      persist(); render(); openAccounts(); toast('Saved');
    });
  }

  // ---------- Data ----------
  // ---------- Live sharing (Supabase) ----------
  function syncErr(e) { var m = (e && e.message) || 'Something went wrong'; if (/fetch|network/i.test(m)) m = 'No connection. Try again when online'; toast(m); }
  function openSync() {
    var sy = HF.sync, st = sy && sy.state();
    if (!sy || !st.ready) {
      openSheet('Live sharing', '<div class="card pad">Live sharing needs an internet connection. Open the app while online and try again.</div>');
      return;
    }
    var h;
    if (!st.signedIn) {
      h = '<p class="muted" style="margin-top:0">Share one budget with Zhila. Changes on either phone show on the other within seconds. Each of you signs in with your own email.</p>' +
        '<label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" inputmode="email"></label>' +
        '<label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" placeholder="At least 6 characters"></label>' +
        '<div class="btn-row mt12"><button class="btn accent" id="syIn">Sign in</button><button class="btn" id="syUp">Create account</button></div>';
    } else if (!st.householdId) {
      h = '<p class="muted" style="margin-top:0">Signed in as <b>' + esc(st.email) + '</b>.</p>' +
        '<div class="card pad"><b>Start sharing this budget</b><p class="muted small">Uploads the budget on this phone and gives you an invite code for Zhila.</p><button class="btn accent block" id="syStart">Start sharing</button></div>' +
        '<div class="card pad mt12"><b>Join a shared budget</b><p class="muted small">Enter the invite code. This replaces the budget on this phone with the shared one.</p>' +
        '<label class="field"><span>Your name</span><input name="myname" autocomplete="given-name" placeholder="e.g. Zhila"></label>' +
        '<label class="field"><span>Invite code</span><input name="code" autocapitalize="characters" placeholder="e.g. 7F3A9C21" style="text-transform:uppercase;letter-spacing:.1em"></label><button class="btn block" id="syJoin">Join</button></div>' +
        '<button class="btn danger-text block mt12" id="syOut">Sign out</button>';
    } else {
      h = '<div class="card pad"><div class="lbl muted small">Status</div><b>' + esc(sy.label()) + '</b><div class="muted small mt8">Signed in as ' + esc(st.email) + '</div></div>' +
        '<div class="card pad mt12"><div class="lbl muted small">Invite code</div><div class="invite num">' + esc(st.invite || '—') + '</div>' +
        '<p class="muted small">Zhila: install LifeCalc, open Settings → Live sharing, create an account, then join with this code.</p><button class="btn accent block" id="syInvite">Send invite to Zhila</button></div>' +
        '<div class="card pad mt12"><div class="lbl muted small">Members</div><div id="syMembers" class="muted">Loading…</div></div>' +
        '<div class="btn-row mt12"><button class="btn" id="syNow">Sync now</button><button class="btn danger-text" id="syOut">Stop on this phone</button></div>' +
        '<p class="muted small">Stopping signs this phone out. Its budget stays here; the shared copy stays online for Zhila.</p>';
    }
    openSheet('Live sharing', '<div id="syncSheet">' + h + '</div>', function (el) {
      function q(id) { return el.querySelector(id); }
      function busy(b, on) { if (b) { b.disabled = on; } }
      function creds() { return [String(q('[name="email"]').value).trim(), q('[name="password"]').value]; }
      if (q('#syIn')) q('#syIn').addEventListener('click', function () {
        var c = creds(), b = this; busy(b, true);
        sy.signIn(c[0], c[1]).then(function (hid) {
          if (hid && confirm('You already share a budget. Load it on this phone? This replaces the budget here.')) return sy.useHousehold(hid).then(function () { toast('Shared budget loaded'); });
        }).then(function () { openSync(); }).catch(function (e) { busy(b, false); syncErr(e); });
      });
      if (q('#syUp')) q('#syUp').addEventListener('click', function () {
        var c = creds(), b = this;
        if (!c[0] || c[1].length < 6) { toast('Enter an email and a password of 6+ characters'); return; }
        busy(b, true);
        sy.signUp(c[0], c[1]).then(function (r) {
          if (r === 'confirm') { busy(b, false); toast('Account created. Tap Sign in'); }
          else openSync();
        }).catch(function (e) { busy(b, false); syncErr(e); });
      });
      if (q('#syStart')) q('#syStart').addEventListener('click', function () {
        var b = this; busy(b, true);
        sy.start(S.settings.householdName || 'Household').then(function () { toast('Sharing is on'); openSync(); render(); }).catch(function (e) { busy(b, false); syncErr(e); });
      });
      if (q('#syJoin')) q('#syJoin').addEventListener('click', function () {
        var code = String(q('[name="code"]').value).trim(), b = this;
        if (!code) { toast('Enter the invite code'); return; }
        if (!confirm('Join the shared budget? The budget on this phone is replaced by the shared one.')) return;
        busy(b, true);
        var me = String(q('[name="myname"]').value).trim();
        sy.join(code).then(function () { if (me) { S.settings.userName = me; HF.save(S); render(); } toast('Joined. You’re sharing now'); openSync(); }).catch(function (e) { busy(b, false); syncErr(e); });
      });
      if (q('#syInvite')) q('#syInvite').addEventListener('click', function () {
        var text = 'Join our LifeCalc budget:\n1. Open ' + st.appUrl + ' in Safari, tap Share → Add to Home Screen\n2. Open it → Settings → Live sharing → Create account\n3. Join with code ' + st.invite;
        if (navigator.share) navigator.share({ title: 'LifeCalc budget', text: text }).catch(function () {});
        else { try { navigator.clipboard.writeText(text); toast('Invite copied'); } catch (e) { toast('Code: ' + st.invite); } }
      });
      if (q('#syNow')) q('#syNow').addEventListener('click', function () { sy.pull().then(function () { toast('Synced'); openSync(); }); });
      if (q('#syOut')) q('#syOut').addEventListener('click', function () {
        if (!confirm('Stop live sharing on this phone? The budget stays on this phone.')) return;
        sy.signOut().then(function () { toast('Signed out'); closeSheet(); render(); });
      });
      if (q('#syMembers')) sy.members().then(function (m) {
        q('#syMembers').innerHTML = m.length ? m.map(function (x) { return esc(x.email || 'Member') + (x.role === 'owner' ? ' <span class="badge">Owner</span>' : ''); }).join('<br>') : 'Just you so far';
      });
    });
  }
  // Hooks for sync.js: read the state, replace it with the shared copy, refresh the status.
  window.LCBudget = {
    get: function () { return S; },
    // Swipe right on a sub-page goes back one step (used by nav-swipe.js).
    canBack: function () { return !!ui.page || !!document.getElementById('sheet'); },
    back: function () { if (document.getElementById('sheet')) return true; if (!ui.page) return false; ui.page = ui.stack.pop() || null; render(); window.scrollTo(0, 0); return true; },
    replace: function (data, keep) {
      var local = S.settings || {}, next = HF.migrate(JSON.parse(JSON.stringify(data)));
      next.settings = next.settings || {};
      (keep || []).forEach(function (k) { if (k in local) next.settings[k] = local[k]; });
      next.settings.includeBusiness = true; next.settings.mode = 'budget';
      S = next; HF.recordNetWorth(S); HF.save(S); render();
    },
    syncChanged: function () { if (!ui.page && S.settings.tab === 'more') render(); }
  };

  // Send a copy of everything (as a backup file) through the phone's share sheet. Zhila opens it with Restore backup.
  function shareData() {
    var name = 'lifecalc-budget-' + todayISO() + '.json';
    var file;
    try { file = new File([JSON.stringify(S)], name, { type: 'application/json' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'LifeCalc budget', text: 'Our LifeCalc budget. Open LifeCalc → Settings → Restore backup and choose this file.' })
        .then(function () { toast('Sent'); }).catch(function () {});
    } else { exportData(); toast('Backup downloaded. Send the file to Zhila'); }
  }
  function exportData() {
    var blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'lifecalc-budget-' + todayISO() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast('Backup downloaded');
  }
  function restoreData(file) {
    file.text().then(function (txt) {
      var data = JSON.parse(txt);
      if (!data || !Array.isArray(data.items) || !Array.isArray(data.categories)) throw new Error('Not a LifeCalc Budget backup');
      if (!confirm('Replace all current data with this backup?')) return;
      S = HF.migrate(data); ui.page = null; commit('Backup restored');
    }).catch(function (e) { toast(e.message || 'Could not read backup'); });
  }

  // ---------- Sheets ----------
  function openSheet(title, html, onMount, o) {
    o = o || {};
    closeSheet(true);
    var scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.id = 'scrim';
    var sh = document.createElement('div'); sh.className = 'sheet' + (o.full ? ' full' : '') + (o.deep ? ' deep' : ''); sh.id = 'sheet';
    sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', title);
    sh.innerHTML = o.full ? html : '<div class="grab"></div><div class="sheet-head"><h3>' + esc(title) + '</h3><button class="close-btn" data-act="close-sheet" aria-label="Close">' + icon('close', 16) + '</button></div><div class="sheet-body">' + html + '</div>';
    document.body.appendChild(scrim); document.body.appendChild(sh);
    document.body.style.overflow = 'hidden';
    scrim.addEventListener('click', function () { closeSheet(); });
    requestAnimationFrame(function () { scrim.classList.add('show'); sh.classList.add('show'); });
    if (onMount) onMount(sh);
  }
  // Full-screen form with Cancel / Save, as in the design.
  function openForm(title, body, onSave, onMount) {
    var html = '<form id="sheetForm" autocomplete="off" novalidate><div class="form-bar"><button type="button" class="cancel" data-act="close-sheet">Cancel</button><button type="submit" class="save">Save</button></div>' +
      '<h2 class="form-title">' + esc(title) + '</h2>' + body + '</form>';
    openSheet(title, html, function (el) {
      var form = el.querySelector('form');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var req = form.querySelector('[required]');
        if (req && !req.value.trim()) { req.focus(); toast('Fill in ' + (req.closest('.field').querySelector('span').textContent || 'the name').toLowerCase() + ' first'); return; }
        onSave(form);
      });
      if (onMount) onMount(el);
    }, { full: true });
  }
  function closeSheet(instant) {
    var sh = document.getElementById('sheet'), sc = document.getElementById('scrim');
    document.body.style.overflow = '';
    if (!sh) return;
    sh.id = ''; if (sc) sc.id = '';
    if (instant) { sh.remove(); if (sc) sc.remove(); return; }
    sh.classList.remove('show'); if (sc) sc.classList.remove('show');
    setTimeout(function () { sh.remove(); if (sc) sc.remove(); }, 260);
  }

  // ---------- Events ----------
  function confirmDel(what) { return confirm('Delete ' + what + '? This can’t be undone.'); }
  var actions = {
    'app-menu': function (b) { if (document.getElementById('appMenu')) closeAppMenu(); else openAppMenu(b); },
    tab: function (b, e) { e.preventDefault(); closeAppMenu(); ui.page = null; ui.stack = []; ui.edit = {}; S.settings.tab = b.dataset.val; closeSheet(true); commit(); window.scrollTo(0, 0); },
    page: function (b) { closeSheet(true); if (b.dataset.val === 'category') ui.catTab = 'items'; go({ name: b.dataset.val, id: b.dataset.id }); },
    back: function () { ui.page = ui.stack.pop() || null; render(); window.scrollTo(0, 0); },
    set: function (b) {
      var k = b.dataset.key, v = b.dataset.val;
      if (k in ui) { ui[k] = v; if (k === 'txView') ui.txOffset = 0; render(); return; }
      if (k === 'view') ui.actualOffset = 0;
      S.settings[k] = v === 'true' ? true : v === 'false' ? false : v; commit();
    },
    overview: openOverview,
    toggle: function (b) { ui.open[b.dataset.id] = !ui.open[b.dataset.id]; render(); },
    reorder: function (b) { ui.edit[b.dataset.val] = !ui.edit[b.dataset.val]; closeSwipe(); render(); },
    'show-off': function (b) { ui.showOff[b.dataset.id] = !ui.showOff[b.dataset.id]; render(); },
    'src-info': function (b, e) { e.stopPropagation(); showPop(b, SOURCE_INFO[b.dataset.src] || 'Where this figure came from.'); },
    'add-item': function (b) { openItemForm(null, b.dataset.dir, b.dataset.cat); },
    'edit-item': function (b) { openItemForm(b.dataset.id); },
    'del-item': function (b) {
      var it = byId(S.items, b.dataset.id); if (!it || !confirmDel('“' + it.name + '”')) return;
      S.items = S.items.filter(function (x) { return x.id !== it.id; }); closeSheet(); commit('Deleted');
    },
    'actual-shift': function (b) { ui.actualOffset += Number(b.dataset.val); render(); },
    'tx-shift': function (b) { ui.txOffset += Number(b.dataset.val); render(); },
    'tx-filter': function (b) { ui.txFilter = b.dataset.val; render(); },
    'nw-range': function (b) { ui.nwRange = b.dataset.val; render(); },
    import: openImport,
    'add-tx': function () { openTxForm(null); },
    'edit-tx': function (b) { openTxForm(b.dataset.id); },
    'del-tx': function (b) {
      if (!confirmDel('this transaction')) return;
      S.transactions = S.transactions.filter(function (x) { return x.id !== b.dataset.id; }); closeSheet(); commit('Deleted');
    },
    'add-debt': function () { openDebtForm(null); },
    'edit-debt': function (b) { openDebtForm(b.dataset.id); },
    'del-debt': function (b) {
      var d = byId(S.debts, b.dataset.id); if (!d || !confirmDel('“' + d.name + '”')) return;
      S.debts = S.debts.filter(function (x) { return x.id !== d.id; }); closeSheet(); commit('Deleted');
    },
    'add-asset': function (b) { openAssetForm(null, b.dataset.type); },
    'edit-assetcat': function (b) { openAssetCatForm(b.dataset.id); },
    'edit-asset': function (b) { openAssetForm(b.dataset.id); },
    'del-asset': function (b) {
      var a = byId(S.assets, b.dataset.id); if (!a || !confirmDel('“' + a.name + '”')) return;
      S.assets = S.assets.filter(function (x) { return x.id !== a.id; }); closeSheet(); commit('Deleted');
    },
    settings: openSettings, appearance: openAppearance, help: openHelp, profile: openProfile,
    'manage-cats': openCats,
    'add-cat': function () { openCatForm(null); },
    'edit-cat': function (b) { openCatForm(b.dataset.id); },
    'cat-move': function (b) {
      var list = sortedCats(), i = list.findIndex(function (c) { return c.id === b.dataset.id; }), j = i + Number(b.dataset.val);
      if (j < 0 || j >= list.length) return;
      var t = list[i]; list[i] = list[j]; list[j] = t;
      list.forEach(function (c, k) { c.order = k; });
      persist(); render(); openCats();
    },
    'manage-rules': openRules,
    'add-rule': function () { openRuleForm(null); },
    'edit-rule': function (b) { openRuleForm(b.dataset.id); },
    'del-rule': function (b) {
      if (!confirmDel('this rule')) return;
      S.rules = S.rules.filter(function (x) { return x.id !== b.dataset.id; }); persist(); render(); openRules(); toast('Deleted');
    },
    'reapply-rules': function () { var n = IM.reapplyRules(S), p = IM.detectTransferPairs(S); persist(); render(); toast(n + ' updated' + (p ? ' · ' + p + ' transfer pairs' : '')); },
    'manage-accounts': openAccounts,
    'add-account': function () { openAccountForm(null); },
    'edit-account': function (b) { openAccountForm(b.dataset.id); },
    'del-account': function (b) {
      var a = byId(S.accounts, b.dataset.id);
      if (S.transactions.some(function (t) { return t.account_id === a.id; })) { toast('Account has transactions — mark it not owned instead'); return; }
      if (!confirmDel('“' + a.name + '”')) return;
      S.accounts = S.accounts.filter(function (x) { return x.id !== a.id; }); persist(); render(); openAccounts(); toast('Deleted');
    },
    export: exportData,
    'share-data': shareData,
    sync: openSync,
    restore: function () { document.getElementById('restoreFile').click(); },
    reset: function () {
      if (!confirm('Reset everything to the starting figures? Imported transactions and edits will be lost. Export a backup first if unsure.')) return;
      S = HF.seed(); ui.page = null; commit('Reset to starting figures');
    },
    'close-sheet': function () { closeSheet(); }
  };

  // ---------- Drag to reorder (grip handle; works with touch and mouse) ----------
  var drag = null;
  document.addEventListener('pointerdown', function (e) {
    var g = e.target.closest('.grip'); if (!g) return;
    var el = g.closest('[data-sort-id]'), list = el && el.parentElement;
    if (!list || !list.hasAttribute('data-sort-list')) return;
    e.preventDefault();
    drag = { el: el, list: list, grab: e.clientY - el.getBoundingClientRect().top, id: e.pointerId, moved: false };
    el.classList.add('dragging'); list.classList.add('sorting');
    try { g.setPointerCapture(e.pointerId); } catch (err) {}
  });
  function sortSib(el, dir) { var x = el[dir]; while (x && !x.hasAttribute('data-sort-id')) x = x[dir]; return x; }
  document.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    var el = drag.el, y = e.clientY, next, prev, r, guard = 0;
    el.style.transform = '';
    // Swap with a neighbour once the finger passes its middle (works with gaps between cards).
    while (guard++ < 20) {
      next = sortSib(el, 'nextElementSibling'); prev = sortSib(el, 'previousElementSibling');
      if (next && (r = next.getBoundingClientRect()) && y > r.top + r.height / 2) { drag.list.insertBefore(next, el); drag.moved = true; continue; }
      if (prev && (r = prev.getBoundingClientRect()) && y < r.top + r.height / 2) { drag.list.insertBefore(el, prev); drag.moved = true; continue; }
      break;
    }
    el.style.transform = 'translateY(' + (y - drag.grab - el.getBoundingClientRect().top) + 'px)';
  });
  // Only some rows may be on screen; slot the new order into their existing positions.
  function applyOrder(all, ids, pool) {
    var slots = [], k = 0;
    all.forEach(function (x, i) { if (ids.indexOf(x.id) >= 0) slots.push(i); });
    slots.forEach(function (i) { all[i] = byId(pool, ids[k++]); });
    all.forEach(function (x, i) { x.order = i; });
  }
  function endDrag() {
    if (!drag) return;
    var d = drag; drag = null;
    d.el.style.transform = ''; d.el.classList.remove('dragging'); d.list.classList.remove('sorting');
    if (!d.moved) return;
    var ids = Array.prototype.filter.call(d.list.children, function (x) { return x.hasAttribute('data-sort-id'); }).map(function (x) { return x.getAttribute('data-sort-id'); });
    var kind = d.list.getAttribute('data-sort-list'), parts = kind.split(':');
    if (kind === 'cats') applyOrder(sortedCats(), ids, S.categories);
    else if (kind === 'assetcats') applyOrder(assetCats(), ids, S.assetCats);
    else if (kind === 'debts') applyOrder(byOrder(S.debts), ids, S.debts);
    else if (parts[0] === 'assets') applyOrder(assetsIn(parts[1]), ids, S.assets);
    else if (kind === 'items:in') applyOrder(byOrder(S.items.filter(function (i) { return i.direction === 'in'; })), ids, S.items);
    else if (kind === 'items:oneoff') applyOrder(byOrder(S.items.filter(function (i) { return i.direction === 'out' && HF.isOneOff(S, i); })), ids, S.items);
    else if (parts[0] === 'items') applyOrder(catItems(parts[1]), ids, S.items);
    persist(); render();
  }
  document.addEventListener('pointerup', endDrag);

  // ---------- Swipe left to reveal Delete (iOS style) ----------
  var SW = 88, sw = null, openSwipe = null, eatClick = false;
  function setX(row, x, animate) { row.classList.toggle('swiping', !animate); row.style.transform = x ? 'translateX(' + x + 'px)' : ''; }
  function closeSwipe() { if (openSwipe) { setX(openSwipe, 0, true); openSwipe = null; } }
  document.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.grip')) return;
    var row = e.target.closest('.swipe');
    if (openSwipe && !(row === openSwipe && e.target.closest('.swipe-del'))) { closeSwipe(); eatClick = true; return; }
    if (!row || row.closest('.reorder')) return;
    sw = { row: row, x0: e.clientX, y0: e.clientY, id: e.pointerId, on: false };
  });
  document.addEventListener('pointermove', function (e) {
    if (!sw || e.pointerId !== sw.id) return;
    var dx = e.clientX - sw.x0, dy = e.clientY - sw.y0;
    if (!sw.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; }
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      sw.on = true;
    }
    setX(sw.row, Math.max(-SW * 1.5, Math.min(0, dx)), false);
  });
  function endSwipe(e) {
    if (!sw || (e && e.pointerId !== sw.id)) return;
    var s0 = sw; sw = null;
    if (!s0.on) return;
    var dx = (e ? e.clientX : s0.x0) - s0.x0;
    eatClick = true;
    if (dx < -SW / 2) { setX(s0.row, -SW, true); openSwipe = s0.row; } else setX(s0.row, 0, true);
  }
  document.addEventListener('pointerup', endSwipe);
  document.addEventListener('pointercancel', function (e) { if (sw && sw.on) setX(sw.row, 0, true); sw = null; });
  document.addEventListener('click', function (e) { if (eatClick) { eatClick = false; e.stopPropagation(); e.preventDefault(); } }, true);

  // ---------- Small popover (badge explanations) ----------
  function closePop() { var p = document.getElementById('pop'); if (p) p.remove(); }
  function showPop(anchor, text) {
    closePop();
    var p = document.createElement('div'); p.id = 'pop'; p.className = 'pop'; p.textContent = text;
    document.body.appendChild(p);
    var r = anchor.getBoundingClientRect(), w = p.offsetWidth;
    p.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + 'px';
    p.style.top = (r.bottom + window.scrollY + 8) + 'px';
  }
  document.addEventListener('click', function (e) { if (!e.target.closest('[data-act="src-info"]') && !e.target.closest('#pop')) closePop(); }, true);
  window.addEventListener('scroll', closePop, { passive: true });
  document.addEventListener('pointercancel', endDrag);

  document.addEventListener('click', function (e) {
    chartHover(e);
    if (e.target.closest('.grip')) return;
    var b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'INPUT') return;
    var fn = actions[b.dataset.act];
    if (fn) fn(b, e);
  });
  document.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') chartHover(e); });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.act === 'setting') { S.settings[t.dataset.key] = t.checked; persist(); render(); }
    if (t.id === 'restoreFile' && t.files[0]) restoreData(t.files[0]);
  });
  document.addEventListener('input', function (e) {
    if (e.target.dataset && e.target.dataset.act === 'tx-search') {
      ui.txSearch = e.target.value;
      var pos = e.target.selectionStart;
      render();
      var s = document.querySelector('[data-act="tx-search"]');
      if (s) { s.focus(); s.setSelectionRange(pos, pos); }
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeSheet(); closeAppMenu(); } });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('../service-worker.js', { scope: '../' }).catch(function () {}); });
  }
  // The calculator's bar links to budget/#<tab>.
  function routeFromHash() {
    var h = location.hash.slice(1);
    if (TABS.indexOf(h) >= 0 && (h !== S.settings.tab || ui.page)) { ui.page = null; closeSheet(true); S.settings.tab = h; persist(); render(); window.scrollTo(0, 0); }
  }
  window.addEventListener('hashchange', routeFromHash);
  window.__HF_STATE = function () { return S; };
  var initial = location.hash.slice(1);
  if (TABS.indexOf(initial) >= 0) S.settings.tab = initial;
  persist();
  render();
})();
