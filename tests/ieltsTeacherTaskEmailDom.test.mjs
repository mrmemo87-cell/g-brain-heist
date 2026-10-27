import {JSDOM,VirtualConsole} from 'jsdom';import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
// Owner decision 2026-10-20: teachers choose whether students are emailed. New-task email is ticked by default; the
// email is sent only after the assignment is confirmed, and an email failure never undoes the assignment.
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from './src/pages/ielts/IeltsBatchPractice';window.root=createRoot(document.getElementById('root'));window.root.render(<Page batchId="batch" onClose={()=>{}}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},define:{'import.meta':JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test'}})},logLevel:'silent'});
const loop={batch:{id:'batch',name:'October',revision:4},policy:'p',gaps:[],students:[]};
async function run({untick=false,due=false,emailFails=false}={}){const calls=[],errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window;Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers});let assigned=false;
 w.fetch=async(url,opts)=>{const fn=String(url).split('/').pop(),args=JSON.parse(opts.body);calls.push({fn,args});
  if(fn==='rpc_ielts_batch_learning_loop')return new Response(JSON.stringify(loop));
  if(fn==='rpc_ielts_batch_assign_practice_after_screeners'){assigned=true;return new Response(JSON.stringify({assigned_count:1,allocation_ids:['alloc-1']}));}
  if(fn==='rpc_ielts_notify_students')return emailFails?new Response(JSON.stringify({message:'nope'}),{status:400}):new Response(JSON.stringify({keys:['ielts-task-assigned:targeted:alloc-1'],queued:1}));
  if(fn==='rpc_ielts_email_status')return new Response(JSON.stringify({total:1,waiting:0,sent:0,delivered:1,no_email:0,turned_off:0,not_delivered:0}));
  assert.equal(fn,'rpc_ielts_batch_practice_preview');
  return new Response(JSON.stringify({batch:{id:'batch',name:'October',revision:4},tasks:[{code:'practice',display_code:'R-001',title:'Evidence first',skill:'reading',purpose:'guided_practice',instructions:'i',success_description:'s'}],students:args.p_task?[{id:'ready',name:'Ready Student',class_name:'11A',eligible:true,source_ready:true,source_id:'attempt',screeners:{listening:true,reading:true,writing:true},prior_count:0,active:assigned}]:[]}));};
 const wait=async f=>{for(let i=0;i<150;i++){if(f())return;await new Promise(r=>setTimeout(r,15));}throw Error(w.document.body.textContent);};
 w.eval(bundle.outputFiles[0].text);
 try{
  await wait(()=>[...w.document.querySelectorAll('button')].some(b=>b.textContent==='Targeted practice'));[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Targeted practice').click();
  await wait(()=>w.document.querySelector('select'));const select=w.document.querySelector('select');select.value='practice';select.dispatchEvent(new w.Event('change',{bubbles:true}));
  await wait(()=>w.document.body.textContent.includes('Ready Student'));
  const text=()=>w.document.body.textContent;
  assert.match(text(),/Students see this message with the task/);
  const box=()=>[...w.document.querySelectorAll('label')].find(l=>l.textContent.startsWith('Email these students about this task'))?.querySelector('input');
  assert.equal(box().checked,true,'new-task email is ticked by default');
  assert.match(text(),/No scores or notes are included/);
  assert.ok(!/Remind them the day before/.test(text()),'no reminder option without a due date');
  if(due){const d=w.document.querySelector('input[type=datetime-local]');Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(d,'2099-01-10T09:00');d.dispatchEvent(new w.Event('input',{bubbles:true}));await wait(()=>/Remind them the day before/.test(text()));}
  if(untick){box().click();await wait(()=>!box().checked);}
  w.document.querySelector('input[type=checkbox]').click();
  const ta=w.document.querySelector('textarea');Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value').set.call(ta,'Practise locating exact evidence in the passage.');ta.dispatchEvent(new w.Event('input',{bubbles:true}));
  [...w.document.querySelectorAll('label')].find(l=>l.textContent.startsWith('I reviewed')).querySelector('input').click();
  await wait(()=>{const b=[...w.document.querySelectorAll('button')].find(b=>b.textContent.includes('Confirm & assign'));return b&&!b.disabled;});
  assert.equal(calls.filter(c=>c.fn==='rpc_ielts_notify_students').length,0,'nothing is emailed before confirming');
  [...w.document.querySelectorAll('button')].find(b=>b.textContent.includes('Confirm & assign')).click();
  await wait(()=>text().includes('Assigned now to 1 student.'));
  if(!untick)await wait(()=>emailFails?text().includes('email could not be queued'):text().includes('Email: delivered to 1.'));
  else await new Promise(r=>setTimeout(r,100));
  assert.deepEqual(errors,[]);
  return {calls,text:text()};
 }finally{w.root.unmount();dom.window.close();}}

test('new-task email is on by default and sent once, after the assignment is confirmed',async()=>{
 const {calls}=await run();const n=calls.filter(c=>c.fn==='rpc_ielts_notify_students');
 assert.equal(n.length,1);assert.deepEqual(n[0].args,{p_event:'targeted_assigned',p_refs:['alloc-1'],p_remind_due:false});
 assert.ok(calls.findIndex(c=>c.fn==='rpc_ielts_batch_assign_practice_after_screeners')<calls.findIndex(c=>c.fn==='rpc_ielts_notify_students'));});
test('a due date offers a reminder, ticked by default',async()=>{
 const {calls}=await run({due:true});assert.equal(calls.find(c=>c.fn==='rpc_ielts_notify_students').args.p_remind_due,true);});
test('unticking the box sends no email',async()=>{
 const {calls}=await run({untick:true});assert.equal(calls.filter(c=>c.fn==='rpc_ielts_notify_students').length,0);});
test('an email failure keeps the assignment and says so plainly',async()=>{
 const {text}=await run({emailFails:true});assert.match(text,/Assigned now to 1 student./);assert.match(text,/the email could not be queued\. Students will still see it/);});
