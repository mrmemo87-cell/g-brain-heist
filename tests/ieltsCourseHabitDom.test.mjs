import {JSDOM,VirtualConsole} from 'jsdom';
import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {randomUUID} from 'node:crypto';import fs from 'node:fs';

const week=(xps)=>xps.map((xp,i)=>({day:`2026-11-0${i+1}`,xp,frozen:i===2,today:i===6}));
const habit=(o={})=>({streak:4,today_done:false,longest_streak:9,freezes:1,today:'2026-11-07',today_xp:0,daily_goal_xp:20,goal_done:false,total_xp:240,next_milestone:7,week:week([15,20,0,10,15,25,0]),time_zone:'Asia/Bishkek',reminders:true,...o});
const code='bh-ielts-targeted-reading-r58-v1';
const state={access:{full:true,reason:'prime'},current_unit_id:1,units_total:20,units_completed:0,units:[{id:1,track:'main',position:1,slug:'u1',title:'Welcome',subtitle:null,focus_skills:['reading'],estimated_minutes:30,is_free_preview:true,lesson_viewed:false,completed:false,unlocked:true,locked_reason:null,tasks:[]}],vocabulary:{current_unit_id:null,units_total:0,units_completed:0,units:[]}};
const step={code,unit_id:21,unit_title:'Paraphrase power',step:1,steps:6,next_code:'c2',purpose:'guided_practice',title:'Meet the words',display_code:'R-080',minutes:6,instructions:'Choose.',success_description:null,focus:null,passage:'LEARN FIRST: x\n\nBody',questions:[{id:'q1',prompt:'What?',options:[{value:'A',label:'A'},{value:'B',label:'B'}]}],result:null};
const marked={attempt_id:'a',score:1,total:1,submitted_at:'',answers:{q1:'A'},outcomes:[{id:'q1',correct:true,response_state:'answered',accepted_answers:['A']}],explanations:{q1:'A.'},unit_completed:false};

const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{RouterProvider,createBrowserRouter}from'./src/lib/router';import{ supabase }from'./services/supabaseClient';import Path from './src/pages/ielts/IeltsCoursePath';import Step from './src/pages/ielts/IeltsCourseVocabStep';const user={id:'00000000-0000-0000-0000-000000000001'};supabase.auth.getSession=async()=>({data:{session:{user}}});supabase.auth.getUser=async()=>({data:{user}});supabase.auth.onAuthStateChange=()=>({data:{subscription:{unsubscribe(){}}}});createRoot(document.getElementById('root')).render(<RouterProvider router={createBrowserRouter([{path:'/ielts/course',element:<Path/>},{path:'/ielts/vocabulary/:code',element:<Step/>}])}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},define:{'import.meta':JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-key'}})},logLevel:'silent'});

async function mount(path,habits){
 const bodies=[],errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'+path,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers});w.crypto.randomUUID=randomUUID;w.scrollTo=()=>{};
 let h=0;
 w.fetch=async(url,options)=>{const name=new URL(String(url)).pathname.split('/').pop();const body=options?.body?JSON.parse(options.body):null;bodies.push([name,body]);let result;
  if(name==='rpc_ielts_course_habit')result=habits[Math.min(h++,habits.length-1)];
  else if(name==='rpc_ielts_course_habit_settings')result=habit({daily_goal_xp:body.p_goal??20});
  else if(name==='rpc_ielts_course_state')result=state;
  else if(name==='rpc_ielts_course_vocab_task')result=step;
  else if(name==='rpc_ielts_course_vocab_submit')result=marked;
  else return new Promise(()=>{});
  return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
 };
 w.eval(bundle.outputFiles[0].text);
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,15));}throw Error('UI did not settle '+w.document.body.textContent.slice(0,300)+' '+errors.join(','));};
 return{dom,w,bodies,errors,wait};
}

test('the course map shows the streak, today\'s goal and freezes, and the sheet changes the daily goal',async()=>{
 const m=await mount('/ielts/course',[habit()]);try{
  await m.wait(()=>m.w.document.querySelector('.ih-bar:not(.ih-bar--loading)'));
  const bar=m.w.document.querySelector('.ih-bar');
  assert.match(bar.textContent,/4 day streak/);
  assert.match(bar.textContent,/One step today makes it 5 days in a row\./);
  assert.match(bar.textContent,/0\/20/);
  assert.ok(bar.classList.contains('is-waiting'),'an unlit streak gently pulses');
  assert.doesNotMatch(m.w.document.body.textContent,/lose|lost|disappoint/i,'no guilt wording');
  bar.click();
  await m.wait(()=>m.w.document.querySelector('.ih-sheet'));
  const sheet=m.w.document.querySelector('.ih-sheet');
  assert.match(sheet.textContent,/3 more days to reach 7/);
  assert.equal(sheet.querySelectorAll('.ih-day--frozen').length,1,'a frozen day shows as ice');
  [...sheet.querySelectorAll('.ih-goal-option')].find(b=>/Serious/.test(b.textContent)).click();
  await m.wait(()=>m.bodies.some(([n])=>n==='rpc_ielts_course_habit_settings'));
  assert.deepEqual(m.bodies.find(([n])=>n==='rpc_ielts_course_habit_settings')[1],{p_goal:30,p_reminders:null});
  await m.wait(()=>m.w.document.querySelector('.ih-goal-option.is-on')?.textContent.includes('Serious'));
  assert.ok(m.bodies.find(([n])=>n==='rpc_ielts_course_habit')[1].p_tz,'the browser time zone is sent');
  assert.deepEqual(m.errors,[]);
 }finally{m.dom.window.close();}
});

test('finishing a step shows the XP earned and celebrates the streak once a day',async()=>{
 const m=await mount('/ielts/vocabulary/'+code,[habit(),habit({today_done:true,streak:5,today_xp:15})]);try{
  m.w.localStorage.clear();
  await m.wait(()=>m.w.document.querySelector('.iv-option'));
  await new Promise(r=>setTimeout(r,60));
  assert.equal(m.w.document.querySelector('.ih-celebrate'),null,'no celebration before practising');
  m.w.document.querySelector('.iv-option').click();
  const check=()=>[...m.w.document.querySelectorAll('button')].find(b=>/Check my answers/.test(b.textContent));
  await m.wait(()=>check()&&!check().disabled);
  check().click();
  await m.wait(()=>m.w.document.querySelector('.iv-xp'));
  assert.match(m.w.document.querySelector('.iv-xp').textContent,/\+15 XP · 🔥 5/);
  await m.wait(()=>m.w.document.querySelector('.ih-celebrate'));
  assert.match(m.w.document.querySelector('.ih-celebrate').textContent,/Streak extended!/);
  assert.match(m.w.document.querySelector('.ih-celebrate').textContent,/5 days in a row/);
  assert.equal(JSON.parse(m.w.localStorage.getItem('bh_ielts_habit_seen_v1')).streakDay,'2026-11-07');
  [...m.w.document.querySelectorAll('.ih-celebrate button')].find(b=>/Continue/.test(b.textContent)).click();
  await m.wait(()=>!m.w.document.querySelector('.ih-celebrate'));
  assert.deepEqual(m.errors,[]);
 }finally{m.dom.window.close();}
});

test('XP comes only from real attempts on the server; reminders respect the evening window and an opt-out',()=>{
 const sql=fs.readFileSync('supabase/migrations/20261104090000_ielts_course_habit.sql','utf8');
 assert.match(sql,/from public\.ielts_reading_attempts a where a\.user_id = p_user/);
 assert.match(sql,/from private\.ielts_course_vocab_attempts a where a\.user_id = p_user/);
 assert.match(sql,/if v_streak % 7 = 0 and v_bank < 2 then v_bank := v_bank \+ 1/,'one freeze per 7 days, at most two');
 assert.match(sql,/v_local::time < time '19:00' or v_local::time >= time '20:00'/,'one evening window in the learner\'s own time zone');
 assert.match(sql,/not p\.ielts_course/,'learners can switch the reminder off');
 assert.match(sql,/'ielts-streak-' \|\| r\.user_id::text \|\| '-' \|\| v_local::date::text/,'at most one reminder a day');
 assert.doesNotMatch(sql,/insert into private\.ielts_course_vocab_attempts|rpc_ielts_course_award/,'the browser cannot award XP');
});
