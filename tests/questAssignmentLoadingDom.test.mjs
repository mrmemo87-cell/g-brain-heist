import { JSDOM, VirtualConsole } from 'jsdom';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const service = readFileSync('services/gameService.ts','utf8');
const names = [...service.matchAll(/export\s+(?:async\s+)?(?:const|function|class|enum)\s+(\w+)/g)].map(m=>m[1]);
const bundle = await build({
 stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Quest from './components/QuestView';window.root=createRoot(document.getElementById('root'));window.show=(assignment)=>window.root.render(<Quest onComplete={()=>{}} onGrantReward={()=>{}} initialAssignment={assignment} currentProfile={{id:'student',level:2}}/>);`,loader:'tsx',resolveDir:process.cwd()},
 bundle:true,format:'iife',write:false,loader:{'.css':'empty'},
 define:{'import.meta':JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test'}})},
 plugins:[{name:'mock-game-service',setup(b){b.onLoad({filter:/services\/gameService\.ts$/},()=>({contents:names.map(name=>`export const ${name}=(...args)=>window.gameService('${name}',args);`).join('\n'),loader:'js'}));}}],logLevel:'silent',
});
const a={assignment_id:'assignment-a',subject_name:'ESL',topic_name:'Tense',title:'Classroom assessment',teacher_username:'Teacher',assigned_at:new Date().toISOString(),questions:[],question_count:2};
const q={id:'question-1',question_text:'Select the answer',question_type:'multiple_choice',options:['A','B'],correct_answer:'A',points:10};
async function harness() {
 const errors=[];const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://app.test',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
 const w=dom.window;Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers});
 w.fetch=async()=>{throw Error("Unexpected network request in assignment test");};
 w.HTMLMediaElement.prototype.play=()=>Promise.resolve();w.HTMLMediaElement.prototype.pause=()=>{};
 w.HTMLElement.prototype.scrollIntoView=()=>{};
 const calls=[];let fail=true;let detailDelay;
 w.gameService=async(name,args)=>{
  calls.push({name,args});
  if(name==='get_student_assignment_summaries'){if(fail)throw Error('Database unavailable');return [a];}
  if(name==='get_student_assignment_detail'){if(detailDelay)return detailDelay;return {...a,questions:[q,{...q,id:'question-2'}],student_status:'in_progress',resume_answered_count:1,answered_question_ids:['question-1'],resume_score:10};}
  if(name==='mcq_subjects_list')return [];
  if(name==='whoami')return {id:'student',level:2};
  return [];
 };
 w.eval(bundle.outputFiles[0].text);w.show(a);
 const wait=async(predicate)=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('UI did not settle: '+w.document.body.textContent);};
 return {w,dom,calls,errors,wait,setFail:v=>{fail=v;},delay:p=>{detailDelay=p;}};
}
test('failed assignment loads retain assignment context; retry downloads selected detail and resumes saved progress',async()=>{
 const h=await harness();
 try {
  await h.wait(()=>h.w.document.body.textContent.includes('Assignment temporarily unavailable'));
  assert.equal(h.calls.some(c=>c.name==='mcq_subjects_list'),false);
  h.setFail(false);
  [...h.w.document.querySelectorAll('button')].find(b=>b.textContent==='Retry assignment').click();
  await h.wait(()=>h.w.document.body.textContent.includes('1 of 2 answered'));
  assert.equal(h.calls.filter(c=>c.name==='get_student_assignment_detail').length,1);
  assert.equal(h.calls.find(c=>c.name==='get_student_assignment_detail').args[0],a.assignment_id);
  assert.equal(h.calls.some(c=>c.name==='get_student_pending_assignments'),false);
  assert.deepEqual(h.errors,[]);
 } finally {h.w.root.unmount();h.dom.window.close();}
});
test('unmount cancels selected detail and stale replies cannot restore the old assignment',async()=>{
 const h=await harness();
 try {
  await h.wait(()=>h.w.document.body.textContent.includes('Assignment temporarily unavailable'));
  h.setFail(false);let resolve;h.delay(new Promise(r=>{resolve=r;}));
  [...h.w.document.querySelectorAll('button')].find(b=>b.textContent==='Retry assignment').click();
  await h.wait(()=>h.calls.some(c=>c.name==='get_student_assignment_detail'));
  const signal=h.calls.find(c=>c.name==='get_student_assignment_detail').args[1];
  h.w.root.unmount();assert.equal(signal.aborted,true);
  resolve({...a,questions:[q]});await new Promise(r=>setTimeout(r,20));
  assert.equal(h.w.document.getElementById('root').textContent,'');assert.deepEqual(h.errors,[]);
 } finally {h.dom.window.close();}
});
