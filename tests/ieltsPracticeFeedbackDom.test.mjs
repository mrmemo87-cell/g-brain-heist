import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {JSDOM} from 'jsdom';
const view=(confirmed=false)=>({id:'f1',status:'ready',created_at:'',confirmed,confirmed_at:confirmed?'2026-10-19T00:00:00Z':null,confirmed_by:confirmed?'Ms Lead':null,teacher_note:null,
 fields:{task_number:2,next_step:'Add a second example.',prompt_version:'v1',criteria:{task_response:{comment:'Your position is clear.',action:'Explain the other view.',evidence:[{quote:'phones distract'}],indication:{low:5.5,high:6.5}}}}});
const compiled=(mode,audience='school')=>build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import C from './src/components/ielts/IeltsPracticeAiFeedback';window.root=createRoot(document.getElementById('root'));window.root.render(<C attemptId="a1" mode="${mode}" audience="${audience}"/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,logLevel:'silent',plugins:[{name:'f',setup(b){b.onLoad({filter:/services[\\/]ieltsPracticeFeedback\.ts$/},()=>({contents:`export const criterionLabel={task_response:'Task Response'};export const practiceFeedback=()=>window.load();export const requestPracticeFeedback=()=>window.req();export const confirmPracticeFeedback=(id,n)=>window.conf(id,n);export const speakingPracticeFeedback=()=>window.load();export const requestSpeakingPracticeFeedback=()=>window.req();export const confirmSpeakingPracticeFeedback=(id,n)=>window.conf(id,n);`,loader:'js'}));b.onLoad({filter:/lib[\\/]ieltsAudience\.ts$/},()=>({contents:`export const useIeltsAudience=()=>'school';`,loader:'js'}));b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));}}]});
async function mount(mode,initial,audience){const code=(await compiled(mode,audience)).outputFiles[0].text;const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 Object.assign(w,{calls:[],load:async()=>initial,req:async()=>{w.calls.push('req');return view();},conf:async(id,n)=>{w.calls.push(['conf',id,n]);return view(true);}});
 const wait=async f=>{for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,10));}throw Error(w.document.body.textContent);};
 w.eval(code);await new Promise(r=>setTimeout(r,30));return{w,wait,button:t=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.startsWith(t)),close:()=>{w.root.unmount();dom.window.close();}};}
test('students request labelled feedback with per-criterion ranges and no overall band',async()=>{const m=await mount('student',null);try{
 await m.wait(()=>m.button('Get AI feedback now'));m.button('Get AI feedback now').click();await m.wait(()=>/Try this/.test(m.w.document.body.textContent));
 const t=m.w.document.body.textContent;assert.match(t,/AI practice feedback — your teacher may adjust it/);assert.match(t,/AI practice indication: about 5\.5–6\.5/);assert.match(t,/not a full Writing band/);assert.doesNotMatch(t,/Overall/);
}finally{m.close();}});
test('teachers confirm; the label then shows who checked it',async()=>{const m=await mount('teacher',view());try{
 await m.wait(()=>m.button('Confirm this AI feedback'));m.button('Confirm this AI feedback').click();await m.wait(()=>/Checked by Ms Lead/.test(m.w.document.body.textContent));
 assert.equal(m.w.calls[0][1],'f1');
}finally{m.close();}});
test('teachers can run the AI check when the student has not requested feedback (Bible 10.9)',async()=>{const m=await mount('teacher',null);try{
 await m.wait(()=>m.button('Run AI check'));m.button('Run AI check').click();await m.wait(()=>/Try this/.test(m.w.document.body.textContent));
 assert.deepEqual(m.w.calls,['req']);
}finally{m.close();}});

const essay='Nowadays many peoples is using phones in class. However, students can be distracted.';
const v3=()=>{const v=view();v.fields={...v.fields,prompt_version:'bh-ielts-practice-feedback-v3',essay,estimate:{band:6,low:5.5,high:6.5},highlights:[{criterion:'grammar_range_accuracy',kind:'fix',quote:'peoples is',note:'Use the plural verb.',correction:'people are',start_char:essay.indexOf('peoples is'),end_char:essay.indexOf('peoples is')+10},{criterion:'coherence_cohesion',kind:'strength',quote:'However,',note:'Clear contrast.',correction:null,start_char:essay.indexOf('However,'),end_char:essay.indexOf('However,')+8}]};return v;};
test('students see the AI estimated task band with its range and a collapsible essay with highlights and corrections',async()=>{const m=await mount('student',v3());try{
 await m.wait(()=>/Try this/.test(m.w.document.body.textContent));
 const t=m.w.document.body.textContent;assert.match(t,/AI estimated band · Task 2/);assert.match(t,/Likely range 5\.5–6\.5/);assert.match(t,/Waiting for your teacher to confirm/);assert.match(t,/Not an official IELTS result/);
 assert.equal(m.w.document.querySelectorAll('mark.st-hl').length,0,'essay starts collapsed');
 m.button('Show your essay').click();await m.wait(()=>m.w.document.querySelectorAll('mark.st-hl').length===2);
 assert.match(m.w.document.querySelector('.st-notes').textContent,/peoples is → .*people are/);
 assert.match(m.w.document.querySelector('.st-legend').textContent,/Task Response/);assert.doesNotMatch(m.w.document.querySelector('.st-legend').textContent,/Task Achievement/);
}finally{m.close();}});
test('teachers see the highlighted essay open and are told to confirm the band themselves',async()=>{const m=await mount('teacher',v3());try{
 await m.wait(()=>/Try this/.test(m.w.document.body.textContent));
 assert.equal(m.w.document.querySelectorAll('mark.st-hl').length,2);
 assert.match(m.w.document.body.textContent,/you confirm or change it in Your bands/);
}finally{m.close();}});
test('teachers can upgrade writing feedback made before highlights existed',async()=>{const m=await mount('teacher',view());try{
 await m.wait(()=>m.button('Upgrade with highlights'));m.button('Upgrade with highlights').click();await new Promise(r=>setTimeout(r,30));assert.deepEqual(m.w.calls,['req']);
}finally{m.close();}});

test('self-paced learners see Brains Heist estimate wording and no teacher wording (Bible 10.6)',async()=>{const m=await mount('student',null,'independent');try{
 await m.wait(()=>m.button('Get my feedback'));m.button('Get my feedback').click();await m.wait(()=>/Try this/.test(m.w.document.body.textContent));
 const t=m.w.document.body.textContent;assert.match(t,/Brains Heist feedback — an estimate, not an official IELTS result/);assert.match(t,/Brains Heist practice estimate: about 5\.5–6\.5/);
 assert.match(t,/never used as a score/);assert.doesNotMatch(t,/teacher/i);assert.doesNotMatch(t,/Overall/);
}finally{m.close();}});
