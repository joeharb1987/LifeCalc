// Run with Playwright installed. Optional CHROMIUM_PATH supports managed runtimes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
(async()=>{
 const server=spawn('python3',['-m','http.server','8765'],{cwd:path.join(__dirname,'../..'),stdio:'ignore'});
 let browser;
 try {
  await new Promise(r=>setTimeout(r,500));
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-gpu']});
  const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('https://cdn.jsdelivr.net/**',r=>r.abort());
  await p.goto('http://localhost:8765/budget/#budget');
  const before=await p.evaluate(()=>JSON.stringify(LCBudget.get().items));
  await p.click('[data-act="app-menu"]'); await p.click('[data-act="tab"][data-val="hq"]');
  await p.waitForSelector('.hq');assert.match(await p.locator('h1').innerText(),/Ariel/);
  await p.locator('[data-hq="add"]').first().click();
  const f=p.locator('#hqForm');await f.locator('[name="name"]').first().fill('Test café');await f.locator('[name="franchisees"]').fill('Alex & Sam');
  await f.locator('[data-hq="add-record"][data-id="sales"]').click();
  await f.locator('[data-kind="sales"] [name="amount"]').fill('22000');
  await f.locator('[data-hq="add-record"][data-id="fees"]').click();
  await f.locator('[data-kind="fees"] [name="type"]').selectOption('percent');await f.locator('[data-kind="fees"] [name="amount"]').fill('6');
  for(let i=0;i<3;i++) await f.locator('[data-kind="costs"] [name="amount"]').nth(i).fill(['1000','100','100'][i]);
  await f.locator('[name="lease.expiry"]').fill('2028-11-26');
  await f.locator('[data-hq="add-record"][data-id="options"]').click();await f.locator('[data-kind="options"] [name="years"]').fill('5');await f.locator('[data-kind="options"] [name="deadline"]').fill('2027-05-26');
  assert.match(await f.locator('#hqPreview').innerText(),/1,200/);
  await f.locator('[type="submit"]').click();await p.waitForSelector('#hqForm',{state:'detached'});
  assert.match(await p.locator('.hq').innerText(),/Locations \(1\)/);assert.match(await p.locator('.hq').innerText(),/6.0% of sales/);
  const id=await p.evaluate(()=>LCBudget.get().hqLocations[0].id);
  await p.click('[data-hq="rent"]');assert.match(await p.locator('#sheet').innerText(),/Marketing fund/);assert.match(await p.locator('#sheet').innerText(),/1,320/);await p.click('[data-act="close-sheet"]');
  await p.click('[data-hq="view"][data-id="monthly"]');assert.match(await p.locator('.hq-stats').innerText(),/5,200/);
  await p.reload();await p.waitForSelector('.hq-name');assert.equal(await p.locator('.hq-name').innerText(),'Test café');
  assert.equal(await p.evaluate(()=>JSON.stringify(LCBudget.get().items)),before);
  // Editing does not append another café; overlapping discounts are rejected.
  await p.click('[data-hq="detail"]');await p.click('[data-hq="edit"]');
  const f2=p.locator('#hqForm');await f2.locator('[name="franchisees"]').fill('Alex, Sam & Jo');
  for(let i=0;i<2;i++) {await f2.locator('[data-hq="add-record"][data-id="discounts"]').click();const d=f2.locator('[data-kind="discounts"]').nth(i);await d.locator('[name="amount"]').fill('50');await d.locator('[name="start"]').fill('2026-01-01');await d.locator('[name="end"]').fill('2026-12-31');}
  await f2.locator('[type="submit"]').click();assert.match(await f2.locator('#hqError').innerText(),/overlap/);
  await f2.locator('[data-kind="discounts"]').last().locator('[data-hq="remove-record"]').click();await f2.locator('[type="submit"]').click();await p.waitForSelector('#hqForm',{state:'detached'});
  assert.equal(await p.evaluate(()=>LCBudget.get().hqLocations.length),1);assert.equal(await p.evaluate(()=>LCBudget.get().hqLocations[0].id),id);
  await p.click('[data-hq="home"]');
  // Mobile gestures on page background, cancellation, menu round trip.
  async function swipe(selector,x1,x2,cancel=false){await p.evaluate(({selector,x1,x2,cancel})=>{const el=document.querySelector(selector);for(const [type,x] of [['touchstart',x1],['touchmove',x2],[cancel?'touchcancel':'touchend',x2]]){const e=new Event(type,{bubbles:true,cancelable:true});e.touches=type==='touchend'||type==='touchcancel'?[]:[{clientX:x,clientY:160}];e.changedTouches=[{clientX:x,clientY:160}];el.dispatchEvent(e);}},{selector,x1,x2,cancel});}
  await swipe('.hq',70,320,true);assert.match(p.url(),/#hq/);await swipe('.hq',70,320);await p.waitForURL('**/#budget');
  await swipe('#app',320,70);await p.waitForURL('**/#hq');
  await p.evaluate(()=>{LCBudget.get().settings.theme='light';LCBudget.render();});await p.waitForTimeout(500);await p.screenshot({path:'/tmp/lifecalc-hq-light.png',fullPage:true});
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.evaluate(()=>{LCBudget.get().settings.theme='dark';LCBudget.render();});await p.waitForTimeout(500);await p.screenshot({path:'/tmp/lifecalc-hq-dark.png',fullPage:true});
  assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');
  // Archive / restore retains the record and excludes archived revenue.
  await p.click('[data-hq="detail"]');p.once('dialog',d=>d.accept());await p.click('[data-hq="archive"]');assert.match(await p.locator('.hq').innerText(),/Locations \(0\)/);await p.click('[data-hq="archived"]');await p.click('[data-hq="detail"]');await p.click('[data-hq="archive"]');assert.match(await p.locator('.hq').innerText(),/Locations \(1\)/);
  assert.deepEqual(errors,[]);console.log('HQ browser: create, edit, reload, calculations, validation, Budget isolation, gestures, themes, archive/restore passed');
 } finally {if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
