import {JSDOM,VirtualConsole} from 'jsdom';import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
// "Skill coverage" tab: every IELTS skill, practice vs fresh check vs measurement, pilot-only kept separate from released.
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from './src/pages/ielts/IeltsBatchPractice';window.root=createRoot(document.getElementById('root'));window.root.render(<Page batchId="batch" onClose={()=>{}}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},define:{'import.meta':JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test'}})},logLevel:'silent'});
const C=(released,pilot)=>({released,pilot});
const row=(o)=>({skill:'listening',ord:1,code:'x',name:'X',method:'fresh_questions',practice:C(0,0),checks:C(0,0),materials:0,baseline:{screener:true,mock:false},students_measured:0,...o});
const batch={id:'batch',name:'October',revision:4};
const coverage={batch,policy:'bh-ielts-skill-coverage-v1 (provisional)',members:9,rows:[
 row({code:'l-dates',name:'Dates and times',practice:C(3,0),checks:C(1,0),materials:5,baseline:{screener:true,mock:true},students_measured:4}),
 row({ord:2,code:'l-seq',name:'Sequencing',materials:1}),
 row({skill:'reading',code:'r-gist',name:'Identify gist',practice:C(0,1),checks:C(0,1),students_measured:3}),
 row({skill:'reading',ord:2,code:'r-struct',name:'Recognise text organisation',practice:C(0,1),checks:C(0,0),baseline:{screener:false,mock:false}}),
 row({skill:'writing',code:'grammar',name:'grammar',method:'teacher_ratings',practice:C(1,0),checks:C(1,0),materials:12,baseline:{screener:true,interview:false},students_measured:1,students_rated:3}),
 row({skill:'speaking',code:'pronunciation',name:'pronunciation',method:'teacher_ratings',practice:C(0,0),checks:C(0,0),materials:13,baseline:{screener:false,interview:true},students_measured:0,students_rated:1}),
]};
async function mount(){const calls=[],errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window;Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers});
 w.fetch=async(url,opts)=>{const fn=String(url).split('/').pop();calls.push({fn,args:JSON.parse(opts.body)});
  if(fn==='rpc_ielts_batch_learning_loop')return new Response(JSON.stringify({batch,policy:'p',gaps:[],students:[]}));
  if(fn==='rpc_ielts_batch_practice_preview')return new Response(JSON.stringify({batch,tasks:[],students:[]}));
  if(fn==='rpc_ielts_batch_skill_coverage')return new Response(JSON.stringify(coverage));
  errors.push('unexpected '+fn);return new Response('{}',{status:500});};
 w.eval(bundle.outputFiles[0].text);
 const wait=async f=>{for(let i=0;i<150;i++){if(f())return;await new Promise(r=>setTimeout(r,15));}throw Error('UI did not settle '+w.document.body.textContent);};
 const button=t=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===t);
 return{dom,w,calls,errors,wait,button};}
const rowText=(w,name)=>[...w.document.querySelectorAll('tbody tr')].find(tr=>tr.querySelector('th').textContent===name)?.textContent??'';
test('teachers see every skill with practice, fresh check, starting point and measurement',async()=>{const m=await mount();try{
 await m.wait(()=>m.button('Skill coverage'));m.button('Skill coverage').click();
 await m.wait(()=>m.w.document.querySelector('[aria-label="Skill coverage"] table'));
 assert.equal(m.calls.find(c=>c.fn==='rpc_ielts_batch_skill_coverage').args.p_batch,'batch');
 const s=m.w.document.querySelector('[aria-label="Coverage summary"]').textContent;
 assert.match(s,/3 of 6skills with practice and a fresh check/);assert.match(s,/2ready for every student/);assert.match(s,/1pilot only/);assert.match(s,/3gaps/);
 assert.match(rowText(m.w,'Dates and times'),/3 released tasks.*5 bank materials.*1 released check.*screener, mock tests.*4 of 9 students.*Ready for all students/);
 assert.match(rowText(m.w,'Sequencing'),/None.*Gap · no practice task/);
 assert.match(rowText(m.w,'Identify gist'),/1 pilot task.*1 pilot check.*Pilot only · awaiting approval/);
 assert.match(rowText(m.w,'Recognise text organisation'),/First fresh check.*Gap · no fresh check/);
 assert.match(rowText(m.w,'Grammar (range and accuracy)'),/12 writing tasks · 1 released targeted task.*1 compared · 3 rated.*Ready/);
 assert.match(rowText(m.w,'Pronunciation'),/13 speaking tasks.*speaking interview.*Gap · no fresh check/);
 const t=m.w.document.querySelector('[aria-label="Skill coverage"]').textContent;
 assert.match(t,/Practice never counts as measurement/);assert.match(t,/It is not a band/);assert.doesNotMatch(t,/improved/i);
 assert.equal(m.calls.some(c=>c.fn.includes('assign')),false);assert.deepEqual(m.errors,[]);
}finally{m.w.root.unmount();m.dom.window.close();}});
