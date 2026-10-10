import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
const result = { label:'Screener result',raw_score:9,marks_possible:12,confidence:{level:'low',items_answered:12,items_possible:12,constructs_sampled:8,constructs_with_responses:8},warnings:['No band estimate: this form has not been calibrated.','One sitting cannot establish a persistent weakness.'],integrity_state:'unreviewed',next_step:'Review the sampled items with your teacher.',readiness_available:false,persistent_weakness_available:false };
const bundle=(await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {RouterProvider,createBrowserRouter} from './src/lib/router';import Page from './src/pages/ielts/IeltsGovernedScreenerResult';window.root=createRoot(document.getElementById('root'));window.root.render(<RouterProvider router={createBrowserRouter([{path:'/ielts/screener-result/:attemptId',element:<Page/>}])}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},plugins:[{name:'saved-result-fixture',setup(b){b.onLoad({filter:/services\/supabaseClient\.ts$/},()=>({contents:`export const supabase={auth:{getUser:async()=>({data:{user:{id:'viewer'}}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>window.profileError?{data:null,error:{message:'Unavailable'}}:{data:{role:window.role,is_admin:false},error:null}})})})};`,loader:'js'}));b.onLoad({filter:/services\/ieltsTeacherProgrammeEntry\.ts$/},()=>({contents:`export async function fetchTeacherProgrammeEntries(){return window.schools;}export function teacherProgrammeRoute(entry){return '/ielts/programme?school='+entry.id;}`,loader:'js'}));b.onLoad({filter:/services\/ieltsDiagnosticEvidenceService\.ts$/},()=>({contents:`export async function fetchIeltsDiagnosticResult(id){window.reads.push(id);if(window.fail&&window.reads.length===1)throw Error('Unavailable');return window.result;}`,loader:'js'}));}}],logLevel:'silent'})).outputFiles[0].text;
async function mount(role,{fail=false,profileError=false,review=false,schools=[{id:'11111111-1111-4111-8111-111111111111',name:'School'}]}={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://app.test/ielts/screener-result/saved-attempt',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window;
 Object.assign(w,{role,profileError,fail,schools,reads:[],result:{...result,integrity_state:review?'review_required':'unreviewed'}});w.eval(bundle);
 const wait=async f=>{for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,10));}throw Error(w.document.body.textContent);};
 await wait(()=>fail?w.document.querySelector('[role=alert]'):w.document.querySelector('.isr-metrics'));
 return {w,dom,wait,errors,close:()=>{w.root.unmount();w.close();}};
}
test('student sees server evidence, bounded interpretation and Journey links',async()=>{const m=await mount('student');try{
 await m.wait(()=>m.w.document.querySelector('a').textContent.includes('My IELTS Journey'));assert.equal(m.w.document.querySelector('a').getAttribute('href'),'/ielts/journey');
 assert.deepEqual([...m.w.document.querySelectorAll('dd')].map(x=>x.textContent),['9 / 12','12 / 12','8 / 8']);assert.match(m.w.document.body.textContent,/Confidence: low/);assert.match(m.w.document.body.textContent,/No band estimate/);assert.match(m.w.document.body.textContent,/does not establish a band or a persistent weakness/);assert.deepEqual(m.w.reads,['saved-attempt']);assert.deepEqual(m.errors,[]);
 }finally{m.close();}});
test('teacher result links return to Programme student progress instead of personal Journey',async()=>{const m=await mount('teacher');try{
 await m.wait(()=>m.w.document.querySelector('a').textContent.includes('Back to IELTS Programme'));assert.ok([...m.w.document.querySelectorAll('a')].every(a=>a.getAttribute('href')==='/ielts/programme?school=11111111-1111-4111-8111-111111111111&programmeSection=students'));assert.doesNotMatch(m.w.document.body.textContent,/My IELTS Journey/);assert.match(m.w.document.body.textContent,/Guide the next learning conversation/);assert.deepEqual(m.w.reads,['saved-attempt']);
 }finally{m.close();}});
test('school staff use the governed admin progress destination; failed role lookup has a safe landing',async()=>{
 for(const [role,profileError] of [['school_admin',false],['teacher',true]]){const m=await mount(role,{profileError});try{
 await m.wait(()=>profileError?m.w.document.querySelector('.isr-metrics'):m.w.document.querySelector('a').textContent.includes('Back to student progress'));assert.equal(m.w.document.querySelector('a').getAttribute('href'),profileError?'/ielts':'/?view=school_admin&adminTab=ielts&ieltsTab=ielts-student-progress');assert.deepEqual(m.errors,[]);
 }finally{m.close();}}
});
test('failed reads retry the same saved attempt; integrity flags remain visible',async()=>{const m=await mount('teacher',{fail:true,review:true});try{
 [...m.w.document.querySelectorAll('button')].find(b=>b.textContent==='Retry result').click();await m.wait(()=>m.w.document.querySelector('.isr-metrics'));assert.deepEqual(m.w.reads,['saved-attempt','saved-attempt']);assert.match(m.w.document.body.textContent,/Assessment conditions need teacher review/);assert.deepEqual(m.errors,[]);
 }finally{m.close();}});

test('teacher without a current programme allocation returns to the teacher workspace',async()=>{const m=await mount('teacher',{schools:[]});try{await m.wait(()=>m.w.document.querySelector('a').textContent.includes('teacher workspace'));assert.equal(m.w.document.querySelector('a').getAttribute('href'),'/');assert.doesNotMatch(m.w.document.body.textContent,/My IELTS Journey/);}finally{m.close();}});
