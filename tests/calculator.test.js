// Calculator behaviour tests — drives the real page in Chromium (Playwright).
// Run: python3 -m http.server 8765  (repo root), then: node tests/calculator.test.js
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;
const URL = process.argv[2] || 'http://localhost:8765/index.html';
// Key names map to data-act/data-val buttons on the pads.
const K = { '÷': ['op', '÷'], '×': ['op', '×'], '−': ['op', '−'], '+': ['op', '+'], '^': ['op', '^'], '=': ['equals'], '.': ['decimal'], 'AC': ['clear'], 'C': ['clear'],
  '±': ['sign'], '%': ['percent'], '⌫': ['back'], '(': ['paren'], 'π': ['const', 'pi'], 'e': ['const', 'e'], 'sin': ['fn', 'sin'], 'cos': ['fn', 'cos'], 'tan': ['fn', 'tan'],
  'ln': ['fn', 'ln'], 'log': ['fn', 'log'], '√': ['fn', 'sqrt'] };
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
  ['C clears entry', '5 + 3 C 4 =', '9'],
  ['C then AC clears all', '5 + 3 C C 7 =', '7'],
  ['C after op clears all', '5 + C C 2 =', '2'],
  ['C after result', '2 + 3 = C', '0'],
  ['C then AC', '1 2 + 3 C C', '0'],
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
  ['sin π', 'sin π =', '0'],
  ['cos 0', 'cos 0 =', '1'],
  ['tan π/4', 'tan π ÷ 4 =', '1'],
  ['sqrt', '√ 1 6 =', '4'],
  ['2√9', '2 √ 9 =', '6'],
  ['√ of result', '1 6 = √ =', '4'],
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
  ['paren then digit', '( 2 + 3 ( 4 =', '20'],
  ['paren then decimal', '( 2 + 3 ( . 5 =', '2.5'],
  ['digit then paren', '2 ( 3 + 1 =', '8'],
  ['nested parens', '( ( 1 + 2 ( × 3 ( =', '9'],
  ['unary minus in paren', '( − 3 ( × 2 =', '−6'],
  ['backspace', '1 2 3 ⌫ =', '12'],
  ['backspace fn', 'sin ⌫ 5 =', '5'],
  ['backspace result', '1 2 3 = ⌫', '12'],
  ['backspace to empty', '7 ⌫', '0'],
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
        const el = document.querySelector('#padBasic ' + sel) || document.querySelector('#padSci ' + sel); el.click();
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
