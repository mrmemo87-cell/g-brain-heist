/** Run with a locally available Playwright installation; artifacts are written outside source. */
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const modulePath=process.env.PLAYWRIGHT_MODULE_PATH;
const {chromium}=await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const repo=process.cwd();
const artifacts=resolve(process.env.PROFILE_ARTIFACTS_DIRECTORY || '/tmp/academic-profile-premium');
await mkdir(artifacts,{recursive:true});
const port=process.env.PROFILE_TEST_PORT || '3102';
const origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',port,'--strictPort'],{cwd:repo,env:{...process.env,VITE_SUPABASE_URL:'http://localhost',VITE_SUPABASE_ANON_KEY:'test'}});
let serverLog='';server.stdout.on('data',d=>serverLog+=d);server.stderr.on('data',d=>serverLog+=d);
const results=[];let browser;let lastPage;
try {
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,'Vite must be ready');
 browser=await chromium.launch({headless:true,executablePath:process.env.PROFILE_BROWSER_EXECUTABLE || undefined,args:process.env.PROFILE_BROWSER_ARGS ? JSON.parse(process.env.PROFILE_BROWSER_ARGS) : ['--no-sandbox']});
 async function open(mode='baseline',width=1448){
  const page=await browser.newPage({viewport:{width,height:1086},deviceScaleFactor:1});
  lastPage=page;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://fixture.invalid/**',route=>route.fulfill({path:resolve(repo,'public/schools/silk_road/silk_road_logo.jpg')}));
  // Optional offline mirror of the application's existing font, for repeatable screenshot metrics.
  if(process.env.PROFILE_FONT_DIRECTORY){const dir=resolve(process.env.PROFILE_FONT_DIRECTORY);await page.route('https://fonts.googleapis.com/**',async route=>route.fulfill({contentType:'text/css',body:(await readFile(resolve(dir,'plex-local.css'),'utf8')).replaceAll(/\/plex-(\d)\.ttf/g,'https://profile-font.invalid/plex-$1.ttf')}));await page.route('https://profile-font.invalid/**',route=>route.fulfill({path:resolve(dir,new URL(route.request().url()).pathname.slice(1))}));}
  await page.goto(`${origin}/e2e/academic-profile-premium.fixture.html?mode=${mode}&student=fixture-student&subject=English`);
  await page.getByRole('button',{name:'Academic Profiles',exact:true}).click();
  await page.getByRole('button',{name:'Open academic profile',exact:true}).click();
  await page.getByRole('heading',{name:'Student Academic Profile',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
  return {page,errors};
 }
 async function check(page,errors,name){assert.deepEqual(errors,[],`${name}: no browser exceptions`);assert.deepEqual(await page.evaluate(()=>window.__consoleErrors),[],`${name}: no console errors`);assert.equal(await page.locator('vite-error-overlay').count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name}: no page overflow`);results.push(name);console.log(name);}
 const {page,errors}=await open();
 assert.equal(await page.locator('.ap-stat').count(),4);assert.match(await page.locator('.ap-overview').innerText(),/93%/);assert.match(await page.locator('.ap-overview').innerText(),/16 items/);
 for(const name of ['Learning trends','Assessment results','Priority support','Evidence to confirm','Detailed evidence','Assessment record'])assert.equal(await page.getByRole('region',{name,exact:true}).isVisible(),true);
 const outcomes=page.getByRole('region',{name:'Assessment results',exact:true});assert.equal(await outcomes.locator('tbody tr').count(),8);await outcomes.getByRole('button',{name:'View all assessment results',exact:true}).click();assert.equal(await outcomes.locator('tbody tr').count(),16);assert.match(await page.locator('.ap-overview').innerText(),/16 items/);await outcomes.getByRole('button',{name:'Show less assessment results',exact:true}).click();
 const explorer=page.getByRole('region',{name:'Detailed evidence',exact:true});await explorer.locator('.ap-assessment-detail > summary').first().click();await explorer.locator('.ap-skill-detail > summary').first().click();assert.match(await explorer.innerText(),/Apply this skill in a contextual question/);await explorer.locator('.ap-assessment-detail > summary').first().click();
 await page.getByRole('button',{name:'Generate individual report',exact:true}).click();await page.locator('.sap-print-report').waitFor();assert.match(await page.locator('.sap-print-report').innerText(),/Ildar Kanybekov/);await page.screenshot({path:resolve(artifacts,'report-preview.png'),fullPage:true});await page.emulateMedia({media:'print'});await page.locator('.sap-print-report').waitFor({state:'visible'});assert.equal(await page.locator('.teacher-academic-tool-shell').isVisible(),false,'print hides workspace chrome');assert.equal(await page.locator('.sap-print-report').isVisible(),true);await page.pdf({path:resolve(artifacts,'report.pdf'),format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});await page.getByRole('button',{name:'Close',exact:true}).click();
 for(const width of [1448,1280,1024,768,390,360]){await page.setViewportSize({width,height:width<768?844:1086});await page.screenshot({path:resolve(artifacts,`profile-${width}.png`),fullPage:true});await check(page,errors,`baseline layout at ${width}px`);}
 await page.setViewportSize({width:1448,height:1086});await page.getByLabel('From',{exact:true}).fill('2026-10-01');await page.getByRole('heading',{name:'Student Academic Profile',exact:true}).waitFor();assert.match(await page.locator('.ap-overview').innerText(),/No completed assignment results/);const requests=await page.evaluate(()=>window.__requests);assert.ok(requests.some(r=>r.body.p_date_from==='2026-10-01T00:00:00.000Z'));await page.getByLabel('To',{exact:true}).fill('2026-09-20');assert.match(await page.getByRole('alert').innerText(),/previous valid date range/);await page.getByLabel('From',{exact:true}).fill('');await page.getByRole('heading',{name:'Student Academic Profile',exact:true}).waitFor();
 await page.getByRole('button',{name:'Back to student selection',exact:true}).click();await page.getByRole('button',{name:'Back to Teacher Workspace',exact:true}).click();assert.equal(await page.locator('.teacher-academic-tool-shell').getAttribute('data-active-academic-tool'),null);assert.equal(await page.locator('.ap-workspace-brand').count(),0);await check(page,errors,'report, date filtering, evidence expansion and workspace exit');
 for(const mode of ['empty','archived','long','mixed','repeated','multi']){
  const {page,errors}=await open(mode);
  if(mode==='empty'){assert.match(await page.locator('.ap-overview').innerText(),/No assessed evidence/);assert.equal(await page.locator('.ap-stat').count(),4);}
  if(mode==='archived'){assert.equal(await page.getByRole('button',{name:'Generate individual report',exact:true}).count(),0);assert.match(await page.locator('.ap-year-context').innerText(),/Archived/);}
  if(mode==='mixed'){assert.match(await page.getByRole('status').innerText(),/Writing Hub submission/);assert.match(await page.locator('.ap-skill-trends').innerText(),/Writing Hub/);assert.match(await page.locator('.ap-overview').innerText(),/93%/);}
  if(mode==='repeated'){assert.ok(await page.locator('.sap-trend-line').count()>0);assert.match(await page.locator('.ap-overview').innerText(),/1 active area/);}
  if(mode==='multi'){await page.getByLabel('Subject',{exact:true}).selectOption('Economics');await page.getByRole('heading',{name:'Student Academic Profile',exact:true}).waitFor();assert.match(await page.getByRole('region',{name:'Assessment results',exact:true}).innerText(),/Inflation/);assert.doesNotMatch(await page.getByRole('region',{name:'Assessment results',exact:true}).innerText(),/Question formation/);}
  await page.screenshot({path:resolve(artifacts,`profile-${mode}.png`),fullPage:true});await check(page,errors,`${mode} evidence state`);await page.setViewportSize({width:390,height:844});await check(page,errors,`${mode} mobile state`);
 }
 await writeFile(resolve(artifacts,'verification.json'),JSON.stringify({passed:results},null,2));console.log(JSON.stringify({passed:results,artifacts}));
}catch(error){if(lastPage&&!lastPage.isClosed()){await lastPage.screenshot({path:resolve(artifacts,'failure.png'),fullPage:true}).catch(()=>{});console.log(JSON.stringify({failureText:(await lastPage.locator('body').innerText()).slice(0,3500),errors:await lastPage.evaluate(()=>window.__consoleErrors)}));}throw error;}finally{await browser?.close();server.kill();await writeFile(resolve(artifacts,'server.log'),serverLog);}
