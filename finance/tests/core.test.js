// Run: node finance/tests/core.test.js
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

t('seed income totals', () => {
  const S = HF.seed();
  const yr = HF.budgetSummary(S, 'yearly', 'normalised');
  close(yr.income, 202646.40, 'yearly income');
  close(HF.budgetSummary(S, 'weekly', 'normalised').income, 202646.40 / 52);
});

t('seed tax & government = 11,284', () => {
  const S = HF.seed();
  close(HF.budgetSummary(S, 'yearly', 'normalised').byCat.c_tax, 11284);
});

t('recurring excludes statement averages; normalised includes them', () => {
  const S = HF.seed();
  const r = HF.budgetSummary(S, 'weekly', 'recurring'), n = HF.budgetSummary(S, 'weekly', 'normalised');
  close(n.expenses - r.expenses, 171.22 + 109.66 + 77.25 + 48.38 + 33.42 + 7.13);
});

t('one-offs, inactive and business excluded by default', () => {
  const S = HF.seed();
  const n = HF.budgetSummary(S, 'yearly', 'normalised');
  assert.ok(!n.byCat.c_oneoff);
  assert.ok(!n.byCat.c_business);
  S.settings.includeBusiness = true;
  close(HF.budgetSummary(S, 'yearly', 'normalised').byCat.c_business, (21.95 + 30.75) * 12);
});

t('kids savings classed as savings', () => {
  const S = HF.seed();
  close(HF.budgetSummary(S, 'weekly', 'normalised').byType.savings, 150);
});

t('cash toggle removes cash income', () => {
  const S = HF.seed(); S.settings.includeCash = false;
  close(HF.budgetSummary(S, 'yearly', 'normalised').income, 130000 + 24866.40);
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

t('net worth scopes', () => {
  const S = HF.seed();
  const h = HF.netWorth(S, 'household');
  close(h.liabilities, 12077.75 + 4080.18 + 634.58 + 2055.30);
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
  assert.strictEqual(IM.classify(S, { description: 'Payrix*ADVANTAGETENNIS', amount: -52 }).categoryId, 'c_kids');
  assert.strictEqual(IM.classify(S, { description: 'ATO PAYMENT 1234', amount: -118 }).categoryId, 'c_tax');
  assert.notStrictEqual(IM.classify(S, { description: 'DECORATOR WAREHOUSE', amount: -10 }).categoryId, 'c_tax');
  const tr = IM.classify(S, { description: 'TRANSFER TO JZD ACCOUNT', amount: -500, accountId: 'a_joint' });
  assert.ok(tr.internalTransfer);
  const kid = IM.classify(S, { description: 'TRANSFER TO DARIUS SAVINGS', amount: -50, accountId: 'a_joint' });
  assert.strictEqual(kid.categoryId, 'c_savings'); assert.ok(!kid.internalTransfer);
  assert.ok(IM.classify(S, { description: 'CASH DEPOSIT BRANCH', amount: 400 }).cashDeposit);
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
  const a = HF.actualSummary(S, HF.periodRange('weekly', new Date(2026, 9, 2)));
  close(a.expenses, 100); close(a.income, 0);
  close(a.byCat.c_food, 100);
});

console.log(passed + ' tests passed' + (process.exitCode ? ' (with failures)' : ''));
