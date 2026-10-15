import { JSDOM, VirtualConsole } from 'jsdom';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {RouterProvider,createBrowserRouter} from './src/lib/router';import Exam from './src/pages/ielts/IeltsExamMode';window.root=createRoot(document.getElementById('root'));window.root.render(<RouterProvider router={createBrowserRouter([{path:'/exam/:examEventId',element:<Exam/>}])}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},define:{'import.meta':JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-key'}})},logLevel:'silent'});
async function mount(width, saved={}) {
 const errors=[],calls=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://app.test/exam/event',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 w.HTMLMediaElement.prototype.pause=function(){};
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,innerWidth:width});w.HTMLElement.prototype.scrollIntoView=function(){};
 const payload={assessment_mode:'screener',passages:[1,2].map(n=>({id:`p${n}`,title:`Reading passage ${n}`,paragraphs:[{label:'A',text:'Original synthetic classroom text for testing navigation.'}]})),questions:Array.from({length:12},(_,i)=>({id:`q${i+1}`,prompt:`Fixture question ${i+1}`,type:'short_answer',passage_id:i<6?'p1':'p2'}))};
 const who={allowed:true,reason:'ok',assignment_id:'assignment',attempt_id:'attempt',status:'in_progress',attempt_status:'in_progress',event_status:'live',starts_at:new Date(Date.now()-10000).toISOString(),ends_at:new Date(Date.now()+1200000).toISOString(),server_now:new Date().toISOString(),remaining_seconds:1200,drafts:[{section:'reading',payload:saved,draft_version:1}],form_public_payload:{reading_payload:payload}};
 w.fetch=async(url,opts)=>{const fn=String(url).split('/').pop(),args=JSON.parse(opts.body??'{}');calls.push({fn,args});let result;
 if(fn==='rpc_ielts_exam_whoami')result=who;
 else if(fn==='rpc_ielts_exam_status')result=who;
 else if(fn==='rpc_ielts_start_attempt')result={...who,attempt_id:'attempt',lock_token:'lock'};
 else if(fn==='rpc_ielts_autosave_attempt')result={draft_version:args.p_draft_version,server_now:new Date().toISOString()};
 else if(fn==='rpc_ielts_submit_attempt')result={attempt_id:'attempt',status:'submitted',submitted_at:new Date().toISOString()};
 else if(fn==='rpc_ielts_writing_screener_result'||fn==='rpc_ielts_diagnostic_result')result=null;
 else if(fn==='rpc_ielts_log_incident')result={incident_id:'incident'};
 else throw Error('Unexpected request '+fn);
 return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});};
 w.eval(bundle.outputFiles[0].text);
 const wait=async f=>{for(let i=0;i<150;i++){if(f())return;await new Promise(r=>setTimeout(r,10));}throw Error('UI did not settle: '+w.document.body.textContent+' '+errors.join(','));};
 const button=(label)=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
 await wait(()=>button('Resume screener'));button('Resume screener').click();await wait(()=>w.document.querySelector('#reading-q1'));
 return{w,calls,wait,button,errors,close(){w.root.unmount();w.close();}};
}
for(const width of [375,768,1440])test(`Reading at ${width}px shows both passages, keeps answers and confirms partial submission`,async()=>{
 const saved=Object.fromEntries(Array.from({length:6},(_,i)=>[`q${i+1}`,'saved answer']));const ui=await mount(width,saved);const {w,wait,button,calls}=ui;
 try {
  assert.match(w.document.body.textContent,/Passage 1 of 2 · 6 of 12/);
  assert.equal(w.document.querySelectorAll('#reading-questions input').length,6);
  button('Continue to Passage 2').click();await wait(()=>w.document.querySelector('#reading-q7'));
  await wait(()=>w.document.activeElement.id==='reading-passage-title');
  assert.equal(w.localStorage.getItem('ielts_reading_passage_attempt'),'p2');
  button('Submit screener').click();await wait(()=>w.document.querySelector('[role=dialog]'));
  assert.match(w.document.querySelector('[role=dialog]').textContent,/6 questions are unanswered/);
  assert.equal(calls.filter(c=>c.fn==='rpc_ielts_submit_attempt').length,0);
  button('Cancel').click();await wait(()=>!w.document.querySelector('[role=dialog]'));
  button('Passage 1 · 6/6 answered').click();await wait(()=>w.document.querySelector('#reading-q1'));
  assert.equal(w.document.querySelector('#reading-q1').value,'saved answer');
  button('Submit screener').click();await wait(()=>w.document.querySelector('[role=dialog]'));
  button('Submit incomplete work').click();await wait(()=>calls.some(c=>c.fn==='rpc_ielts_submit_attempt'));
  const submits=calls.filter(c=>c.fn==='rpc_ielts_submit_attempt');assert.equal(submits.length,1);assert.deepEqual(submits[0].args.p_payload.reading,saved);
  assert.deepEqual(ui.errors,[]);
 } finally {ui.close();}
});
test('fully answered Reading submits without an incomplete warning, including rapid repeated clicks',async()=>{
 const saved=Object.fromEntries(Array.from({length:12},(_,i)=>[`q${i+1}`,'answer']));const ui=await mount(375,saved);
 try {const button=ui.button('Submit screener');button.click();button.click();await ui.wait(()=>ui.calls.some(c=>c.fn==='rpc_ielts_submit_attempt'));
 assert.equal(ui.w.document.querySelector('[role=dialog]'),null);assert.equal(ui.calls.filter(c=>c.fn==='rpc_ielts_submit_attempt').length,1);
 }finally{ui.close();}
});
test('empty submission requires explicit acknowledgement and Escape returns to the saved work',async()=>{
 const ui=await mount(375);
 try{ui.button('Submit screener').click();await ui.wait(()=>ui.w.document.querySelector('[role=dialog]'));
 assert.match(ui.w.document.querySelector('[role=dialog]').textContent,/12 questions are unanswered/);
 ui.w.document.dispatchEvent(new ui.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await ui.wait(()=>!ui.w.document.querySelector('[role=dialog]'));
 assert.equal(ui.calls.filter(c=>c.fn==='rpc_ielts_submit_attempt').length,0);assert.ok(ui.w.document.querySelector('#reading-q1'));
 }finally{ui.close();}
});
