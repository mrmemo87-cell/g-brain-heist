import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Workspace from './components/teacher/PaperAssignmentWorkspace';window.root=createRoot(document.getElementById('root'));window.root.render(<Workspace assignmentId="assignment" initialMode="scan" userId="teacher" schoolName="School" teacherName="Teacher" onClose={()=>window.closed=true} onRecorded={()=>window.recorded++}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},logLevel:'silent',plugins:[{name:'mocks',setup(b){
 b.onResolve({filter:/supabaseClient$/},()=>({path:'db',namespace:'mock'}));
 b.onResolve({filter:/paperScanImage$/},()=>({path:'photo',namespace:'mock'}));
 b.onResolve({filter:/\.\/ClassroomPrintPanel$/},()=>({path:'print',namespace:'mock'}));
 b.onResolve({filter:/\.\/GuestResultsPanel$/},()=>({path:'guests',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},arg=>({loader:'js',contents:arg.path==='db'?`export const supabase={rpc:async(name,args)=>{if(name==='rpc_teacher_paper_workspace')return{data:window.packet,error:null};if(name==='rpc_teacher_scan_inbox')return{data:[window.session],error:null};if(name==='rpc_teacher_scan_session'||name==='rpc_teacher_resolve_scan_sheet')return{data:window.session,error:null};if(name==='rpc_teacher_save_paper_draft'){window.saved++;return{data:{revision:args.p_revision+1},error:null}}if(name==='rpc_teacher_confirm_paper'){window.confirmations.push(args);window.packet={...window.packet,students:window.packet.students.map(s=>({...s,status:'completed',source:'paper',accuracy:100,completedAt:'2026-10-14T09:30:00Z'}))};return{data:{success:true,accuracy:100},error:null}}throw new Error(name)}};`:arg.path==='photo'?`export class ScanPhotoReadError extends Error{constructor(){super('The page corners could not be matched.');this.sheetId='sheet'}}export const loadScanPhoto=async()=>{throw new ScanPhotoReadError()};export const detectedAnswers=()=>({});export const rowPreviews=()=>({});`:`export default function Panel(){return null}`}));
}}]});
const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
async function until(predicate){for(let i=0;i<120;i++){if(predicate())return;await pause()}assert.ok(predicate(),'UI did not become ready')}
test('QR fallback uses the real paper editor, preserves draft/date/tray, and confirms only after explicit teacher review',async()=>{
 const errors=[];const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://test.local',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});const w=dom.window;
 w.saved=0;w.recorded=0;w.confirmations=[];w.URL.createObjectURL=()=> 'blob:photo';w.URL.revokeObjectURL=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.packet={assignment:{id:'assignment',title:'Diagnostic',assignedAt:'2026-10-14T07:00:00Z',className:'ESL'},code:'BH-99',formHash:'form',questions:[{questionId:'q',orderIndex:1,questionText:'Choose the past form.',questionType:'multiple_choice',options:[{text:'went'},{text:'goed'}],points:1}],students:[{id:'student',name:'Student',status:'pending',source:null,existingAnswerCount:0,accuracy:null,completedAt:null,draft:null}]};
 w.session={id:'session',assignmentId:'assignment',formHash:'form',assessedAt:'2026-10-14T09:30:00Z',sheets:[{id:'sheet',studentId:'student',studentName:'Student',pageNumber:1,pageCount:1,questions:[{questionId:'q',options:['went','goed']}]}]};
 const button=text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.includes(text));
 try{
  w.eval(bundle.outputFiles[0].text);await until(()=>button('Scan & review'));button('Scan & review').click();await until(()=>w.document.querySelector('[aria-label="Take answer sheet photo with phone camera"]'));
  const input=w.document.querySelector('[aria-label="Take answer sheet photo with phone camera"]');Object.defineProperty(input,'files',{value:[new w.File(['photo'],'original.jpg',{type:'image/jpeg'})]});input.dispatchEvent(new w.Event('change',{bubbles:true}));await until(()=>button('Enter answers from photo'));button('Enter answers from photo').click();await until(()=>w.document.querySelector('.paw-question'));
  assert.equal(w.confirmations.length,0);assert.equal(w.document.querySelector('input[type="datetime-local"]').value,new Date(new Date(w.session.assessedAt).getTime()-new Date(w.session.assessedAt).getTimezoneOffset()*60000).toISOString().slice(0,16));
  const answer=[...w.document.querySelectorAll('[role="radio"]')].find(b=>b.textContent.includes('went'));answer.click();await pause();button('Back to scan tray').click();await until(()=>w.document.querySelector('.psc-batch'));
  assert.ok(w.saved>0);assert.match(w.document.querySelector('.psc-batch').textContent,/original.jpg/);assert.equal(w.confirmations.length,0);
  button('Enter answers from photo').click();await until(()=>button('Review answers'));button('Review answers').click();await until(()=>button('Confirm paper result'));assert.equal(w.confirmations.length,0);button('Confirm paper result').click();await until(()=>w.document.querySelector('.paw-complete'));
  assert.equal(w.confirmations.length,1);assert.equal(w.confirmations[0].p_student_id,'student');assert.equal(w.confirmations[0].p_assessed_at,'2026-10-14T09:30:00Z');assert.deepEqual(JSON.parse(JSON.stringify(w.confirmations[0].p_answers)),{q:'went'});assert.equal(w.recorded,1);
  button('Back to scan tray').click();await until(()=>w.document.querySelector('.psc-batch'));assert.match(w.document.querySelector('.psc-batch').textContent,/1 finished/);assert.equal(w.document.querySelector('.psc-batch-item').classList.contains('completed'),true);assert.deepEqual(errors,[]);
 }finally{w.root.unmount();dom.window.close()}
});
