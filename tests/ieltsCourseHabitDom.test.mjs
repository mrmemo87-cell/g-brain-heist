import {JSDOM,VirtualConsole} from 'jsdom';
import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {randomUUID} from 'node:crypto';import fs from 'node:fs';

const week=(xps)=>xps.map((xp,i)=>({day:`2026-11-0${i+1}`,xp,frozen:i===2,today:i===6}));
const habit=(o={})=>({streak:4,today_done:false,longest_streak:9,freezes:1,today:'2026-11-07',today_xp:0,daily_goal_xp:20,goal_done:false,total_xp:240,next_milestone:7,week:week([15,20,0,10,15,25,0]),time_zone:'Asia/Bishkek',reminders:true,...o});
const code='bh-ielts-targeted-reading-r58-v1';
const state={access:{full:true,reason:'prime'},current_unit_id:1,units_total:20,units_completed:0,units:[{id:1,track:'main',position:1,slug:'u1',title:'Welcome',subtitle:null,focus_skills:['reading'],estimated_minutes:30,is_free_preview:true,lesson_viewed:false,completed:false,unlocked:true,locked_reason:null,tasks:[]}],vocabulary:{current_unit_id:null,units_total:0,units_completed:0,units:[]}};
const step={code,unit_id:21,unit_title:'Paraphrase power',step:1,steps:6,next_code:'c2',purpose:'guided_practice',title:'Meet the words',display_code:'R-080',minutes:6,instructions:'Choose.',success_description:null,focus:null,passage:'LEARN FIRST: x\n\nBody',questions:[{id:'q1',prompt:'What?',options:[{value:'A',label:'A'},{value:'B',label:'B'}]}],result:null};
const marked={attempt_id:'a',score:1,total:1,submitted_at:'',answers:{q1:'A'},outcomes:[{id:'q1',correct:true,response_state:'answered',accepted_answers:['A']}],explanations:{q1:'A.'},unit_completed:false};

const leagueData={week_start:'2026-11-02',ends_at:new Date(Date.now()+30*3600000).toISOString(),tier:2,tier_name:'Silver',joined:true,my_xp:140,size:12,promote_count:5,demote_count:5,
 members:Array.from({length:12},(_,i)=>({rank:i+1,name:i===2?'Gulzada K.':`Learner ${String.fromCharCode(65+i)}.`,xp:200-i*15,me:i===2,hue:i*30})),
 last_week:{week_start:'2026-10-26',tier:1,tier_name:'Bronze',rank:2,xp:210,result:'promoted',new_tier:2,new_tier_name:'Silver'}};
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{RouterProvider,createBrowserRouter}from'./src/lib/router';import{ supabase }from'./services/supabaseClient';import Path from './src/pages/ielts/IeltsCoursePath';import Step from './src/pages/ielts/IeltsCourseVocabStep';import League from './src/pages/ielts/IeltsCourseLeague';const user={id:'00000000-0000-0000-0000-000000000001'};supabase.auth.getSession=async()=>({data:{session:{user}}});supabase.auth.getUser=async()=>({data:{user}});supabase.auth.onAuthStateChange=()=>({data:{subscription:{unsubscribe(){}}}});createRoot(document.getElementById('root')).render(<RouterProvider router={createBrowserRouter([{path:'/ielts/course',element:<Path/>},{path:'/ielts/vocabulary/:code',element:<Step/>},{path:'/ielts/league',element:<League/>}])}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},define:{'import.meta':JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-key'}})},logLevel:'silent'});

async function mount(path,habits){
 const bodies=[],errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'+path,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers});w.crypto.randomUUID=randomUUID;w.scrollTo=()=>{};
 let h=0;
 w.fetch=async(url,options)=>{const name=new URL(String(url)).pathname.split('/').pop();const body=options?.body?JSON.parse(options.body):null;bodies.push([name,body]);let result;
  if(name==='rpc_ielts_course_habit')result=habits[Math.min(h++,habits.length-1)];
  else if(name==='rpc_ielts_course_habit_settings')result=habit({daily_goal_xp:body.p_goal??20});
  else if(name==='rpc_ielts_course_state')result=state;
  else if(name==='rpc_ielts_league')result=leagueData;
  else if(name==='rpc_ielts_course_exam_profile')result=habit({exam:{module:body.p_module,date:body.p_exam_date,days_left:43,target:body.p_target,onboarded:true}});
  else if(name==='get_my_effective_entitlements')result={success:true,plan:'free',school_id:null,modules:{},programme_catalogue:{},entitlements:{}};
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

test('the weekly league shows the ladder, both zones, the learner and last week\'s promotion once',async()=>{
 const m=await mount('/ielts/league',[habit()]);try{
  m.w.localStorage.clear();
  await m.wait(()=>m.w.document.querySelector('.lg-result'));
  assert.match(m.w.document.querySelector('.lg-result').textContent,/Promoted to Silver!/);
  assert.match(m.w.document.querySelector('.lg-result').textContent,/#2 with 210 XP/);
  m.w.document.querySelector('.lg-result button').click();
  await m.wait(()=>!m.w.document.querySelector('.lg-result'));
  assert.equal(m.w.localStorage.getItem('bh_ielts_league_result_seen_v1'),'2026-10-26','shown once per week');
  assert.equal(m.w.document.querySelectorAll('.lg-row').length,12);
  assert.match(m.w.document.querySelector('.lg-row.is-me').textContent,/Gulzada K\. \(you\)/);
  assert.match(m.w.document.querySelector('.lg-zone--up').textContent,/Promotion zone/);
  assert.match(m.w.document.querySelector('.lg-zone--down').textContent,/Demotion zone/);
  assert.equal(m.w.document.querySelectorAll('.lg-row.is-down').length,5);
  assert.match(m.w.document.querySelector('.lg-hero').textContent,/Top 5 move up to Gold/);
  assert.equal(m.w.document.querySelectorAll('.lg-rung').length,8);
  assert.match(m.w.document.body.textContent,/first name and initial/);
  assert.deepEqual(m.errors,[]);
 }finally{m.dom.window.close();}
});

test('leagues show only first name + initial and settle at most once; badges are derived from real activity',()=>{
 const sql=fs.readFileSync('supabase/migrations/20261104110000_ielts_course_leagues_badges.sql','utf8');
 assert.match(sql,/upper\(left\(parts\[cardinality\(parts\)\], 1\)\) \|\| '\.'/,'last name is reduced to an initial');
 assert.doesNotMatch(sql.slice(sql.indexOf('rpc_ielts_league()')),/avatar_url|email|username|school_id/,'no photos, emails, usernames or schools on the board');
 assert.match(sql,/settled_at is null and week_start < v_week for update skip locked/,'each group settles once');
 assert.match(sql,/m\.rank <= 5 and m\.xp > 0 and g\.tier < 8 then 'promoted'/);
 assert.match(sql,/v_n >= 10 and m\.rank > v_n - 5 and g\.tier > 1 then 'demoted'/);
 assert.match(sql,/< 20/,'groups hold at most 20 learners');
 assert.match(sql,/v_streak in \(14, 30, 100, 365\) and v_bank < 3/,'milestone streaks give a bonus freeze, not free access');
});

test('a new independent learner gets a three-question welcome; the plan becomes a countdown on the map',async()=>{
 const m=await mount('/ielts/course',[habit({exam:{module:null,date:null,days_left:null,target:null,onboarded:false}})]);try{
  m.w.localStorage.setItem('bh_ielts_first_touch',JSON.stringify({utm_source:'instagram',utm_campaign:'nov'}));
  await m.wait(()=>m.w.document.querySelector('.ep-welcome'));
  assert.match(m.w.document.querySelector('.ep-welcome').textContent,/Welcome! I'm Blaze\./);
  [...m.w.document.querySelectorAll('.ep-welcome button')][0].click();
  await m.wait(()=>m.w.document.querySelector('.ep-option'));
  [...m.w.document.querySelectorAll('.ep-option')].find(b=>/Academic/.test(b.textContent)).click();
  [...m.w.document.querySelectorAll('.ep-target')].find(b=>b.textContent==='6.5').click();
  const save=()=>[...m.w.document.querySelectorAll('.ep-sheet button')].find(b=>/Start my course/.test(b.textContent));
  await m.wait(()=>save()&&m.w.document.querySelector('.ep-target.is-on'));
  save().click();
  await m.wait(()=>m.bodies.some(([n])=>n==='rpc_ielts_course_exam_profile'));
  const sent=m.bodies.find(([n])=>n==='rpc_ielts_course_exam_profile')[1];
  assert.equal(sent.p_module,'academic');assert.equal(sent.p_target,6.5);assert.equal(sent.p_exam_date,null);
  assert.deepEqual(sent.p_acquisition,{utm_source:'instagram',utm_campaign:'nov'},'the ad campaign is recorded once');
  await m.wait(()=>m.w.document.querySelector('.ep-countdown'));
  assert.match(m.w.document.querySelector('.ep-countdown').textContent,/43 days to your test/);
  assert.match(m.w.document.querySelector('.ep-countdown').textContent,/Academic · goal 6\.5/);
  assert.equal(m.w.document.querySelector('.isn-back'),null,'independent learners are not sent back into the game');
  assert.deepEqual(m.errors,[]);
 }finally{m.dom.window.close();}
});

test('the public landing page is Russian first with English, honest about results and carries campaign tags',()=>{
 const html=fs.readFileSync('public/ielts-prep.html','utf8');
 const vercel=JSON.parse(fs.readFileSync('vercel.json','utf8'));
 assert.ok(vercel.rewrites.findIndex(r=>r.source==='/ielts-prep')<vercel.rewrites.findIndex(r=>r.source==='/(.*)'),'the page is served before the app catch-all');
 assert.match(html,/<html lang="ru">/);
 assert.match(html,/<body data-lang="ru">/);
 assert.match(html,/data-set-lang="en"/);
 assert.match(html,/og:image" content="https:\/\/brainsheist\.com\/ielts\/og-ielts-prep\.jpg"/);
 assert.ok(fs.existsSync('public/ielts/og-ielts-prep.jpg'));
 assert.match(html,/не официальный результат IELTS/);
 assert.match(html,/not an official IELTS result/);
 assert.match(html,/не связан с ними/,'trademark disclaimer');
 assert.match(html,/bh_ielts_first_touch/);
 assert.doesNotMatch(html,/гарантир|guarantee/i,'no score guarantees');
 for(const price of ['$14.50','$34.50','$99.50']) assert.ok(html.includes(price),'prices match the in-app Prime plans');
});
