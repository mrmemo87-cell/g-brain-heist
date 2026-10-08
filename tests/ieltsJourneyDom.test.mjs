import { JSDOM, VirtualConsole } from 'jsdom';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const review = n => ({id:id(n),reviewer_name:'Test teacher',reviewed_at:'2026-10-08T09:00:00Z',next_step:'Explain how each example supports your opinion.',conditions_note:'',observations:{task_response:{status:'developing',comment:'Your ideas need clearer supporting examples.'}}});
const point = {student_name:'Test learner',school_managed:true,speaking_available:true,confidence:'low',readiness_available:false,band_estimate:null,
 catalog:['listening','reading','writing'].map((s,i)=>({title:s,code:`bh-${s}-screener-a`,exam_event_id:id(i+30),assignment_id:id(i+20),attempt_id:id(i+10),status:'completed',duration_minutes:20,starts_at:'2026-10-08T09:00:00Z'})),
 results:{listening:{attempt_id:id(10),raw_score:8,total:12,occurred_at:'2026-10-08T09:00:00Z',conditions_need_review:false},reading:{attempt_id:id(11),raw_score:6,total:12,occurred_at:'2026-10-08T09:00:00Z',conditions_need_review:false},writing:{attempt_id:id(12),word_count:250,occurred_at:'2026-10-08T09:00:00Z',conditions_need_review:false,review:review(50)},speaking:{attempt_id:id(40),status:'submitted',occurred_at:'2026-10-08T09:00:00Z',conditions_need_review:false,review:review(51)}}};
const journey={student_id:id(1),target_band:7,current_estimates:{reading:null,listening:null,writing:null,speaking:null,overall:null},confidence_level:'low',assigned_practice:[],completed_practice:[],teacher_feedback:[],recent_exam_mode_submissions:[],assigned_practice_summary:{total:0,assigned:0,in_progress:0,completed:0,overdue:0},recent_practice:[],weak_skill:null,next_recommendation:'Legacy recommendation'};
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {RouterProvider,createBrowserRouter} from './src/lib/router';import Journey from './src/pages/ielts/IeltsJourneyDashboard';createRoot(document.getElementById('root')).render(<RouterProvider router={createBrowserRouter([{path:'/ielts/journey',element:<Journey/>},{path:'/ielts/screener-result/:attemptId',element:<div>Saved objective result</div>},{path:'/ielts/writing-screener/reviews/:attemptId',element:<div>Saved essay feedback</div>},{path:'/ielts/speaking-pilot/:sessionId',element:<div>Saved interview</div>}])}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},define:{'import.meta':JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-key'}})},logLevel:'silent'});
async function mount(data=point,fail=false){
 const errors=[],calls=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/ielts/journey',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window;
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers});w.HTMLElement.prototype.scrollIntoView=function(){};
 w.fetch=async(url,options)=>{const fn=String(url).split('/').pop();calls.push(fn);let result;
  if(fn==='rpc_ielts_starting_point_summary'){if(fail){fail=false;return new Response(JSON.stringify({message:'failed'}),{status:500,headers:{'Content-Type':'application/json'}});}result=data;}
  else if(fn==='rpc_ielts_student_journey')result=journey;
  else throw Error('Unexpected request '+fn);
  return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
 };
 w.eval(bundle.outputFiles[0].text);
 const wait=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,15));}throw Error('UI did not settle: '+w.document.body.textContent+' errors '+errors.join(','));};
 const button=(root,label)=>Array.from(root.querySelectorAll('button')).find(b=>b.textContent.trim()===label);
 return{dom,w,errors,calls,wait,button};
}
test('completed four-skill journey renders saved records and explicit teacher feedback with no duplicate reads',async()=>{
 const {dom,w,errors,calls,wait,button}=await mount();await wait(()=>w.document.body.textContent.includes('Your starting point is in.'));
 const body=w.document.body.textContent;
 assert.match(body,/4 of 4 completed/);assert.match(body,/2 of 2 teacher reviews shared/);assert.match(body,/8 \/ 12/);assert.match(body,/6 \/ 12/);assert.match(body,/Shared by Test teacher/);assert.match(body,/cannot give a reliable overall band/);assert.doesNotMatch(body,/No reviewed feedback yet|No results available yet|Legacy recommendation/);
 assert.equal(calls.filter(c=>c==='rpc_ielts_starting_point_summary').length,1);
 button(w.document,'Read teacher feedback →').click();assert.equal(w.document.activeElement.id,'teacher-feedback-heading');
 const listening=w.document.querySelector('[aria-label="Listening screener"]');assert.match(listening.textContent,/Completed/);button(listening,'View saved result').click();await wait(()=>w.location.pathname===`/ielts/screener-result/${id(10)}`);
 assert.deepEqual(errors,[]);dom.window.close();
});
test('teacher feedback and Speaking cards open existing productive records',async()=>{
 for(const [skill,label,path] of [['Writing','View teacher feedback',`/ielts/writing-screener/reviews/${id(12)}`],['Speaking','View teacher feedback',`/ielts/speaking-pilot/${id(40)}`]]){
  const {dom,w,wait,button,errors}=await mount();await wait(()=>w.document.body.textContent.includes('Your starting point is in.'));
  const card=w.document.querySelector(`[aria-label="${skill} screener"]`);assert.match(card.textContent,/Feedback ready/);button(card,label).click();await wait(()=>w.location.pathname===path);assert.deepEqual(errors,[]);dom.window.close();
 }
});
test('pending review, failed summary and retry never claim a zero score or lose saved work',async()=>{
 const pending=structuredClone(point);pending.results.writing.review=null;pending.results.speaking.review=null;
 const {dom,w,wait,button,errors,calls}=await mount(pending,true);await wait(()=>w.document.body.textContent.includes('Try again'));assert.equal(w.document.querySelector('[aria-label="Listening screener"]'),null);
 button(w.document,'Try again').click();await wait(()=>w.document.body.textContent.includes('Your teacher review is next'));
 assert.match(w.document.querySelector('[aria-label="Writing screener"]').textContent,/Awaiting review/);assert.match(w.document.body.textContent,/Your feedback will appear here/);assert.equal(calls.filter(c=>c==='rpc_ielts_starting_point_summary').length,2);assert.deepEqual(errors,[]);dom.window.close();
});
