// Run: node budget/tests/core.test.js
const assert = require('assert');
require('../js/core.js'); require('../js/seed.js'); require('../js/importer.js');
const HF = globalThis.HF, IM = HF.importer;
let passed = 0;
function t(name, fn) { try { fn(); passed++; } catch (e) { console.error('FAIL', name, '\n ', e.message); process.exitCode = 1; } }
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg || ''} expected ${b}, got ${a}`);

t('frequency conversions', () => {
  close(HF.annualise(100, 'weekly'), 5200);
  close(HF.annualise(100, 'fortnightly'), 2600);
  close(HF.annualise(100, 'monthly'), 1200);
  close(HF.annualise(100, 'quarterly'), 400);
  close(HF.annualise(260, 'term'), 1040, 'tennis');
  close(HF.annualise(100, 'yearly'), 100);
  close(HF.annualise(60, 'everyX', 3.5), 60 * 52 / 3.5, 'haircut');
  close(HF.convert(1200, 'monthly', null, 'weekly'), 1200 * 12 / 52);
  close(HF.convert(52, 'weekly', null, 'monthly'), 52 * 52 / 12);
});

const NOW = '2026-10-02';
const sum = (S, view) => HF.budgetSummary(S, view || 'yearly', NOW);
const item = (S, name) => S.items.find(i => i.name === name);

t('seed income totals', () => {
  const S = HF.seed();
  close(sum(S).income, 202646.40, 'yearly income');
  close(sum(S, 'weekly').income, 202646.40 / 52);
  close(sum(S).cashIncome, 47780, 'cash income');
});

t('corrected seed items', () => {
  const S = HF.seed();
  const pt = item(S, 'Joe PT (Vision PT)'); assert.strictEqual(pt.amount, 79.30); assert.strictEqual(pt.frequency, 'weekly');
  const zip = item(S, 'Zip'); assert.strictEqual(zip.amount, 150); assert.strictEqual(zip.source, 'assumption'); assert.strictEqual(zip.categoryId, 'c_debt');
  assert.strictEqual(item(S, 'Latitude GO').amount, 332.14);
  assert.strictEqual(item(S, 'PlayStation').amount, 20.95);
  const subs = { Netflix: 9.99, Spotify: 22.99, 'Paramount+': 7.99, 'Amazon Prime': 9.99, 'YouTube (via Apple)': 22.99, iCloud: 14.99, Google: 4.49, 'Samsung Electronic X': 5.99 };
  Object.keys(subs).forEach(n => { assert.strictEqual(item(S, n).amount, subs[n], n); assert.strictEqual(item(S, n).frequency, 'monthly'); });
  assert.ok(item(S, 'Samsung Electronic X').review);
  assert.strictEqual(item(S, 'iPad Air insurance').amount, 8.49);
  assert.strictEqual(item(S, 'iPhone insurance').amount, 20.49);
  ['Lovable', 'Vercel', 'JZD ATO', 'JZD ATO (second plan)', 'Revenue NSW — JZD'].forEach(n => assert.strictEqual(item(S, n).scope, 'business', n));
});

t('statement averages counted by default and labelled', () => {
  const S = HF.seed();
  const avgs = S.items.filter(i => i.source === 'statement_avg');
  assert.strictEqual(avgs.length, 6);
  avgs.forEach(i => assert.ok(i.notes.startsWith('Statement average Jan–Sep 2026, bank-only'), i.name));
  close(sum(S, 'weekly').variable, 171.22 + 109.66 + 77.25 + 48.38 + 33.42 + 7.13);
});

t('household/business toggle', () => {
  const S = HF.seed();
  close(sum(S).byCat.c_tax, 3068, 'household tax');
  assert.ok(!sum(S).byCat.c_business);
  close(sum(S, 'weekly').businessExcluded, (228 + 88 + 50) / 2 + (21.95 + 30.75) * 12 / 52);
  S.settings.includeBusiness = true;
  close(sum(S).byCat.c_tax, 11284, 'tax incl. business');
  close(sum(S).byCat.c_business, (21.95 + 30.75) * 12);
});

t('AGL split with arrears end date', () => {
  const S = HF.seed();
  assert.strictEqual(item(S, 'AGL — electricity usage').amount, 95);
  assert.strictEqual(item(S, 'AGL — electricity usage').endDate, null);
  const arr = item(S, 'AGL arrears repayment');
  assert.strictEqual(arr.amount, 104); assert.ok(arr.endDate.startsWith('2027-02'));
  assert.strictEqual(HF.excludedReason(S, arr, NOW), '');
  assert.strictEqual(HF.excludedReason(S, arr, '2027-03-15'), 'Ended');
  close(HF.budgetSummary(S, 'weekly', NOW).expenses - HF.budgetSummary(S, 'weekly', '2027-03-15').expenses, 104);
  const up = HF.upcomingChanges(S, 'weekly', 12, NOW);
  assert.ok(up.some(c => c.item === arr && Math.abs(c.change - 104) < 0.01));
});

t('one-offs and inactive excluded', () => {
  const S = HF.seed();
  assert.ok(!sum(S).byCat.c_oneoff);
  assert.strictEqual(HF.excludedReason(S, item(S, 'Disney+'), NOW), 'Inactive');
});

t('kids savings classed as savings', () => {
  close(sum(HF.seed(), 'weekly').byType.savings, 150);
});

t('cash toggle and cash-spending flag', () => {
  const S = HF.seed();
  assert.strictEqual(sum(S).cashSpendingEntered, false);
  S.items.push(Object.assign({}, item(S, 'Rent'), { id: 'x', name: 'House cleaner', amount: 150, frequency: 'fortnightly', source: 'cash' }));
  assert.strictEqual(sum(S).cashSpendingEntered, true);
  S.settings.includeCash = false;
  close(sum(S).income, 130000 + 24866.40);
});

t('Monday-Sunday weeks', () => {
  const r = HF.periodRange('weekly', new Date(2026, 9, 2)); // Fri 2 Oct 2026
  assert.strictEqual(r.start, '2026-09-28'); assert.strictEqual(r.end, '2026-10-04');
  const s = HF.periodRange('weekly', new Date(2026, 9, 4)); // Sunday
  assert.strictEqual(s.start, '2026-09-28');
  assert.strictEqual(HF.periodRange('monthly', new Date(2026, 1, 10)).end, '2026-02-28');
});

t('payoff months', () => {
  assert.strictEqual(HF.payoffMonths(1200, 0, 100), 12);
  assert.strictEqual(HF.payoffMonths(12077.75, 28.99, 250), null); // interest > payment
  assert.ok(HF.payoffMonths(12077.75, 28.99, 600) > 20);
});

t('debts: fields and JZD ATO business debt', () => {
  const S = HF.seed();
  S.debts.forEach(d => ['balance', 'rate', 'endDate', 'scope'].forEach(k => assert.ok(k in d, d.name + ' ' + k)));
  const jzd = S.debts.find(d => d.name === 'JZD ATO');
  assert.strictEqual(jzd.balance, 25209.75); assert.strictEqual(jzd.scope, 'business');
  assert.ok(S.debts.find(d => d.name === 'AGL arrears').endDate.startsWith('2027-02'));
});

t('net worth scopes', () => {
  const S = HF.seed();
  const h = HF.netWorth(S, 'household');
  close(h.liabilities, 12077.75 + 4080.18 + 634.58 + 2055.30);
  close(HF.netWorth(S, 'all').liabilities, 12077.75 + 4080.18 + 634.58 + 2055.30 + 25209.75);
  close(h.assets, 886.94 * 3 + 34119.85 + 2047.49 + 4000);
});

t('date & amount parsing', () => {
  assert.strictEqual(IM.parseDate('03/02/2026'), '2026-02-03');
  assert.strictEqual(IM.parseDate('3 Feb 2026'), '2026-02-03');
  assert.strictEqual(IM.parseDate('03 Feb', 2026), '2026-02-03');
  assert.strictEqual(IM.parseDate('2026-02-03'), '2026-02-03');
  assert.strictEqual(IM.parseDate('31/02/2026'), null);
  assert.strictEqual(IM.parseAmount('-$1,234.56'), -1234.56);
  assert.strictEqual(IM.parseAmount('(45.20)'), -45.2);
  assert.strictEqual(IM.parseAmount('45.20 DR'), -45.2);
  assert.strictEqual(IM.parseAmount('956.40 CR'), 956.4);
});

t('CSV: CommBank style (no header)', () => {
  const rows = IM.parseCSV('03/02/2026,"-45.20","WOOLWORTHS 1234 WOLLONGONG","+1,000.00"\n04/02/2026,"+956.40","CENTRELINK FTB","+1,956.40"\n');
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].amount, -45.2);
  assert.strictEqual(rows[0].description, 'WOOLWORTHS 1234 WOLLONGONG');
  assert.strictEqual(rows[1].amount, 956.4);
});

t('CSV: debit/credit columns with header', () => {
  const rows = IM.parseCSV('Date,Description,Debit,Credit,Balance\n05/03/2026,DFJW PTY LTD,198.00,,500.00\n06/03/2026,Salary,,2500.00,3000.00\n');
  assert.deepStrictEqual(rows.map(r => r.amount), [-198, 2500]);
});

t('pasted text with balance column', () => {
  const rows = IM.parseText('12/03/2026  WOOLWORTHS 1234  45.20  1,000.00\n13/03/2026  TRANSFER FROM JOINT  200.00  1,200.00', 2026);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].amount, -45.2);
  assert.strictEqual(rows[1].amount, 200);
});

t('rules, word boundaries and transfers', () => {
  const S = HF.seed();
  assert.strictEqual(IM.classify(S, { description: 'DFJW PTY LTD SYDNEY', amount: -198 }).merchant, 'Ariana Dance');
  assert.strictEqual(IM.classify(S, { description: 'Payrix*ADVANTAGETENNIS', amount: -52 }).category_id, 'c_kids');
  assert.strictEqual(IM.classify(S, { description: 'ATO PAYMENT 1234', amount: -118 }).category_id, 'c_tax');
  assert.notStrictEqual(IM.classify(S, { description: 'DECORATOR WAREHOUSE', amount: -10 }).category_id, 'c_tax');
  const tr = IM.classify(S, { description: 'TRANSFER TO JZD ACCOUNT', amount: -500, account_id: 'a_joint' });
  assert.ok(tr.internal_transfer);
  const kid = IM.classify(S, { description: 'TRANSFER TO DARIUS SAVINGS', amount: -50, account_id: 'a_joint' });
  assert.strictEqual(kid.category_id, 'c_savings'); assert.ok(!kid.internal_transfer);
  assert.ok(IM.classify(S, { description: 'CASH DEPOSIT BRANCH', amount: 400 }).cash_deposit);
});

t('import dedupe + transfer pairs excluded from actuals', () => {
  const S = HF.seed();
  const rows = [
    { date: '2026-09-29', description: 'WOOLWORTHS', amount: -50 },
    { date: '2026-09-29', description: 'WOOLWORTHS', amount: -50 },
    { date: '2026-09-30', description: 'PAYMENT 77', amount: -300 }
  ];
  let txs = IM.prepare(S, rows, 'a_joint');
  assert.ok(txs.every(x => !x.duplicate));
  S.transactions.push(...txs);
  txs = IM.prepare(S, rows, 'a_joint');
  assert.ok(txs.every(x => x.duplicate), 're-import flagged as duplicates');
  S.transactions.push(...IM.prepare(S, [{ date: '2026-10-01', description: 'DEPOSIT 77', amount: 300 }], 'a_jzd'));
  assert.strictEqual(IM.detectTransferPairs(S), 1);
  const wk = HF.periodRange('weekly', new Date(2026, 9, 2));
  const a = HF.actualSummary(S, wk, 'weekly');
  close(a.expenses, 100); close(a.income, 0);
  close(a.byCat.c_food, 100);
});

t('ledger record shape, raw date and budget week', () => {
  const S = HF.seed();
  const [tx] = IM.prepare(S, IM.parseText('05 Oct 2026  DFJW PTY LTD  -99.00', 2026), 'a_joint');
  ['id', 'date', 'date_raw', 'budget_week', 'description_raw', 'merchant', 'amount', 'direction', 'account_id', 'category_id', 'subcategory',
    'source', 'internal_transfer', 'one_off', 'recurring', 'recurring_group', 'notes'].forEach(k => assert.ok(k in tx, k));
  assert.strictEqual(tx.date, '2026-10-05'); assert.strictEqual(tx.date_raw, '05 Oct 2026');
  assert.strictEqual(tx.budget_week, '2026-10-05'); assert.strictEqual(tx.direction, 'out');
  // Split payment: second $99 paid the following Monday, moved back into the first week.
  const [tx2] = IM.prepare(S, IM.parseText('12/10/2026  DFJW PTY LTD  -99.00', 2026), 'a_joint');
  tx2.budget_week = '2026-10-05';
  S.transactions.push(tx, tx2);
  const wk = HF.periodRange('weekly', new Date(2026, 9, 7));
  close(HF.actualSummary(S, wk, 'weekly').byCat.c_kids, 198);
  close(HF.actualSummary(S, HF.periodRange('weekly', new Date(2026, 9, 13)), 'weekly').expenses, 0);
  assert.strictEqual(HF.history(S, 'weekly').length, 1);
});

t('migrates V1 saves', () => {
  const v1 = HF.seed(); v1.version = 1; v1.settings.mode = 'normalised';
  v1.transactions = [{ id: 't1', date: '2026-09-29', descriptionRaw: 'X', merchant: 'X', amount: -5, accountId: 'a_joint', categoryId: 'c_food', internalTransfer: false, oneOff: false, source: 'imported' }];
  const m = HF.migrate(JSON.parse(JSON.stringify(v1)));
  assert.strictEqual(m.version, 3); assert.strictEqual(m.settings.mode, 'budget');
  assert.strictEqual(m.categories.find(c => c.id === 'c_food').icon, 'food');
  assert.strictEqual(m.transactions[0].category_id, 'c_food'); assert.strictEqual(m.transactions[0].budget_week, '2026-09-28');
  assert.ok(!('categoryId' in m.transactions[0]));
});

t('net worth subtracts every debt in scope and lists missing balances', () => {
  const S = HF.seed();
  const debtsIn = scope => S.debts.filter(d => d.active !== false && (scope === 'all' || d.scope !== 'business'));
  ['household', 'all'].forEach(scope => {
    const nw = HF.netWorth(S, scope);
    const withBal = debtsIn(scope).filter(d => d.balance != null);
    close(nw.liabilities, withBal.reduce((a, d) => a + d.balance, 0), scope);
    assert.deepStrictEqual(nw.missing.map(d => d.id).sort(), debtsIn(scope).filter(d => d.balance == null).map(d => d.id).sort());
  });
  assert.ok(HF.netWorth(S, 'household').missing.some(d => d.name === 'Tesla — Angle Finance'));
  // Setting a balance moves it from missing into liabilities.
  const before = HF.netWorth(S, 'household');
  S.debts.find(d => d.id === 'd_tesla').balance = 30000;
  const after = HF.netWorth(S, 'household');
  close(before.net - after.net, 30000);
  assert.strictEqual(after.missing.length, before.missing.length - 1);
  // Closed debts drop out.
  S.debts.find(d => d.id === 'd_tesla').active = false;
  close(HF.netWorth(S, 'household').net, before.net);
});

t('net worth snapshots: one per day, only on change', () => {
  const S = HF.seed();
  HF.recordNetWorth(S, '2026-10-01'); HF.recordNetWorth(S, '2026-10-01'); HF.recordNetWorth(S, '2026-10-02');
  assert.strictEqual(S.nwHistory.length, 1, 'unchanged value not re-recorded');
  S.assets[0].value = 5000; HF.recordNetWorth(S, '2026-10-02');
  assert.strictEqual(S.nwHistory.length, 2);
  close(S.nwHistory[1].household - S.nwHistory[0].household, 5000);
});

console.log(passed + ' tests passed' + (process.exitCode ? ' (with failures)' : ''));
