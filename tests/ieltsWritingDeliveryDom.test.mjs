import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
const windows=[];test.after(()=>windows.forEach(w=>w.close()));
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {RouterProvider,createBrowserRouter} from './src/lib/router';import Exam from './src/pages/ielts/IeltsExamMode';createRoot(document.getElementById('root')).render(<RouterProvider router={createBrowserRouter([{path:'/exam/:examEventId',element:<Exam/>}])}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},define:{'import.meta':JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-key'}})},logLevel:'silent'});
async function mount(width,draft=null){
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/exam/event',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;windows.push(w);w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.play=async function(){};
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,innerWidth:width});
 let online=true,failSave=false;const calls=[];Object.defineProperty(w.navigator,'onLine',{get:()=>online});
 const end=new Date(Date.now()+1200000).toISOString();
 const who={allowed:true,reason:'ok',assignment_id:'assignment',attempt_id:'attempt',status:'in_progress',attempt_status:'in_progress',event_status:'live',starts_at:new Date(Date.now()-10000).toISOString(),ends_at:end,server_now:new Date().toISOString(),remaining_seconds:1200,drafts:[],form_public_payload:{writing_payload:{assessment_mode:'screener',task_type:'academic_task2',minimum_words:250,questions:[{id:'essay',type:'essay',prompt:'Discuss both views and give your opinion.'}]}}};
 if(draft)w.localStorage.setItem('ielts_exam_local_draft_attempt',draft);
 w.fetch=async(url,opts)=>{const fn=String(url).split('/').pop(),args=JSON.parse(opts.body??'{}');calls.push({fn,args});let result;
 if(fn==='rpc_ielts_exam_whoami')result=who;
 else if(fn==='rpc_ielts_start_attempt')result={...who,attempt_id:'attempt',lock_token:'lock'};
 else if(fn==='rpc_ielts_autosave_attempt'){if(failSave)throw Error('Injected network failure');result={draft_version:args.p_draft_version,server_now:new Date().toISOString()};}
 else if(fn==='rpc_ielts_log_incident')result={incident_id:'incident'};
 else throw Error('Unexpected request '+fn);
 return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});};
 w.eval(bundle.outputFiles[0].text);
 const wait=async(fn)=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,15));}throw Error('UI did not settle: '+w.document.body.textContent);};
 await wait(()=>w.document.body.textContent.includes('Resume screener'));
 [...w.document.querySelectorAll('button')].find(b=>b.textContent.includes('Resume screener')).click();await wait(()=>w.document.querySelector('textarea'));
 return{dom,w,calls,wait,disconnect(){online=false;w.dispatchEvent(new w.Event('offline'));},reconnect(){online=true;w.dispatchEvent(new w.Event('online'));},fail(value){failSave=value;}};
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
