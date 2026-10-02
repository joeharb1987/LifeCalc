// Calculator behaviour tests — drives the real page in Chromium (Playwright).
// Run: python3 -m http.server 8765  (repo root), then: node tests/calculator.test.js
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;
const URL = process.argv[2] || 'http://localhost:8765/index.html';
// Key names map to data-act/data-val buttons on the pads.
const K = { '÷': ['op', '÷'], '×': ['op', '×'], '−': ['op', '−'], '+': ['op', '+'], '^': ['op', '^'], '=': ['equals'], '.': ['decimal'], 'AC': ['clear'], '⌫': ['back'],
  '±': ['sign'], '%': ['percent'], '(': ['open'], ')': ['close'], 'π': ['const', 'pi'], 'e': ['const', 'e'], 'Rand': ['const', 'rand'],
  'sin': ['unary', 'sin'], 'cos': ['unary', 'cos'], 'tan': ['unary', 'tan'], 'sin⁻¹': ['unary', 'asin'], 'sinh': ['unary', 'sinh'],
  'ln': ['unary', 'ln'], 'log': ['unary', 'log'], 'log₂': ['unary', 'log2'], '√': ['unary', 'sqrt'], '∛': ['unary', 'cbrt'],
  'x²': ['unary', 'sq'], 'x³': ['unary', 'cube'], '1/x': ['unary', 'inv'], 'x!': ['unary', 'fact'], 'eˣ': ['unary', 'exp'], '10ˣ': ['unary', 'pow10'], '2ˣ': ['unary', 'pow2'],
  'ʸ√': ['op', '√'], 'EE': ['ee'], 'Rad': ['angle'], '2nd': ['second'], 'mc': ['mem', 'mc'], 'm+': ['mem', 'm+'], 'm−': ['mem', 'm-'], 'mr': ['mem', 'mr'] };
const cases = [
  // basic arithmetic
  ['add', '2 + 3 =', '5'],
  ['float 0.1+0.2', '0 . 1 + 0 . 2 =', '0.3'],
  ['float 0.1×3', '0 . 1 × 3 =', '0.3'],
  ['precedence', '2 + 3 × 4 =', '14'],
  ['divide', '1 ÷ 3 =', '0.333333333333'],
  ['÷3 ×3', '1 ÷ 3 × 3 =', '1'],
  ['leading decimal', '. 5 + . 5 =', '1'],
  ['subtract to negative', '3 − 8 =', '−5'],
  ['div by zero', '5 ÷ 0 =', 'Error'],
  ['after error starts fresh', '5 ÷ 0 = 3 =', '3'],
  ['after error op', '5 ÷ 0 = + 2 =', '2'],
  // equals behaviour
  ['repeat =', '5 + 2 = = =', '11'],
  ['repeat × =', '3 × 2 = =', '12'],
  ['repeat − on negative', '2 − 5 = =', '−8'],
  ['repeat with negative operand', '1 0 × 2 ± = =', '40'],
  ['chain after =', '2 + 3 = × 4 =', '20'],
  ['new calc after =', '2 + 3 = 7 =', '7'],
  ['= with dangling op', '5 + =', '5'],
  ['= on empty', '=', '0'],
  // percent
  ['percent add', '1 0 0 + 1 0 % =', '110'],
  ['percent sub', '1 0 0 − 1 0 % =', '90'],
  ['percent mul', '1 0 0 × 1 0 % =', '10'],
  ['percent div', '1 0 0 ÷ 1 0 % =', '1,000'],
  ['percent alone', '5 0 %', '0.5'],
  ['percent of result', '5 0 = %', '0.5'],
  ['percent then continue', '1 0 % + 1 =', '1.1'],
  ['percent on dangling op ignored', '1 0 + %', '10+'],
  // sign
  ['sign', '5 ±', '−5'],
  ['sign twice', '5 ± ±', '5'],
  ['sign then op', '5 ± × 3 =', '−15'],
  ['sign of second operand', '3 × 5 ± =', '−15'],
  ['sign second twice', '3 × 5 ± ± =', '15'],
  ['sign of result', '2 + 3 = ±', '−5'],
  ['sign then power', '2 ± ^ 2 =', '4'],
  ['sign on empty then digits', '± 4 + 1 =', '−3'],
  // entry
  ['leading zeros', '0 0 0 7', '7'],
  ['zero point', '0 . 0 5', '0.05'],
  ['double decimal', '1 . . 5', '1.5'],
  ['op replace', '5 + × 2 =', '10'],
  ['leading minus', '− 5 + 2 =', '−3'],
  ['leading minus then ×', '− × 5', '5'],
  ['thousands while typing', '1 2 3 4 5 6 7', '1,234,567'],
  ['thousands decimal', '1 2 3 4 . 5 6 7 8', '1,234.5678'],
  // clear
  ['delete key removes last digit', '5 + 3 ⌫ 4 =', '9'],
  ['delete twice removes operator', '5 + 3 ⌫ ⌫ 7 =', '57'],
  ['delete to empty then AC', '5 ⌫ AC', '0'],
  ['AC after result', '2 + 3 = AC', '0'],
  ['AC mid-sum clears all', '5 + 3 AC 2 =', '2'],
  ['delete then AC', '1 2 + 3 ⌫ ⌫ ⌫ ⌫ AC', '0'],
  ['neg exponent then op swap', '2 ^ − + 3 =', '5'],
  ['sign of big result keeps precision', '9 9 9 9 9 9 9 × 9 9 9 9 9 9 9 × 9 9 9 = ± ÷ 1 0 0 0 =', '−99,899,980,020,001'],
  ['repeat on big result keeps precision', '9 9 9 9 9 9 9 × 9 9 9 9 9 9 9 × 9 9 9 = ÷ 1 0 0 0 = =', '99,899,980,020'],
  // big / small
  ['big number', '9 9 9 9 9 9 × 9 9 9 9 9 9 =', '999,998,000,001'],
  ['huge', '9 9 9 9 9 9 9 × 9 9 9 9 9 9 9 × 9 9 9 =', '9.989998002E+16'],
  ['huge continues', '9 9 9 9 9 9 9 × 9 9 9 9 9 9 9 × 9 9 9 = ÷ 1 0 0 0 =', '99,899,980,020,001'],
  ['1E+15', '1 0 0 0 0 0 0 × 1 0 0 0 0 0 0 0 0 0 =', '1E+15'],
  ['tiny', '1 ÷ 1 0 0 0 0 0 0 0 0 0 0 =', '1E−10'],
  ['tiny × big', '1 ÷ 1 0 0 0 0 0 0 0 0 0 0 = × 1 0 0 0 0 0 0 0 0 0 0 =', '1'],
  // scientific
  ['pi', 'π =', '3.14159265359'],
  ['2π', '2 π =', '6.28318530718'],
  ['π2', 'π 2 =', '6.28318530718'],
  ['ππ', 'π π =', '9.86960440109'],
  ['sin π (rad)', 'Rad sin π = Rad', '0'],
  ['sin 30 (degrees by default)', 'sin 3 0 =', '0.5'],
  ['30 sin acts on number', '3 0 sin =', '0.5'],
  ['tan 90 is Error', '9 0 tan =', 'Error'],
  ['sin⁻¹ via 2nd', '2nd 0 . 5 sin⁻¹ = 2nd', '30'],
  ['sinh (rad)', 'Rad 0 sinh = Rad', '0'],
  ['cos 0', 'cos 0 =', '1'],
  ['tan π/4 (rad)', 'Rad tan ( π ÷ 4 ) = Rad', '1'],
  ['tan 45', '4 5 tan =', '1'],
  ['sqrt', '√ 1 6 =', '4'],
  ['√ acts on the number', '9 √ =', '3'],
  ['2 × √9', '2 × √ 9 =', '6'],
  ['√ of result', '1 6 = √ =', '4'],
  ['√ after result then new number', '1 6 = √ 8 1 =', '9'],
  ['√ of big result keeps precision', '9 9 9 9 9 9 9 × 9 9 9 9 9 9 9 × 9 9 9 = √ =', '316,069,580.979'],
  ['ln after result then decimal', '5 = ln . 5 =', '−0.69314718056'],
  ['√ negative', '√ − 4 =', 'Error'],
  ['log', 'log 1 0 0 0 =', '3'],
  ['ln e', 'ln e =', '1'],
  ['ln 1', 'ln 1 =', '0'],
  ['e', 'e =', '2.71828182846'],
  ['e + 5 (not 2e+5)', '2 e + 5 =', '10.4365636569'],
  ['power', '2 ^ 1 0 =', '1,024'],
  ['neg base power', '− 2 ^ 2 =', '4'],
  ['neg exponent', '2 ^ − 2 =', '0.25'],
  ['power right-assoc', '2 ^ 3 ^ 2 =', '512'],
  ['power of result', '3 = ^ 2 =', '9'],
  ['parens auto-close', '( 2 + 3 × 4 =', '14'],
  ['paren then digit', '( 2 + 3 ) 4 =', '20'],
  ['paren then decimal', '( 2 + 3 ) . 5 =', '2.5'],
  ['digit then paren', '2 ( 3 + 1 =', '8'],
  ['nested parens', '( ( 1 + 2 ) × 3 ) =', '9'],
  ['unary minus in paren', '( − 3 ) × 2 =', '−6'],
  ['backspace', '1 2 3 ⌫ =', '12'],
  ['backspace fn', 'sin ⌫ 5 =', '5'],
  ['delete after result edits it', '1 2 3 = ⌫', '12'],
  ['backspace to empty', '7 ⌫', '0'],
  ['x²', '5 x² =', '25'],
  ['x³', '2 x³ =', '8'],
  ['negative x²', '5 ± x² =', '25'],
  ['1/x', '4 1/x =', '0.25'],
  ['x!', '5 x! =', '120'],
  ['0!', '0 x! =', '1'],
  ['non-integer x! (gamma)', '0 . 5 x! =', '0.886226925453'],
  ['factorial in a sum', '3 x! + 1 =', '7'],
  ['eˣ', '1 eˣ =', '2.71828182846'],
  ['10ˣ', '3 10ˣ =', '1,000'],
  ['2ˣ via 2nd', '2nd 1 0 2ˣ = 2nd', '1,024'],
  ['log₂ via 2nd', '2nd 8 log₂ = 2nd', '3'],
  ['∛', '2 7 ∛ =', '3'],
  ['∛ of negative', '2 7 ± ∛ =', '−3'],
  ['ʸ√x', '8 ʸ√ 3 =', '2'],
  ['EE', '2 EE 3 =', '2,000'],
  ['EE negative exponent', '2 EE − 3 =', '0.002'],
  ['x² of result', '3 = x² =', '9'],
  ['x² after result then digit starts fresh', '3 = x² 4 =', '4'],
  ['memory add', 'mc 5 m+ AC 3 m+ AC mr =', '8'],
  ['memory subtract', 'mc 1 0 m+ 4 m− AC mr =', '6'],
  ['mr in a sum', 'mc 2 m+ AC 1 + mr = mc', '3'],
  ['Rand × 0', 'Rand × 0 =', '0'],
];
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 393, height: 852 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(300);
  let pass = 0, fail = [];
  for (const [name, keys, want] of cases) {
    await p.keyboard.press('Escape');
    let ok = true;
    for (const k of keys.trim().split(/\s+/)) {
      const [act, val] = K[k] || ['digit', k];
      const sel = '[data-act="' + act + '"]' + (val ? '[data-val="' + val + '"]' : '');
      const found = await p.evaluate(sel => { const el = document.querySelector('#padBasic ' + sel) || document.querySelector('#padSci ' + sel); if (!el) return false; el.click(); return true; }, sel);
      if (!found) { fail.push(name + ': no key ' + k); ok = false; break; }
    }
    if (!ok) continue;
    const got = (await p.textContent('#resultEl')).trim();
    if (got === want) pass++;
    else fail.push(`${name}: [${keys}] → "${got}" (want "${want}")`);
  }
  // keyboard
  const kb = [['12*(3+4)', 'Enter', '84'], ['7/2', 'Enter', '3.5'], ['9-12', '=', '−3'], ['5x5', 'Enter', '25'], ['2^8', 'Enter', '256'], ['1,5+1', 'Enter', '2.5'], ['123', 'Backspace', '12'], ['99', 'Escape', '0'], ['50%', '', '0.5']];
  for (const [typed, last, want] of kb) {
    await p.keyboard.press('Escape');
    await p.keyboard.type(typed);
    if (last) await p.keyboard.press(last);
    const got = (await p.textContent('#resultEl')).trim();
    if (got === want) pass++; else fail.push(`keyboard "${typed}" ${last} → "${got}" (want "${want}")`);
  }
  // random key mashing never hangs, throws, or leaves NaN / undefined / Infinity on screen
  const keys = Object.keys(K).concat('0 1 2 3 4 5 6 7 8 9'.split(' '));
  const sels = keys.map(k => { const [act, val] = K[k] || ['digit', k]; return '[data-act="' + act + '"]' + (val ? '[data-val="' + val + '"]' : ''); });
  const mash = await p.evaluate((sels) => {
    const bad = []; const t0 = Date.now();
    for (let r = 0; r < 3000; r++) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      const seq = [];
      for (let i = 0; i < 14; i++) {
        const sel = sels[Math.floor(Math.random() * sels.length)]; seq.push(sel.replace(/\[data-(act|val)="([^"]*)"\]/g, '$2 ').trim());
        const el = document.querySelector('#padBasic ' + sel) || document.querySelector('#padSci ' + sel); if (el) el.click();
      }
      const out = document.getElementById('resultEl').textContent + ' | ' + document.getElementById('exprEl').textContent;
      if (/NaN|undefined|Infinity|null/.test(out)) bad.push(seq.join(', ') + ' → ' + out);
    }
    return { bad, ms: Date.now() - t0 };
  }, sels);
  const bad = mash.bad.length;
  mash.bad.slice(0, 5).forEach(x => fail.push('mash: ' + x));
  console.log('random sequences with bad output: ' + bad + '/3000 (' + mash.ms + 'ms)');
  const total = cases.length + kb.length;
  console.log(pass + '/' + total + ' pass');
  fail.forEach(f => console.log('  ✗ ' + f));
  if (errs.length) console.log('page errors:', errs);
  await b.close();
})();
