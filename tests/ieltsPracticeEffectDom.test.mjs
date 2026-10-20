import {JSDOM,VirtualConsole} from 'jsdom';import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
// "Did it work?" tab: honest small numbers, fresh-check actions, no improvement claims from practice.
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from './src/pages/ielts/IeltsBatchPractice';window.root=createRoot(document.getElementById('root'));window.root.render(<Page batchId="batch" onClose={()=>{}}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},define:{'import.meta':JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test'}})},logLevel:'silent'});
const ev=(o,c,at=null)=>({opportunities:o,correct:c,at});
const row=(over)=>({student_id:'s1',student:'Aigul',node_id:'n1',code:'eng.reading.main-ideas.summary',skill_name:'Summarise and paraphrase',first_practice_at:'2026-10-10T05:00:00Z',last_practice_at:'2026-10-12T05:00:00Z',practice_count:2,practice:['R-013 · Bank set'],verdict:'waiting_for_check',before:ev(4,1,'2026-10-01'),after:ev(0,0),fresh_checks:[],pending_checks:[],...over});
const effect={batch:{id:'batch',name:'October',revision:4},policy:'bh-practice-effect-v1 (provisional)',members:9,rows:[
 row({fresh_checks:[{code:'check-1',display_code:'R-020',title:'Fresh summary check'}]}),
 row({node_id:'n2',skill_name:'Claims and evidence',code:'eng.reading.argument-evaluation.claims-evidence',verdict:'higher',after:ev(6,5,'2026-10-15')}),
 row({student_id:'s2',student:'Gulzada',node_id:'n3',skill_name:'Sequencing',code:'bh-ielts-listening-v1-sequencing'}),
 row({student_id:'s2',student:'Gulzada',node_id:'n4',skill_name:'Dates and times',code:'bh-ielts-listening-v1-dates-times',pending_checks:[{code:'l2',display_code:'L-002',title:'Museum'}]}),
 row({student_id:'s2',student:'Gulzada',node_id:'n5',skill_name:'State and qualify a position',code:'eng.writing.argumentation.claim-position',verdict:'teacher_judged',before:ev(0,0)}),
]};
const R=(scale,value,source,at)=>({at,task:source+at,scale,value,source});
const productive={batch:effect.batch,policy:'bh-productive-effect-v1 (provisional)',rows:[
 {student_id:'s2',student:'Gulzada',skill:'writing',criterion:'task_response',verdict:'different_scales',pieces:2,first:R('status','developing','screener','2026-10-06'),last:null},
 {student_id:'s2',student:'Gulzada',skill:'writing',criterion:'grammar',verdict:'higher',pieces:2,first:R('band','5','practice','2026-10-10'),last:R('band','6','practice','2026-10-18')},
 {student_id:'s2',student:'Gulzada',skill:'speaking',criterion:'pronunciation',verdict:'waiting_for_fresh_task',pieces:1,first:R('status','observed','interview','2026-10-07'),last:null}]};
const preview={batch:{id:'batch',name:'October',revision:4},tasks:[{code:'check-1',display_code:'R-020',title:'Fresh summary check',skill:'reading',purpose:'independent_check',instructions:'Read.',success_description:'Answer.'}],students:[{id:'s1',name:'Aigul',class_name:'11A',eligible:true,source_ready:true,active:false,prior_count:0,source_id:null},{id:'s2',name:'Gulzada',class_name:'11A',eligible:true,source_ready:true,active:false,prior_count:0,source_id:null}]};
async function mount(){const calls=[],errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window;Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers});
 w.fetch=async(url,opts)=>{const fn=String(url).split('/').pop();calls.push({fn,args:JSON.parse(opts.body)});
  if(fn==='rpc_ielts_batch_learning_loop')return new Response(JSON.stringify({batch:effect.batch,policy:'p',gaps:[],students:[]}));
  if(fn==='rpc_ielts_batch_practice_effect')return new Response(JSON.stringify(effect));
  if(fn==='rpc_ielts_batch_practice_preview')return new Response(JSON.stringify(preview));
  if(fn==='rpc_ielts_batch_productive_effect')return new Response(JSON.stringify(productive));
  errors.push('unexpected '+fn);return new Response('{}',{status:500});};
 w.eval(bundle.outputFiles[0].text);
 const wait=async f=>{for(let i=0;i<150;i++){if(f())return;await new Promise(r=>setTimeout(r,15));}throw Error('UI did not settle '+w.document.body.textContent);};
 const button=t=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===t);
 return{dom,w,calls,errors,wait,button};}
test('teachers see before vs fresh check per student and skill, with honest small numbers',async()=>{const m=await mount();try{
 await m.wait(()=>m.button('Did it work?'));m.button('Did it work?').click();
 await m.wait(()=>m.w.document.querySelector('.ix-effect'));const t=m.w.document.querySelector('.ix-effect').textContent;
 assert.match(t,/Too early to judge the practice: 1 fresh check so far/);
 assert.match(t,/Higher on the fresh check/);assert.match(t,/Waiting for a fresh check/);assert.match(t,/Your judgement/);
 assert.match(t,/Before practice:\s*1\/4 correct/);assert.match(t,/Fresh check after:\s*5\/6 correct/);
 assert.match(t,/Fresh check L-002 is assigned and not done yet/);assert.match(t,/No fresh check exists for this skill yet/);
 assert.match(t,/does not prove the practice caused it/);
 await m.wait(()=>m.w.document.querySelector('[aria-label="Writing and Speaking change"] table'));
 const p=m.w.document.querySelector('[aria-label="Writing and Speaking change"]').textContent;
 assert.match(p,/Grammar \(range and accuracy\)band 5 \(practice/);assert.match(p,/Higher on a fresh task/);assert.match(p,/Needs one more band-rated piece/);assert.match(p,/Waiting for a fresh rated task/);
 assert.match(p,/1 criterion comparison so far/);assert.match(p,/never compared with bands/);assert.doesNotMatch(t,/improved|did not improve|band/i);
 assert.equal(m.w.document.querySelector('[aria-label="Aigul"]').querySelectorAll('li').length,2);
 m.button('Prepare fresh check R-020').click();
 await m.wait(()=>m.w.document.querySelector('textarea')?.value.includes('Fresh check after practice on Summarise and paraphrase'));
 const preview=m.calls.filter(c=>c.fn==='rpc_ielts_batch_practice_preview').at(-1);assert.equal(preview.args.p_task,'check-1');
 await m.wait(()=>m.w.document.querySelectorAll('input[type=checkbox]:checked:not(.ix-email-options input)').length===1);
 assert.equal(m.calls.some(c=>c.fn.includes('assign')),false,'preparing never assigns');assert.deepEqual(m.errors,[]);
}finally{m.w.root.unmount();m.dom.window.close();}});
