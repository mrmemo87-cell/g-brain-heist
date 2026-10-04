// Run from the repository root with Playwright installed. All RPCs are mocked.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin='http://127.0.0.1:5271';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5271','--strictPort'],{env:{...process.env,VITE_SUPABASE_URL:'http://localhost:9999',VITE_SUPABASE_ANON_KEY:'test'}});
let log='';server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
(async()=>{
 let browser;
 try {
  let ready=false;for(let i=0;i<80;i++){try{if((await fetch(origin)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,log);
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,args:process.env.PLAYWRIGHT_SINGLE_PROCESS ? ['--no-sandbox','--no-zygote','--single-process'] : []});
  const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.context().route('http://localhost:9999/**',route=>route.fulfill({contentType:'application/json',body:'[]'}));
  await page.goto(origin+'/e2e/question-browser.fixture.html');
  await page.locator('.qb-topic-card').first().waitFor();
  assert.equal(await page.locator('.qb-topic-card').count(),2);
  assert.equal((await page.evaluate(()=>window.__requests)).filter(r=>r.name.includes('question_browser')).length,0);
  await page.locator('.qb-topic-card').filter({hasText:'Alpha'}).click();
  await page.getByText('Question 60: choose the correct answer',{exact:true}).waitFor();
  assert.equal(await page.locator('.qb-modal__questions h3').count(),60);
  await page.getByRole('button',{name:'Load more questions',exact:true}).click();
  await page.getByText('Question 80: choose the correct answer',{exact:true}).waitFor();
  assert.equal(await page.locator('.qb-modal__questions h3').count(),80);
  await page.getByRole('button',{name:'Add to a new assignment',exact:true}).click();
  await page.getByText('Used 80 questions',{exact:true}).waitFor();
  const popupPromise=page.waitForEvent('popup');
  await page.getByRole('button',{name:'Print paper',exact:true}).click();const popup=await popupPromise;
  await popup.getByText('80. Question 80: choose the correct answer',{exact:true}).waitFor();
  assert.equal(await popup.locator('.document-card>strong').filter({hasText:/^\d+\./}).count(),80);
  await popup.close();
  await page.getByRole('button',{name:'Close topic',exact:true}).click();
  await page.getByRole('button',{name:'Open battle picker',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Select battle questions',exact:true});
  await dialog.getByText('Question 60: choose the correct answer',{exact:true}).waitFor();
  await dialog.locator('article button[aria-pressed]').first().click();
  await dialog.getByRole('button',{name:'Load more questions',exact:true}).click();
  await dialog.getByText('Question 120: choose the correct answer',{exact:true}).waitFor();
  await dialog.locator('select').nth(2).selectOption('Beta');
  await dialog.getByText('Question 125: choose the correct answer',{exact:true}).waitFor();
  await dialog.locator('article button[aria-pressed]').first().click();
  await dialog.getByRole('button',{name:'Use 2 questions in battle',exact:true}).click();
  await page.getByText('Battle 2 questions',{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open battle picker',exact:true}).click();
  await dialog.getByText('Question 60: choose the correct answer',{exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile overflow');
  if (process.env.QUESTION_BROWSER_SCREENSHOT) await page.screenshot({path:process.env.QUESTION_BROWSER_SCREENSHOT,fullPage:true});
  assert.deepEqual(errors,[]);assert.equal(await page.locator('vite-error-overlay').count(),0);
  const requests=await page.evaluate(()=>window.__requests);assert.ok(requests.filter(r=>r.name.includes('question_browser')).every(r=>r.args.p_filters.limit<=100));
  console.log('PASS: first-page loading, pagination, complete set/print, selection across filters, mobile layout, no browser exceptions.');
 } catch(error){console.log(log.slice(-2000));throw error;}
 finally {await browser?.close();server.kill();}
})();
