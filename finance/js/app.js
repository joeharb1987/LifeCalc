/* Household Finance — UI. Renders from a single state object (S) and persists on every change. */
(function () {
  'use strict';
  var HF = window.HF, IM = HF.importer;
  var S = HF.load() || HF.seed();
  var ui = {
    open: {}, ovOpen: {}, actualOffset: 0,
    txView: 'monthly', txOffset: 0, txFilter: 'all', txSearch: '',
    histView: 'monthly', importRows: null
  };
  var $app = document.getElementById('app');
  var money = HF.money;

  // ---------- Utilities ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function persist() { if (!HF.save(S)) toast('Could not save — storage is full or blocked'); }
  function commit(msg) { persist(); render(); if (msg) toast(msg); }
  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function cat(id) { return HF.catById(S, id); }
  function sortedCats() { return S.categories.slice().sort(function (a, b) { return a.order - b.order; }); }
  function expenseCats() { return sortedCats().filter(function (c) { return c.type !== 'income' && c.type !== 'transfer' && c.type !== 'investment'; }); }
  function num(v) { var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
  function todayISO() { return HF.toISO(new Date()); }
  var VIEW_WORD = { weekly: 'week', monthly: 'month', yearly: 'year' };
  var VIEW_SHORT = { weekly: '/wk', monthly: '/mo', yearly: '/yr' };

  var I = {
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 15 6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>',
    pie: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/></svg>'
  };
  var NAV = [
    { id: 'budget', label: 'Budget', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18"/><path d="M7 15h4"/></svg>' },
    { id: 'transactions', label: 'Transactions', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16"/><path d="m3 8 4-4 4 4"/><path d="M17 20V4"/><path d="m13 16 4 4 4-4"/></svg>' },
    { id: 'debts', label: 'Debts', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19"/><path d="M6.5 15h2"/></svg>' },
    { id: 'networth', label: 'Net Worth', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M5 16l4-5 4 3 6-8"/><path d="M15 6h4v4"/></svg>' },
    { id: 'more', label: 'More', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>' }
  ];
  var SOURCE_LABEL = { statement: 'Statement', statement_avg: 'Statement avg', cash: 'Manual cash', manual: 'Manual', imported: 'Imported', calculated: 'Calculated', assumption: 'Assumption' };
  function badge(cls, text) { return '<span class="badge b-' + cls + '">' + esc(text) + '</span>'; }
  function srcBadge(src) { return badge(src, SOURCE_LABEL[src] || src); }
  function seg(name, options, current, cls) {
    return '<div class="seg ' + (cls || '') + '" role="tablist">' + options.map(function (o) {
      return '<button role="tab" aria-selected="' + (o[0] === current) + '" class="' + (o[0] === current ? 'on' : '') + '" data-act="set" data-key="' + name + '" data-val="' + o[0] + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function iconBtns(kind, id) {
    return '<div class="icon-btns"><button class="ibtn" data-act="edit-' + kind + '" data-id="' + id + '" aria-label="Edit">' + I.edit + '</button>' +
      '<button class="ibtn del" data-act="del-' + kind + '" data-id="' + id + '" aria-label="Delete">' + I.del + '</button></div>';
  }

  // ---------- Render ----------
  function render() {
    var th = S.settings.theme || 'auto';
    if (th === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', th);
    var tab = S.settings.tab || 'budget';
    var html = { budget: renderBudget, transactions: renderTransactions, debts: renderDebts, networth: renderNetWorth, more: renderMore }[tab]();
    $app.innerHTML = html;
    document.getElementById('navInner').innerHTML = NAV.map(function (n) {
      return '<button class="' + (n.id === tab ? 'on' : '') + '" data-act="tab" data-val="' + n.id + '" aria-current="' + (n.id === tab ? 'page' : 'false') + '">' + n.icon + '<span>' + n.label + '</span></button>';
    }).join('');
  }

  // ===================== BUDGET =====================
  var MODE_HELP = {
    budget: 'Recurring costs plus statement-average variable spending (Jan–Sep 2026, bank-only). One-offs are listed but not counted.',
    actual: 'Everything that actually happened in your imported statements and manual cash entries.'
  };
  var AVG_LABEL = 'Statement average Jan–Sep 2026, bank-only';

  function renderBudget() {
    var s = S.settings;
    var h = '<header class="page-head"><div><h1>Budget</h1><p>Money in → money out → money left</p></div>' +
      '<button class="head-btn" data-act="overview" aria-label="Expense overview">' + I.pie + '</button></header>';
    h += '<div class="controls">' + seg('view', [['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']], s.view) +
      '<div class="grid2">' + seg('mode', [['budget', 'Budget'], ['actual', 'Actual']], s.mode, 'gold small') +
      seg('includeBusiness', [['false', 'Household'], ['true', '+ Business']], String(!!s.includeBusiness), 'gold small') + '</div></div>';
    if (s.mode === 'actual') return h + renderActual();

    var sum = HF.budgetSummary(S, s.view);
    var w = VIEW_WORD[s.view];
    var basis = sum.cashSpendingEntered ? 'Bank + manual cash spending' : 'Bank-only – cash spending not entered';
    h += '<div class="summary">' +
      '<button class="stat" data-act="jump" data-val="earnings"><div class="lbl"><span class="dot" style="background:var(--good)"></span>Earnings</div><div class="val num">' + money(sum.income) + '</div><div class="sub">per ' + w + '</div></button>' +
      '<button class="stat" data-act="overview"><div class="lbl"><span class="dot" style="background:var(--gold)"></span>Expenses</div><div class="val num">' + money(sum.expenses) + '</div><div class="sub">per ' + w + '</div></button>' +
      '<div class="stat hero"><div class="lbl">Available</div><div class="val num ' + (sum.available < 0 ? 'neg' : '') + '">' + money(sum.available) + '</div>' +
      '<div class="sub" style="color:#E2B672;font-weight:700">' + basis + '</div>' +
      (sum.cashIncome && !sum.cashSpendingEntered ? '<div class="sub">' + cashIncomeText(sum.cashIncome) + ' of income is cash, with no cash spending against it yet.</div>' : '') +
      '<div class="sub">' + (s.includeBusiness ? 'Household + business / trust' : 'Household only') + ' · per ' + w + '</div>' +
      heroSplit(sum) + '</div></div>';
    h += '<p class="muted" style="font-size:12.5px;margin:4px 4px 0">' + MODE_HELP.budget + '</p>';
    h += budgetNotes(sum);

    // Earnings
    var incomes = S.items.filter(function (i) { return i.direction === 'in'; });
    h += '<section class="section" id="earnings"><div class="section-head"><h2>Earnings</h2><button class="add-btn" data-act="add-item" data-dir="in">＋ Add</button></div>';
    h += incomes.length ? '<div class="list">' + incomes.map(function (it) { return itemRow(it, false); }).join('') + '</div>'
      : emptyBlock('💵', 'No earnings yet', 'Add your income sources.', '<button class="btn primary" data-act="add-item" data-dir="in">Add earnings</button>');
    h += '</section>';

    // Expenses
    h += '<section class="section"><div class="section-head"><h2>Expenses</h2><button class="add-btn" data-act="add-item" data-dir="out">＋ Add</button></div>';
    h += '<div style="margin-bottom:10px">' + seg('expView', [['all', 'All'], ['categories', 'Categories']], s.expView, 'small') + '</div>';
    h += s.expView === 'all' ? renderAllExpenses() : renderCategoryCards();
    h += '</section>';
    return h;
  }
  // Cash income is always quoted yearly so "$47.8k/yr" reads the same in every view.
  function cashIncomeText(perView) {
    var yr = perView * ({ weekly: 52, monthly: 12, yearly: 1 })[S.settings.view];
    return 'About $' + (yr / 1000).toFixed(1) + 'k/yr';
  }

  function heroSplit(sum) {
    var t = sum.byType;
    var parts = [['Lifestyle', t.living], ['Debt', t.debt], ['Tax & gov', t.tax], ['Savings', t.savings]];
    if (S.settings.includeBusiness) parts.push(['Business', t.business]);
    var line = 'rgba(245,241,231,.14)', dim = 'rgba(245,241,231,.6)';
    return '<div style="display:grid;grid-template-columns:repeat(' + parts.length + ',1fr);gap:6px;margin-top:14px;padding-top:12px;border-top:1px solid ' + line + '">' +
      parts.map(function (p) {
        return '<div><div style="font-size:11px;color:' + dim + ';font-weight:600">' + p[0] + '</div><div class="num" style="font-weight:700;font-size:14px;margin-top:2px">' + money(p[1], { dp: 0 }) + '</div></div>';
      }).join('') + '</div>' + (sum.fixed == null ? '' :
      '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid ' + line + ';font-size:12px;color:' + dim + '">' +
      '<span>Fixed <b class="num" style="color:var(--navy-ink)">' + money(sum.fixed, { dp: 0 }) + '</b></span>' +
      '<span>Statement averages <b class="num" style="color:var(--navy-ink)">' + money(sum.variable, { dp: 0 }) + '</b></span></div>');
  }

  function budgetNotes(sum) {
    var s = S.settings, out = [];
    var oneoffs = 0, review = 0, cashHidden = 0;
    S.items.forEach(function (it) {
      if (!it.active) return;
      if (it.direction === 'out' && HF.isOneOff(S, it)) oneoffs += Number(it.amount) || 0;
      if (it.review) review++;
      if (it.source === 'cash') cashHidden++;
    });
    if (!s.includeBusiness && sum.businessExcluded > 0) out.push('<b>Business / trust</b> costs (' + money(sum.businessExcluded) + VIEW_SHORT[s.view] + ' — JZD ATO, Revenue NSW JZD, software) are excluded from household burn.');
    HF.upcomingChanges(S, s.view, 12).forEach(function (c) {
      out.push('<b>' + esc(c.item.name) + '</b> ' + c.kind + ' ' + HF.fmtDate(c.date, true) + ' → Available ' + (c.change >= 0 ? '+' : '−') + money(Math.abs(c.change)) + VIEW_SHORT[s.view] + '.');
    });
    if (oneoffs > 0) out.push('<b>One-offs</b> (' + money(oneoffs) + ' total) are not in the recurring numbers.');
    if (!s.includeCash && cashHidden) out.push('<b>Manual cash</b> items are hidden from totals (bank-derived only).');
    if (review) out.push('<b>' + review + ' item' + (review > 1 ? 's' : '') + '</b> flagged to review.');
    return out.length ? '<div class="note">' + out.join('<br>') + ' <a href="#" data-act="tab" data-val="more" style="color:var(--gold-ink)">Settings</a></div>' : '';
  }

  function itemRow(it, showCat) {
    var view = S.settings.view;
    var reason = HF.excludedReason(S, it);
    var isOne = it.frequency === 'oneoff';
    var conv = isOne ? Number(it.amount) || 0 : HF.convert(it.amount, it.frequency, it.customWeeks, view);
    var c = cat(it.categoryId);
    var subBits = [srcBadge(it.source)];
    if (it.kind === 'variable' && it.source !== 'statement_avg') subBits.push(badge('calculated', 'Variable'));
    if (HF.isBusiness(S, it) && reason !== 'Business') subBits.push(badge('biz', 'Business'));
    if (it.review) subBits.push(badge('review', 'Review'));
    if (reason) subBits.push(badge(reason === 'Business' ? 'biz' : 'off', reason === 'Business' ? 'Business · excluded' : reason));
    if (it.endDate && !reason) subBits.push(badge('calculated', 'Ends ' + HF.fmtDate(it.endDate, true)));
    var srcAmt = (Number(it.amount) ? money(it.amount, { cents: true, dp: 2 }) : '—') + ' ' + HF.freqLabel(it);
    subBits.push('<span>' + esc(srcAmt) + (showCat && c ? ' · ' + esc(c.name) : (it.provider ? ' · ' + esc(it.provider) : '')) + '</span>');
    if (it.source === 'statement_avg') subBits.push('<span style="flex-basis:100%">' + AVG_LABEL + '</span>');
    return '<div class="row ' + (!it.active ? 'inactive' : reason ? 'excluded' : '') + '">' +
      '<div class="main" data-act="edit-item" data-id="' + it.id + '" style="cursor:pointer"><div class="name">' + esc(it.name) + '</div><div class="sub">' + subBits.join('') + '</div></div>' +
      '<div class="amt num ' + (it.direction === 'in' ? 'pos' : '') + '">' + (Number(it.amount) ? money(conv) : '—') + '<small>' + (isOne ? 'once' : VIEW_SHORT[view]) + '</small></div>' +
      iconBtns('item', it.id) + '</div>';
  }

  function renderAllExpenses() {
    var view = S.settings.view;
    var items = S.items.filter(function (i) { return i.direction === 'out'; });
    if (!items.length) return emptyBlock('🧾', 'No expenses yet', 'Add your first expense.', '');
    items.sort(function (a, b) {
      var ra = HF.excludedReason(S, a) ? 1 : 0, rb = HF.excludedReason(S, b) ? 1 : 0;
      if (ra !== rb) return ra - rb;
      return HF.convert(b.amount, b.frequency, b.customWeeks, view) - HF.convert(a.amount, a.frequency, a.customWeeks, view);
    });
    return '<div class="list">' + items.map(function (it) { return itemRow(it, true); }).join('') + '</div>';
  }

  function renderCategoryCards() {
    var s = S.settings, view = s.view;
    var sum = HF.budgetSummary(S, view);
    var h = '';
    expenseCats().forEach(function (c) {
      var items = S.items.filter(function (i) { return i.direction === 'out' && i.categoryId === c.id; });
      if (!items.length) return;
      var total = sum.byCat[c.id] || 0;
      var counted = items.filter(function (i) { return !HF.excludedReason(S, i); }).length;
      var excluded = c.type === 'business' && !s.includeBusiness;
      var isOne = c.type === 'oneoff';
      var oneTotal = isOne ? items.reduce(function (a, i) { return a + (i.active ? Number(i.amount) || 0 : 0); }, 0) : 0;
      var subText = items.length + ' expense' + (items.length > 1 ? 's' : '') + (counted !== items.length && !isOne && !excluded ? ' · ' + counted + ' counted' : '') +
        (excluded ? ' · business, excluded' : '') + (isOne ? ' · not in recurring burn' : '');
      var open = ui.open[c.id];
      h += '<div class="card cat ' + (open ? 'open' : '') + '"><button class="cat-head" data-act="toggle-cat" data-id="' + c.id + '" aria-expanded="' + !!open + '">' +
        '<div class="emoji">' + esc(c.icon || '•') + '</div><div class="main"><div class="name">' + esc(c.name) + '</div><div class="sub">' + subText + '</div></div>' +
        '<div class="amt num" style="' + (excluded || isOne ? 'color:var(--muted)' : '') + '">' + money(isOne ? oneTotal : excluded ? activeTotal(items) : total) + '<small>' + (isOne ? 'total' : VIEW_SHORT[view]) + '</small></div>' + I.chev + '</button>' +
        '<div class="cat-body">' + items.map(function (it) { return itemRow(it, false); }).join('') + catFoot(c, items) + '</div></div>';
    });
    return h || emptyBlock('🧾', 'No expenses yet', 'Add your first expense.', '');
  }
  function activeTotal(items) {
    return items.reduce(function (a, i) {
      return a + (i.active ? HF.convert(i.amount, i.frequency, i.customWeeks, S.settings.view) : 0);
    }, 0);
  }
  function catFoot(c, items) {
    var view = S.settings.view;
    var bits = [];
    var hasBiz = items.some(function (i) { return i.scope === 'business'; }) && c.type !== 'business';
    if (hasBiz) {
      var p = 0, b = 0;
      items.forEach(function (i) {
        var r = HF.excludedReason(S, i);
        if (r && r !== 'Business') return;
        var v = HF.convert(i.amount, i.frequency, i.customWeeks, view);
        if (i.scope === 'business') b += v; else p += v;
      });
      bits.push('<span>Personal <b class="num">' + money(p) + '</b></span><span>Business / trust <b class="num">' + money(b) + '</b>' + (S.settings.includeBusiness ? '' : ' (excluded)') + '</span>');
    }
    if (items.some(function (i) { return i.source === 'statement_avg'; })) bits.push('<span>' + AVG_LABEL + '</span>');
    if (c.type === 'savings') bits.push('<span>Family savings — not consumption, counted in net worth</span>');
    return bits.length ? '<div class="cat-foot">' + bits.join('') + '</div>' : '';
  }

  // ---------- Actual mode (from transactions) ----------
  function renderActual() {
    var view = S.settings.view;
    if (!S.transactions.length) {
      return emptyBlock('🏦', 'No statement data yet', 'Actual mode shows what really happened, from imported bank statements and manual cash entries.',
        '<div class="btn-row"><button class="btn primary" data-act="import">Import statement</button><button class="btn" data-act="add-tx">Add cash entry</button></div>');
    }
    var range = HF.periodRange(view, new Date(), ui.actualOffset);
    var a = HF.actualSummary(S, range, view);
    var h = '<div class="period"><button data-act="actual-shift" data-val="-1" aria-label="Previous">‹</button><b>' + HF.periodLabel(view, range) + '</b><button data-act="actual-shift" data-val="1" aria-label="Next">›</button></div>';
    h += '<div class="summary">' +
      '<div class="stat"><div class="lbl"><span class="dot" style="background:var(--good)"></span>Money in</div><div class="val num">' + money(a.income) + '</div><div class="sub">actual</div></div>' +
      '<button class="stat" data-act="overview"><div class="lbl"><span class="dot" style="background:var(--gold)"></span>Money out</div><div class="val num">' + money(a.expenses) + '</div><div class="sub">' + a.count + ' transactions</div></button>' +
      '<div class="stat hero"><div class="lbl">Money left</div><div class="val num ' + (a.available < 0 ? 'neg' : '') + '">' + money(a.available) + '</div>' +
      '<div class="sub">' + (view === 'weekly' ? 'Monday → Sunday · ' : '') + 'excludes internal transfers, cash deposits & investments' + (a.oneoffs ? ' · includes ' + money(a.oneoffs) + ' one-offs' : '') + '</div>' + heroSplit({ byType: a.byType }) + '</div></div>';
    h += '<p class="muted" style="font-size:12.5px;margin:4px 4px 0">' + MODE_HELP.actual + '</p>';

    var txs = S.transactions.filter(function (t) { return HF.txInRange(t, range, view) && !HF.txExcluded(S, t); });
    // Money in grouped by merchant
    var inc = {};
    txs.forEach(function (t) { if (t.amount > 0) { var k = t.merchant || t.description_raw; (inc[k] = inc[k] || { n: 0, v: 0, src: t.source }); inc[k].n++; inc[k].v += t.amount; } });
    var incKeys = Object.keys(inc).sort(function (x, y) { return inc[y].v - inc[x].v; });
    h += '<section class="section"><div class="section-head"><h2>Money in</h2><span class="meta">' + incKeys.length + ' sources</span></div>';
    h += incKeys.length ? '<div class="list">' + incKeys.map(function (k) {
      return '<div class="row"><div class="main"><div class="name">' + esc(k) + '</div><div class="sub">' + srcBadge(inc[k].src) + '<span>' + inc[k].n + ' payment' + (inc[k].n > 1 ? 's' : '') + '</span></div></div><div class="amt num pos">' + money(inc[k].v) + '</div></div>';
    }).join('') + '</div>' : '<div class="card pad muted">No income in this period.</div>';
    h += '</section>';

    h += '<section class="section"><div class="section-head"><h2>Money out</h2><button class="add-btn" data-act="add-tx">＋ Cash</button></div>';
    var keys = Object.keys(a.byCat).sort(function (x, y) { return a.byCat[y] - a.byCat[x]; });
    if (!keys.length) h += '<div class="card pad muted">No spending in this period.</div>';
    keys.forEach(function (k) {
      var c = cat(k) || { name: 'Uncategorised', icon: '❔' };
      var list = txs.filter(function (t) { return t.amount < 0 && (t.category_id || 'uncategorised') === k; });
      var key = 'a_' + k, open = ui.open[key];
      h += '<div class="card cat ' + (open ? 'open' : '') + '"><button class="cat-head" data-act="toggle-cat" data-id="' + key + '"><div class="emoji">' + esc(c.icon) + '</div>' +
        '<div class="main"><div class="name">' + esc(c.name) + '</div><div class="sub">' + list.length + ' transactions</div></div><div class="amt num">' + money(a.byCat[k]) + '</div>' + I.chev + '</button>' +
        '<div class="cat-body">' + list.map(txRow).join('') + '</div></div>';
    });
    return h + '</section>';
  }

  // ---------- Expense overview sheet ----------
  function openOverview() {
    var s = S.settings, view = s.view, total, cats = [];
    if (s.mode === 'actual') {
      var range = HF.periodRange(view, new Date(), ui.actualOffset);
      var a = HF.actualSummary(S, range, view);
      total = a.expenses;
      Object.keys(a.byCat).forEach(function (k) {
        var lines = {};
        S.transactions.forEach(function (t) {
          if (!HF.txInRange(t, range, view) || t.amount >= 0 || HF.txExcluded(S, t) || (t.category_id || 'uncategorised') !== k) return;
          var n = t.merchant || t.description_raw; lines[n] = (lines[n] || 0) - t.amount;
        });
        cats.push({ id: k, c: cat(k) || { name: 'Uncategorised', icon: '❔' }, v: a.byCat[k], lines: Object.keys(lines).map(function (n) { return [n, lines[n]]; }) });
      });
    } else {
      var sum = HF.budgetSummary(S, view);
      total = sum.expenses;
      Object.keys(sum.byCat).forEach(function (k) {
        var lines = S.items.filter(function (i) { return i.categoryId === k && i.direction === 'out' && HF.itemIncluded(S, i); })
          .map(function (i) { return [i.name, HF.convert(i.amount, i.frequency, i.customWeeks, view)]; });
        cats.push({ id: k, c: cat(k), v: sum.byCat[k], lines: lines });
      });
    }
    cats.sort(function (x, y) { return y.v - x.v; });
    var max = cats.length ? cats[0].v : 1;
    function body() {
      var label = s.mode === 'actual' ? HF.periodLabel(view, HF.periodRange(view, new Date(), ui.actualOffset)) : 'per ' + VIEW_WORD[view] + ' · ' + (s.includeBusiness ? 'household + business' : 'household only');
      return '<div class="ov-total"><div class="lbl">Total expenses</div><div class="val num">' + money(total) + '</div><div class="muted" style="font-size:13px">' + esc(label) + '</div></div>' +
        '<h4 style="margin:0 2px 4px;font-size:15px">Category breakdown</h4>' +
        (cats.length ? cats.map(function (x) {
          var pct = total ? x.v / total * 100 : 0, open = ui.ovOpen[x.id];
          x.lines.sort(function (p, q) { return q[1] - p[1]; });
          return '<div class="ov-cat ' + (open ? 'open' : '') + '"><button class="ov-head" data-act="toggle-ov" data-id="' + x.id + '"><div class="emoji">' + esc(x.c.icon || '•') + '</div><div class="main">' +
            '<div class="top"><span>' + esc(x.c.name) + ' <span class="pct">' + pct.toFixed(1) + '%</span></span><span class="num">' + money(x.v) + '</span></div>' +
            '<div class="bar"><span style="width:' + (x.v / max * 100).toFixed(1) + '%"></span></div></div>' + I.chev + '</button>' +
            '<div class="cat-body">' + x.lines.map(function (l) { return '<div class="ov-line"><span>' + esc(l[0]) + '</span><span class="num">' + money(l[1]) + '</span></div>'; }).join('') + '</div></div>';
        }).join('') : '<p class="muted">Nothing to show for this period.</p>');
    }
    openSheet('Expense Overview', body(), function (el) {
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-act="toggle-ov"]');
        if (!b) return;
        ui.ovOpen[b.dataset.id] = !ui.ovOpen[b.dataset.id];
        b.parentNode.classList.toggle('open');
      });
    });
  }

  // ---------- Item form ----------
  function freqOptions(cur) {
    return HF.FREQUENCIES.map(function (f) { return '<option value="' + f.id + '"' + (f.id === cur ? ' selected' : '') + '>' + f.label + '</option>'; }).join('');
  }
  function catOptions(cur, types) {
    return sortedCats().filter(function (c) { return !types || types.indexOf(c.type) >= 0; }).map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === cur ? ' selected' : '') + '>' + esc((c.icon ? c.icon + ' ' : '') + c.name) + '</option>';
    }).join('');
  }
  function opts(list, cur) { return list.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cur ? ' selected' : '') + '>' + o[1] + '</option>'; }).join(''); }
  function toggleField(name, label, hint, checked) {
    return '<label class="toggle"><span class="t-text"><b>' + label + '</b>' + (hint ? '<small>' + hint + '</small>' : '') + '</span><span class="switch"><input type="checkbox" name="' + name + '"' + (checked ? ' checked' : '') + '><i></i></span></label>';
  }

  function openItemForm(id, dir) {
    var it = id ? byId(S.items, id) : {
      id: null, direction: dir || 'out', name: '', categoryId: dir === 'in' ? 'c_income' : 'c_housing', amount: '', frequency: 'weekly', customWeeks: '',
      source: 'manual', kind: 'fixed', active: true, scope: 'personal', review: false, provider: '', notes: '', startDate: null, endDate: null
    };
    var isIn = it.direction === 'in';
    var f = '<form id="itemForm" autocomplete="off">' +
      '<label class="field"><span>Name</span><input name="name" required value="' + esc(it.name) + '" placeholder="' + (isIn ? "e.g. Ariel's" : 'e.g. Rent') + '"></label>' +
      '<div class="grid2"><label class="field"><span>Type</span><select name="direction">' + opts([['out', 'Expense'], ['in', 'Earnings']], it.direction) + '</select></label>' +
      '<label class="field" id="catField"' + (isIn ? ' style="display:none"' : '') + '><span>Category</span><select name="categoryId">' + catOptions(it.categoryId, ['living', 'debt', 'tax', 'savings', 'business', 'oneoff']) + '</select></label></div>' +
      '<div class="grid2"><label class="field"><span>Amount</span><div class="money-input"><input name="amount" inputmode="decimal" value="' + esc(it.amount) + '" placeholder="0.00"></div></label>' +
      '<label class="field"><span>Frequency</span><select name="frequency">' + freqOptions(it.frequency) + '</select></label></div>' +
      '<label class="field" id="xField"' + (it.frequency === 'everyX' ? '' : ' style="display:none"') + '><span>Every how many weeks?</span><input name="customWeeks" inputmode="decimal" value="' + esc(it.customWeeks || '') + '" placeholder="e.g. 3.5"></label>' +
      '<div class="note" id="convPreview" style="margin:0 0 12px"></div>' +
      '<div class="grid2"><label class="field"><span>Source</span><select name="source">' + opts([['statement', 'Statement'], ['statement_avg', 'Statement average'], ['cash', 'Manual cash'], ['manual', 'Manual'], ['imported', 'Imported'], ['calculated', 'Calculated'], ['assumption', 'Assumption']], it.source) + '</select></label>' +
      '<label class="field"><span>Behaviour</span><select name="kind">' + opts([['fixed', 'Recurring (fixed)'], ['variable', 'Variable spending'], ['oneoff', 'One-off']], it.kind) + '</select></label></div>' +
      '<div class="grid2"><label class="field"><span>Belongs to</span><select name="scope">' + opts([['personal', 'Household / personal'], ['business', 'Business / trust']], it.scope) + '</select></label>' +
      '<label class="field"><span>Provider</span><input name="provider" value="' + esc(it.provider) + '" placeholder="Optional"></label></div>' +
      '<div class="grid2"><label class="field"><span>Start date</span><input type="date" name="startDate" value="' + esc(it.startDate || '') + '"></label>' +
      '<label class="field"><span>End date</span><input type="date" name="endDate" value="' + esc(it.endDate || '') + '"></label></div>' +
      '<p class="muted" style="font-size:12px;margin:-4px 2px 12px">Optional. Outside these dates the item isn\'t counted — e.g. a repayment plan that finishes.</p>' +
      toggleField('active', 'Active', 'Inactive items are kept but not counted', it.active) +
      toggleField('review', 'Needs review', 'Flag to check against statements', it.review) +
      '<label class="field mt8"><span>Notes</span><textarea name="notes" placeholder="Optional">' + esc(it.notes) + '</textarea></label>' +
      '<div class="btn-row mt12">' + (it.id ? '<button type="button" class="btn danger" data-act="del-item" data-id="' + it.id + '">Delete</button>' : '') +
      '<button type="submit" class="btn primary">' + (it.id ? 'Save' : 'Add') + '</button></div></form>';
    openSheet(it.id ? 'Edit ' + (isIn ? 'earnings' : 'expense') : 'Add ' + (isIn ? 'earnings' : 'expense'), f, function (el) {
      var form = el.querySelector('#itemForm');
      function preview() {
        var a = num(form.amount.value), fr = form.frequency.value, x = num(form.customWeeks.value);
        el.querySelector('#xField').style.display = fr === 'everyX' ? '' : 'none';
        el.querySelector('#catField').style.display = form.direction.value === 'in' ? 'none' : '';
        if (fr === 'oneoff') { el.querySelector('#convPreview').innerHTML = 'One-off: <b>' + money(a) + '</b> once — kept out of recurring burn.'; return; }
        var yr = HF.annualise(a, fr, x);
        el.querySelector('#convPreview').innerHTML = '= <b class="num">' + money(yr / 52) + '</b>/wk · <b class="num">' + money(yr / 12) + '</b>/mo · <b class="num">' + money(yr) + '</b>/yr';
      }
      form.addEventListener('input', preview); form.addEventListener('change', preview); preview();
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var d = {
          name: form.name.value.trim() || 'Untitled', direction: form.direction.value,
          categoryId: form.direction.value === 'in' ? 'c_income' : form.categoryId.value,
          amount: Math.round(num(form.amount.value) * 100) / 100, frequency: form.frequency.value,
          customWeeks: form.frequency.value === 'everyX' ? num(form.customWeeks.value) || null : null,
          source: form.source.value, kind: form.frequency.value === 'oneoff' ? 'oneoff' : form.kind.value,
          scope: form.scope.value, provider: form.provider.value.trim(), active: form.active.checked,
          review: form.review.checked, notes: form.notes.value.trim(),
          startDate: form.startDate.value || null, endDate: form.endDate.value || null
        };
        if (d.startDate && d.endDate && d.endDate < d.startDate) { toast('End date is before start date'); return; }
        if (d.kind === 'oneoff' && d.frequency !== 'oneoff') d.frequency = 'oneoff';
        if (it.id) Object.assign(it, d); else S.items.push(Object.assign({ id: HF.uid('i') }, d));
        closeSheet(); commit(it.id ? 'Saved' : 'Added');
      });
    });
  }

  // ===================== TRANSACTIONS =====================
  function txRow(t) {
    var c = cat(t.category_id);
    var acct = byId(S.accounts, t.account_id);
    var bits = [srcBadge(t.source === 'cash' ? 'cash' : t.source === 'manual' ? 'manual' : 'statement')];
    if (t.internal_transfer) bits.push(badge('transfer', 'Transfer'));
    if (t.cash_deposit) bits.push(badge('transfer', 'Cash deposit'));
    if (t.one_off) bits.push(badge('review', 'One-off'));
    if (!t.category_id) bits.push(badge('review', 'Uncategorised'));
    bits.push('<span>' + esc((c ? c.name : '') + (acct ? (c ? ' · ' : '') + acct.name : '')) + '</span>');
    var excl = HF.txExcluded(S, t);
    return '<div class="row ' + (excl ? 'excluded' : '') + '" data-act="edit-tx" data-id="' + t.id + '" style="cursor:pointer">' +
      '<div class="emoji">' + esc(c ? c.icon : '❔') + '</div><div class="main"><div class="name">' + esc(t.merchant || t.description_raw) + '</div><div class="sub">' + bits.join('') + '</div></div>' +
      '<div class="amt num ' + (t.amount > 0 && !excl ? 'pos' : '') + '">' + (t.amount > 0 ? '+' : '') + money(t.amount, { dp: 2 }) + '<small>' + HF.fmtDate(t.date) + '</small></div></div>';
  }

  function renderTransactions() {
    var h = '<header class="page-head"><div><h1>Transactions</h1><p>Statement-derived & manual cash</p></div></header>';
    h += '<div class="btn-row" style="margin-bottom:12px"><button class="btn primary" data-act="import">Import statement</button><button class="btn" data-act="add-tx">＋ Cash entry</button></div>';
    if (!S.transactions.length) {
      return h + '<div class="card">' + emptyBlock('📄', 'No transactions yet', 'Import a CSV bank statement, or paste lines copied from internet banking. Merchant rules categorise everything automatically, and transfers between your own accounts are excluded.', '') + '</div>';
    }
    h += '<div class="controls">' + seg('txView', [['weekly', 'Week'], ['monthly', 'Month'], ['yearly', 'Year'], ['all', 'All']], ui.txView, 'small') + '</div>';
    var range = ui.txView === 'all' ? { start: '0000', end: '9999' } : HF.periodRange(ui.txView, new Date(), ui.txOffset);
    if (ui.txView !== 'all') h += '<div class="period"><button data-act="tx-shift" data-val="-1" aria-label="Previous">‹</button><b>' + HF.periodLabel(ui.txView, range) + '</b><button data-act="tx-shift" data-val="1" aria-label="Next">›</button></div>';
    h += '<input class="search" type="search" placeholder="Search merchant or description" value="' + esc(ui.txSearch) + '" data-act="tx-search" aria-label="Search transactions">';
    var f = ui.txFilter;
    h += '<div class="chips">' + [['all', 'All'], ['uncat', 'Uncategorised'], ['transfer', 'Transfers'], ['cash', 'Manual cash'], ['oneoff', 'One-offs'], ['sign', 'Check sign']].map(function (c) {
      return '<button class="chip ' + (f === c[0] ? 'on' : '') + '" data-act="tx-filter" data-val="' + c[0] + '">' + c[1] + '</button>';
    }).join('') + '</div>';
    var q = ui.txSearch.toLowerCase();
    var list = S.transactions.filter(function (t) {
      if (t.date < range.start || t.date > range.end) return false;
      if (q && (t.merchant + ' ' + t.description_raw).toLowerCase().indexOf(q) < 0) return false;
      if (f === 'uncat') return !t.category_id;
      if (f === 'transfer') return t.internal_transfer || t.cash_deposit;
      if (f === 'cash') return t.source === 'cash';
      if (f === 'oneoff') return t.one_off;
      if (f === 'sign') return t.sign_guessed;
      return true;
    }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    var tin = 0, tout = 0;
    list.forEach(function (t) { if (HF.txExcluded(S, t)) return; if (t.amount > 0) tin += t.amount; else tout -= t.amount; });
    h += '<div class="card pad" style="display:flex;justify-content:space-between;gap:10px;margin-bottom:6px"><div><div class="muted" style="font-size:12px">In</div><b class="num" style="color:var(--good)">' + money(tin) + '</b></div>' +
      '<div><div class="muted" style="font-size:12px">Out</div><b class="num">' + money(tout) + '</b></div><div class="right"><div class="muted" style="font-size:12px">Left</div><b class="num">' + money(tin - tout) + '</b></div></div>';
    if (!list.length) h += '<div class="card pad muted mt8">No transactions match.</div>';
    var shown = list.slice(0, 400), lastDate = null, group = '';
    shown.forEach(function (t) {
      if (t.date !== lastDate) {
        if (group) h += group + '</div>';
        h += '<div class="day-label">' + HF.fmtDate(t.date, true) + '</div>';
        group = '<div class="list">'; lastDate = t.date;
      }
      group += txRow(t);
    });
    if (group) h += group + '</div>';
    if (list.length > shown.length) h += '<p class="muted right" style="font-size:12px">Showing 400 of ' + list.length + ' — narrow the period or search.</p>';
    h += renderHistory();
    return h;
  }

  // ---------- History chart ----------
  function renderHistory() {
    var v = ui.histView;
    var hist = HF.history(S, v, v === 'weekly' ? 12 : v === 'monthly' ? 12 : 6);
    var h = '<section class="section"><div class="section-head"><h2>History</h2></div>' +
      '<div style="margin-bottom:10px">' + seg('histView', [['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']], v, 'small') + '</div>';
    if (!hist.length) return h + '<div class="card pad muted">Not enough data yet.</div></section>';
    var labels = hist.map(function (b) { return HF.periodShortLabel(v, b.key); });
    h += '<div class="card pad"><div style="font-weight:700;margin-bottom:2px">Money in vs money out</div><div class="legend muted" style="margin-bottom:8px">' +
      '<span><i class="dot" style="background:var(--series-in)"></i>In</span><span><i class="dot" style="background:var(--series-out)"></i>Out</span></div>' +
      barChart('h1', labels, [{ name: 'In', color: 'var(--series-in)', values: hist.map(function (b) { return b.income; }) }, { name: 'Out', color: 'var(--series-out)', values: hist.map(function (b) { return b.expenses; }) }]) + '</div>';
    h += '<div class="card pad"><div style="font-weight:700;margin-bottom:8px">Money left</div>' +
      barChart('h2', labels, [{ name: 'Left', color: 'var(--ink-2)', values: hist.map(function (b) { return b.available; }) }]) + '</div>';
    h += '<div class="card pad" style="overflow-x:auto"><table class="tbl num"><thead><tr><th>' + (v === 'weekly' ? 'Week (Mon)' : v === 'monthly' ? 'Month' : 'Year') + '</th><th>In</th><th>Out</th><th>Left</th><th>Savings</th></tr></thead><tbody>' +
      hist.slice().reverse().map(function (b) {
        return '<tr><td>' + HF.periodShortLabel(v, b.key) + '</td><td>' + money(b.income, { dp: 0 }) + '</td><td>' + money(b.expenses, { dp: 0 }) + '</td><td>' + money(b.available, { dp: 0 }) + '</td><td>' + money(b.savings, { dp: 0 }) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return h + '</section>';
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function shortMoney(v) {
    var a = Math.abs(v), s = a >= 1e6 ? (a / 1e6).toFixed(1) + 'm' : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k' : a.toFixed(0);
    return (v < 0 ? '−' : '') + '$' + s;
  }
  // Grouped bar chart on one shared axis; hover/tap a column for values.
  function barChart(id, labels, series) {
    var W = 340, H = 180, padL = 40, padB = 22, padT = 8;
    var all = []; series.forEach(function (s) { all = all.concat(s.values); });
    var hi = niceMax(Math.max.apply(null, all.concat([0]))), lo = Math.min.apply(null, all.concat([0]));
    lo = lo < 0 ? -niceMax(-lo) : 0;
    var plotH = H - padB - padT, plotW = W - padL - 4;
    function y(v) { return padT + (hi - v) / (hi - lo) * plotH; }
    var n = labels.length, gw = plotW / n, bw = Math.max(3, Math.min(18, (gw - 6) / series.length - 2));
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Bar chart">';
    var ticks = [hi, hi / 2, 0]; if (lo < 0) ticks.push(lo);
    // Drop labels that would collide with the one above.
    ticks = ticks.filter(function (t, i) { return i === 0 || y(t) - y(ticks[i - 1]) >= 14; });
    svg += '<g class="grid">' + ticks.map(function (t) { return '<line x1="' + padL + '" x2="' + W + '" y1="' + y(t) + '" y2="' + y(t) + '"/>'; }).join('') + '</g>';
    svg += '<g class="axis">' + ticks.map(function (t) { return '<text x="' + (padL - 6) + '" y="' + (y(t) + 3) + '" text-anchor="end">' + shortMoney(t) + '</text>'; }).join('') + '</g>';
    var step = Math.ceil(n / 6);
    labels.forEach(function (l, i) {
      var gx = padL + i * gw, total = series.length * (bw + 2) - 2, x0 = gx + (gw - total) / 2;
      series.forEach(function (s, j) {
        var v = s.values[i], top = y(Math.max(v, 0)), bot = y(Math.min(v, 0)), hgt = Math.max(1, bot - top), x = x0 + j * (bw + 2), r = Math.min(4, bw / 2, hgt);
        // Rounded at the data end, square at the baseline.
        var d = v >= 0
          ? 'M' + x + ',' + bot + 'V' + (top + r) + 'Q' + x + ',' + top + ' ' + (x + r) + ',' + top + 'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + top + ' ' + (x + bw) + ',' + (top + r) + 'V' + bot + 'Z'
          : 'M' + x + ',' + top + 'V' + (bot - r) + 'Q' + x + ',' + bot + ' ' + (x + r) + ',' + bot + 'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + bot + ' ' + (x + bw) + ',' + (bot - r) + 'V' + top + 'Z';
        svg += '<path d="' + d + '" fill="' + s.color + '"/>';
      });
      if (i % step === 0 || i === n - 1) svg += '<g class="axis"><text x="' + (gx + gw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(l) + '</text></g>';
      var tip = '<b>' + esc(l) + '</b>' + series.map(function (s) { return esc(s.name) + ' ' + money(s.values[i], { dp: 0 }); }).join('<br>');
      svg += '<rect x="' + gx + '" y="0" width="' + gw + '" height="' + (H - padB) + '" fill="transparent" data-tip="' + esc(tip) + '" data-cx="' + ((gx + gw / 2) / W) + '"/>';
    });
    if (lo < 0) svg += '<line class="zero" x1="' + padL + '" x2="' + W + '" y1="' + y(0) + '" y2="' + y(0) + '"/>';
    svg += '</svg>';
    return '<div class="chart" id="' + id + '">' + svg + '<div class="tip"></div></div>';
  }
  function chartHover(e) {
    var r = e.target.closest && e.target.closest('rect[data-tip]');
    document.querySelectorAll('.chart .tip.show').forEach(function (t) { if (!r || !t.parentNode.contains(r)) t.classList.remove('show'); });
    if (!r) return;
    var chart = r.closest('.chart'), tip = chart.querySelector('.tip');
    tip.innerHTML = r.getAttribute('data-tip');
    var x = Math.min(Math.max(Number(r.dataset.cx) * chart.clientWidth, 60), chart.clientWidth - 60);
    tip.style.left = x + 'px'; tip.style.top = '6px';
    tip.classList.add('show');
  }

  // ---------- Transaction form ----------
  function openTxForm(id) {
    var t = id ? byId(S.transactions, id) : HF.newTransaction({ account_id: 'a_cash', category_id: 'c_food', source: 'cash', amount: '' });
    var isNew = !id, editableAmt = isNew || t.source !== 'imported';
    var dir = t.direction || (t.amount > 0 ? 'in' : 'out');
    var f = '<form id="txForm" autocomplete="off">' +
      (t.description_raw && !isNew ? '<div class="note" style="margin:0 0 12px"><b>Statement text:</b> ' + esc(t.description_raw) + (t.date_raw && t.date_raw !== t.date ? '<br><b>Statement date:</b> ' + esc(t.date_raw) : '') + '</div>' : '') +
      '<label class="field"><span>' + (isNew ? 'Description' : 'Merchant name') + '</span><input name="merchant" required value="' + esc(t.merchant || t.description_raw) + '" placeholder="e.g. House cleaner"></label>' +
      '<div class="grid2"><label class="field"><span>Date</span><input type="date" name="date" value="' + esc(t.date) + '"' + (editableAmt ? '' : ' readonly') + '></label>' +
      '<label class="field"><span>Money</span><select name="dir"' + (editableAmt ? '' : ' disabled') + '>' + opts([['out', 'Out (spent)'], ['in', 'In (received)']], dir) + '</select></label></div>' +
      '<label class="field"><span>Amount</span><div class="money-input"><input name="amount" inputmode="decimal" value="' + (t.amount === '' ? '' : Math.abs(t.amount)) + '"' + (editableAmt ? '' : ' readonly') + '></div>' +
      (editableAmt ? '' : '<div class="hint">Imported amounts stay as the statement shows them.</div>') + '</label>' +
      '<div class="grid2"><label class="field"><span>Category</span><select name="category_id"><option value="">Uncategorised</option>' + catOptions(t.category_id) + '</select></label>' +
      '<label class="field"><span>Subcategory</span><input name="subcategory" value="' + esc(t.subcategory || '') + '" placeholder="Optional"></label></div>' +
      '<div class="grid2"><label class="field"><span>Budget week (Mon)</span><input type="date" name="budget_week" value="' + esc(t.budget_week || '') + '"><div class="hint">Move a split payment into the week it belongs to.</div></label>' +
      '<label class="field"><span>Recurring group</span><input name="recurring_group" value="' + esc(t.recurring_group || '') + '" placeholder="e.g. Ariana Dance"></label></div>' +
      (isNew ? '' : toggleField('internal_transfer', 'Internal transfer', 'Between your own accounts — not income or expense', t.internal_transfer) +
        toggleField('cash_deposit', 'Cash deposit', 'Cash already counted manually — don\'t double count', t.cash_deposit)) +
      toggleField('recurring', 'Recurring', 'A normal repeating payment', t.recurring) +
      toggleField('one_off', 'One-off', 'Keep out of normal recurring spending', t.one_off) +
      (!isNew && t.source === 'imported' ? '<label class="field mt8"><span>Make a rule (optional)</span><input name="rulePattern" placeholder="Text to match, e.g. ' + esc(String(t.description_raw).split(/\s+/).slice(0, 2).join(' ').toUpperCase()) + '">' +
        '<div class="hint">Future imports containing this text get this name & category.</div></label>' : '') +
      '<label class="field mt8"><span>Notes</span><textarea name="notes">' + esc(t.notes) + '</textarea></label>' +
      '<div class="btn-row mt12">' + (isNew ? '' : '<button type="button" class="btn danger" data-act="del-tx" data-id="' + t.id + '">Delete</button>') +
      '<button type="submit" class="btn primary">' + (isNew ? 'Add cash entry' : 'Save') + '</button></div></form>';
    openSheet(isNew ? 'Cash entry' : 'Transaction', f, function (el) {
      var form = el.querySelector('#txForm');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var d = {
          merchant: form.merchant.value.trim(), category_id: form.category_id.value || null, subcategory: form.subcategory.value.trim() || null,
          recurring_group: form.recurring_group.value.trim() || null, recurring: form.recurring.checked, one_off: form.one_off.checked, notes: form.notes.value.trim()
        };
        if (editableAmt) {
          var a = Math.abs(num(form.amount.value));
          d.amount = form.dir.value === 'in' ? a : -a; d.direction = form.dir.value;
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
    });
  }

  // ---------- Import ----------
  function openImport() {
    var accts = S.accounts.filter(function (a) { return a.type !== 'cash'; });
    var f = '<div id="imp">' +
      '<label class="field"><span>Which account is this statement for?</span><select name="account">' + accts.map(function (a) { return '<option value="' + a.id + '">' + esc(a.name) + '</option>'; }).join('') +
      '<option value="__new">＋ New account…</option></select></label>' +
      '<label class="field" id="newAcct" style="display:none"><span>New account name</span><input name="newAccount" placeholder="e.g. CommBank Everyday"></label>' +
      '<div class="field"><span>Statement file (CSV)</span><input type="file" name="file" accept=".csv,.txt,text/csv"><div class="hint">Export CSV from internet banking. PDF statements aren\'t supported — paste the lines instead.</div></div>' +
      '<label class="field"><span>…or paste transactions</span><textarea name="paste" placeholder="12/03/2026  WOOLWORTHS 1234 WOLLONGONG  -45.20&#10;13/03/2026  CENTRELINK FTB  956.40"></textarea>' +
      '<div class="hint">One per line: date, description, amount. Copy straight from internet banking.</div></label>' +
      '<label class="field"><span>Year for dates without one</span><input name="year" inputmode="numeric" value="' + new Date().getFullYear() + '"></label>' +
      '<button class="btn primary block" id="parseBtn">Read transactions</button>' +
      '<div id="impResult"></div></div>';
    openSheet('Import statement', f, function (el) {
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
        var file = el.querySelector('[name=file]').files[0];
        var paste = el.querySelector('[name=paste]').value;
        var year = Number(el.querySelector('[name=year]').value) || new Date().getFullYear();
        var res = el.querySelector('#impResult');
        res.innerHTML = '<p class="muted">Reading…</p>';
        var p;
        if (file && /\.pdf$/i.test(file.name)) { res.innerHTML = '<div class="note"><b>PDF isn\'t supported.</b> Use the CSV export, or copy the lines from the PDF and paste them.</div>'; return; }
        else if (file) p = file.text().then(function (txt) { var r = IM.parseCSV(txt); return r.length ? r : IM.parseText(txt, year); });
        else if (paste.trim()) p = Promise.resolve(/,/.test(paste.split('\n')[0]) && IM.parseCSV(paste).length ? IM.parseCSV(paste) : IM.parseText(paste, year));
        else { res.innerHTML = '<p class="muted">Choose a file or paste some lines first.</p>'; return; }
        p.then(function (rows) {
          ui.importRows = IM.prepare(S, rows, accountId);
          res.innerHTML = importPreview();
        }).catch(function (err) { res.innerHTML = '<div class="note"><b>Couldn\'t read that.</b> ' + esc(err.message || err) + '</div>'; });
      });
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-imp]');
        if (!b) return;
        var rows = ui.importRows, i = Number(b.dataset.i);
        if (b.dataset.imp === 'flip') {
          var r = rows[i];
          r.amount = -r.amount; r.direction = r.amount > 0 ? 'in' : 'out'; r.sign_guessed = false;
          Object.assign(r, IM.classify(S, { description: r.description_raw, amount: r.amount, account_id: r.account_id }));
          el.querySelector('#impResult').innerHTML = importPreview();
        }
        if (b.dataset.imp === 'skip') { rows[i].skip = !rows[i].skip; el.querySelector('#impResult').innerHTML = importPreview(); }
        if (b.dataset.imp === 'confirm') {
          var add = rows.filter(function (r) { return !r.skip && !r.duplicate; });
          add.forEach(function (r) { delete r.skip; delete r.duplicate; S.transactions.push(r); });
          var pairs = IM.detectTransferPairs(S);
          ui.importRows = null;
          closeSheet(); S.settings.tab = 'transactions';
          commit(add.length + ' imported' + (pairs ? ' · ' + pairs + ' transfer pair' + (pairs > 1 ? 's' : '') + ' found' : ''));
        }
      });
    });
  }
  function importPreview() {
    var rows = ui.importRows;
    if (!rows.length) return '<div class="note mt12"><b>No transactions found.</b> Check the CSV has date, description and amount columns, or copy & paste the lines from internet banking.</div>';
    var dup = rows.filter(function (r) { return r.duplicate; }).length;
    var tr = rows.filter(function (r) { return r.internal_transfer; }).length;
    var unc = rows.filter(function (r) { return !r.category_id; }).length;
    var guess = rows.filter(function (r) { return r.sign_guessed; }).length;
    var n = rows.filter(function (r) { return !r.skip && !r.duplicate; }).length;
    var h = '<div class="card pad mt12"><div class="kv"><span>Found</span><b>' + rows.length + '</b></div><div class="kv"><span>Already imported (skipped)</span><b>' + dup + '</b></div>' +
      '<div class="kv"><span>Internal transfers</span><b>' + tr + '</b></div><div class="kv"><span>Uncategorised</span><b>' + unc + '</b></div>' +
      (guess ? '<div class="kv"><span>In/out guessed from text</span><b>' + guess + '</b></div>' : '') + '</div>';
    if (guess) h += '<div class="note">Rows marked <b>±?</b> had no sign on the statement. Tap <b>±</b> to flip any that are wrong.</div>';
    h += '<div class="list mt12">' + rows.slice(0, 300).map(function (r, i) {
      var c = cat(r.category_id);
      return '<div class="row" style="' + (r.skip || r.duplicate ? 'opacity:.45' : '') + '"><div class="main"><div class="name" style="font-size:14px">' + esc(r.merchant) + '</div>' +
        '<div class="sub"><span>' + HF.fmtDate(r.date, true) + '</span>' + (c ? '<span>· ' + esc(c.name) + '</span>' : badge('review', 'Uncategorised')) + (r.internal_transfer ? badge('transfer', 'Transfer') : '') + (r.duplicate ? badge('off', 'Duplicate') : '') + '</div></div>' +
        '<div class="amt num ' + (r.amount > 0 ? 'pos' : '') + '" style="font-size:14px">' + money(r.amount, { dp: 2 }) + (r.sign_guessed ? '<small>±?</small>' : '') + '</div>' +
        '<div class="icon-btns"><button class="ibtn" data-imp="flip" data-i="' + i + '" aria-label="Flip in/out">±</button>' +
        (r.duplicate ? '' : '<button class="ibtn" data-imp="skip" data-i="' + i + '" aria-label="Skip">' + (r.skip ? '↺' : '✕') + '</button>') + '</div></div>';
    }).join('') + '</div>';
    if (rows.length > 300) h += '<p class="muted" style="font-size:12px">Previewing 300 of ' + rows.length + '; all will be imported.</p>';
    return h + '<button class="btn gold block mt12" data-imp="confirm"' + (n ? '' : ' disabled') + '>Import ' + n + ' transaction' + (n === 1 ? '' : 's') + '</button>';
  }

  // ===================== DEBTS =====================
  function debtMonthly(d) { return HF.convert(d.payment, d.frequency, null, 'monthly'); }
  function renderDebts() {
    var h = '<header class="page-head"><div><h1>Debts</h1><p>Balances, repayments and payoff</p></div><button class="add-btn" data-act="add-debt">＋ Add</button></header>';
    var tot = { personal: 0, business: 0 }, pay = 0, interest = 0, unknown = 0;
    S.debts.forEach(function (d) {
      if (d.active === false) return;
      if (d.balance == null || d.balance === '') unknown++;
      tot[d.scope === 'business' ? 'business' : 'personal'] += Number(d.balance) || 0;
      pay += debtMonthly(d);
      if (d.rate && d.balance) interest += d.balance * d.rate / 100 / 12;
    });
    h += '<div class="summary"><div class="stat hero"><div class="lbl">Household debt</div><div class="val num" style="color:#F0C9A0">' + money(tot.personal) + '</div>' +
      '<div class="sub">' + (tot.business ? 'Plus business / trust ' + money(tot.business) + ' · ' : '') + (unknown ? unknown + ' balance' + (unknown > 1 ? 's' : '') + ' not set' : 'all balances set') + '</div></div>' +
      '<div class="stat"><div class="lbl">Repayments</div><div class="val num">' + money(pay) + '</div><div class="sub">per month, all debts</div></div>' +
      '<div class="stat"><div class="lbl">Est. interest</div><div class="val num">' + money(interest) + '</div><div class="sub">per month, where rate known</div></div></div>';
    h += '<section class="section">';
    S.debts.forEach(function (d) {
      var bal = d.balance == null || d.balance === '' ? null : Number(d.balance);
      var util = d.limit ? bal / d.limit : null;
      var months = bal != null ? HF.payoffMonths(bal, d.rate, debtMonthly(d)) : null;
      var payoff = bal == null ? '—' : months === null ? (debtMonthly(d) ? 'Never at this rate' : 'No set payment') : months === 0 ? 'Paid off' : months < 12 ? months + ' mo' : (months / 12).toFixed(1) + ' yrs';
      h += '<div class="card pad" style="' + (d.active === false ? 'opacity:.55' : '') + '"><div style="display:flex;align-items:flex-start;gap:10px"><div style="flex:1;min-width:0">' +
        '<div style="font-weight:700;font-size:16px">' + esc(d.name) + '</div><div class="sub" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">' + (d.scope === 'business' ? badge('biz', 'Business / trust') : badge('manual', 'Personal')) +
        (d.active === false ? badge('off', 'Closed') : '') + '</div></div>' +
        '<div class="right"><div class="num" style="font-weight:700;font-size:20px">' + (bal == null ? '<span class="muted" style="font-size:14px">Balance not set</span>' : money(bal, { dp: 2 })) + '</div>' +
        (d.limit ? '<div class="muted" style="font-size:12px">of ' + money(d.limit) + ' limit</div>' : '') + '</div></div>' +
        (util != null ? '<div class="util ' + (util > 1 ? 'over' : '') + '"><span style="width:' + Math.min(100, util * 100).toFixed(1) + '%"></span></div>' + (util > 1 ? '<div style="color:var(--bad);font-size:12px;margin-top:4px;font-weight:600">Over limit by ' + money(bal - d.limit, { dp: 2 }) + '</div>' : '') : '') +
        '<div class="debt-meta"><div><small>Rate</small><b>' + (d.rate != null && d.rate !== '' ? d.rate + '%' : '—') + '</b></div><div><small>Repayment</small><b class="num">' + (Number(d.payment) ? money(d.payment, { dp: 2 }) + '<span class="muted" style="font-weight:500;font-size:11px"> ' + HF.freqLabel(d) + '</span>' : 'Not set') + '</b></div><div><small>' + (d.endDate ? 'Ends' : 'Payoff (est.)') + '</small><b>' + (d.endDate ? HF.fmtDate(d.endDate, true) : payoff) + '</b></div></div>' +
        (d.notes ? '<div class="muted" style="font-size:12.5px;margin-top:10px">' + esc(d.notes) + '</div>' : '') +
        '<div style="display:flex;justify-content:flex-end;margin-top:10px">' + iconBtns('debt', d.id) + '</div></div>';
    });
    if (!S.debts.length) h += '<div class="card">' + emptyBlock('🎉', 'No debts', 'Add one to track it.', '') + '</div>';
    h += '<div class="note">Repayments shown here are your targets. What actually left the bank is in <b>Transactions</b> under Debt Repayments.</div></section>';
    return h;
  }
  function openDebtForm(id) {
    var d = id ? byId(S.debts, id) : { id: null, name: '', balance: '', limit: '', rate: '', payment: '', frequency: 'monthly', scope: 'personal', endDate: null, active: true, notes: '' };
    var f = '<form id="debtForm" autocomplete="off"><label class="field"><span>Name</span><input name="name" required value="' + esc(d.name) + '"></label>' +
      '<div class="grid2"><label class="field"><span>Balance owing</span><div class="money-input"><input name="balance" inputmode="decimal" value="' + esc(d.balance == null ? '' : d.balance) + '" placeholder="Unknown"></div></label>' +
      '<label class="field"><span>Credit limit</span><div class="money-input"><input name="limit" inputmode="decimal" value="' + esc(d.limit == null ? '' : d.limit) + '" placeholder="Optional"></div></label></div>' +
      '<div class="grid2"><label class="field"><span>Interest rate % p.a.</span><input name="rate" inputmode="decimal" value="' + esc(d.rate == null ? '' : d.rate) + '" placeholder="Optional"></label>' +
      '<label class="field"><span>Belongs to</span><select name="scope">' + opts([['personal', 'Personal'], ['business', 'Business / trust']], d.scope) + '</select></label></div>' +
      '<div class="grid2"><label class="field"><span>Repayment</span><div class="money-input"><input name="payment" inputmode="decimal" value="' + esc(d.payment || '') + '" placeholder="Target"></div></label>' +
      '<label class="field"><span>Frequency</span><select name="frequency">' + opts([['weekly', 'Weekly'], ['fortnightly', 'Fortnightly'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly']], d.frequency) + '</select></label></div>' +
      '<label class="field"><span>End date</span><input type="date" name="endDate" value="' + esc(d.endDate || '') + '"><div class="hint">When it\'s due to be paid off, if known. Otherwise payoff is estimated.</div></label>' +
      toggleField('active', 'Active', 'Turn off when paid off or closed', d.active !== false) +
      '<label class="field mt8"><span>Notes</span><textarea name="notes">' + esc(d.notes) + '</textarea></label>' +
      '<div class="btn-row mt12">' + (d.id ? '<button type="button" class="btn danger" data-act="del-debt" data-id="' + d.id + '">Delete</button>' : '') + '<button class="btn primary" type="submit">' + (d.id ? 'Save' : 'Add debt') + '</button></div></form>';
    openSheet(d.id ? 'Edit debt' : 'Add debt', f, function (el) {
      var form = el.querySelector('#debtForm');
      function optNum(v) { return String(v).trim() === '' ? null : num(v); }
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = { name: form.name.value.trim() || 'Debt', balance: optNum(form.balance.value), limit: optNum(form.limit.value), rate: optNum(form.rate.value),
          payment: num(form.payment.value), frequency: form.frequency.value, scope: form.scope.value, endDate: form.endDate.value || null, active: form.active.checked, notes: form.notes.value.trim() };
        if (d.id) Object.assign(d, v); else S.debts.push(Object.assign({ id: HF.uid('d') }, v));
        closeSheet(); commit('Saved');
      });
    });
  }

  // ===================== NET WORTH =====================
  var ASSET_TYPES = [['cash', 'Cash', '💵'], ['kids', 'Kids savings', '🐷'], ['shares', 'Stock market', '📈'], ['crypto', 'Crypto', '🪙'], ['other', 'Other assets', '🏷️']];
  function renderNetWorth() {
    var scope = S.settings.nwScope;
    var nw = HF.netWorth(S, scope);
    var h = '<header class="page-head"><div><h1>Net Worth</h1><p>Cash + investments − debt</p></div><button class="add-btn" data-act="add-asset">＋ Asset</button></header>';
    h += '<div class="controls">' + seg('nwScope', [['household', 'Household only'], ['all', 'Household + Business']], scope, 'small') + '</div>';
    h += '<div class="summary"><div class="stat hero"><div class="lbl">Net worth</div><div class="val num ' + (nw.net < 0 ? 'neg' : '') + '">' + money(nw.net) + '</div>' +
      '<div class="sub">Not part of weekly cash flow. Market values change — update them when you check.</div></div>' +
      '<div class="stat"><div class="lbl"><span class="dot" style="background:var(--good)"></span>Assets</div><div class="val num">' + money(nw.assets) + '</div></div>' +
      '<div class="stat"><div class="lbl"><span class="dot" style="background:var(--bad)"></span>Liabilities</div><div class="val num">' + money(nw.liabilities) + '</div></div></div>';
    ASSET_TYPES.forEach(function (t) {
      var list = S.assets.filter(function (a) { return a.type === t[0] && (scope === 'all' || a.scope !== 'business'); });
      if (!list.length) return;
      var tot = list.reduce(function (s, a) { return s + (Number(a.value) || 0); }, 0);
      var key = 'nw_' + t[0], open = ui.open[key] !== false;
      h += '<div class="card cat ' + (open ? 'open' : '') + '" style="margin-top:10px"><button class="cat-head" data-act="toggle-nw" data-id="' + key + '"><div class="emoji">' + t[2] + '</div><div class="main"><div class="name">' + t[1] + '</div><div class="sub">' + list.length + ' item' + (list.length > 1 ? 's' : '') + '</div></div><div class="amt num">' + money(tot) + '</div>' + I.chev + '</button>' +
        '<div class="cat-body">' + list.map(function (a) {
          return '<div class="row"><div class="main" data-act="edit-asset" data-id="' + a.id + '" style="cursor:pointer"><div class="name">' + esc(a.name) + '</div><div class="sub">' + (a.scope === 'business' ? badge('biz', 'Business') : '') +
            '<span>Updated ' + (a.updated ? HF.fmtDate(a.updated, true) : '—') + '</span>' + (a.notes ? '<span>· ' + esc(a.notes) + '</span>' : '') + '</div></div><div class="amt num">' + money(a.value, { dp: 2 }) + '</div>' + iconBtns('asset', a.id) + '</div>';
        }).join('') + '</div></div>';
    });
    var debts = S.debts.filter(function (d) { return d.active !== false && (scope === 'all' || d.scope !== 'business'); });
    h += '<section class="section"><div class="section-head"><h2>Liabilities</h2><button class="add-btn" data-act="tab" data-val="debts">Debts ›</button></div><div class="list">' +
      debts.map(function (d) {
        return '<div class="row"><div class="main"><div class="name">' + esc(d.name) + '</div><div class="sub">' + (d.scope === 'business' ? badge('biz', 'Business / trust') : '') + (d.balance == null ? badge('review', 'Balance not set') : '') + '</div></div><div class="amt num">' + (d.balance == null ? '—' : '−' + money(d.balance, { dp: 2 })) + '</div></div>';
      }).join('') + '</div></section>';
    return h;
  }
  function openAssetForm(id) {
    var a = id ? byId(S.assets, id) : { id: null, name: '', type: 'cash', value: '', scope: 'household', updated: todayISO(), notes: '' };
    var f = '<form id="assetForm" autocomplete="off"><label class="field"><span>Name</span><input name="name" required value="' + esc(a.name) + '"></label>' +
      '<div class="grid2"><label class="field"><span>Type</span><select name="type">' + opts(ASSET_TYPES.map(function (t) { return [t[0], t[1]]; }), a.type) + '</select></label>' +
      '<label class="field"><span>Value</span><div class="money-input"><input name="value" inputmode="decimal" value="' + esc(a.value) + '"></div></label></div>' +
      '<div class="grid2"><label class="field"><span>Belongs to</span><select name="scope">' + opts([['household', 'Household'], ['business', 'Business / trust']], a.scope) + '</select></label>' +
      '<label class="field"><span>Value as at</span><input type="date" name="updated" value="' + esc(a.updated || todayISO()) + '"></label></div>' +
      '<label class="field"><span>Notes</span><textarea name="notes">' + esc(a.notes) + '</textarea></label>' +
      '<div class="btn-row mt12">' + (a.id ? '<button type="button" class="btn danger" data-act="del-asset" data-id="' + a.id + '">Delete</button>' : '') + '<button class="btn primary" type="submit">' + (a.id ? 'Save' : 'Add asset') + '</button></div></form>';
    openSheet(a.id ? 'Edit asset' : 'Add asset', f, function (el) {
      var form = el.querySelector('#assetForm');
      form.value.addEventListener('input', function () { form.updated.value = todayISO(); });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = { name: form.name.value.trim() || 'Asset', type: form.type.value, value: Math.round(num(form.value.value) * 100) / 100, scope: form.scope.value, updated: form.updated.value, notes: form.notes.value.trim() };
        if (a.id) Object.assign(a, v); else S.assets.push(Object.assign({ id: HF.uid('as') }, v));
        closeSheet(); commit('Saved');
      });
    });
  }

  // ===================== MORE / SETTINGS =====================
  function renderMore() {
    var s = S.settings;
    var h = '<header class="page-head"><div><h1>More</h1><p>Settings, categories, rules & data</p></div></header>';
    h += '<section class="section" style="margin-top:0"><div class="section-head"><h2>Totals</h2></div>' +
      '<label class="toggle"><span class="t-text"><b>Include business / trust</b><small>Count JZD ATO, Revenue NSW JZD and business software in totals</small></span><span class="switch"><input type="checkbox" data-act="setting" data-key="includeBusiness"' + (s.includeBusiness ? ' checked' : '') + '><i></i></span></label>' +
      '<label class="toggle"><span class="t-text"><b>Include manual cash</b><small>Off = bank-derived totals only. On = bank + manual cash</small></span><span class="switch"><input type="checkbox" data-act="setting" data-key="includeCash"' + (s.includeCash ? ' checked' : '') + '><i></i></span></label></section>';
    h += '<section class="section"><div class="section-head"><h2>Appearance</h2></div>' + seg('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], s.theme || 'auto', 'small') + '</section>';
    var cats = S.categories.length, rules = S.rules.length, accts = S.accounts.length;
    h += '<section class="section"><div class="section-head"><h2>Manage</h2></div><div class="list">' +
      moreRow('manage-cats', '🗂️', 'Categories', cats + ' categories · types control what counts as lifestyle, debt, savings…') +
      moreRow('manage-rules', '🏷️', 'Merchant rules', rules + ' rules · auto-categorise imported statements') +
      moreRow('manage-accounts', '🏦', 'Accounts', accts + ' accounts · owned accounts make transfers internal') + '</div></section>';
    h += '<section class="section"><div class="section-head"><h2>Data</h2></div><div class="list">' +
      moreRow('export', '⬇️', 'Export backup', 'Download everything as a JSON file') +
      moreRow('restore', '⬆️', 'Restore backup', 'Load a JSON backup (replaces current data)') +
      moreRow('reset', '↺', 'Reset to starting figures', 'Replace everything with the original seed data') + '</div>' +
      '<input type="file" id="restoreFile" accept=".json,application/json" class="sr-only">' +
      '<div class="note">Data is stored on this device only (browser storage). Export a backup now and then — especially before clearing Safari data.</div></section>';
    h += '<section class="section"><div class="section-head"><h2>How the numbers work</h2></div><div class="card pad" style="font-size:13.5px;line-height:1.5">' +
      '<p style="margin-top:0"><b>Conversions:</b> weekly ×52, fortnightly ×26, monthly ×12, quarterly ×4, per term ×4, every X weeks ×52/X. Weekly view = yearly ÷ 52, monthly view = yearly ÷ 12.</p>' +
      '<p><b>Weeks</b> run Monday → Sunday.</p>' +
      '<p><b>Internal transfers</b> between your own accounts, <b>cash deposits</b> (already counted as manual cash) and <b>investment</b> buys/sells are excluded from income and expenses.</p>' +
      '<p><b>Kids savings</b> leave the adult account as Family Savings — shown in expenses so “Available” is honest, but excluded from lifestyle and counted in net worth.</p>' +
      '<p style="margin-bottom:0"><b>Statement averages</b> (groceries, eating out…) are actual Jan–Sep 2026 bank figures, bank only. Cash spending is only included when you add it.</p></div></section>';
    return h;
  }
  function moreRow(act, icon, title, sub) {
    return '<button class="row" data-act="' + act + '"><div class="emoji">' + icon + '</div><div class="main"><div class="name">' + title + '</div><div class="sub">' + sub + '</div></div>' + I.chev + '</button>';
  }

  // ---- Categories manager ----
  var CAT_TYPES = [['living', 'Lifestyle spending'], ['debt', 'Debt repayment'], ['tax', 'Tax & government'], ['savings', 'Savings'], ['business', 'Business'], ['oneoff', 'One-off'], ['income', 'Income'], ['transfer', 'Internal transfer (excluded)'], ['investment', 'Investment movement (excluded)']];
  function openCats() {
    function body() {
      var list = sortedCats();
      return '<button class="btn primary block" data-act="add-cat">＋ New category</button><div class="list mt12">' + list.map(function (c, i) {
        var n = S.items.filter(function (it) { return it.categoryId === c.id; }).length + S.transactions.filter(function (t) { return t.category_id === c.id; }).length;
        return '<div class="row"><div class="emoji">' + esc(c.icon || '•') + '</div><div class="main" data-act="edit-cat" data-id="' + c.id + '" style="cursor:pointer"><div class="name">' + esc(c.name) + '</div><div class="sub">' + esc(HF.TYPE_LABELS[c.type] || c.type) + ' · ' + n + ' uses</div></div>' +
          '<div class="icon-btns"><button class="ibtn" data-act="cat-move" data-id="' + c.id + '" data-val="-1" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>' + I.up + '</button><button class="ibtn" data-act="cat-move" data-id="' + c.id + '" data-val="1" aria-label="Move down"' + (i === list.length - 1 ? ' disabled' : '') + '>' + I.down + '</button>' +
          '<button class="ibtn" data-act="edit-cat" data-id="' + c.id + '" aria-label="Edit">' + I.edit + '</button></div></div>';
      }).join('') + '</div>';
    }
    openSheet('Categories', body());
  }
  function openCatForm(id) {
    var c = id ? cat(id) : { id: null, name: '', icon: '', type: 'living' };
    var others = sortedCats().filter(function (x) { return x.id !== c.id; });
    var f = '<form id="catForm" autocomplete="off"><div class="grid2" style="grid-template-columns:90px 1fr"><label class="field"><span>Icon</span><input name="icon" maxlength="4" value="' + esc(c.icon) + '" placeholder="🙂" style="text-align:center"></label>' +
      '<label class="field"><span>Name</span><input name="name" required value="' + esc(c.name) + '"></label></div>' +
      '<label class="field"><span>Counts as</span><select name="type">' + opts(CAT_TYPES, c.type) + '</select><div class="hint">Controls which total it rolls into: lifestyle burn, debt, savings, business, or excluded.</div></label>' +
      (c.id ? '<label class="field"><span>If deleting, move its items to</span><select name="moveTo">' + others.map(function (o) { return '<option value="' + o.id + '">' + esc(o.name) + '</option>'; }).join('') + '</select></label>' : '') +
      '<div class="btn-row mt12">' + (c.id ? '<button type="button" class="btn danger" id="catDel">Delete</button>' : '') + '<button class="btn primary" type="submit">' + (c.id ? 'Save' : 'Add') + '</button></div></form>';
    openSheet(c.id ? 'Edit category' : 'New category', f, function (el) {
      var form = el.querySelector('#catForm');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = { name: form.name.value.trim() || 'Category', icon: form.icon.value.trim(), type: form.type.value };
        if (c.id) Object.assign(c, v); else S.categories.push(Object.assign({ id: HF.uid('c'), order: S.categories.length }, v));
        persist(); render(); openCats(); toast('Saved');
      });
      var del = el.querySelector('#catDel');
      if (del) del.addEventListener('click', function () {
        var to = form.moveTo.value;
        if (!confirm('Delete “' + c.name + '”? Its items, transactions and rules move to “' + cat(to).name + '”.')) return;
        S.items.forEach(function (i) { if (i.categoryId === c.id) i.categoryId = to; });
        S.transactions.forEach(function (t) { if (t.category_id === c.id) t.category_id = to; });
        S.rules.forEach(function (r) { if (r.categoryId === c.id) r.categoryId = to; });
        S.categories = S.categories.filter(function (x) { return x.id !== c.id; });
        persist(); render(); openCats(); toast('Deleted');
      });
    });
  }

  // ---- Rules manager ----
  function openRules() {
    var h = '<div class="btn-row"><button class="btn primary" data-act="add-rule">＋ New rule</button><button class="btn" data-act="reapply-rules">Re-apply</button></div>' +
      '<div class="note">Rules are checked top to bottom; the first match wins. Matching ignores case. Transactions you edited by hand are never overwritten.</div>' +
      '<div class="list mt12">' + S.rules.map(function (r) {
        var c = cat(r.categoryId);
        return '<div class="row"><div class="main" data-act="edit-rule" data-id="' + r.id + '" style="cursor:pointer"><div class="name" style="font-family:ui-monospace,Menlo,monospace;font-size:13.5px">' + esc(r.pattern) + '</div>' +
          '<div class="sub"><span>→ ' + esc(r.merchant || '(keep name)') + (c ? ' · ' + esc(c.name) : '') + '</span>' + (r.flag === 'internal' ? badge('transfer', 'Transfer') : r.flag === 'cashDeposit' ? badge('transfer', 'Cash deposit') : '') + '</div></div>' + iconBtns('rule', r.id) + '</div>';
      }).join('') + '</div>';
    openSheet('Merchant rules', h);
  }
  function openRuleForm(id) {
    var r = id ? byId(S.rules, id) : { id: null, pattern: '', merchant: '', categoryId: '', flag: null };
    var f = '<form id="ruleForm" autocomplete="off"><label class="field"><span>When the statement text contains</span><input name="pattern" required value="' + esc(r.pattern) + '" placeholder="e.g. DFJW PTY LTD" style="text-transform:uppercase"></label>' +
      '<label class="field"><span>Show as</span><input name="merchant" value="' + esc(r.merchant) + '" placeholder="e.g. Ariana Dance"></label>' +
      '<label class="field"><span>Category</span><select name="categoryId"><option value="">Leave uncategorised</option>' + catOptions(r.categoryId) + '</select></label>' +
      '<label class="field"><span>Special handling</span><select name="flag">' + opts([['', 'None'], ['internal', 'Internal transfer (exclude)'], ['cashDeposit', 'Cash deposit (don\'t double count)']], r.flag || '') + '</select></label>' +
      '<div class="btn-row mt12">' + (r.id ? '<button type="button" class="btn danger" data-act="del-rule" data-id="' + r.id + '">Delete</button>' : '') + '<button class="btn primary" type="submit">Save</button></div></form>';
    openSheet(r.id ? 'Edit rule' : 'New rule', f, function (el) {
      var form = el.querySelector('#ruleForm');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = { pattern: form.pattern.value.trim().toUpperCase(), merchant: form.merchant.value.trim(), categoryId: form.categoryId.value || null, flag: form.flag.value || null };
        if (r.id) Object.assign(r, v); else S.rules.unshift(Object.assign({ id: HF.uid('r') }, v));
        var n = IM.reapplyRules(S);
        persist(); render(); openRules(); toast('Rule saved' + (n ? ' · ' + n + ' transactions updated' : ''));
      });
    });
  }

  // ---- Accounts manager ----
  function openAccounts() {
    var h = '<button class="btn primary block" data-act="add-account">＋ New account</button>' +
      '<div class="note">Mark accounts you own. A transfer whose description mentions an owned account’s keywords — or an equal and opposite amount between two owned accounts within 3 days — is treated as an internal transfer. Kids accounts can count transfers as Family Savings instead.</div>' +
      '<div class="list mt12">' + S.accounts.map(function (a) {
        return '<div class="row"><div class="main" data-act="edit-account" data-id="' + a.id + '" style="cursor:pointer"><div class="name">' + esc(a.name) + '</div><div class="sub">' + (a.owned ? badge('cash', 'Owned') : badge('off', 'External')) +
          (a.transferAs === 'savings' ? badge('statement_avg', 'Transfers = savings') : '') + '<span>' + esc(a.match ? 'matches “' + a.match + '”' : 'no keywords') + '</span></div></div>' + iconBtns('account', a.id) + '</div>';
      }).join('') + '</div>';
    openSheet('Accounts', h);
  }
  function openAccountForm(id) {
    var a = id ? byId(S.accounts, id) : { id: null, name: '', type: 'bank', owned: true, transferAs: 'internal', match: '', active: true };
    var f = '<form id="acctForm" autocomplete="off"><label class="field"><span>Name</span><input name="name" required value="' + esc(a.name) + '"></label>' +
      '<label class="field"><span>Type</span><select name="type">' + opts([['bank', 'Bank account'], ['savings', 'Savings / reserve'], ['kids', 'Kids savings'], ['business', 'Business / trust'], ['credit', 'Credit card'], ['cash', 'Cash']], a.type) + '</select></label>' +
      toggleField('owned', 'Owned by Joe / Zhila', 'Transfers to/from it are not income or expenses', a.owned) +
      '<label class="field mt8"><span>Money sent to this account counts as</span><select name="transferAs">' + opts([['internal', 'Internal transfer (excluded)'], ['savings', 'Family Savings']], a.transferAs) + '</select></label>' +
      '<label class="field"><span>Keywords in transfer descriptions</span><input name="match" value="' + esc(a.match) + '" placeholder="e.g. JZD, 062000 1234"><div class="hint">Comma separated — names, BSB/account numbers, nicknames.</div></label>' +
      '<div class="btn-row mt12">' + (a.id ? '<button type="button" class="btn danger" data-act="del-account" data-id="' + a.id + '">Delete</button>' : '') + '<button class="btn primary" type="submit">Save</button></div></form>';
    openSheet(a.id ? 'Edit account' : 'New account', f, function (el) {
      var form = el.querySelector('#acctForm');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = { name: form.name.value.trim() || 'Account', type: form.type.value, owned: form.owned.checked, transferAs: form.transferAs.value, match: form.match.value.trim() };
        if (a.id) Object.assign(a, v); else S.accounts.push(Object.assign({ id: HF.uid('a'), active: true }, v));
        persist(); render(); openAccounts(); toast('Saved');
      });
    });
  }

  // ---------- Data ----------
  function exportData() {
    var blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'household-finance-' + todayISO() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast('Backup downloaded');
  }
  function restoreData(file) {
    file.text().then(function (txt) {
      var data = JSON.parse(txt);
      if (!data || !Array.isArray(data.items) || !Array.isArray(data.categories)) throw new Error('Not a Household Finance backup');
      if (!confirm('Replace all current data with this backup?')) return;
      S = HF.migrate(data); commit('Backup restored');
    }).catch(function (e) { toast(e.message || 'Could not read backup'); });
  }

  // ---------- Sheet ----------
  function openSheet(title, html, onMount) {
    closeSheet(true);
    var scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.id = 'scrim';
    var sh = document.createElement('div'); sh.className = 'sheet'; sh.id = 'sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', title);
    sh.innerHTML = '<div class="grab"></div><div class="sheet-head"><h3>' + esc(title) + '</h3><button class="ibtn" data-act="close-sheet" aria-label="Close">✕</button></div>' + html;
    document.body.appendChild(scrim); document.body.appendChild(sh);
    document.body.style.overflow = 'hidden';
    scrim.addEventListener('click', function () { closeSheet(); });
    requestAnimationFrame(function () { scrim.classList.add('show'); sh.classList.add('show'); });
    if (onMount) onMount(sh);
    var first = sh.querySelector('input:not([type=checkbox]):not([readonly]), select, textarea');
    if (first && !('ontouchstart' in window)) first.focus();
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
  function emptyBlock(icon, title, text, actions) {
    return '<div class="empty"><div class="big">' + icon + '</div><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p>' + actions + '</div>';
  }

  // ---------- Events ----------
  function confirmDel(what) { return confirm('Delete ' + what + '? This can’t be undone.'); }
  var actions = {
    tab: function (b, e) { e.preventDefault(); S.settings.tab = b.dataset.val; closeSheet(true); commit(); window.scrollTo(0, 0); },
    set: function (b) {
      var k = b.dataset.key, v = b.dataset.val;
      if (k in ui) { ui[k] = v; if (k === 'txView') ui.txOffset = 0; render(); return; }
      if (k === 'view') ui.actualOffset = 0;
      S.settings[k] = v === 'true' ? true : v === 'false' ? false : v; commit();
    },
    jump: function () { var el = document.getElementById('earnings'); if (el) el.scrollIntoView({ behavior: 'smooth' }); },
    overview: openOverview,
    'toggle-cat': function (b) { ui.open[b.dataset.id] = !ui.open[b.dataset.id]; b.parentNode.classList.toggle('open'); b.setAttribute('aria-expanded', !!ui.open[b.dataset.id]); },
    'toggle-nw': function (b) { ui.open[b.dataset.id] = ui.open[b.dataset.id] === false; b.parentNode.classList.toggle('open'); },
    'add-item': function (b) { openItemForm(null, b.dataset.dir); },
    'edit-item': function (b) { openItemForm(b.dataset.id); },
    'del-item': function (b) {
      var it = byId(S.items, b.dataset.id); if (!it || !confirmDel('“' + it.name + '”')) return;
      S.items = S.items.filter(function (x) { return x.id !== it.id; }); closeSheet(); commit('Deleted');
    },
    'actual-shift': function (b) { ui.actualOffset += Number(b.dataset.val); render(); },
    'tx-shift': function (b) { ui.txOffset += Number(b.dataset.val); render(); },
    'tx-filter': function (b) { ui.txFilter = b.dataset.val; render(); },
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
    'add-asset': function () { openAssetForm(null); },
    'edit-asset': function (b) { openAssetForm(b.dataset.id); },
    'del-asset': function (b) {
      var a = byId(S.assets, b.dataset.id); if (!a || !confirmDel('“' + a.name + '”')) return;
      S.assets = S.assets.filter(function (x) { return x.id !== a.id; }); closeSheet(); commit('Deleted');
    },
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
    'reapply-rules': function () { var n = IM.reapplyRules(S); var p = IM.detectTransferPairs(S); persist(); render(); toast(n + ' updated' + (p ? ' · ' + p + ' transfer pairs' : '')); },
    'manage-accounts': openAccounts,
    'add-account': function () { openAccountForm(null); },
    'edit-account': function (b) { openAccountForm(b.dataset.id); },
    'del-account': function (b) {
      var a = byId(S.accounts, b.dataset.id);
      var used = S.transactions.some(function (t) { return t.account_id === a.id; });
      if (used) { toast('Account has transactions — mark it not owned instead'); return; }
      if (!confirmDel('“' + a.name + '”')) return;
      S.accounts = S.accounts.filter(function (x) { return x.id !== a.id; }); persist(); render(); openAccounts(); toast('Deleted');
    },
    export: exportData,
    restore: function () { document.getElementById('restoreFile').click(); },
    reset: function () {
      if (!confirm('Reset everything to the starting figures? Imported transactions and edits will be lost. Export a backup first if unsure.')) return;
      S = HF.seed(); commit('Reset to starting figures');
    },
    'close-sheet': function () { closeSheet(); }
  };

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    chartHover(e);
    if (!b || b.tagName === 'INPUT') return;
    var fn = actions[b.dataset.act];
    if (fn) fn(b, e);
  });
  document.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') chartHover(e); });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.act === 'setting') { S.settings[t.dataset.key] = t.checked; commit(); }
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
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('./sw.js').catch(function () {}); });
  }
  window.__HF_STATE = function () { return S; };
  persist();
  render();
})();
