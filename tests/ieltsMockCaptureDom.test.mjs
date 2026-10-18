import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {JSDOM} from 'jsdom';
const src=`export const mockSittings=b=>window.list(b);export const openMockSitting=(b,m,d,v)=>window.open_(b,m,d,v);export const mockSitting=id=>window.sitting(id);export const saveMockResult=(...a)=>window.save(...a);
export const batchOutcomes=()=>Promise.resolve({students:[{id:'a',name:'Aida',official:[],mock_ranges:[]}]});export const recordOfficialResult=(...a)=>window.record(...a);export const verifyOfficialResult=()=>Promise.resolve();export const officialOverall=(l,r,w,s)=>Math.floor(((l+r+w+s)/4)*2+0.5)/2;
export function normaliseMarks(i){return i.replace(/[\\s,]/g,'').replace(/[✓✔yY+]/g,'1').replace(/[xX✗✘nN]/g,'0').replace(/[_.]/g,'-');}
export function marksSummary(m){const valid=/^[10-]*$/.test(m);return{valid,length:m.length,correct:[...m].filter(c=>c==='1').length,answered:[...m].filter(c=>c!=='-').length,complete:valid&&m.length===40};}`;
const compiled=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from './src/pages/ielts/IeltsMockCapture';window.root=createRoot(document.getElementById('root'));window.root.render(<Page batchId="batch"/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},logLevel:'silent',plugins:[{name:'fixtures',setup(b){b.onLoad({filter:/services[\\/]ieltsMockResults\.ts$/},()=>({contents:src,loader:'js'}));}}]});
const sitting={sitting:{id:'s1',mock_code:'IELTS-M1',sat_on:'2026-10-18',delivery:'paper',batch_id:'batch'},form:{code:'IELTS-M1',title:'Mock Test 1',version:'1.0.0',items:[]},policy:'bh-indicative-v1',
 students:[{id:'a',name:'Aida',exposed:false,results:{}},{id:'b',name:'Bek',exposed:true,results:{listening:{section:'listening',marks:'1'.repeat(35)+'0'.repeat(5),criteria:null,revision:1,entered_at:'',raw:35,answered:40,exposed:true,indicative:null}}}]};
async function mount(){const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://app.test'}),w=dom.window;
 Object.assign(w,{saves:[],opened:[],records:[],record:async(...a)=>{w.records.push(a);return 'r1';},list:async()=>({forms:[{code:'IELTS-M1',title:'Mock Test 1',version:'1.0.0'}],sittings:[]}),open_:async(...a)=>{w.opened.push(a);return 's1';},sitting:async()=>sitting,
  save:async(sid,stu,section,marks,criteria,rev)=>{w.saves.push({sid,stu,section,marks,criteria,rev});return{section,marks,criteria,revision:1,entered_at:'',raw:marks?[...marks].filter(c=>c==='1').length:null,answered:marks?[...marks].filter(c=>c!=='-').length:null,exposed:false,indicative:section==='speaking'&&!criteria.audio?null:{label:'6.0–7.0',low:6,high:7,central:6.5}};}});
 const wait=async f=>{for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,10));}throw Error(w.document.body.textContent);};
 w.eval(compiled.outputFiles[0].text);await new Promise(r=>setTimeout(r,30));
 const button=t=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.startsWith(t));
 const set=(el,v)=>{const proto=el.tagName==='INPUT'?w.HTMLInputElement.prototype:w.HTMLSelectElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v);el.dispatchEvent(new w.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
 return{w,wait,button,set,close:()=>{w.root.unmount();dom.window.close();}};}
test('a teacher records Listening marks and sees an indicative range, never a single band',async()=>{const m=await mount();try{const {w}=m;
 await m.wait(()=>m.button('Open results sheet'));assert.match(w.document.body.textContent,/always a range, confidence low, not an official IELTS result/);
 m.button('Open results sheet').click();await m.wait(()=>/Mock Test 1 · 2026-10-18 · paper/.test(w.document.body.textContent));
 assert.equal(w.opened[0][1],'IELTS-M1');assert.equal(w.opened[0][3],'paper');
 const input=w.document.querySelector('details input');m.set(input,'1'.repeat(29)+'x'.repeat(9)+'..');
 await m.wait(()=>/40\/40 entered · 29 correct/.test(w.document.body.textContent));
 m.button('Save listening').click();await m.wait(()=>w.saves.length===1);
 assert.deepEqual(JSON.parse(JSON.stringify(w.saves[0])),{sid:'s1',stu:'a',section:'listening',marks:'1'.repeat(29)+'0'.repeat(9)+'--',criteria:null,rev:null});
 await m.wait(()=>/Indicative band range 6\.0–7\.0/.test(w.document.body.textContent));assert.match(w.document.body.textContent,/Confidence: low · Not an official IELTS result/);
 assert.match(w.document.body.textContent,/Already sat this mock: practice only, no range/);
}finally{m.close();}});
test('incomplete marks cannot be saved, and Speaking without listening gives no range',async()=>{const m=await mount();try{const {w}=m;
 await m.wait(()=>m.button('Open results sheet'));m.button('Open results sheet').click();await m.wait(()=>m.button('Save listening'));
 m.set(w.document.querySelector('details input'),'1101');await m.wait(()=>/4\/40 entered/.test(w.document.body.textContent));assert.equal(m.button('Save listening').disabled,true);
 const speaking=[...w.document.querySelectorAll('fieldset')].find(f=>f.textContent.startsWith('Speaking'));for(const inp of speaking.querySelectorAll('input[type=number]'))m.set(inp,'6');
 await m.wait(()=>!m.button('Save speaking').disabled);m.button('Save speaking').click();await m.wait(()=>w.saves.length===1);
 assert.equal(w.saves[0].criteria.audio,false);await m.wait(()=>/audio for Speaking, are needed/.test(w.document.body.textContent));
}finally{m.close();}});

test('real IELTS results need consent and compute the official overall',async()=>{const m=await mount();try{const {w}=m;
 await m.wait(()=>m.button('Add official result'));m.button('Add official result').click();await m.wait(()=>m.button('Save result'));
 const box=[...w.document.querySelectorAll('fieldset')].find(f=>f.textContent.startsWith('Official result'));
 const inputs=[...box.querySelectorAll('input')];m.set(inputs.find(i=>i.type==='date'),'2026-10-10');
 const nums=inputs.filter(i=>i.type==='number');['7','6.5','6','6.5'].forEach((v,i)=>m.set(nums[i],v));
 await m.wait(()=>/Overall: 6\.5/.test(box.textContent));assert.equal(m.button('Save result').disabled,true,'consent first');
 box.querySelector('input[type=checkbox]').click();await m.wait(()=>!m.button('Save result').disabled);m.button('Save result').click();
 await m.wait(()=>w.records.length===1);assert.equal(w.records[0][0],'a');assert.equal(w.records[0][1].overall,6.5);assert.equal(w.records[0][1].consent,true);
}finally{m.close();}});
