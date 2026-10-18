import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {JSDOM} from 'jsdom';
const item=(n,role='primary')=>({id:`m${n}${role}`,material_type:'ielts_reading_set',material_id:'30',display_code:'R-008',title:'A café',item_key:String(n),item_text:`Question text ${n}`,node_code:'eng.reading.main-ideas.gist',node_name:'Identify gist',role,rationale:'Because.',status:'proposed'});
const batch={id:'b1',title:'Construct mappings: test',status:'pending',proposed_by:'Claude (AI assistant)',proposal_basis:'Proposals.',created_at:'2026-10-19T00:00:00Z',decided_at:null,decision_notes:null,reviewer:null,sha256:'s'.repeat(64),minimum_sample:3,items:[1,2,3,4,5].map(n=>item(n))};
const compiled=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from './src/pages/ielts/IeltsConstructMappingReview';window.root=createRoot(document.getElementById('root'));window.root.render(<Page/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},logLevel:'silent',plugins:[{name:'fixtures',setup(b){b.onLoad({filter:/services[\\/]ieltsConstructMapping\.ts$/},()=>({contents:`export const constructMappingQueue=()=>window.queue();export const decideConstructMappingBatch=(b,d,s,r,n)=>window.decide(b,d,s,r,n);export const randomSample=(items,size)=>items.slice(0,size);`,loader:'js'}));}}]});
async function mount(batches=[batch]){const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://app.test'}),w=dom.window;let current=batches;
 Object.assign(w,{decisions:[],queue:async()=>current,decide:async(b,d,s,r,n)=>{w.decisions.push({id:b.id,sha:b.sha256,d,s,r,n});current=[{...b,status:d,reviewer:'Owner'}];return{status:d,approved:b.items.length-r.length,total:b.items.length};}});
 const wait=async f=>{for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,10));}throw Error(w.document.body.textContent);};
 w.eval(compiled.outputFiles[0].text);await new Promise(r=>setTimeout(r,30));
 const button=t=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.startsWith(t));
 const type=(el,value)=>{const setter=Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value').set;setter.call(el,value);el.dispatchEvent(new w.Event('input',{bubbles:true}));};
 return{w,wait,button,type,close:()=>{w.root.unmount();dom.window.close();}};}
test('approval needs the minimum sample and a note, and sends the exact batch version',async()=>{const m=await mount();try{
 await m.wait(()=>m.button('Review mappings'));m.button('Review mappings').click();await m.wait(()=>m.button('Approve batch'));
 assert.match(m.w.document.body.textContent,/Check at least 3 mappings/);assert.equal(m.button('Approve batch').disabled,true);
 m.button('Pick a random sample').click();await m.wait(()=>/3 checked/.test(m.w.document.body.textContent));
 assert.equal(m.button('Approve batch').disabled,true,'a note is still required');
 m.type(m.w.document.querySelector('textarea'),'Checked three mappings against the keys.');await m.wait(()=>!m.button('Approve batch').disabled);
 m.button('Approve batch').click();await m.wait(()=>m.w.decisions.length===1);
 assert.deepEqual(JSON.parse(JSON.stringify(m.w.decisions[0])),{id:'b1',sha:'s'.repeat(64),d:'approved',s:['m1primary','m2primary','m3primary'],r:[],n:'Checked three mappings against the keys.'});
 await m.wait(()=>/Approved 5 mappings/.test(m.w.document.body.textContent));
}finally{m.close();}});
test('rejecting a mapping also counts it as checked',async()=>{const m=await mount();try{
 await m.wait(()=>m.button('Review mappings'));m.button('Review mappings').click();await m.wait(()=>m.button('Approve batch'));
 const reject=[...m.w.document.querySelectorAll('label')].find(l=>l.textContent==='Reject').querySelector('input');reject.click();
 await m.wait(()=>/1 checked · 1 rejected/.test(m.w.document.body.textContent));assert.match(m.button('Approve batch').textContent,/4 mappings/);
}finally{m.close();}});
test('non-administrators see nothing',async()=>{const m=await mount([]);try{await new Promise(r=>setTimeout(r,30));assert.equal(m.w.document.getElementById('root').innerHTML,'');}finally{m.close();}});
