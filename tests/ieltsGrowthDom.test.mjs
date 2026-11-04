import {JSDOM,VirtualConsole} from 'jsdom';
import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {randomUUID} from 'node:crypto';import fs from 'node:fs';

const report={days:30,totals:{visitors:420,signups:63,started:48,cleared:31,paid:7,active_prime:9},
 campaigns:[{campaign:'nov',source:'instagram',visitors:300,signups:45,started:35,cleared:22,paid:6},{campaign:'(direct or unknown)',source:null,visitors:120,signups:18,started:13,cleared:9,paid:1}],
 daily:Array.from({length:7},(_,i)=>({day:`2026-11-0${i+1}`,visitors:40+i*5,signups:5+i}))};
const unit={id:1,track:'main',position:1,slug:'u1',title:'Welcome: how IELTS works',subtitle:null,focus_skills:['reading'],estimated_minutes:30,is_free_preview:true,lesson_viewed:true,completed:true,unlocked:true,locked_reason:null,tasks:[],lesson:{intro:'x',sections:[],tips:[]},next_unit_id:2,prev_unit_id:null};

const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{RouterProvider,createBrowserRouter}from'./src/lib/router';import{ supabase }from'./services/supabaseClient';import Growth from './src/pages/ielts/IeltsGrowthDashboard';import Unit from './src/pages/ielts/IeltsCourseUnit';import Login from './components/ielts/IELTSLoginView';const user={id:'00000000-0000-0000-0000-000000000001'};supabase.auth.getSession=async()=>({data:{session:{user}}});supabase.auth.getUser=async()=>({data:{user}});supabase.auth.onAuthStateChange=()=>({data:{subscription:{unsubscribe(){}}}});window.__signups=[];supabase.auth.signUp=async(a)=>{window.__signups.push(a);return{data:{session:null,user:{id:'u'}},error:null};};createRoot(document.getElementById('root')).render(<RouterProvider router={createBrowserRouter([{path:'/ielts/growth',element:<Growth/>},{path:'/ielts/course/:unitId',element:<Unit/>},{path:'/ielts/apply-prime',element:<h1>Prime plans</h1>},{path:'/ielts/course',element:<Login onAuthenticated={()=>{}}/>}])}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty','.png':'empty','.svg':'empty'},define:{'import.meta':JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-key',VITE_SITE_URL:'https://brainsheist.com'}})},logLevel:'silent'});

async function mount(path,{denied=false,access='prime_required'}={}){
 const bodies=[],errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'+path,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers});w.crypto.randomUUID=randomUUID;w.scrollTo=()=>{};
 w.fetch=async(url,options)=>{const name=new URL(String(url)).pathname.split('/').pop();bodies.push([name,options?.body?JSON.parse(options.body):null]);let result;
  if(name==='rpc_ielts_growth_report'){if(denied)return new Response(JSON.stringify({message:'not_authorized'}),{status:403,headers:{'Content-Type':'application/json'}});result=report;}
  else if(name==='rpc_ielts_course_sync_progress')result={completed:true};
  else if(name==='rpc_ielts_course_unit')result=unit;
  else if(name==='rpc_ielts_course_state')result={access:{full:access===null,reason:access??'prime'},current_unit_id:2,units_total:20,units_completed:1,units:[]};
  else return new Promise(()=>{});
  return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
 };
 w.eval(bundle.outputFiles[0].text);
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,15));}throw Error('UI did not settle '+w.document.body.textContent.slice(0,300)+' '+errors.join(','));};
 return{dom,w,bodies,errors,wait};
}

test('the owner sees the funnel from landing visit to Prime, by campaign',async()=>{
 const m=await mount('/ielts/growth');try{
  await m.wait(()=>m.w.document.querySelector('.gd-table'));
  const t=m.w.document.body.textContent;
  assert.match(t,/Landing visitors420/);assert.match(t,/Bought Prime7/);assert.match(t,/23% of previous step/,'paid / cleared');
  const rows=[...m.w.document.querySelectorAll('.gd-table tbody tr')];
  assert.equal(rows.length,2);assert.match(rows[0].textContent,/nov · instagram/);assert.match(rows[0].textContent,/2%$/);
  [...m.w.document.querySelectorAll('.gd-range button')].find(b=>b.textContent==='7 days').click();
  await m.wait(()=>m.bodies.some(([n,b])=>n==='rpc_ielts_growth_report'&&b.p_days===7));
  assert.deepEqual(m.errors,[]);
 }finally{m.dom.window.close();}
});

test('other accounts cannot open the growth report',async()=>{
 const m=await mount('/ielts/growth',{denied:true});try{
  await m.wait(()=>m.w.document.querySelector('[role="alert"]'));
  assert.match(m.w.document.body.textContent,/for the Brains Heist owner only/);
 }finally{m.dom.window.close();}
});

test('clearing free Unit 1 without access offers Prime instead of a locked next unit',async()=>{
 const m=await mount('/ielts/course/1');try{
  await m.wait(()=>m.w.document.querySelector('.po-card'));
  assert.match(m.w.document.querySelector('.po-card').textContent,/Unlock the next 19 units/);
  assert.equal([...m.w.document.querySelectorAll('button')].some(b=>/^Next unit/.test(b.textContent)),false,'no button into a locked unit');
  [...m.w.document.querySelectorAll('.po-card button')].find(b=>/See Prime plans/.test(b.textContent)).click();
  await m.wait(()=>m.w.location.pathname==='/ielts/apply-prime');
 }finally{m.dom.window.close();}
});

test('learners with full access go straight on to the next unit',async()=>{
 const m=await mount('/ielts/course/1',{access:null});try{
  await m.wait(()=>[...m.w.document.querySelectorAll('button')].some(b=>/^Next unit/.test(b.textContent)));
  assert.equal(m.w.document.querySelector('.po-card'),null);
 }finally{m.dom.window.close();}
});

test('new learners can create an account with email; the confirmation returns to the course',async()=>{
 const m=await mount('/ielts/course?utm_source=instagram');try{
  await m.wait(()=>[...m.w.document.querySelectorAll('button')].some(b=>/Create an account with email/.test(b.textContent)));
  [...m.w.document.querySelectorAll('button')].find(b=>/Create an account with email/.test(b.textContent)).click();
  await m.wait(()=>m.w.document.querySelector('#ielts-email-create'));
  const set=(sel,v)=>{const el=m.w.document.querySelector(sel);Object.getOwnPropertyDescriptor(m.w.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new m.w.Event('input',{bubbles:true}));};
  set('#ielts-email-create input[autocomplete="name"]','Aigerim Toktosunova');
  set('#ielts-email-create input[type="email"]','Aigerim.T@example.com');
  set('#ielts-email-create input[type="password"]','longpassword1');
  await new Promise(r=>setTimeout(r,30));
  m.w.document.querySelector('#ielts-email-create button[type="submit"]').click();
  await m.wait(()=>m.w.document.querySelector('.ielts-auth-check'));
  assert.match(m.w.document.querySelector('.ielts-auth-check').textContent,/aigerim\.t@example\.com/);
  const call=m.w.__signups[0];
  assert.equal(call.email,'aigerim.t@example.com');
  assert.equal(call.options.data.full_name,'Aigerim Toktosunova');
  assert.match(call.options.emailRedirectTo,/\/auth\/callback$/);
  assert.equal(m.w.sessionStorage.getItem('ielts_auth_intent'),'/ielts/course?utm_source=instagram','the confirmation link brings them back to the course');
 }finally{m.dom.window.close();}
});

test('the growth report is owner-only, aggregate and fed by anonymous landing visits',()=>{
 const sql=fs.readFileSync('supabase/migrations/20261104170000_ielts_growth_report.sql','utf8');
 assert.match(sql,/if not public\.is_superadmin\(\(select auth\.uid\(\)\)\) then/);
 assert.doesNotMatch(sql.replace(/--[^\n]*/g,''),/email|full_name|username/,'no personal data in the report');
 const html=fs.readFileSync('public/ielts-prep.html','utf8');
 assert.match(html,/localStorage\.getItem\('bh_site_member'\)/,'signed-in members are not counted');
 assert.match(html,/sendBeacon\('\/api\/site-visit'/);
 assert.match(html,/path: '\/ielts-prep'/);
});
