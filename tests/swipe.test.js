// Page carousel tests (Calculator ‹› Budget ‹› HQ) — drives real touch events in Chromium.
// Run: python3 -m http.server 8765  (repo root), then: node tests/swipe.test.js
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const D = process.argv[2] || require('os').tmpdir();
(async () => {
  const b = await pw.chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: false, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  let fail = 0; const ck = (ok, m) => { console.log(ok ? 'PASS' : 'FAIL', m); if (!ok) fail++; };
  let cdp = await ctx.newCDPSession(p);
  const tp = (x, y) => [{ x, y, id: 1 }];
  async function drag(x0, y, dx, ms, { shotAt, shot, hold } = {}) {
    const steps = Math.max(4, Math.round(ms / 16));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(x0, y) });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(x0 + dx * i / steps, y + (i % 2)) });
      await p.waitForTimeout(ms / steps);
      if (shot && i === Math.round(steps * shotAt)) await p.screenshot({ path: D + '/' + shot + '.png' });
    }
    if (hold) await p.waitForTimeout(hold);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  const where = () => p.evaluate(() => location.pathname.replace(/.*LifeCalc|\/$/,'') + location.hash);
  const settled = () => p.evaluate(() => ({ ghost: !!document.querySelector('.lc-ghost'), tf: (document.querySelector('.app')||{}).style?.transform || '' }));

  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1500);
  ck(await p.evaluate(() => !!document.querySelector('.lc-peek iframe')), 'calculator preloads Budget');
  ck(await p.evaluate(() => { const f = document.querySelector('.lc-peek iframe'); return f.contentDocument.documentElement.style.getPropertyValue('--lc-sat') !== ''; }), 'preview gets notch spacing');

  // calculator: rubber-band to the right, stays
  await drag(120, 620, 200, 250, { shot: '1-calc-rubber', shotAt: 1 }); await p.waitForTimeout(500);
  ck((await where()).includes('index.html') && !(await settled()).tf, 'calc right swipe: rubber-band, stays, springs back');
  // slow short drag left, released early: springs back
  await drag(300, 620, -90, 500, { hold: 150 }); await p.waitForTimeout(500);
  ck((await where()).includes('index.html'), 'calc short slow drag: stays');
  // drag left, mid-drag frame, release → Budget
  await drag(330, 620, -230, 300, { shot: '2-calc-to-budget-mid', shotAt: 0.9 });
  await p.waitForURL(/budget/, { timeout: 4000 }).catch(() => {});
  await p.waitForTimeout(1500); cdp = await ctx.newCDPSession(p);
  ck(/budget\/?#budget/.test(await where()), 'calc swipe left → Budget (' + await where() + ')');
  await p.screenshot({ path: D + '/3-budget.png' });

  // Budget → HQ with finger following
  await drag(320, 62, -220, 320, { shot: '4-budget-to-hq-mid', shotAt: 0.85 }); await p.waitForTimeout(600);
  ck(/#hq/.test(await where()) && await p.evaluate(() => LCBudget.get().settings.tab === 'hq'), 'Budget swipe left → HQ');
  ck(!(await settled()).ghost && !(await settled()).tf, 'no leftover copy or offset after HQ arrives');
  await p.screenshot({ path: D + '/5-hq.png' });
  // HQ: rubber-band left
  await drag(320, 62, -200, 250); await p.waitForTimeout(600);
  ck(/#hq/.test(await where()) && !(await settled()).tf, 'HQ swipe left: rubber-band, stays');
  // quick flick right (short distance, fast) → Budget
  await drag(80, 62, 70, 60); await p.waitForTimeout(600);
  ck(/#budget/.test(await where()) && await p.evaluate(() => LCBudget.get().settings.tab === 'budget'), 'HQ quick flick right → Budget');
  // browser Back returns to HQ (history kept)
  await p.goBack(); await p.waitForTimeout(400);
  ck(await p.evaluate(() => LCBudget.get().settings.tab === 'hq'), 'Back button returns to HQ');
  await p.goForward(); await p.waitForTimeout(400);
  // vertical scroll is not hijacked
  const y0 = await p.evaluate(() => scrollY);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(200, 650) });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(200 + i, 650 - i * 30) }); await p.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(400);
  ck(/#budget/.test(await where()), 'vertical drag does not change page');
  // Budget → calculator
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(1200);
  await drag(60, 62, 240, 300, { shot: '6-budget-to-calc-mid', shotAt: 0.85 });
  await p.waitForURL(/index\.html|LifeCalc\/$|8765\/$/, { timeout: 4000 }).catch(() => {});
  await p.waitForTimeout(800);
  ck(!/budget/.test(await where()), 'Budget swipe right → calculator (' + await where() + ')');
  ck(!errs.length, 'no page errors ' + errs.join(' | '));
  console.log(fail ? fail + ' FAILED' : 'ALL PASS'); await b.close(); process.exit(fail ? 1 : 0);
})();
