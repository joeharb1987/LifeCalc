/* Household Finance — seed data for Joe & Zhila.
   Figures come from the Jan–Sep 2026 bank statement review and Joe's confirmations.
   Everything here is editable in the app; this is only the starting point. */
(function (root) {
  'use strict';

  function seed() {
    var categories = [
      { id: 'c_income', name: 'Income', icon: '💵', type: 'income' },
      { id: 'c_housing', name: 'Housing', icon: '🏠', type: 'living' },
      { id: 'c_food', name: 'Food', icon: '🛒', type: 'living' },
      { id: 'c_education', name: 'Education', icon: '🎓', type: 'living' },
      { id: 'c_kids', name: 'Children Activities', icon: '🎹', type: 'living' },
      { id: 'c_transport', name: 'Transport', icon: '🚗', type: 'living' },
      { id: 'c_utilities', name: 'Utilities & Bills', icon: '💡', type: 'living' },
      { id: 'c_insurance', name: 'Insurance', icon: '🛡️', type: 'living' },
      { id: 'c_shopping', name: 'Shopping', icon: '🛍️', type: 'living' },
      { id: 'c_health', name: 'Health', icon: '💊', type: 'living' },
      { id: 'c_personal', name: 'Personal Care', icon: '✂️', type: 'living' },
      { id: 'c_subs', name: 'Subscriptions', icon: '📺', type: 'living' },
      { id: 'c_debt', name: 'Debt Repayments', icon: '💳', type: 'debt' },
      { id: 'c_tax', name: 'Tax & Government', icon: '🏛️', type: 'tax' },
      { id: 'c_savings', name: 'Family Savings', icon: '🐷', type: 'savings' },
      { id: 'c_business', name: 'Business Software', icon: '💻', type: 'business' },
      { id: 'c_oneoff', name: 'One-offs', icon: '📌', type: 'oneoff' },
      { id: 'c_transfer', name: 'Internal Transfer', icon: '🔁', type: 'transfer' },
      { id: 'c_invest', name: 'Cash → Investment', icon: '📈', type: 'investment' },
      { id: 'c_liquidation', name: 'Asset Liquidation', icon: '💱', type: 'investment' }
    ];
    categories.forEach(function (c, i) { c.order = i; });

    var n = 0;
    function item(direction, categoryId, name, amount, frequency, source, extra) {
      var it = {
        id: 'i' + (++n), direction: direction, categoryId: categoryId, name: name,
        amount: amount, frequency: frequency, customWeeks: null,
        source: source, kind: frequency === 'oneoff' ? 'oneoff' : 'fixed',
        active: true, scope: 'personal', review: false, provider: '', notes: '',
        startDate: null, endDate: null   // optional ISO dates; outside them the item isn't counted
      };
      return Object.assign(it, extra || {});
    }
    function inc(name, amount, freq, source, extra) { return item('in', 'c_income', name, amount, freq, source, extra); }
    function exp(cat, name, amount, freq, source, extra) { return item('out', cat, name, amount, freq, source, extra); }
    var AVG = 'Statement average Jan–Sep 2026, bank-only.';
    function avg(cat, name, amount, txCount, total, extra) {
      return exp(cat, name, amount, 'weekly', 'statement_avg', Object.assign({
        kind: 'variable',
        notes: AVG + ' ' + txCount + ' transactions, $' + total.toLocaleString('en-AU', { minimumFractionDigits: 2 }) + ' total.'
      }, extra || {}));
    }

    var items = [
      // ----- Income -----
      inc("Ariel's", 2500, 'weekly', 'manual', { notes: 'Confirmed by Joe at $2,500/week (not $3,000).' }),
      inc('Joe — Wollongong Station', 2075, 'monthly', 'cash', { notes: '50% of $4,150/month Station fixed amount.' }),
      inc('Zhila', 440, 'weekly', 'cash', { notes: 'Manual cash income. Don\'t double count if later deposited.' }),
      inc('Family Tax Benefit', 956.40, 'fortnightly', 'statement', { provider: 'Centrelink', notes: 'Recent fortnightly total $956.40–$957.22.' }),

      // ----- Housing -----
      exp('c_housing', 'Rent', 1000, 'weekly', 'manual'),

      // ----- Food (statement averages) -----
      avg('c_food', 'Groceries', 171.22, 133, 6677.69),
      avg('c_food', 'Eating out / takeaway / cafés', 109.66, 230, 4276.65),

      // ----- Education -----
      exp('c_education', 'Edstart / School Fees', 463.53, 'weekly', 'statement', { provider: 'Edstart' }),
      exp('c_education', 'Elonera Montessori', 101.18, 'weekly', 'statement', { notes: 'Separate from Edstart.' }),

      // ----- Children activities -----
      exp('c_kids', 'Darius Piano', 249, 'monthly', 'statement', { provider: 'Piano Play', notes: 'June $349 was a one-off startup charge; ongoing invoice is $249/month.' }),
      exp('c_kids', 'Darius Tennis', 260, 'term', 'manual', { provider: 'Advantage Tennis', notes: '$26/lesson × 10-week term = $260/term, paid as 5 × $52 fortnightly debits.' }),
      exp('c_kids', 'Ariana Dance', 198, 'fortnightly', 'statement', { provider: 'Dance Factor by Jessica Walker (DFJW PTY LTD)', notes: 'Occasional partial payments e.g. $99.' }),

      // ----- Transport -----
      avg('c_transport', 'Tesla charging', 48.38, 104, 1886.76, { notes: AVG + ' Tesla + Chargefox. 104 transactions, $1,886.76 total. Not Tesla finance.' }),
      avg('c_transport', 'Tolls / parking / transport', 33.42, 66, 1303.23),

      // ----- Utilities & bills -----
      exp('c_utilities', 'AGL — electricity usage', 95, 'weekly', 'calculated', { provider: 'AGL', notes: 'Ongoing. Approx split of the $199/week AGL debit ($95 usage + $104 arrears). Statement transactions stay as the actual $199.' }),
      exp('c_utilities', 'EnergyAustralia repayment plan', 20, 'weekly', 'statement', { provider: 'EnergyAustralia (FRM FRANCOM)' }),
      exp('c_utilities', 'Joe phone — Telstra', 84, 'monthly', 'statement', { provider: 'Telstra' }),
      exp('c_utilities', 'Zhila phone — JB Hi-Fi Mobile', 99, 'monthly', 'statement', { provider: 'JB Hi-Fi Mobile' }),
      exp('c_utilities', 'Optus', 60, 'monthly', 'statement', { review: true, notes: 'Was $52/month, latest $60. Confirm service or cancellation.' }),
      exp('c_utilities', 'Starlink', 75, 'monthly', 'manual'),

      // ----- Insurance -----
      exp('c_insurance', 'NRMA insurance', 189.75, 'monthly', 'statement', { provider: 'NRMA', review: true, notes: 'Possible duplicate / catch-up transactions to review.' }),
      exp('c_insurance', 'NRMA second cover / roadside', 21.99, 'monthly', 'statement', { provider: 'NRMA' }),
      exp('c_insurance', 'iPad Air insurance', 8.49, 'monthly', 'manual', { provider: 'Apple' }),
      exp('c_insurance', 'iPhone insurance', 20.49, 'monthly', 'manual', { provider: 'Apple' }),

      // ----- Shopping / health -----
      avg('c_shopping', 'Shopping / misc retail', 77.25, 63, 3012.74, { notes: AVG + ' Kmart, Amazon, Shein, Big W, TK Maxx, Reject Shop etc. 63 transactions, $3,012.74 total.' }),
      avg('c_health', 'Pharmacy / medical', 7.13, 11, 278.00),

      // ----- Personal care -----
      exp('c_personal', 'Joe PT (Vision PT)', 79.30, 'weekly', 'statement', { provider: 'Vision PT' }),

      // ----- Subscriptions -----
      exp('c_subs', 'Netflix', 9.99, 'monthly', 'manual'),
      exp('c_subs', 'Spotify', 22.99, 'monthly', 'manual'),
      exp('c_subs', 'Paramount+', 7.99, 'monthly', 'manual'),
      exp('c_subs', 'Amazon Prime', 9.99, 'monthly', 'manual'),
      exp('c_subs', 'PlayStation', 20.95, 'monthly', 'statement', { notes: 'Latest amount seen on statement.' }),
      exp('c_subs', 'YouTube (via Apple)', 22.99, 'monthly', 'manual', { provider: 'Apple' }),
      exp('c_subs', 'iCloud', 14.99, 'monthly', 'manual'),
      exp('c_subs', 'Google', 4.49, 'monthly', 'manual'),
      exp('c_subs', 'Samsung Electronic X', 5.99, 'monthly', 'statement', { review: true, notes: 'Needs identification.' }),
      exp('c_subs', 'Disney+', 0, 'monthly', 'manual', { active: false, notes: 'Cancelled.' }),
      exp('c_subs', 'Kayo', 0, 'monthly', 'manual', { active: false, notes: 'Cancelled.' }),
      exp('c_subs', 'Stan', 0, 'monthly', 'manual', { active: false, notes: 'Cancelled.' }),
      exp('c_subs', 'Audible', 0, 'monthly', 'manual', { active: false, notes: 'Cancelled.' }),
      exp('c_subs', 'Peloton', 0, 'monthly', 'manual', { active: false, notes: 'Cancelled. Cancelled subs together saved ~$162/month.' }),

      // ----- Debt repayments -----
      exp('c_debt', 'Tesla — Angle Finance', 1174.68, 'monthly', 'statement', { provider: 'Angle Finance', notes: '$50,000 financed over 5 years.' }),
      exp('c_debt', 'AGL arrears repayment', 104, 'weekly', 'calculated', { provider: 'AGL', endDate: '2027-02-28', notes: 'Arrears part of the $199/week AGL debit. Balance ~$2,055.30 ÷ $104/wk ≈ 20 weeks, so ends around Feb 2027.' }),
      exp('c_debt', 'Latitude GO', 332.14, 'monthly', 'manual', { provider: 'Latitude', notes: 'Minimum repayment as target. Actual debits vary ($326–$438). Interest ~$281/month at 28.99%.' }),
      exp('c_debt', 'Zip', 150, 'monthly', 'assumption', { provider: 'Zip', notes: 'Assumption: $150/month. Actual Zip Money payments have been irregular ($150 and smaller).' }),
      exp('c_debt', 'Revenue NSW — personal', 30, 'fortnightly', 'statement', { provider: 'Revenue NSW' }),
      exp('c_debt', 'Revenue NSW — JZD', 50, 'fortnightly', 'statement', { provider: 'Revenue NSW', scope: 'business' }),

      // ----- Tax & government -----
      exp('c_tax', 'Personal ATO', 118, 'fortnightly', 'statement', { provider: 'ATO' }),
      exp('c_tax', 'JZD ATO', 228, 'fortnightly', 'statement', { provider: 'ATO', scope: 'business' }),
      exp('c_tax', 'JZD ATO (second plan)', 88, 'fortnightly', 'statement', { provider: 'ATO', scope: 'business' }),

      // ----- Family savings -----
      exp('c_savings', 'Darius savings', 50, 'weekly', 'manual'),
      exp('c_savings', 'Ariana savings', 50, 'weekly', 'manual'),
      exp('c_savings', 'Bella savings', 50, 'weekly', 'manual'),

      // ----- Business software -----
      exp('c_business', 'Lovable', 21.95, 'monthly', 'statement', { scope: 'business' }),
      exp('c_business', 'Vercel', 30.75, 'monthly', 'statement', { scope: 'business' }),
      exp('c_business', 'OpenAI', 0, 'monthly', 'statement', { scope: 'business', kind: 'variable', review: true, notes: 'Variable — set an amount.' }),

      // ----- One-offs (never in recurring burn) -----
      exp('c_oneoff', 'Morrison legal — September', 1100, 'oneoff', 'statement'),
      exp('c_oneoff', 'Morrison / trust (earlier)', 1237.25, 'oneoff', 'statement', { notes: 'Approx.' }),
      exp('c_oneoff', 'Removalists', 1190, 'oneoff', 'statement', { notes: 'Approx.' }),
      exp('c_oneoff', 'Futboltec', 1260, 'oneoff', 'statement', { notes: 'Seasonal / irregular.' }),
      exp('c_oneoff', 'Cricket registration', 0, 'oneoff', 'manual', { review: true, notes: 'Seasonal — add amount when known.' }),
      exp('c_oneoff', 'Oztag registration', 0, 'oneoff', 'manual', { review: true, notes: 'Seasonal — add amount when known.' })
    ];

    var accounts = [
      { id: 'a_joint', name: 'Joint account', type: 'bank', owned: true, transferAs: 'internal', match: 'JOINT', active: true },
      { id: 'a_jzd', name: 'JZD account', type: 'business', owned: true, transferAs: 'internal', match: 'JZD', active: true },
      { id: 'a_reserve', name: 'Reserve account', type: 'savings', owned: true, transferAs: 'internal', match: 'RESERVE', active: true },
      { id: 'a_darius', name: 'Darius savings', type: 'kids', owned: true, transferAs: 'savings', match: 'DARIUS', active: true },
      { id: 'a_ariana', name: 'Ariana savings', type: 'kids', owned: true, transferAs: 'savings', match: 'ARIANA', active: true },
      { id: 'a_bella', name: 'Bella savings', type: 'kids', owned: true, transferAs: 'savings', match: 'BELLA', active: true },
      { id: 'a_cash', name: 'Cash (manual)', type: 'cash', owned: true, transferAs: 'internal', match: '', active: true }
    ];

    var r = 0;
    function rule(pattern, merchant, categoryId, flag) {
      return { id: 'r' + (++r), pattern: pattern, merchant: merchant, categoryId: categoryId, flag: flag || null };
    }
    var rules = [
      rule('DFJW PTY LTD', 'Ariana Dance', 'c_kids'),
      rule('VISION P T', 'Joe Personal Training', 'c_personal'),
      rule('FRM FRANCOM', 'EnergyAustralia repayment', 'c_utilities'),
      rule('JB HIFI MOBILE', 'Zhila Mobile', 'c_utilities'),
      rule('TELSTRA', 'Joe Telstra', 'c_utilities'),
      rule('PIANO PLAY', 'Darius Piano', 'c_kids'),
      rule('ADVANTAGETENNIS', 'Darius Tennis', 'c_kids'),
      rule('PLINEPH', 'Pharmacy', 'c_health'),
      rule('CHARGEFOX', 'Tesla Charging', 'c_transport'),
      rule('TESLA INC', 'Tesla Charging', 'c_transport'),
      rule('ANGLE FINANCE', 'Tesla Finance', 'c_debt'),
      rule('REVENUENSW', 'Revenue NSW', 'c_debt'),
      rule('LATITUDE', 'Latitude GO', 'c_debt'),
      rule('ZIPMONEY', 'Zip repayment', 'c_debt'),
      rule('ZIP PAY', 'Zip repayment', 'c_debt'),
      rule('ATO', 'ATO', 'c_tax'),
      rule('AGL', 'AGL', 'c_utilities'),
      rule('EDSTART', 'Edstart / School Fees', 'c_education'),
      rule('ELONERA', 'Elonera Montessori', 'c_education'),
      rule('NRMA', 'NRMA', 'c_insurance'),
      rule('OPTUS', 'Optus', 'c_utilities'),
      rule('STARLINK', 'Starlink', 'c_utilities'),
      rule('CENTRELINK', 'Family Tax Benefit', 'c_income'),
      rule('NETFLIX', 'Netflix', 'c_subs'),
      rule('SPOTIFY', 'Spotify', 'c_subs'),
      rule('PARAMOUNT', 'Paramount+', 'c_subs'),
      rule('PRIME VIDEO', 'Amazon Prime', 'c_subs'),
      rule('PLAYSTATION', 'PlayStation', 'c_subs'),
      rule('YOUTUBE', 'YouTube', 'c_subs'),
      rule('APPLE.COM/BILL', 'Apple', 'c_subs'),
      rule('GOOGLE STORAGE', 'Google Storage', 'c_subs'),
      rule('LOVABLE', 'Lovable', 'c_business'),
      rule('VERCEL', 'Vercel', 'c_business'),
      rule('OPENAI', 'OpenAI', 'c_business'),
      rule('WOOLWORTHS', 'Woolworths', 'c_food'),
      rule('COLES', 'Coles', 'c_food'),
      rule('ALDI', 'Aldi', 'c_food'),
      rule('IGA', 'IGA', 'c_food'),
      rule('MCDONALDS', "McDonald's", 'c_food'),
      rule('UBER *EATS', 'Uber Eats', 'c_food'),
      rule('MENULOG', 'Menulog', 'c_food'),
      rule('DOORDASH', 'DoorDash', 'c_food'),
      rule('KMART', 'Kmart', 'c_shopping'),
      rule('AMAZON', 'Amazon', 'c_shopping'),
      rule('SHEIN', 'Shein', 'c_shopping'),
      rule('BIG W', 'Big W', 'c_shopping'),
      rule('TK MAXX', 'TK Maxx', 'c_shopping'),
      rule('REJECT SHOP', 'Reject Shop', 'c_shopping'),
      rule('LINKT', 'Linkt tolls', 'c_transport'),
      rule('PARKING', 'Parking', 'c_transport'),
      rule('CHEMIST', 'Pharmacy', 'c_health'),
      rule('PHARMACY', 'Pharmacy', 'c_health'),
      rule('COMMSEC', 'CommSec', 'c_invest'),
      rule('COINSPOT', 'Crypto purchase', 'c_invest'),
      rule('CRYPTO.COM', 'Crypto.com', 'c_invest'),
      rule('CASH DEPOSIT', 'Cash deposit', 'c_income', 'cashDeposit')
    ];

    // Debt fields: balance, rate (% p.a.), payment + frequency, endDate (optional ISO), scope personal|business.
    var debts = [
      { id: 'd_latitude', name: 'Latitude GO', balance: 12077.75, limit: 12000, rate: 28.99, payment: 332.14, frequency: 'monthly', scope: 'personal', active: true, notes: 'Over limit. Recent interest ~$281.06/month. Minimum $332.14.' },
      { id: 'd_zipmoney', name: 'Zip Money', balance: 4080.18, limit: null, rate: null, payment: 150, frequency: 'monthly', scope: 'personal', active: true, notes: 'Repayment is an assumption ($150/month) — actual payments irregular.' },
      { id: 'd_zippay', name: 'Zip Pay', balance: 634.58, limit: null, rate: null, payment: 0, frequency: 'monthly', scope: 'personal', active: true, notes: '' },
      { id: 'd_agl', name: 'AGL arrears', balance: 2055.30, limit: null, rate: 0, payment: 104, frequency: 'weekly', scope: 'personal', active: true, endDate: '2027-02-28', notes: 'Arrears part of the $199/week AGL plan. Ends around Feb 2027.' },
      { id: 'd_tesla', name: 'Tesla — Angle Finance', balance: null, limit: null, rate: null, payment: 1174.68, frequency: 'monthly', scope: 'personal', active: true, notes: '$50,000 financed over 5 years. Add current payout balance.' },
      { id: 'd_rnsw_p', name: 'Revenue NSW — personal', balance: null, limit: null, rate: 0, payment: 30, frequency: 'fortnightly', scope: 'personal', active: true, notes: '' },
      { id: 'd_rnsw_jzd', name: 'Revenue NSW — JZD', balance: null, limit: null, rate: 0, payment: 50, frequency: 'fortnightly', scope: 'business', active: true, notes: '' },
      { id: 'd_ato_p', name: 'Personal ATO', balance: null, limit: null, rate: null, payment: 118, frequency: 'fortnightly', scope: 'personal', active: true, notes: '' },
      { id: 'd_ato_jzd', name: 'JZD ATO', balance: 25209.75, limit: null, rate: null, payment: 316, frequency: 'fortnightly', scope: 'business', active: true, notes: 'Two plans: $228 + $88 fortnightly.' }
    ];

    var D = '2026-09-30';
    function asset(id, name, type, value, extra) {
      return Object.assign({ id: id, name: name, type: type, value: value, updated: D, scope: 'household', notes: '' }, extra || {});
    }
    var assets = [
      asset('as_bank', 'Adult bank cash', 'cash', 0, { notes: 'Not set yet — enter current balances.' }),
      asset('as_cash', 'Cash on hand', 'cash', 0),
      asset('as_darius', 'Darius savings', 'kids', 886.94),
      asset('as_ariana', 'Ariana savings', 'kids', 886.94),
      asset('as_bella', 'Bella savings', 'kids', 886.94),
      asset('as_btc', 'BTC', 'crypto', 11161.32),
      asset('as_eth', 'ETH', 'crypto', 7467.94),
      asset('as_sol', 'SOL', 'crypto', 7029.40),
      asset('as_ada', 'ADA', 'crypto', 4407.08),
      asset('as_cro', 'CRO', 'crypto', 3487.85),
      asset('as_pol', 'POL', 'crypto', 566.26),
      asset('as_au', 'CommSec — Australian shares', 'shares', 1143.17),
      asset('as_intl', 'CommSec — International shares', 'shares', 904.32),
      asset('as_pocket', 'CommSec Pocket', 'shares', 0),
      asset('as_bond', 'Rental bond', 'other', 4000, { notes: 'Deposit held — an asset, not lifestyle spending.' })
    ];

    debts.forEach(function (d) { if (!('endDate' in d)) d.endDate = null; });

    return {
      version: 2,
      settings: {
        view: 'weekly',          // weekly | monthly | yearly
        mode: 'budget',          // budget | actual
        expView: 'categories',   // all | categories
        includeBusiness: false,  // business / trust items (JZD ATO, Revenue NSW JZD, software) in totals
        includeCash: true,       // manual cash items in totals
        nwScope: 'household',    // household | all
        tab: 'budget'
      },
      categories: categories,
      items: items,
      accounts: accounts,
      transactions: [],
      rules: rules,
      debts: debts,
      assets: assets
    };
  }

  root.HF = Object.assign(root.HF || {}, { seed: seed });
})(typeof window !== 'undefined' ? window : globalThis);
