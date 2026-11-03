import {JSDOM,VirtualConsole} from 'jsdom';
import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {randomUUID} from 'node:crypto';import fs from 'node:fs';

const code='bh-ielts-targeted-reading-r58-v1';
const vocabUnit=(position,extra={})=>({id:20+position,track:'vocabulary',position,slug:`v${position}`,title:`Vocab lesson ${position}`,subtitle:null,focus_skills:['vocabulary'],estimated_minutes:45,is_free_preview:position===1,lesson_viewed:false,completed:false,unlocked:position===1,locked_reason:position===1?null:'previous_unit',tasks:[{skill:'vocabulary',task_id:null,task_code:position===1?code:`c${position}`,position:1,completed:false,route:`/ielts/vocabulary/${position===1?code:'c'+position}`,title:'Meet the words'}],...extra});
const courseState={access:{full:false,reason:'prime_required'},current_unit_id:1,units_total:20,units_completed:0,
 units:[{id:1,track:'main',position:1,slug:'u1',title:'Welcome: how IELTS works',subtitle:null,focus_skills:['reading'],estimated_minutes:30,is_free_preview:true,lesson_viewed:false,completed:false,unlocked:true,locked_reason:null,tasks:[]}],
 vocabulary:{current_unit_id:21,units_total:6,units_completed:0,units:[1,2,3,4,5,6].map(p=>vocabUnit(p))}};
const step={code,unit_id:21,unit_title:'Paraphrase power',step:6,steps:6,next_code:null,purpose:'independent_check',title:'Mixed check',display_code:'R-085',minutes:8,
 instructions:'Read LEARN FIRST and the worked example. Then answer six new questions. Tell your teacher if anything interrupted you.',success_description:null,focus:null,
 passage:"LEARN FIRST: paraphrase decides the answer\n\nCheck how much, how sure and when.\n\nWORKED EXAMPLE\n'Most' is not 'all'.\n\n- - - - - - - - - - - - - - - - - - - -\n\nTHE PASSAGE: Repair cafés\n\nA. Repair cafés appear in many towns.\n\nB. Volunteers help residents.",
 questions:[{id:'q1',prompt:'All visitors are over fifty.',options:[{value:'TRUE',label:'TRUE'},{value:'FALSE',label:'FALSE'},{value:'NOT GIVEN',label:'NOT GIVEN'}]},{id:'q2',prompt:"Paragraph A: 'many' = ____",answer_format:'text'}],result:null};
const marked={attempt_id:'a1',score:1,total:2,submitted_at:'2026-11-03T00:00:00Z',answers:{q1:'FALSE',q2:'lots'},
 outcomes:[{id:'q1',correct:true,response_state:'answered',accepted_answers:['FALSE']},{id:'q2',correct:false,response_state:'answered',accepted_answers:['many']}],
 explanations:{q1:"FALSE. 'Predominantly' means most, not all.",q2:'many: "Repair cafés appear in many towns".'},unit_completed:true};

const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{RouterProvider,createBrowserRouter}from'./src/lib/router';import{ supabase }from'./services/supabaseClient';import Path from './src/pages/ielts/IeltsCoursePath';import Step from './src/pages/ielts/IeltsCourseVocabStep';const user={id:'00000000-0000-0000-0000-000000000001'};supabase.auth.getSession=async()=>({data:{session:{user}}});supabase.auth.getUser=async()=>({data:{user}});supabase.auth.onAuthStateChange=()=>({data:{subscription:{unsubscribe(){}}}});createRoot(document.getElementById('root')).render(<RouterProvider router={createBrowserRouter([{path:'/ielts/course',element:<Path/>},{path:'/ielts/course/:unitId',element:<h1>Unit page</h1>},{path:'/ielts/vocabulary/:code',element:<Step/>}])}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},define:{'import.meta':JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-key'}})},logLevel:'silent'});

async function mount(path){
 const calls=[],bodies=[],errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'+path,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers});w.crypto.randomUUID=randomUUID;w.scrollTo=()=>{};
 w.fetch=async(url,options)=>{const name=new URL(String(url)).pathname.split('/').pop();calls.push(name);bodies.push([name,options?.body?JSON.parse(options.body):null]);let result;
  if(name==='rpc_ielts_course_state')result=courseState;
  else if(name==='rpc_ielts_course_vocab_task')result=step;
  else if(name==='rpc_ielts_course_vocab_submit')result=marked;
  else if(name==='get_my_effective_entitlements')result={success:true,plan:'free',school_id:null,modules:{},programme_catalogue:{},entitlements:{}};
  else if(name==='users')result={role:'student',is_admin:false};
  else if(name==='school_admin_get_my_allocation_capabilities')result={success:true,can_administer:false};
  else if(name.includes('funnel'))result=null;
  else return new Promise(()=>{});
  return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
 };
 w.eval(bundle.outputFiles[0].text);
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,15));}throw Error('UI did not settle '+w.document.body.textContent.slice(0,400)+' '+errors.join(','));};
 return{dom,w,calls,bodies,errors,wait};
}

test('the Course tab offers a separate vocabulary path that unlocks in its own order',async()=>{
 const m=await mount('/ielts/course');try{
  await m.wait(()=>m.w.document.querySelector('[role="tablist"][aria-label="Course paths"]')&&m.w.document.body.textContent.includes('0/6 lessons'));
  const tabs=[...m.w.document.querySelectorAll('[role="tab"]')];
  assert.deepEqual(tabs.map(t=>t.querySelector('b').textContent),['Skills route','Vocabulary']);
  assert.match(tabs[1].textContent,/0\/6 lessons/);
  tabs[1].click();
  await m.wait(()=>m.w.document.body.textContent.includes('Word power')&&m.w.location.search==='?path=vocabulary');
  const stops=[...m.w.document.querySelectorAll('.ic-stop')];
  assert.equal(stops.length,6,'six vocabulary lessons on the path');
  assert.equal(stops[0].querySelector('.ic-medallion-num').textContent,'V1');
  assert.ok(stops[0].classList.contains('ic-stop--current'),'V1 is the current, open lesson');
  assert.ok(stops[1].classList.contains('ic-stop--locked'),'V2 waits for V1');
  assert.match(m.w.document.body.textContent,/V1 is free\. V2 to V6 are part of IELTS Prime\./);
  assert.doesNotMatch(m.w.document.body.textContent,/Welcome: how IELTS works/,'the skills route is not mixed into the vocabulary path');
  stops[1].querySelector('.ic-medallion').click();
  await m.wait(()=>m.w.document.querySelector('.ic-sheet'));
  assert.match(m.w.document.querySelector('.ic-sheet').textContent,/Finish V1 to open this lesson/);
  assert.deepEqual(m.errors,[]);
 }finally{m.dom.window.close();}
});

test('a vocabulary step teaches first, marks instantly, explains every answer and never claims a band',async()=>{
 const m=await mount('/ielts/vocabulary/'+code);try{
  await m.wait(()=>m.w.document.querySelector('.iv-learn'));
  const text=()=>m.w.document.body.textContent;
  assert.match(text(),/paraphrase decides the answer/);
  assert.match(text(),/The passage: Repair cafés/);
  assert.doesNotMatch(text(),/teacher/i,'self-paced learners are never told to contact a teacher');
  assert.match(text(),/step 6 of 6 · mixed check/);
  const submit=()=>[...m.w.document.querySelectorAll('button')].find(b=>/Check my answers/.test(b.textContent));
  assert.ok(submit().disabled,'nothing to check before answering');
  [...m.w.document.querySelectorAll('.iv-option')].find(b=>b.textContent==='FALSE').click();
  const input=m.w.document.querySelector('.iv-input');
  const setter=Object.getOwnPropertyDescriptor(m.w.HTMLInputElement.prototype,'value').set;setter.call(input,'lots');input.dispatchEvent(new m.w.Event('input',{bubbles:true}));
  await m.wait(()=>/2\/2/.test(submit().textContent));
  submit().click();
  await m.wait(()=>m.w.document.querySelector('.iv-score'));
  const sent=m.bodies.find(([n])=>n==='rpc_ielts_course_vocab_submit')[1];
  assert.deepEqual(sent,{p_code:code,p_answers:{q1:'FALSE',q2:'lots'}});
  assert.equal(m.w.document.querySelector('.iv-score-num').textContent,'1/2');
  assert.match(text(),/practice score, not an IELTS band/);
  assert.match(text(),/Predominantly' means most, not all/);
  assert.match(text(),/Answer: many/);
  assert.ok(m.w.document.querySelector('.iv-q--wrong'),'the wrong answer is marked');
  const finish=[...m.w.document.querySelectorAll('button')].find(b=>/Lesson complete/.test(b.textContent));
  finish.click();
  await m.wait(()=>m.w.location.pathname==='/ielts/course/21');
  assert.deepEqual(m.errors,[]);
 }finally{m.dom.window.close();}
});

test('the vocabulary path is server-gated, separate from teacher allocations and tied to the released versions',()=>{
 const sql=fs.readFileSync('supabase/migrations/20261103020000_ielts_course_vocabulary_path.sql','utf8');
 const seed=fs.readFileSync('supabase/migrations/20261103021000_ielts_course_vocabulary_units.sql','utf8');
 assert.match(sql,/unique \(track, position\)/,'order is per path');
 assert.match(sql,/private\.ielts_course_current_position\(v_actor, v_track\)/,'unlocking follows the unit\'s own path');
 assert.match(sql,/ielts_learning_publicly_released\(p_code\)[\s\S]*ielts_practice_material_allowed\('targeted', p_code\)/,'every serve re-checks release and originality');
 assert.doesNotMatch(sql,/insert into private\.ielts_learning_allocations/,'course attempts never become teacher allocations');
 assert.match(sql,/q - 'accepted_answers' - 'taxonomy_node_id' - 'supporting_node_id'/,'answer keys are not served before submitting');
 assert.match(sql,/'units', v_main->'units'/,'the main path keeps its original shape');
 assert.match(seed,/'bh-ielts-targeted-reading-r' \|\| \(s\.first_task \+ step - 1\) \|\| '-v1'/);
 assert.equal((seed.match(/^\(\d, 'vocab-/gm)||[]).length,6,'six vocabulary units');
 assert.match(seed,/\(1, 'vocab-paraphrase-power'[^\n]*, true, \$j\$/,'V1 is the free lesson');
 assert.equal((seed.match(/, false, \$j\$/g)||[]).length,5,'V2 to V6 need full access');
});
