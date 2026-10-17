import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {JSDOM} from 'jsdom';
const sha='c'.repeat(64);
const pack={lesson_code:'IELTS-17',title:'Timed Listening',version:'0.1.0',source_sha256:'a'.repeat(64),object_path:`review-drafts/school/IELTS-17/0.1.0/${sha}.zip`,sha256:sha,size_bytes:5,recordings:[{id:'IELTS-17-L1',status:'Produced v1; owner listening review pending'}],published_at:'2026-10-18T00:00:00Z',decision:null};
const compiled=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from './src/pages/ielts/IeltsReviewDraftPacks';window.root=createRoot(document.getElementById('root'));window.root.render(<Page schoolId="school"/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},logLevel:'silent',plugins:[{name:'fixtures',setup(b){b.onLoad({filter:/ieltsReviewDraftPacks\.ts$/},()=>({contents:`export const reviewDraftPacks=s=>window.list(s);export const reviewDraftPackBlob=p=>window.load(p);export const recordReviewDecision=(s,p,d,n)=>window.decide(s,p,d,n);`,loader:'js'}));b.onLoad({filter:/ieltsLessonResources\.ts$/},()=>({contents:'export const downloadLessonFile=(blob,name)=>window.downloads.push({blob,name});',loader:'js'}));}}]});
async function mount({canDecide=false,packs=[pack]}={}){const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://app.test'}),w=dom.window;
 Object.assign(w,{Blob,downloads:[],decisions:[],list:async()=>({canDecide,packs}),load:async()=>new Blob(['draft']),decide:async(s,p,d,n)=>{w.decisions.push({s,p:p.lesson_code,d,n});return {decision:d,notes:n||null,decided_at:'2026-10-18T01:00:00Z',pack_sha256:p.sha256};}});
 const wait=async f=>{for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,10));}throw Error(w.document.body.textContent);};
 w.eval(compiled.outputFiles[0].text);await new Promise(r=>setTimeout(r,30));
 return{w,wait,button:t=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===t),close:()=>{w.root.unmount();dom.window.close();}};}
test('drafts are labelled as not approved and download the verified pack',async()=>{const m=await mount();try{
 await m.wait(()=>m.w.document.querySelector('summary'));assert.match(m.w.document.body.textContent,/Not approved for classroom use/);assert.match(m.w.document.body.textContent,/Awaiting review/);
 assert.equal(m.button('Approve this version'),undefined);
 m.button('Download review draft').click();await m.wait(()=>m.w.downloads.length===1);assert.equal(m.w.downloads[0].name,'IELTS-17-Review-Draft-v0.1.0.zip');
}finally{m.close();}});
test('owner can approve; change requests need notes',async()=>{const m=await mount({canDecide:true});try{
 await m.wait(()=>m.button('Approve this version'));assert.equal(m.button('Request changes').disabled,true);
 m.button('Approve this version').click();await m.wait(()=>m.w.decisions.length===1);assert.deepEqual(m.w.decisions[0],{s:'school',p:'IELTS-17',d:'approved',n:''});
 await m.wait(()=>/Approved by owner/.test(m.w.document.body.textContent));assert.match(m.w.document.body.textContent,/1 of 1 approved/);
}finally{m.close();}});
test('schools without drafts render nothing',async()=>{const m=await mount({packs:[]});try{await new Promise(r=>setTimeout(r,30));assert.equal(m.w.document.getElementById('root').innerHTML,'');}finally{m.close();}});
