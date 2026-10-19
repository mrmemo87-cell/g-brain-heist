import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {JSDOM} from 'jsdom';
const item=(i,type='ielts_writing_task',matches=[])=>({ref:`${type}:${i}`,material_type:type,material_id:String(i),item_key:`k${i}`,display_code:`W-0${i}`,status:'proposed',preview:{title:`Prompt ${i}`,prompt:`Write about topic ${i}.`},matches,constructs:[{item_key:null,role:'primary',name:'State and qualify a position',code:'x'}]});
const batch={id:'b',title:'practice-bank-01: test',status:'pending',proposed_by:'Claude (AI assistant)',proposal_basis:'Automated gates passed.',created_at:'',decided_at:null,decision_notes:null,reviewer:null,sha256:'s',minimum_sample:3,
 items:[item(1),item(2),item(3,'ielts_writing_task',[{display_code:'W-004',reason:'similar_content'}]),item(4),item(5)]};
const compiled=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import P from './src/pages/ielts/IeltsPracticeBankReview';window.root=createRoot(document.getElementById('root'));window.root.render(<P/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},logLevel:'silent',plugins:[{name:'f',setup(b){b.onLoad({filter:/services[\\/]ieltsConstructMapping\.ts$/},()=>({contents:`export const practiceContentQueue=()=>window.queue();export const decidePracticeContent=(b,d,s,r,n)=>window.decide(b,d,s,r,n);export const randomSample=(items,size)=>items.slice(0,size);export const markRecordingHeard=(b,i,p)=>window.heard(i.ref,p);`,loader:'js'}));}}]});
async function mount(start=batch){const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;let cur=[start];
 Object.assign(w,{calls:[],heardCalls:[],heard:async(ref,p)=>{w.heardCalls.push([ref,p]);},queue:async()=>cur,decide:async(b,d,s,r,n)=>{w.calls.push(JSON.parse(JSON.stringify({d,s,r,n})));cur=[{...b,status:d}];return{status:d,approved:b.items.length-r.length,total:b.items.length};}});
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
const listen=(i)=>({ref:`ielts_listening_set:${i}`,material_type:'ielts_listening_set',material_id:String(i),item_key:`lb0${i}`,display_code:`L-01${i}`,status:'proposed',heard_by_me:false,
 preview:{title:`Set ${i}`,instructions:'Complete the form.',audio_url:`https://x/storage/v1/object/public/ielts-audio/${i}.mp3`,duration_seconds:10,recording_matches:true,transcript:'A: Hello.',questions:[{n:1,question:'Name: _____',options:null,answer:['Hartley'],evidence:'You hear: "Hartley"'}]},
 matches:[],constructs:[{item_key:'1',role:'primary',name:'Explicit detail',code:'x'}]});
test('Listening sets must be played to the end by the reviewer before they can be checked or approved',async()=>{
 const m=await mount({...batch,title:'practice-bank-02: test',items:[listen(1),listen(2),listen(3)]});try{
 await m.wait(()=>m.button('Review drafts'));m.button('Review drafts').click();await m.wait(()=>m.button('Pick a random sample'));
 assert.match(m.w.document.body.textContent,/0 of 3 recordings played in full by you/);
 const boxes=()=>[...m.w.document.querySelectorAll('label')].filter(l=>l.textContent==='I checked this material in full').map(l=>l.querySelector('input'));
 assert.ok(boxes().every(b=>b.disabled),'cannot tick a Listening set before hearing it');
 m.button('Pick a random sample').click();await new Promise(r=>setTimeout(r,20));
 assert.ok(boxes().every(b=>!b.checked),'the random pick never ticks an unheard recording');
 assert.match(m.w.document.body.textContent,/Locked: play 3 more recordings to the end/);
 const audios=[...m.w.document.querySelectorAll('audio')];assert.equal(audios.length,3);
 const play=async(a,times)=>{let t=0;Object.defineProperty(a,'currentTime',{configurable:true,get:()=>t});for(const x of times){t=x;a.dispatchEvent(new m.w.Event(x<0?'seeking':'timeupdate',{bubbles:false}));}a.dispatchEvent(new m.w.Event('ended'));await new Promise(r=>setTimeout(r,20));};
 // Skipping from 1 s to 9 s does not count as listening.
 await play(audios[0],[0,0.5,1,9,9.5,10]);assert.equal(m.w.heardCalls.length,0);assert.match(m.w.document.body.textContent,/Parts were skipped/);
 const full=Array.from({length:21},(_,k)=>k/2);
 for(const a of audios)await play(a,full);
 assert.equal(m.w.heardCalls.length,3);assert.ok(m.w.heardCalls.every(([,p])=>p>=9.9));
 await m.wait(()=>/3 of 3 recordings played in full by you/.test(m.w.document.body.textContent));
 assert.ok(boxes().every(b=>b.checked),'a recording heard in full joins the sample');
 m.type(m.w.document.querySelector('textarea'),'Played all three recordings in full and checked every key against the transcript.');
 await m.wait(()=>!m.button('Approve and release').disabled);m.button('Approve and release').click();await m.wait(()=>m.w.calls.length===1);
 assert.equal(m.w.calls[0].s.length,3);
}finally{m.close();}});
