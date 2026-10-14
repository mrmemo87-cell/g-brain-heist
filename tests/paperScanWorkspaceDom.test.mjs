import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
const mock = `
export const fetchScanInbox=async()=>window.sessions;
export const resolveScanSheet=async id=>window.sessions.find(s=>s.sheets.some(p=>p.id===id));
export const confirmScan=async(session,id,replace)=>{window.confirmed.push({session,id,replace});window.sessions=window.sessions.map(s=>({...s,sheets:s.sheets.map(p=>p.studentId===id?{...p,confirmedAt:'now'}:p)}))};
export const issueScanSheets=async()=>null;export const issueUnnamedSheets=async()=>null;export const holdGuest=async()=>null;export const saveScan=async(scanId,sheetId,hash,detected)=>{window.sessions=window.sessions.map(s=>({...s,sheets:s.sheets.map(p=>p.id===sheetId?{...p,scanId,imageHash:hash,detected}:p)}));return window.sessions[0]};export const reviewScan=async()=>null;
`;
const bundle = await build({ stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import Workspace from './components/teacher/PaperScanWorkspace'; window.root=createRoot(document.getElementById('root'));window.root.render(<Workspace packet={window.packet} userId="teacher" schoolName="School" flush={{current:()=>{}}} canLeave={{current:()=>true}} onConfirmed={async()=>window.refreshed++}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},logLevel:'silent',plugins:[{name:'mocks',setup(build){
 build.onResolve({filter:/services\/paperScanService$/},()=>({path:'scan',namespace:'mock'}));
 build.onResolve({filter:/paperScanImage$/},()=>({path:'image',namespace:'mock'}));
 build.onResolve({filter:/paperScanPreviewCache$/},()=>({path:'cache',namespace:'mock'}));
 build.onResolve({filter:/supabaseClient$/},()=>({path:'db',namespace:'mock'}));
 build.onResolve({filter:/\.\/ClassroomPrintPanel$/},()=>({path:'print',namespace:'mock'}));
 build.onResolve({filter:/\.\/GuestResultsPanel$/},()=>({path:'guest',namespace:'mock'}));
 build.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='scan'?mock:args.path==='image'?`export async function loadScanPhoto(file,signal,anchors){window.scanCalls.push({file,anchors});if(!anchors)throw new Error('The page corners could not be matched.');return {sheetId:'sheet2',hash:'photo-hash',image:{},manuallyAligned:true}};export const detectedAnswers=()=>({q:{state:'uncertain',choice:null,coverage:[0,1]}});export const rowPreviews=()=>({q:'data:image/png;base64,preview'});`:args.path==='cache'?`export const saveRowPreviews=async()=>{};export const loadRowPreviews=async()=>null;`:args.path==='db'?`export const supabase={rpc:async()=>({data:null,error:null})}`:`export default function Panel(){return null}`,loader:'js'}));
}}]});
const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
async function setup() {
 const errors=[];const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://test.local',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});const w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.confirmed=[];w.refreshed=0;w.scanCalls=[];w.URL.createObjectURL=()=> 'blob:photo';w.URL.revokeObjectURL=()=>{};
 w.packet={assignment:{id:'assignment',title:'Irregular verbs',assigned_at:'2026-01-01'},code:'BH-98',questions:[{questionId:'q',questionType:'multiple_choice',options:[{text:'went'},{text:'goed'}]}],students:Array.from({length:14},(_,i)=>({id:`student${i}`,name:`Student ${i}`,status:i<2?'completed':'pending',existingAnswerCount:i===13?1:0}))};
 w.sessions=[{id:'saved-on-another-device',assignmentId:'assignment',assessedAt:'2026-01-02',formHash:'form',sheets:Array.from({length:14},(_,i)=>({id:`sheet${i}`,studentId:`student${i}`,studentName:i===2?'Akbarov Muhammadamin':`Student ${i}`,pageNumber:1,pageCount:1,layoutVersion:'v1',questions:[{questionId:'q',options:['went','goed']}],scanId:`scan${i}`,reviewedAnswers:{q:'went'},confirmedAt:i<2?'now':null}))}];
 w.eval(bundle.outputFiles[0].text);await pause();await pause();const button=text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.includes(text));button('Scan & review').click();await pause();
 return {dom,w,errors,button};
}
test('old saved reviews are visible without local tray and bulk confirmation updates completion only on click',async()=>{
 const t=await setup();try{
  assert.match(t.w.document.querySelector('.psc-inbox').textContent,/11 results are ready to confirm/);assert.equal(t.w.confirmed.length,0);assert.equal(t.w.document.querySelectorAll('.psc-inbox .psc-session-row').length,12);
  t.button('Confirm 11 results & complete assignments').click();await pause();await pause();
  assert.equal(t.w.confirmed.length,11);assert.ok(t.w.confirmed.every(call=>call.replace===false && !['student0','student1','student13'].includes(call.id)));assert.equal(t.w.refreshed,1);assert.match(t.w.document.querySelector('.psc-inbox').textContent,/Reviewed · finish individually/);assert.deepEqual(t.errors,[]);
 }finally{t.w.root.unmount();t.dom.window.close();}
});
test('restored review can finalize without rescanning; unfinished online work retains replacement consent',async()=>{
 const t=await setup();try{
  t.button('Student 13').click();await pause();await pause();assert.match(t.w.document.querySelector('.psc-review').textContent,/Page checked and saved/);
  const confirm=t.button('Confirm student result');assert.equal(confirm.disabled,true);assert.equal(t.w.confirmed.length,0);
  assert.match(t.w.document.querySelector('.psc-review').textContent,/replace/i);assert.deepEqual(t.errors,[]);
 }finally{t.w.root.unmount();t.dom.window.close();}
});

test('newer unreviewed scans arriving after the inbox loaded cannot finalize an older booklet',async()=>{
 const t=await setup();try{
  t.w.sessions=[{...t.w.sessions[0],id:'newer-session',sheets:t.w.sessions[0].sheets.map(p=>({...p,scanId:`new-${p.scanId}`,reviewedAnswers:null,scannedAt:'2026-03-01'}))},...t.w.sessions];
  t.button('Confirm 11 results & complete assignments').click();await pause();await pause();
  assert.equal(t.w.confirmed.length,0);assert.equal(t.w.refreshed,0);assert.match(t.w.document.querySelector('[role="alert"]').textContent,/newer or unfinished booklet/);assert.deepEqual(t.errors,[]);
 }finally{t.w.root.unmount();t.dom.window.close();}
});


test('failed original photo stays in the tray and Adjust corners reprocesses it into required teacher review',async()=>{
 const t=await setup();try{
  t.w.sessions[0].sheets[2].scanId=null;t.w.sessions[0].sheets[2].reviewedAnswers=null;
  const file=new t.w.File(['photo'],'original.jpg',{type:'image/jpeg'});
  const input=t.w.document.querySelector('[aria-label="Choose answer sheet photos"]');Object.defineProperty(input,'files',{value:[file]});input.dispatchEvent(new t.w.Event('change',{bubbles:true}));await pause();await pause();
  assert.match(t.w.document.querySelector('.psc-batch').textContent,/1 need attention/);assert.equal(t.w.scanCalls.length,1);assert.equal(t.w.confirmed.length,0);
  t.button('Adjust corners').click();await pause();const image=t.w.document.querySelector('.psc-align img');assert.equal(image.src,'blob:photo');image.getBoundingClientRect=()=>({left:0,top:0,width:100,height:200});image.dispatchEvent(new t.w.Event('load'));await pause();
  for(const [x,y] of [[5,10],[95,10],[95,190],[5,190]]){image.dispatchEvent(new t.w.MouseEvent('click',{bubbles:true,clientX:x,clientY:y}));await pause();}
  t.button('Read adjusted photo').click();await pause();await pause();assert.equal(t.w.scanCalls.length,2);assert.equal(t.w.scanCalls[1].file,file);assert.equal(t.w.scanCalls[1].anchors.length,4);
  assert.match(t.w.document.querySelector('.psc-batch').textContent,/Ready to review/);t.button('Start review').click();await pause();await pause();
  assert.equal(t.button('Save page & continue').disabled,true);assert.equal(t.w.confirmed.length,0);assert.deepEqual(t.errors,[]);
 }finally{t.w.root.unmount();t.dom.window.close();}
});
