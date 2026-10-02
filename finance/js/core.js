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
  var TX_RENAMES = {
    descriptionRaw: 'description_raw', accountId: 'account_id', categoryId: 'category_id', internalTransfer: 'internal_transfer',
    cashDeposit: 'cash_deposit', oneOff: 'one_off', signGuessed: 'sign_guessed', userEdited: 'user_edited'
  };
  function migrate(state) {
    var seed = root.HF.seed();
    var from = state.version || 1;
    ['categories', 'items', 'accounts', 'transactions', 'rules', 'debts', 'assets', 'nwHistory'].forEach(function (k) {
      if (!Array.isArray(state[k])) state[k] = seed[k];
    });
    if (from < 3) {
      // V3 swapped emoji category icons for line-icon keys.
      var seedIcons = {};
      seed.categories.forEach(function (c) { seedIcons[c.id] = c.icon; });
      state.categories.forEach(function (c) { c.icon = seedIcons[c.id] || 'tag'; });
      if (state.settings) { delete state.settings.nwScope; if (state.settings.tab === 'budget') state.settings.tab = 'home'; }
    }
    if (from < 2) {
      // V1 was never released: take the corrected seed figures, keep any transactions.
      state.items = seed.items;
      state.debts = seed.debts;
      state.transactions = state.transactions.map(function (t) {
        var n = {};
        Object.keys(t).forEach(function (k) { n[TX_RENAMES[k] || k] = t[k]; });
        return newTransaction(n);
      });
      if (state.settings && state.settings.mode !== 'actual') state.settings.mode = 'budget';
    }
    state.settings = Object.assign({}, seed.settings, state.settings || {});
    state.version = seed.version;
    return state;
  }

  // ---------- Ledger records ----------
  // Transaction: one row per bank/cash movement. Amount is signed (+ in, − out); direction mirrors it.
  // budget_week is the Monday of the week it counts toward — normally the week of `date`, but it can be
  // moved so split payments (e.g. 2 × $99 dance) group into one budget week.
  function newTransaction(f) {
    f = f || {};
    var date = f.date || toISO(new Date());
    var amount = f.amount === '' ? '' : Math.round((Number(f.amount) || 0) * 100) / 100;
    return {
      id: f.id || uid('t'),
      date: date,
      date_raw: f.date_raw != null ? f.date_raw : date,
      budget_week: f.budget_week || toISO(weekStart(parseISO(date))),
      description_raw: f.description_raw || '',
      merchant: f.merchant || '',
      amount: amount,
      direction: f.direction || (amount > 0 ? 'in' : 'out'),
      account_id: f.account_id || null,
      category_id: f.category_id || null,
      subcategory: f.subcategory || null,
      source: f.source || 'imported',          // imported | cash | manual
      internal_transfer: !!f.internal_transfer,
      cash_deposit: !!f.cash_deposit,
      one_off: !!f.one_off,
      recurring: !!f.recurring,
      recurring_group: f.recurring_group || null,
      notes: f.notes || '',
      hash: f.hash || null,
      sign_guessed: !!f.sign_guessed,
      user_edited: !!f.user_edited
    };
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
  function todayISO() { return toISO(new Date()); }
  function isBusiness(state, item) {
    if (item.scope === 'business') return true;
    var cat = catById(state, item.categoryId);
    return !!(cat && cat.type === 'business');
  }
  function isOneOff(state, item) {
    var cat = catById(state, item.categoryId);
    return item.frequency === 'oneoff' || item.kind === 'oneoff' || !!(cat && cat.type === 'oneoff');
  }
  // Why an item isn't in the totals today ('' = counted).
  function excludedReason(state, item, asOf) {
    asOf = asOf || todayISO();
    var s = state.settings;
    if (!item.active) return 'Inactive';
    if (item.startDate && item.startDate > asOf) return 'Starts ' + fmtDate(item.startDate, true);
    if (item.endDate && item.endDate < asOf) return 'Ended';
    if (!s.includeCash && item.source === 'cash') return 'Cash hidden';
    if (isBusiness(state, item) && !s.includeBusiness) return 'Business';
    if (item.direction === 'out' && isOneOff(state, item)) return 'One-off';
    return '';
  }
  function itemIncluded(state, item, asOf) { return !excludedReason(state, item, asOf); }

  function budgetSummary(state, view, asOf) {
    var income = 0, expenses = 0, fixed = 0, variable = 0, cashIncome = 0, business = 0;
    var byType = { living: 0, debt: 0, tax: 0, savings: 0, business: 0 };
    var byCat = {};
    state.items.forEach(function (item) {
      var reason = excludedReason(state, item, asOf);
      var v = convert(item.amount, item.frequency, item.customWeeks, view);
      if (reason === 'Business') business += v;
      if (reason) return;
      if (item.direction === 'in') { income += v; if (item.source === 'cash') cashIncome += v; return; }
      expenses += v;
      if (item.kind === 'variable') variable += v; else fixed += v;
      var cat = catById(state, item.categoryId);
      var t = cat ? cat.type : 'living';
      if (byType[t] != null) byType[t] += v;
      byCat[item.categoryId] = (byCat[item.categoryId] || 0) + v;
    });
    return {
      income: income, expenses: expenses, available: income - expenses, byType: byType, byCat: byCat,
      fixed: fixed, variable: variable, cashIncome: cashIncome, businessExcluded: business,
      cashSpendingEntered: cashSpendingEntered(state)
    };
  }

  // True once any manual cash spending exists (a cash budget item or a cash transaction going out).
  function cashSpendingEntered(state) {
    return state.items.some(function (i) { return i.active && i.direction === 'out' && i.source === 'cash' && Number(i.amount) > 0; }) ||
      state.transactions.some(function (t) { return t.source === 'cash' && t.amount < 0 && !t.internal_transfer; });
  }

  // Items that start or stop within the next `months` months — what changes the budget ahead.
  function upcomingChanges(state, view, months, asOf) {
    asOf = asOf || todayISO();
    var d = parseISO(asOf); d.setMonth(d.getMonth() + (months || 12));
    var horizon = toISO(d), out = [];
    state.items.forEach(function (item) {
      if (!item.active || isOneOff(state, item)) return;
      if (isBusiness(state, item) && !state.settings.includeBusiness) return;
      var v = convert(item.amount, item.frequency, item.customWeeks, view);
      var sign = item.direction === 'in' ? 1 : -1;
      if (item.endDate && item.endDate >= asOf && item.endDate <= horizon) out.push({ date: item.endDate, item: item, change: -sign * v, kind: 'ends' });
      if (item.startDate && item.startDate > asOf && item.startDate <= horizon) out.push({ date: item.startDate, item: item, change: sign * v, kind: 'starts' });
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  // ---------- Transaction (actual) calculations ----------
  function txExcluded(state, tx) {
    if (tx.internal_transfer || tx.cash_deposit) return true;
    var cat = catById(state, tx.category_id);
    if (cat && EXCLUDED_TYPES[cat.type]) return true;
    if (!state.settings.includeCash && tx.source === 'cash') return true;
    if (cat && cat.type === 'business' && !state.settings.includeBusiness) return true;
    return false;
  }

  // Weekly periods group by budget_week (so moved split payments land together); others by date.
  function txWeek(tx) { return tx.budget_week || toISO(weekStart(parseISO(tx.date))); }
  function txInRange(tx, range, view) {
    if (view === 'weekly') return txWeek(tx) === range.start;
    return tx.date >= range.start && tx.date <= range.end;
  }

  function actualSummary(state, range, view) {
    var income = 0, expenses = 0, byCat = {}, count = 0, oneoffs = 0;
    var byType = { living: 0, debt: 0, tax: 0, savings: 0, business: 0, oneoff: 0 };
    state.transactions.forEach(function (tx) {
      if (!txInRange(tx, range, view)) return;
      if (txExcluded(state, tx)) return;
      count++;
      var amt = Number(tx.amount) || 0;
      if (amt > 0) { income += amt; return; }
      var out = -amt;
      expenses += out;
      var cat = catById(state, tx.category_id);
      var t = cat ? cat.type : 'living';
      if (tx.one_off || t === 'oneoff') oneoffs += out;
      if (byType[t] != null) byType[t] += out;
      var key = tx.category_id || 'uncategorised';
      byCat[key] = (byCat[key] || 0) + out;
    });
    return { income: income, expenses: expenses, available: income - expenses, byCat: byCat, byType: byType, count: count, oneoffs: oneoffs };
  }

  // Bucket transactions for history charts.
  function history(state, view, limit) {
    var buckets = {};
    state.transactions.forEach(function (tx) {
      if (txExcluded(state, tx)) return;
      var k = view === 'weekly' ? txWeek(tx) : periodKey(view, tx.date);
      var b = buckets[k] || (buckets[k] = { key: k, income: 0, expenses: 0, savings: 0 });
      var amt = Number(tx.amount) || 0;
      if (amt > 0) b.income += amt;
      else {
        b.expenses += -amt;
        var cat = catById(state, tx.category_id);
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
  // scope 'household' = household assets − household debts; 'all' adds business / trust assets and debts.
  // Every active debt in scope is subtracted; debts without a balance are listed so the gap is visible.
  function netWorth(state, scope) {
    var withBiz = scope === 'all';
    var assets = 0, liabilities = 0, missing = [];
    state.assets.forEach(function (a) {
      if (a.scope === 'business' && !withBiz) return;
      assets += Number(a.value) || 0;
    });
    state.debts.forEach(function (d) {
      if (d.active === false) return;
      if (d.scope === 'business' && !withBiz) return;
      if (d.balance == null || d.balance === '') { missing.push(d); return; }
      liabilities += Number(d.balance) || 0;
    });
    return { assets: assets, liabilities: liabilities, net: assets - liabilities, missing: missing };
  }

  // Keep one snapshot per day so the net-worth chart builds up as values are updated.
  function recordNetWorth(state, date) {
    date = date || todayISO();
    var snap = { date: date, household: netWorth(state, 'household').net, all: netWorth(state, 'all').net };
    var h = state.nwHistory || (state.nwHistory = []);
    var last = h[h.length - 1];
    if (last && last.date === date) h[h.length - 1] = snap;
    else if (!last || last.household !== snap.household || last.all !== snap.all) h.push(snap);
    return snap;
  }

  root.HF = Object.assign(root.HF || {}, {
    STORAGE_KEY: STORAGE_KEY, FREQUENCIES: FREQUENCIES, TYPE_LABELS: TYPE_LABELS,
    annualise: annualise, fromAnnual: fromAnnual, convert: convert, freqLabel: freqLabel,
    money: money, uid: uid,
    parseISO: parseISO, toISO: toISO, weekStart: weekStart, periodRange: periodRange, periodKey: periodKey,
    periodLabel: periodLabel, periodShortLabel: periodShortLabel, fmtDate: fmtDate, MONTHS: MONTHS,
    load: load, save: save, migrate: migrate,
    catById: catById, itemIncluded: itemIncluded, excludedReason: excludedReason, isBusiness: isBusiness, isOneOff: isOneOff,
    budgetSummary: budgetSummary, cashSpendingEntered: cashSpendingEntered, upcomingChanges: upcomingChanges,
    newTransaction: newTransaction, txExcluded: txExcluded, txInRange: txInRange, actualSummary: actualSummary, history: history,
    payoffMonths: payoffMonths, netWorth: netWorth, recordNetWorth: recordNetWorth, todayISO: todayISO
  });
})(typeof window !== 'undefined' ? window : globalThis);
