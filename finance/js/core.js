/* Household Finance — core logic: frequencies, storage, calculations.
   No UI code here so the maths can be tested in isolation (see tests/core.test.js). */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'hf_state_v1';

  // ---------- Frequencies ----------
  var FREQUENCIES = [
    { id: 'weekly', label: 'Weekly', short: 'wk' },
    { id: 'fortnightly', label: 'Fortnightly', short: 'fn' },
    { id: 'monthly', label: 'Monthly', short: 'mo' },
    { id: 'quarterly', label: 'Quarterly', short: 'qtr' },
    { id: 'term', label: 'Per Term', short: 'term' },
    { id: 'yearly', label: 'Yearly', short: 'yr' },
    { id: 'everyX', label: 'Every X Weeks', short: 'x wks' },
    { id: 'oneoff', label: 'One-off', short: 'once' }
  ];

  var PER_YEAR = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, term: 4, yearly: 1, oneoff: 1 };

  // Annual amount for an item. One-off counts once in the year it happens.
  function annualise(amount, frequency, customWeeks) {
    amount = Number(amount) || 0;
    if (frequency === 'everyX') {
      var x = Number(customWeeks) || 0;
      return x > 0 ? amount * (52 / x) : 0;
    }
    var n = PER_YEAR[frequency];
    return n ? amount * n : 0;
  }

  // view: weekly | monthly | yearly
  function fromAnnual(annual, view) {
    if (view === 'weekly') return annual / 52;
    if (view === 'monthly') return annual / 12;
    return annual;
  }

  function convert(amount, frequency, customWeeks, view) {
    return fromAnnual(annualise(amount, frequency, customWeeks), view);
  }

  function freqLabel(item) {
    if (item.frequency === 'everyX') return 'every ' + (item.customWeeks || '?') + ' wks';
    var f = FREQUENCIES.filter(function (x) { return x.id === item.frequency; })[0];
    return f ? f.label.toLowerCase() : item.frequency;
  }

  // ---------- Money formatting ----------
  function money(n, opts) {
    opts = opts || {};
    var v = Number(n) || 0;
    var neg = v < 0;
    var abs = Math.abs(v);
    var dp = opts.dp != null ? opts.dp : (abs >= 1000 && !opts.cents ? 0 : 2);
    var s = abs.toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp });
    return (neg ? '−' : '') + '$' + s;
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------- Dates (Monday → Sunday weeks) ----------
  function parseISO(s) {
    var p = String(s).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function toISO(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function weekStart(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dow = (x.getDay() + 6) % 7; // Monday = 0
    x.setDate(x.getDate() - dow);
    return x;
  }
  // Period containing date d for view, shifted by offset periods.
  function periodRange(view, d, offset) {
    offset = offset || 0;
    var start, end;
    if (view === 'weekly') {
      start = weekStart(d);
      start.setDate(start.getDate() + offset * 7);
      end = new Date(start); end.setDate(end.getDate() + 6);
    } else if (view === 'monthly') {
      start = new Date(d.getFullYear(), d.getMonth() + offset, 1);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    } else {
      start = new Date(d.getFullYear() + offset, 0, 1);
      end = new Date(start.getFullYear(), 11, 31);
    }
    return { start: toISO(start), end: toISO(end) };
  }
  function periodKey(view, iso) {
    var d = parseISO(iso);
    if (view === 'weekly') return toISO(weekStart(d));
    if (view === 'monthly') return iso.slice(0, 7);
    return iso.slice(0, 4);
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso, withYear) {
    var d = parseISO(iso);
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + (withYear ? ' ' + d.getFullYear() : '');
  }
  function periodLabel(view, range) {
    if (view === 'weekly') return 'Mon ' + fmtDate(range.start) + ' – Sun ' + fmtDate(range.end, true);
    var d = parseISO(range.start);
    if (view === 'monthly') return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    return String(d.getFullYear());
  }
  function periodShortLabel(view, key) {
    if (view === 'weekly') return fmtDate(key);
    if (view === 'monthly') return MONTHS[Number(key.slice(5, 7)) - 1] + ' ' + key.slice(2, 4);
    return key;
  }

  // ---------- Storage ----------
  function load() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) { /* fall through to seed */ }
    return null;
  }
  function save(state) {
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) { return false; }
  }
  function migrate(state) {
    // Fill anything added after first release so older saves keep working.
    var seed = root.HF.seed();
    ['categories', 'items', 'accounts', 'transactions', 'rules', 'debts', 'assets'].forEach(function (k) {
      if (!Array.isArray(state[k])) state[k] = seed[k];
    });
    state.settings = Object.assign({}, seed.settings, state.settings || {});
    state.version = seed.version;
    return state;
  }

  // ---------- Category helpers ----------
  // Category types:
  //   living    – household lifestyle consumption
  //   debt      – debt repayments
  //   tax       – tax & government
  //   savings   – family savings (not consumption, counted in net worth)
  //   business  – business costs (excludable from household burn)
  //   oneoff    – irregular items, never in recurring burn
  //   income    – money in (transactions)
  //   transfer  – internal transfer between owned accounts (excluded)
  //   investment– cash ↔ investment movements (excluded from cash flow)
  var TYPE_LABELS = {
    living: 'Lifestyle', debt: 'Debt', tax: 'Tax & Gov', savings: 'Savings', business: 'Business',
    oneoff: 'One-off', income: 'Income', transfer: 'Internal transfer', investment: 'Investment'
  };
  var EXCLUDED_TYPES = { transfer: 1, investment: 1 };

  function catById(state, id) {
    for (var i = 0; i < state.categories.length; i++) if (state.categories[i].id === id) return state.categories[i];
    return null;
  }

  // ---------- Budget calculations ----------
  // mode: recurring | normalised  (actual is computed from transactions)
  function itemIncluded(state, item, mode) {
    if (!item.active) return false;
    var s = state.settings;
    if (!s.includeCash && item.source === 'cash') return false;
    if (item.direction === 'in') return true;
    var cat = catById(state, item.categoryId);
    if (cat && cat.type === 'business' && !s.includeBusiness) return false;
    if (item.frequency === 'oneoff' || item.kind === 'oneoff' || (cat && cat.type === 'oneoff')) return false;
    if (mode === 'recurring' && item.kind === 'variable') return false;
    return true;
  }

  function budgetSummary(state, view, mode) {
    var income = 0, expenses = 0;
    var byType = { living: 0, debt: 0, tax: 0, savings: 0, business: 0 };
    var byCat = {};
    state.items.forEach(function (item) {
      if (!itemIncluded(state, item, mode)) return;
      var v = convert(item.amount, item.frequency, item.customWeeks, view);
      if (item.direction === 'in') { income += v; return; }
      expenses += v;
      var cat = catById(state, item.categoryId);
      var t = cat ? cat.type : 'living';
      if (byType[t] != null) byType[t] += v;
      byCat[item.categoryId] = (byCat[item.categoryId] || 0) + v;
    });
    return { income: income, expenses: expenses, available: income - expenses, byType: byType, byCat: byCat };
  }

  // ---------- Transaction (actual) calculations ----------
  function txExcluded(state, tx) {
    if (tx.internalTransfer || tx.cashDeposit) return true;
    var cat = catById(state, tx.categoryId);
    if (cat && EXCLUDED_TYPES[cat.type]) return true;
    if (!state.settings.includeCash && tx.source === 'cash') return true;
    if (cat && cat.type === 'business' && !state.settings.includeBusiness) return true;
    return false;
  }

  function actualSummary(state, range) {
    var income = 0, expenses = 0, byCat = {}, count = 0, oneoffs = 0;
    var byType = { living: 0, debt: 0, tax: 0, savings: 0, business: 0, oneoff: 0 };
    state.transactions.forEach(function (tx) {
      if (tx.date < range.start || tx.date > range.end) return;
      if (txExcluded(state, tx)) return;
      count++;
      var amt = Number(tx.amount) || 0;
      if (amt > 0) { income += amt; return; }
      var out = -amt;
      expenses += out;
      var cat = catById(state, tx.categoryId);
      var t = cat ? cat.type : 'living';
      if (tx.oneOff || t === 'oneoff') oneoffs += out;
      if (byType[t] != null) byType[t] += out;
      var key = tx.categoryId || 'uncategorised';
      byCat[key] = (byCat[key] || 0) + out;
    });
    return { income: income, expenses: expenses, available: income - expenses, byCat: byCat, byType: byType, count: count, oneoffs: oneoffs };
  }

  // Bucket transactions for history charts.
  function history(state, view, limit) {
    var buckets = {};
    state.transactions.forEach(function (tx) {
      if (txExcluded(state, tx)) return;
      var k = periodKey(view, tx.date);
      var b = buckets[k] || (buckets[k] = { key: k, income: 0, expenses: 0, savings: 0 });
      var amt = Number(tx.amount) || 0;
      if (amt > 0) b.income += amt;
      else {
        b.expenses += -amt;
        var cat = catById(state, tx.categoryId);
        if (cat && cat.type === 'savings') b.savings += -amt;
      }
    });
    var keys = Object.keys(buckets).sort();
    if (limit) keys = keys.slice(-limit);
    return keys.map(function (k) { var b = buckets[k]; b.available = b.income - b.expenses; return b; });
  }

  // ---------- Debts ----------
  // Months to repay at a monthly payment and APR; null if never.
  function payoffMonths(balance, aprPct, monthlyPayment) {
    balance = Number(balance) || 0; monthlyPayment = Number(monthlyPayment) || 0;
    if (balance <= 0) return 0;
    if (monthlyPayment <= 0) return null;
    var r = (Number(aprPct) || 0) / 100 / 12;
    if (r === 0) return Math.ceil(balance / monthlyPayment);
    if (monthlyPayment <= balance * r) return null;
    return Math.ceil(-Math.log(1 - (r * balance) / monthlyPayment) / Math.log(1 + r));
  }

  // ---------- Net worth ----------
  function netWorth(state, scope) {
    var withBiz = scope === 'all';
    var assets = 0, liabilities = 0;
    state.assets.forEach(function (a) {
      if (a.scope === 'business' && !withBiz) return;
      assets += Number(a.value) || 0;
    });
    state.debts.forEach(function (d) {
      if (d.scope === 'business' && !withBiz) return;
      if (d.active === false) return;
      liabilities += Number(d.balance) || 0;
    });
    return { assets: assets, liabilities: liabilities, net: assets - liabilities };
  }

  root.HF = Object.assign(root.HF || {}, {
    STORAGE_KEY: STORAGE_KEY, FREQUENCIES: FREQUENCIES, TYPE_LABELS: TYPE_LABELS,
    annualise: annualise, fromAnnual: fromAnnual, convert: convert, freqLabel: freqLabel,
    money: money, uid: uid,
    parseISO: parseISO, toISO: toISO, weekStart: weekStart, periodRange: periodRange, periodKey: periodKey,
    periodLabel: periodLabel, periodShortLabel: periodShortLabel, fmtDate: fmtDate, MONTHS: MONTHS,
    load: load, save: save, migrate: migrate,
    catById: catById, itemIncluded: itemIncluded, budgetSummary: budgetSummary,
    txExcluded: txExcluded, actualSummary: actualSummary, history: history,
    payoffMonths: payoffMonths, netWorth: netWorth
  });
})(typeof window !== 'undefined' ? window : globalThis);
