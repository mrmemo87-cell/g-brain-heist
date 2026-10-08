import {JSDOM,VirtualConsole} from 'jsdom';
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {build} from 'esbuild';
const base={id:'00000000-0000-0000-0000-000000000201',student_id:'00000000-0000-0000-0000-000000000202',manager:false,title:'Photography workshop',purpose:'guided_practice',instructions:'No more than two words and/or a number.',success_description:'Select the final confirmed details.',reason:'Delivery pilot; no diagnosis asserted.',questions:Array.from({length:6},(_,i)=>({id:'q'+(i+1),prompt:'Detail '+(i+1)})),audio_bucket:'test-audio',audio_path:'test.mp3',audio_sha256:'a'.repeat(64),status:'assigned',answers:{},revision:0,source_attempt_id:'00000000-0000-0000-0000-000000000203',play_count:0,conditions_need_review:false,result:null,review:null};
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {RouterProvider,createBrowserRouter} from './src/lib/router';import Page from './src/pages/ielts/IeltsLearningPractice';createRoot(document.getElementById('root')).render(<RouterProvider router={createBrowserRouter([{path:'/ielts/practice/targeted/:allocationId',element:<Page/>}])}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},define:{'import.meta':JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-key'}})},logLevel:'silent'});
async function mount({server=base,local=null,failSave=false}={}){
 const errors=[],calls=[];let plays=0;const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/ielts/practice/targeted/'+base.id,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window;
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers});w.crypto.randomUUID=randomUUID;
 w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.play=async function(){plays++;this.dispatchEvent(new w.Event('play'));};
 if(local)w.localStorage.setItem(`bh_learning_${base.student_id}_${base.id}`,JSON.stringify(local));
 w.fetch=async(url,options)=>{
  const fn=String(url).split('/').pop();const args=options?.body?JSON.parse(options.body):{};calls.push({fn,args});let result;
  if(String(url).includes('/object/sign/'))result={signedURL:'/object/sign/test-audio/test.mp3?token=fixture'};
  else if(fn==='rpc_ielts_learning_detail')result=structuredClone(server);
  else if(fn==='rpc_ielts_learning_save'){if(failSave)return new Response(JSON.stringify({message:'network unavailable'}),{status:503});server={...server,answers:args.p_answers,revision:server.revision+1};result=server.revision;}
  else if(fn==='rpc_ielts_learning_incident')result=null;
  else if(fn==='rpc_ielts_learning_submit'){server={...server,status:'submitted',result:{score:1,total:6,submitted_at:'2026-10-09T00:00:00Z',outcomes:server.questions.map(q=>({id:q.id,correct:q.id==='q1',accepted_answers:['Sunday']}))}};result=server;}
  else if(fn==='rpc_ielts_learning_review'){server={...server,review:{fields:args.p_feedback,reviewer:'Test teacher',reviewed_at:'2026-10-09T00:00:00Z'}};result=server;}
  else throw Error('Unexpected request '+fn);
  return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
 };
 w.eval(bundle.outputFiles[0].text);
 const wait=async(fn)=>{for(let i=0;i<120;i++){if(fn())return;await new Promise(r=>setTimeout(r,15));}throw Error('UI did not settle: '+w.document.body.textContent+' '+errors.join(','));};
 const button=label=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===label);
 const change=(input,value)=>{const proto=input.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:w.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,value);input.dispatchEvent(new w.Event('input',{bubbles:true}));};
 await wait(()=>button('Play recording')&&!button('Play recording').disabled);return{dom,w,wait,button,change,calls,errors,plays:()=>plays};
}
test('task loads without autoplay or keys; explicit play, save and submit reveal server result',async()=>{
 const m=await mount();assert.equal(m.plays(),0);assert.doesNotMatch(m.w.document.body.textContent,/Accepted:|Sunday/);
 m.button('Play recording').click();await m.wait(()=>m.plays()===1);
 m.change(m.w.document.querySelector('input'),'Sunday');await m.wait(()=>m.w.document.querySelector('input').value==='Sunday');
 m.button('Submit for review').click();await m.wait(()=>m.w.document.body.textContent.includes('Task result: 1 / 6'));
 assert.equal(m.calls.filter(c=>c.fn==='rpc_ielts_learning_save').length,1);assert.equal(m.calls.filter(c=>c.fn==='rpc_ielts_learning_submit').length,1);assert.match(m.w.document.body.textContent,/Accepted: Sunday/);assert.deepEqual(m.errors,[]);m.dom.window.close();
});
test('pending device answers require explicit recovery; failed saving never submits or erases edits',async()=>{
 const m=await mount({local:{q1:'Sunday'},failSave:true});assert.equal(m.button('Submit for review').disabled,true);
 m.button('Use my device answers').click();await m.wait(()=>m.w.document.querySelector('input').value==='Sunday');m.button('Submit for review').click();
 await m.wait(()=>m.w.document.body.textContent.includes('We could not confirm this step'));
 assert.equal(m.calls.filter(c=>c.fn==='rpc_ielts_learning_submit').length,0);assert.equal(m.w.document.querySelector('input').value,'Sunday');assert.match(m.w.localStorage.getItem(`bh_learning_${base.student_id}_${base.id}`),/Sunday/);assert.deepEqual(m.errors,[]);m.dom.window.close();
});
test('teacher feedback requires all four fields and is explicitly attributed after sharing',async()=>{
 const server={...base,manager:true,status:'submitted',result:{score:1,total:6,outcomes:base.questions.map(q=>({id:q.id,correct:true,accepted_answers:['Sunday']}))}};
 const m=await mount({server});assert.equal(m.button('Confirm and share feedback').disabled,true);
 for(const input of m.w.document.querySelectorAll('textarea'))m.change(input,'Clear feedback for this response.');
 await m.wait(()=>!m.button('Confirm and share feedback').disabled);m.button('Confirm and share feedback').click();await m.wait(()=>m.w.document.body.textContent.includes('TEACHER FEEDBACK · Test teacher'));
 assert.equal(m.calls.filter(c=>c.fn==='rpc_ielts_learning_review').length,1);assert.deepEqual(m.errors,[]);m.dom.window.close();
});
