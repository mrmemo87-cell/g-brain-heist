// Isolated browser contract test. All account responses are mocked; no real accounts.
// Optional PLAYWRIGHT_MODULE_PATH / CHROMIUM_EXECUTABLE_PATH support managed runtimes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4179'],{env:{...process.env,VITE_SUPABASE_URL:'http://127.0.0.1:54321',VITE_SUPABASE_ANON_KEY:'test-key'},stdio:['ignore','pipe','pipe']});
let browser;
const uid='00000000-0000-0000-0000-000000000001',sid='00000000-0000-0000-0000-000000000100';
const user={id:uid,email:'agent@example.com',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}};
const session={access_token:`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test`,refresh_token:'test-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
const profile={id:uid,username:'Test Agent',avatar_url:'',role:'student',school_id:sid,grade:'8',batch:'8A',level:1,xp:0,coins:25,gemstones:0,streak:1,ap_now:10,ap_max:10,attack_power:10,defense_power:10,pvp_score:0,last_seen:new Date().toISOString(),needs_setup:false,tutorial_completed:true};
const base={user_id:uid,email:user.email,email_verified:true,needs_setup:false,is_banned:false,profile,school:{id:sid,name:'Test School',logo_url:null},capabilities:null,is_superadmin:false,has_parent_workspace:false};
const caps={school_id:sid,role:'school_admin',account_type:'school_admin',is_owner:false,can_administer:true,can_teach:false,has_active_teacher_allocation:false};
async function setup(payload,{restored=true,delay=0,fail=false,mobile=false}={}){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},reducedMotion:'reduce'});
 await context.addInitScript(({session,restored})=>{localStorage.setItem('brains_heist_ftue_enabled','false');if(restored)localStorage.setItem('sb-127-auth-token',JSON.stringify(session))},{session,restored});
 const requests=[],errors=[];let at=0,shouldFail=fail;
 await context.route('http://127.0.0.1:54321/**',async route=>{
  const path=new URL(route.request().url()).pathname;requests.push(path);
  if(path.endsWith('/rpc_auth_bootstrap_v1')){await new Promise(r=>setTimeout(r,delay));at=Date.now();return route.fulfill({status:shouldFail?503:200,json:shouldFail?{message:'Test connection interrupted'}:payload})}
  if(path.endsWith('/token'))return route.fulfill({json:session});
  if(path.endsWith('/user'))return route.fulfill({json:{user}});
  if(path.endsWith('/logout'))return route.fulfill({status:204});
  if(path.endsWith('/rpc_record_daily_streak'))return route.fulfill({json:{claimed:false,streak:1,coins:25}});
  if(path.endsWith('/school_admin_get_my_allocation_capabilities'))return route.fulfill({json:{success:true,...payload.capabilities}});
  if(path.endsWith('/get_school_details'))return route.fulfill({json:{success:true,school:{...base.school,slug:'test',settings:{}},stats:{students:0,teachers:0,admins:1,total:1}}});
  if(path.endsWith('/users'))return route.fulfill({json:payload.profile});
  return route.fulfill({json:[]});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4179');
 return{context,page,requests,errors,at:()=>at,recover:()=>{shouldFail=false}};
}
async function wait(c,selector,name){try{await c.page.locator(selector).first().waitFor({timeout:20000})}catch(e){console.log(name,await c.page.locator('body').innerText(),c.errors,c.requests);throw e}}
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(d.toString().includes('Local:'))resolve()});server.once('error',reject);server.once('exit',c=>reject(new Error(`Vite exited ${c}`)))});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],headless:true});
 const slow=await setup({...base,profile:{...profile,role:'teacher'},has_parent_workspace:true},{restored:false,delay:2200,mobile:true});
 await slow.page.getByLabel('Email',{exact:true}).fill(user.email);await slow.page.getByLabel('Password',{exact:true}).fill('test-password');
 await slow.page.getByRole('button',{name:'Enter →',exact:true}).click();await slow.page.getByRole('button',{name:'Tile 5, target',exact:true}).waitFor();
 const before=slow.requests.length;
 for(let i=0;i<5;i++)await slow.page.getByRole('button',{name:/, target$/}).click();
 assert.equal(slow.requests.length,before);assert.equal(await slow.page.getByLabel('5 hits').count(),1);
 assert.equal(await slow.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.equal(await slow.page.locator('.login-launchpad__mark').evaluate(el=>getComputedStyle(el).animationName),'none');
 await slow.page.screenshot({path:process.env.AUTH_SCREENSHOT_PATH||'/tmp/bh-login-warmup.png'});
 await slow.page.getByText('Choose your workspace',{exact:true}).waitFor();assert.ok(Date.now()-slow.at()<1800,'No artificial recognition hold');
 assert.equal(slow.requests.filter(p=>p.endsWith('/rpc_auth_bootstrap_v1')).length,1);
 assert.equal(slow.requests.filter(p=>/check_user_setup_status|rpc_guardian_my_children|rpc_is_superadmin/.test(p)).length,0);
 assert.deepEqual(slow.errors,[]);await slow.context.close();console.log('PASS password login: one bootstrap, local taps, mobile layout, reduced motion, no minimum delay');
 const cases=[
 ['student',base,'.student-feed-card'],
 ['teacher',{...base,profile:{...profile,role:'teacher'}},'.teacher-portal, .teacher-sidebar'],
 ['school admin',{...base,profile:{...profile,role:'school_admin'},capabilities:caps},'[data-testid="school-admin-portal"]'],
 ['school head',{...base,profile:{...profile,role:'school_admin'},capabilities:{...caps,is_owner:true,account_type:'school_head'}},'.school-workspace-chooser'],
 ['dual teacher/admin',{...base,profile:{...profile,role:'school_admin'},capabilities:{...caps,can_teach:true,has_active_teacher_allocation:true}},'.school-workspace-chooser'],
 ['student/parent',{...base,has_parent_workspace:true},'.school-workspace-chooser'],
 ['superadmin/parent',{...base,is_superadmin:true,has_parent_workspace:true},'.school-workspace-chooser'],
 ];
 for(const [name,payload,selector]of cases){const c=await setup(payload);await wait(c,selector,name);assert.equal(c.requests.filter(p=>p.endsWith('/rpc_auth_bootstrap_v1')).length,1,name);assert.deepEqual(c.errors,[],name);await c.context.close();console.log(`PASS restored ${name}`)}
 const failed=await setup(base,{fail:true});await failed.page.getByText('Initialization failed',{exact:true}).waitFor();assert.equal(await failed.page.locator('.student-feed-card').count(),0);
 failed.recover();await failed.page.getByRole('button',{name:'Retry',exact:true}).click();await wait(failed,'.student-feed-card','retry');assert.equal(failed.requests.filter(p=>p.endsWith('/rpc_auth_bootstrap_v1')).length,2);await failed.context.close();console.log('PASS fail-closed error and retry');
 const banned=await setup({...base,is_banned:true,profile:null});await banned.page.getByText(/You got banned by an admin/).waitFor();await banned.context.close();console.log('PASS banned account signs out');
 for(const service of ['authService','ieltsAuthService']) {
  const oauth=await setup(base,{restored:false});
  const authorize=oauth.page.waitForRequest(r=>r.url().includes('/auth/v1/authorize'));
  await oauth.page.evaluate(async service=>{const m=await import(`/services/${service}.ts`);await m.loginWithGoogle()},service).catch(e=>{if(!/context.*destroyed|navigation/i.test(e.message))throw e});
  const request=await authorize;const url=new URL(request.url());
  assert.equal(url.searchParams.get('provider'),'google');assert.equal(url.searchParams.has('prompt'),false);assert.equal(url.searchParams.has('access_type'),false);
  assert.ok(url.searchParams.get('redirect_to')?.includes('/auth/callback'));
  await oauth.context.close();console.log(`PASS ${service} Google authorize URL and callback preserved without forced consent`);
 }
 const unverified=await setup({...base,email_verified:false});await unverified.page.getByText(/Verify your email|Check your email/i).first().waitFor();await unverified.context.close();console.log('PASS unverified account stops at verification');
}finally{if(browser)await browser.close();server.kill()}
