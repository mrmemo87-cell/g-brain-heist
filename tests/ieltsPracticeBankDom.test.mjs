import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {JSDOM} from 'jsdom';
const item=(i,type='ielts_writing_task',matches=[])=>({ref:`${type}:${i}`,material_type:type,material_id:String(i),item_key:`k${i}`,display_code:`W-0${i}`,status:'proposed',preview:{title:`Prompt ${i}`,prompt:`Write about topic ${i}.`},matches,constructs:[{item_key:null,role:'primary',name:'State and qualify a position',code:'x'}]});
const batch={id:'b',title:'practice-bank-01: test',status:'pending',proposed_by:'Claude (AI assistant)',proposal_basis:'Automated gates passed.',created_at:'',decided_at:null,decision_notes:null,reviewer:null,sha256:'s',minimum_sample:3,
 items:[item(1),item(2),item(3,'ielts_writing_task',[{display_code:'W-004',reason:'similar_content'}]),item(4),item(5)]};
const compiled=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import P from './src/pages/ielts/IeltsPracticeBankReview';window.root=createRoot(document.getElementById('root'));window.root.render(<P/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},logLevel:'silent',plugins:[{name:'f',setup(b){b.onLoad({filter:/services[\\/]ieltsConstructMapping\.ts$/},()=>({contents:`export const practiceContentQueue=()=>window.queue();export const decidePracticeContent=(b,d,s,r,n)=>window.decide(b,d,s,r,n);export const randomSample=(items,size)=>items.slice(0,size);`,loader:'js'}));}}]});
async function mount(){const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;let cur=[batch];
 Object.assign(w,{calls:[],queue:async()=>cur,decide:async(b,d,s,r,n)=>{w.calls.push(JSON.parse(JSON.stringify({d,s,r,n})));cur=[{...b,status:d}];return{status:d,approved:b.items.length-r.length,total:b.items.length};}});
 const wait=async f=>{for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,10));}throw Error(w.document.body.textContent);};
 w.eval(compiled.outputFiles[0].text);await new Promise(r=>setTimeout(r,30));
 const button=t=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.startsWith(t));
 const type=(el,v)=>{Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value').set.call(el,v);el.dispatchEvent(new w.Event('input',{bubbles:true}));};
 return{w,wait,button,type,close:()=>{w.root.unmount();dom.window.close();}};}
test('the random sample always includes flagged items, and approval sends sample, rejections and notes',async()=>{const m=await mount();try{
 await m.wait(()=>m.button('Review drafts'));m.button('Review drafts').click();await m.wait(()=>m.button('Pick a random sample'));
 assert.match(m.w.document.body.textContent,/similar to W-004/);
 m.button('Pick a random sample').click();await m.wait(()=>/3 checked/.test(m.w.document.body.textContent));
 assert.equal(m.button('Approve and release').disabled,true,'notes required');
 m.type(m.w.document.querySelector('textarea'),'Read three drafts in full and checked the prompts and skill tags.');
 await m.wait(()=>!m.button('Approve and release').disabled);m.button('Approve and release').click();await m.wait(()=>m.w.calls.length===1);
 assert.ok(m.w.calls[0].s.includes('ielts_writing_task:3'),'flagged item sampled');assert.equal(m.w.calls[0].s.length,3);assert.equal(m.w.calls[0].d,'approved');
 await m.wait(()=>/Released 5 of 5 materials/.test(m.w.document.body.textContent));
}finally{m.close();}});
test('approval stays disabled until a flagged item is checked',async()=>{const m=await mount();try{
 await m.wait(()=>m.button('Review drafts'));m.button('Review drafts').click();await m.wait(()=>m.button('Pick a random sample'));
 const boxes=[...m.w.document.querySelectorAll('label')].filter(l=>l.textContent==='I checked this material in full').map(l=>l.querySelector('input'));
 [0,1,3].forEach(i=>boxes[i].click());m.type(m.w.document.querySelector('textarea'),'Read three drafts in full and checked the prompts and skill tags.');
 await m.wait(()=>/3 checked/.test(m.w.document.body.textContent));assert.equal(m.button('Approve and release').disabled,true);
}finally{m.close();}});
