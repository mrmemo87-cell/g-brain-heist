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
 const t=m.w.document.body.textContent;assert.match(t,/AI practice feedback — your teacher may adjust it/);assert.match(t,/AI practice indication: about 5\.5–6\.5/);assert.match(t,/not an overall band/);assert.doesNotMatch(t,/Overall/);
}finally{m.close();}});
test('teachers confirm; the label then shows who checked it',async()=>{const m=await mount('teacher',view());try{
 await m.wait(()=>m.button('Confirm this AI feedback'));m.button('Confirm this AI feedback').click();await m.wait(()=>/Checked by Ms Lead/.test(m.w.document.body.textContent));
 assert.equal(m.w.calls[0][1],'f1');
}finally{m.close();}});
test('teachers see nothing when the student has not requested feedback',async()=>{const m=await mount('teacher',null);try{await new Promise(r=>setTimeout(r,30));assert.equal(m.w.document.getElementById('root').innerHTML,'');}finally{m.close();}});

test('self-paced learners see Brains Heist estimate wording and no teacher wording (Bible 10.6)',async()=>{const m=await mount('student',null,'independent');try{
 await m.wait(()=>m.button('Get my feedback'));m.button('Get my feedback').click();await m.wait(()=>/Try this/.test(m.w.document.body.textContent));
 const t=m.w.document.body.textContent;assert.match(t,/Brains Heist feedback — an estimate, not an official IELTS result/);assert.match(t,/Brains Heist practice estimate: about 5\.5–6\.5/);
 assert.match(t,/never used as a score/);assert.doesNotMatch(t,/teacher/i);assert.doesNotMatch(t,/Overall/);
}finally{m.close();}});
