import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
const windows=[];test.after(()=>windows.forEach(w=>w.close()));
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {RouterProvider,createBrowserRouter} from './src/lib/router';import Exam from './src/pages/ielts/IeltsExamMode';createRoot(document.getElementById('root')).render(<RouterProvider router={createBrowserRouter([{path:'/exam/:examEventId',element:<Exam/>}])}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},define:{'import.meta':JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-key'}})},logLevel:'silent'});
async function mount(width,draft=null,fast=false,serverDraft=null){
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/exam/event',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;windows.push(w);w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.play=async function(){};
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,innerWidth:width});
 let online=true,failSave=false,holdStatus=false,statusReply,holdSave=false,saveReply;const calls=[];
 if(fast){const nativeTimeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>nativeTimeout(fn,ms>=8000?60:ms,...args);}
Object.defineProperty(w.navigator,'onLine',{get:()=>online});
 const end=new Date(Date.now()+1200000).toISOString();
 const who={allowed:true,reason:'ok',assignment_id:'assignment',attempt_id:'attempt',status:'in_progress',attempt_status:'in_progress',event_status:'live',starts_at:new Date(Date.now()-10000).toISOString(),ends_at:end,server_now:new Date().toISOString(),remaining_seconds:1200,drafts:[],form_public_payload:{writing_payload:{assessment_mode:'screener',task_type:'academic_task2',minimum_words:250,questions:[{id:'essay',type:'essay',prompt:'Discuss both views and give your opinion.'}]}}};
 if(serverDraft)who.drafts=[{section:'writing',payload:serverDraft,draft_version:3}];
 if(draft)w.localStorage.setItem('ielts_exam_local_draft_attempt',draft);
 w.fetch=async(url,opts)=>{const fn=String(url).split('/').pop(),args=JSON.parse(opts.body??'{}');calls.push({fn,args});let result;
 if(fn==='rpc_ielts_exam_whoami')result=who;
 else if(fn==='rpc_ielts_exam_status'){if(holdStatus)await new Promise(resolve=>{statusReply=resolve;});const {drafts,form_public_payload,...compact}=who;result=compact;}
 else if(fn==='rpc_ielts_start_attempt')result={...who,attempt_id:'attempt',lock_token:'lock'};
 else if(fn==='rpc_ielts_autosave_attempt'){if(holdSave)await new Promise(resolve=>{saveReply=resolve;});if(failSave)throw Error('Injected network failure');result={draft_version:args.p_draft_version,server_now:new Date().toISOString()};}
 else if(fn==='rpc_ielts_log_incident')result={incident_id:'incident'};
 else throw Error('Unexpected request '+fn);
 return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});};
 w.eval(bundle.outputFiles[0].text);
 const wait=async(fn)=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,15));}throw Error('UI did not settle: '+w.document.body.textContent);};
 await wait(()=>w.document.body.textContent.includes('Resume screener'));
 [...w.document.querySelectorAll('button')].find(b=>b.textContent.includes('Resume screener')).click();await wait(()=>w.document.querySelector('textarea'));
 return{dom,w,calls,wait,who,holdSave(value){holdSave=value;if(!value)saveReply?.();},holdStatus(value){holdStatus=value;if(!value)statusReply?.();},disconnect(){online=false;w.dispatchEvent(new w.Event('offline'));},reconnect(){online=true;w.dispatchEvent(new w.Event('online'));},fail(value){failSave=value;}};
}
for(const width of [390,1440])test(`Writing delivery at ${width}px retains edits through offline, failed saves, backgrounding and remount`,async()=>{
 const ui=await mount(width),{w,wait,calls}=ui;const editor=w.document.querySelector('textarea');
 const essay='My opinion is clear. I support it with a relevant example.';
 Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value').set.call(editor,essay);editor.dispatchEvent(new w.Event('input',{bubbles:true}));
 await wait(()=>Object.values(w.localStorage).some(v=>v.includes(essay)));
 ui.disconnect();await wait(()=>w.document.body.textContent.includes('saved on this device'));
 assert.equal(editor.value,essay);ui.fail(true);ui.reconnect();await wait(()=>w.document.body.textContent.includes('could not save'));
 assert.equal(editor.value,essay);ui.fail(false);w.dispatchEvent(new w.Event('blur'));await wait(()=>calls.some(c=>c.fn==='rpc_ielts_autosave_attempt'&&c.args.p_payload?.essay===essay));
 ui.reconnect();await wait(()=>w.document.body.textContent.includes('All answers saved'));
 const key=Object.keys(w.localStorage).find(k=>w.localStorage.getItem(k).includes(essay)),saved=w.localStorage.getItem(key);assert.equal(key,'ielts_exam_local_draft_attempt');
 assert.equal(w.document.querySelector('textarea').value,essay);ui.dom.window.close();
 const restored=await mount(width,saved);assert.equal(restored.w.document.querySelector('textarea').value,essay);restored.dom.window.close();
});

test('idle exam performs compact single-flight polls without saving unchanged answers',async()=>{
 const ui=await mount(390,null,true);const {w,calls,wait}=ui;
 await wait(()=>calls.some(c=>c.fn==='rpc_ielts_exam_status'));
 assert.equal(calls.filter(c=>c.fn==='rpc_ielts_exam_whoami').length,1);
 assert.equal(calls.filter(c=>c.fn==='rpc_ielts_autosave_attempt').length,0);
 assert.ok(w.document.querySelector('textarea'),'compact status preserves loaded content');
 ui.holdStatus(true);const before=calls.filter(c=>c.fn==='rpc_ielts_exam_status').length;
 await wait(()=>calls.filter(c=>c.fn==='rpc_ielts_exam_status').length>before);
 w.dispatchEvent(new w.Event('focus'));w.dispatchEvent(new w.Event('focus'));
 await new Promise(r=>setTimeout(r,180));
 assert.equal(calls.filter(c=>c.fn==='rpc_ielts_exam_status').length,before+1,'slow status requests cannot overlap');
 ui.who.event_status='paused';ui.holdStatus(false);
 await wait(()=>w.document.body.textContent.includes('Paused by teacher'));
 ui.who.event_status='live';await wait(()=>w.document.querySelector('textarea'));
 assert.equal(calls.filter(c=>c.fn==='rpc_ielts_autosave_attempt').length,0);
 ui.who.allowed=false;ui.who.reason='ielts_not_in_school_agreement';
 await wait(()=>!w.document.querySelector('textarea'));
 ui.dom.window.close();
});

test('save acknowledgement preserves newer edits made while a save is pending',async()=>{
 const ui=await mount(390,null,true),{w,calls,wait}=ui;const editor=w.document.querySelector('textarea');
 const edit=value=>{Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value').set.call(editor,value);editor.dispatchEvent(new w.Event('input',{bubbles:true}));};
 ui.holdSave(true);edit('First draft');await wait(()=>calls.some(c=>c.fn==='rpc_ielts_autosave_attempt'));
 edit('Newer draft');ui.holdSave(false);
 await wait(()=>calls.some(c=>c.fn==='rpc_ielts_autosave_attempt'&&c.args.p_payload.essay==='Newer draft'));
 const saves=calls.filter(c=>c.fn==='rpc_ielts_autosave_attempt');assert.equal(saves[1].args.p_draft_version,saves[0].args.p_draft_version+1);
 assert.equal(editor.value,'Newer draft');ui.dom.window.close();
});
test('matching device and server drafts do not become dirty on refresh',async()=>{
 const ui=await mount(390,JSON.stringify({writing:{essay:'Saved'}}),true,{essay:'Saved'});
 await ui.wait(()=>ui.calls.some(c=>c.fn==='rpc_ielts_exam_status'));
 assert.equal(ui.w.document.querySelector('textarea').value,'Saved');
 assert.equal(ui.calls.filter(c=>c.fn==='rpc_ielts_autosave_attempt').length,0);ui.dom.window.close();
});
