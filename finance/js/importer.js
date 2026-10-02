/* Household Finance — statement import: CSV / pasted text / PDF text parsing,
   merchant rules, internal transfer detection and de-duplication. */
(function (root) {
  'use strict';
  var HF = root.HF;

  var MON = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12 };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function validYMD(y, m, d) {
    if (!(y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    var dt = new Date(y, m - 1, d);
    if (dt.getMonth() !== m - 1) return null;
    return y + '-' + pad(m) + '-' + pad(d);
  }

  // Australian-first date parsing (day before month). Returns ISO or null.
  function parseDate(s, fallbackYear) {
    if (!s) return null;
    s = String(s).trim();
    var m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return validYMD(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/))) {
      var y = +m[3]; if (y < 100) y += 2000;
      return validYMD(y, +m[2], +m[1]);
    }
    if ((m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,4})[a-z]*[\s\-,]*(\d{2,4})?\b/))) {
      var mon = MON[m[2].toUpperCase()];
      if (!mon) return null;
      var yr = m[3] ? +m[3] : (fallbackYear || new Date().getFullYear());
      if (yr < 100) yr += 2000;
      return validYMD(yr, mon, +m[1]);
    }
    return null;
  }

  // "$1,234.56", "-45.20", "(45.20)", "45.20 DR", "45.20CR" -> signed number or null.
  function parseAmount(s) {
    if (s == null) return null;
    var t = String(s).trim();
    if (!t) return null;
    var neg = /^\(.*\)$/.test(t) || /^-|-$/.test(t.replace(/\s/g, '')) || /\bDR\b|DR$/i.test(t);
    var cr = /\bCR\b|CR$/i.test(t);
    var num = t.replace(/[^0-9.]/g, '');
    if (!num || !/\d/.test(num) || (num.match(/\./g) || []).length > 1) return null;
    var v = parseFloat(num);
    if (isNaN(v)) return null;
    if (cr) return v;
    return neg ? -v : v;
  }

  // ---------- CSV ----------
  function parseCSVRows(text) {
    var rows = [], row = [], cell = '', q = false;
    text = String(text).replace(/^﻿/, '');
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(function (x) { return x.trim() !== ''; })) rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell);
    if (row.some(function (x) { return x.trim() !== ''; })) rows.push(row);
    return rows;
  }

  function parseCSV(text) {
    var rows = parseCSVRows(text);
    if (!rows.length) return [];
    var first = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var hasHeader = !first.some(function (c) { return parseDate(c); });
    var header = hasHeader ? first : null;
    var data = hasHeader ? rows.slice(1) : rows;
    var cols = Math.max.apply(null, data.map(function (r) { return r.length; }));
    function find(re) { if (!header) return -1; for (var i = 0; i < header.length; i++) if (re.test(header[i])) return i; return -1; }

    var dateCol = find(/date/);
    if (dateCol < 0) {
      var best = -1, bestN = 0;
      for (var c = 0; c < cols; c++) {
        var n = data.filter(function (r) { return parseDate(r[c]); }).length;
        if (n > bestN) { bestN = n; best = c; }
      }
      dateCol = best;
    }
    var debitCol = find(/debit|withdraw|money out|paid out/);
    var creditCol = find(/credit|deposit|money in|paid in/);
    var amountCol = find(/^amount|amount$|^value$/);
    var balanceCol = find(/balance/);
    var descCol = find(/desc|narrative|details|transaction|merchant|particulars|payee|memo/);
    var acctCol = find(/^account/);

    if (amountCol < 0 && (debitCol < 0 || creditCol < 0)) {
      // No usable header: first mostly-numeric column that isn't the date (CommBank: Date, Amount, Description, Balance).
      for (var k = 0; k < cols; k++) {
        if (k === dateCol || k === balanceCol) continue;
        var numeric = data.filter(function (r) { return parseAmount(r[k]) != null && !parseDate(r[k]); }).length;
        if (numeric >= data.length * 0.6) { amountCol = k; break; }
      }
    }
    if (descCol < 0) {
      var longest = -1, len = 0;
      for (var j = 0; j < cols; j++) {
        if (j === dateCol || j === amountCol || j === debitCol || j === creditCol || j === balanceCol) continue;
        var avg = data.reduce(function (s, r) { return s + String(r[j] || '').length; }, 0) / data.length;
        var textish = data.filter(function (r) { return /[A-Za-z]{3}/.test(r[j] || ''); }).length;
        if (textish && avg > len) { len = avg; longest = j; }
      }
      descCol = longest;
    }

    var out = [];
    data.forEach(function (r) {
      var date = parseDate(r[dateCol]);
      if (!date) return;
      var amt = null;
      if (amountCol >= 0) amt = parseAmount(r[amountCol]);
      else {
        var d = parseAmount(r[debitCol]), cr = parseAmount(r[creditCol]);
        if (d) amt = -Math.abs(d); else if (cr) amt = Math.abs(cr);
      }
      if (amt == null || amt === 0) return;
      out.push({
        date: date,
        description: String(descCol >= 0 ? r[descCol] : '').trim().replace(/\s+/g, ' '),
        amount: amt,
        accountHint: acctCol >= 0 ? String(r[acctCol] || '').trim() : ''
      });
    });
    return out;
  }

  // ---------- Pasted text / PDF text ----------
  var CREDIT_WORDS = /\b(TRANSFER FROM|DEPOSIT|SALARY|WAGES|PAY\/SALARY|CENTRELINK|REFUND|INTEREST PAID|CREDIT|DIRECT CREDIT)\b/i;
  var AMOUNT_RE = /\(?-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})\)?(?:\s?(?:CR|DR))?|\(?-?\$?\d+\.\d{2}\)?(?:\s?(?:CR|DR))?/gi;

  function parseText(text, fallbackYear) {
    var lines = String(text).split(/\r?\n/);
    var out = [];
    lines.forEach(function (raw) {
      var line = raw.replace(/\t/g, '  ').trim();
      if (!line) return;
      var m = line.match(/^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{1,2}[\s\-][A-Za-z]{3,4}(?:[\s\-,]+\d{2,4})?)\s+(.*)$/);
      if (!m) return;
      var date = parseDate(m[1], fallbackYear);
      if (!date) return;
      var rest = m[2];
      var amounts = rest.match(AMOUNT_RE) || [];
      if (!amounts.length) return;
      // With 2+ trailing amounts the last is usually the running balance.
      var amtStr = amounts.length >= 2 ? amounts[amounts.length - 2] : amounts[0];
      var idx = rest.indexOf(amounts[0]);
      var desc = (idx > 0 ? rest.slice(0, idx) : rest).trim().replace(/\s+/g, ' ');
      if (!desc) return;
      var amt = parseAmount(amtStr);
      if (amt == null || amt === 0) return;
      var explicit = /-|\(|DR|CR/i.test(amtStr);
      if (!explicit) amt = CREDIT_WORDS.test(desc) ? Math.abs(amt) : -Math.abs(amt);
      out.push({ date: date, description: desc, amount: amt, accountHint: '', signGuessed: !explicit });
    });
    return out;
  }

  // PDF → text lines using pdf.js (loaded on demand from cdnjs).
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  function loadPdfJs() {
    if (root.pdfjsLib) return Promise.resolve(root.pdfjsLib);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = PDFJS + 'pdf.min.js';
      s.onload = function () {
        root.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
        resolve(root.pdfjsLib);
      };
      s.onerror = function () { reject(new Error('Could not load the PDF reader. Check your connection.')); };
      document.head.appendChild(s);
    });
  }
  function pdfToText(arrayBuffer) {
    return loadPdfJs().then(function (lib) {
      return lib.getDocument({ data: arrayBuffer }).promise;
    }).then(function (pdf) {
      var pages = [];
      for (var p = 1; p <= pdf.numPages; p++) pages.push(pdf.getPage(p).then(function (page) { return page.getTextContent(); }));
      return Promise.all(pages);
    }).then(function (contents) {
      var all = [];
      contents.forEach(function (tc) {
        var rows = {};
        tc.items.forEach(function (it) {
          if (!it.str || !it.str.trim()) return;
          var y = Math.round(it.transform[5] / 3) * 3;
          (rows[y] = rows[y] || []).push({ x: it.transform[4], s: it.str });
        });
        Object.keys(rows).map(Number).sort(function (a, b) { return b - a; }).forEach(function (y) {
          all.push(rows[y].sort(function (a, b) { return a.x - b.x; }).map(function (i) { return i.s; }).join('  '));
        });
      });
      return all.join('\n');
    });
  }

  // ---------- Rules ----------
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function ruleMatches(rule, desc) {
    var p = String(rule.pattern || '').trim().toUpperCase();
    if (!p) return false;
    var re = new RegExp('(^|[^A-Z0-9])' + escapeRe(p) + '($|[^A-Z0-9])');
    return re.test(String(desc).toUpperCase());
  }
  function matchRule(state, desc) {
    for (var i = 0; i < state.rules.length; i++) if (ruleMatches(state.rules[i], desc)) return state.rules[i];
    return null;
  }

  var TRANSFER_WORDS = /\b(TRANSFER|TFR|XFER|INTERNET BANKING|NETBANK|FUNDS TFER|INTERNAL)\b/i;

  // Classify a parsed row against rules and owned accounts.
  function classify(state, row) {
    var desc = row.description;
    var tx = {
      categoryId: row.amount > 0 ? 'c_income' : null,
      merchant: cleanMerchant(desc),
      internalTransfer: false, cashDeposit: false, oneOff: false
    };
    var rule = matchRule(state, desc);
    if (rule) {
      tx.merchant = rule.merchant || tx.merchant;
      if (rule.categoryId) tx.categoryId = rule.categoryId;
      if (rule.flag === 'cashDeposit') tx.cashDeposit = true;
      if (rule.flag === 'internal') { tx.internalTransfer = true; tx.categoryId = 'c_transfer'; }
    }
    if (!rule && TRANSFER_WORDS.test(desc)) {
      var up = desc.toUpperCase();
      state.accounts.forEach(function (a) {
        if (!a.owned || !a.match || a.id === row.accountId) return;
        var hit = a.match.split(',').some(function (k) { k = k.trim().toUpperCase(); return k && up.indexOf(k) >= 0; });
        if (!hit) return;
        if (a.transferAs === 'savings' && row.amount < 0) { tx.categoryId = 'c_savings'; tx.merchant = a.name; }
        else { tx.internalTransfer = true; tx.categoryId = 'c_transfer'; tx.merchant = 'Transfer — ' + a.name; }
      });
    }
    var cat = HF.catById(state, tx.categoryId);
    if (cat && cat.type === 'oneoff') tx.oneOff = true;
    return tx;
  }

  function cleanMerchant(desc) {
    var s = String(desc)
      .replace(/\b(VISA|EFTPOS|PURCHASE|DEBIT|CARD|POS|AUS|AU|NSW|CARD XX\d+|VALUE DATE.*)\b/gi, ' ')
      .replace(/\b\d{4,}\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
    return s.length > 40 ? s.slice(0, 40).trim() : s || desc;
  }

  function hash(tx) {
    return [tx.date, Number(tx.amount).toFixed(2), String(tx.descriptionRaw).toUpperCase().replace(/\s+/g, ' ').trim(), tx.accountId || ''].join('|');
  }

  // Build transaction objects from parsed rows; flags duplicates against existing data.
  function prepare(state, rows, accountId) {
    var existing = {};
    state.transactions.forEach(function (t) { var h = t.hash || hash(t); existing[h] = (existing[h] || 0) + 1; });
    var seen = {};
    return rows.map(function (row) {
      row.accountId = accountId;
      var c = classify(state, row);
      var tx = {
        id: HF.uid('t'), date: row.date, descriptionRaw: row.description, merchant: c.merchant,
        amount: Math.round(row.amount * 100) / 100, accountId: accountId, categoryId: c.categoryId,
        source: 'imported', internalTransfer: c.internalTransfer, cashDeposit: c.cashDeposit,
        oneOff: c.oneOff, recurring: false, notes: '', signGuessed: !!row.signGuessed
      };
      tx.hash = hash(tx);
      // Identical rows within one statement are legitimate (two same coffees): the nth copy is
      // only a duplicate if saved data already holds at least n copies.
      seen[tx.hash] = (seen[tx.hash] || 0) + 1;
      tx.duplicate = seen[tx.hash] <= (existing[tx.hash] || 0);
      return tx;
    });
  }

  // Pair matching: equal and opposite amounts between two different owned accounts within 3 days.
  function detectTransferPairs(state) {
    var owned = {};
    state.accounts.forEach(function (a) { if (a.owned) owned[a.id] = a; });
    var txs = state.transactions.filter(function (t) { return owned[t.accountId] && !t.internalTransfer; });
    var used = {}, count = 0;
    txs.forEach(function (a) {
      if (used[a.id] || a.amount >= 0) return;
      for (var i = 0; i < txs.length; i++) {
        var b = txs[i];
        if (used[b.id] || b.id === a.id || b.accountId === a.accountId) continue;
        if (Math.abs(b.amount + a.amount) > 0.001) continue;
        var days = Math.abs(HF.parseISO(a.date) - HF.parseISO(b.date)) / 864e5;
        if (days > 3) continue;
        used[a.id] = used[b.id] = 1;
        [a, b].forEach(function (t) { t.internalTransfer = true; t.categoryId = 'c_transfer'; });
        count++;
        break;
      }
    });
    return count;
  }

  // Re-run rules over existing transactions (after editing rules). Keeps manual edits.
  function reapplyRules(state) {
    var changed = 0;
    state.transactions.forEach(function (t) {
      if (t.source !== 'imported' || t.userEdited) return;
      var c = classify(state, { description: t.descriptionRaw, amount: t.amount, accountId: t.accountId });
      if (c.categoryId !== t.categoryId || c.merchant !== t.merchant) changed++;
      Object.assign(t, { categoryId: c.categoryId, merchant: c.merchant, internalTransfer: c.internalTransfer, cashDeposit: c.cashDeposit, oneOff: c.oneOff });
    });
    return changed;
  }

  HF.importer = {
    parseDate: parseDate, parseAmount: parseAmount, parseCSV: parseCSV, parseText: parseText,
    pdfToText: pdfToText, matchRule: matchRule, ruleMatches: ruleMatches, classify: classify,
    prepare: prepare, detectTransferPairs: detectTransferPairs, reapplyRules: reapplyRules, hash: hash
  };
})(typeof window !== 'undefined' ? window : globalThis);
