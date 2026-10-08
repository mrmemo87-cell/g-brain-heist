import { JSDOM, VirtualConsole } from 'jsdom';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const school='00000000-0000-0000-0000-000000000900';
const bundle=await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{useIeltsTeacherProgrammeEntry}from'./src/hooks/useIeltsTeacherProgrammeEntry';import Shortcut from './components/teacher/TeacherIeltsProgrammeShortcut';function App(){const[actor,setActor]=useState({id:'teacher-a',role:window.testRole||'teacher'});window.changeActor=setActor;const data=useIeltsTeacherProgrammeEntry(actor.id,actor.role,'${school}');return <Shortcut {...data} onRetry={data.retry}/>;}createRoot(document.getElementById('root')).render(<App/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},define:{'import.meta':JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-key'}})},logLevel:'silent'});
async function setup(response,role='teacher') {
 const calls=[],errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.Request=Request;w.Response=Response;w.Headers=Headers;w.testRole=role;
 w.fetch=async(url,options)=>{calls.push({fn:String(url).split('/').pop(),body:options?.body});const result=await response(calls.length);return new Response(JSON.stringify(result.data),{status:result.status??200,headers:{'Content-Type':'application/json'}});};
 w.eval(bundle.outputFiles[0].text);
 const wait=async(fn)=>{for(let i=0;i<80;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI did not settle: '+w.document.body.textContent);};
 const link=()=>w.document.querySelector('a');
 return{w,dom,calls,errors,wait,link};
}
const allocated={data:{schools:[{id:school,name:'Synthetic school'}]}};
test('allocated lead sees a direct school-scoped workspace link, with one lightweight read',async()=>{
 const t=await setup(()=>allocated);try{await t.wait(()=>t.link());assert.equal(t.link().getAttribute('href'),`/ielts/programme?school=${school}`);assert.match(t.w.document.body.textContent,/allocated programme lead/);assert.equal(t.calls.length,1);assert.equal(t.calls[0].fn,'rpc_ielts_teacher_programme_entry');assert.deepEqual(JSON.parse(t.calls[0].body),{});assert.deepEqual(t.errors,[]);}finally{t.dom.window.close();}
});
test('allocation changes refresh on return, revoked entries disappear, and failed checks can be retried',async()=>{
 let response={data:{schools:[]}};const t=await setup(()=>response);try{
 await t.wait(()=>t.calls.length===1);await new Promise(r=>setTimeout(r,40));assert.equal(t.link(),null);
 response=allocated;t.w.dispatchEvent(new t.w.Event('focus'));await t.wait(()=>t.link());
 response={data:{schools:[]}};t.w.dispatchEvent(new t.w.Event('focus'));await t.wait(()=>t.calls.length===3);assert.equal(t.link(),null);
 response={status:500,data:{message:'Synthetic failure'}};t.w.dispatchEvent(new t.w.Event('focus'));await t.wait(()=>t.w.document.querySelector('button'));assert.equal(t.link(),null);
 response=allocated;t.w.document.querySelector('button').click();await t.wait(()=>t.link());assert.equal(t.calls.length,5);assert.deepEqual(t.errors,[]);
 }finally{t.dom.window.close();}
});
test('a late response from a previous account cannot show its allocation to the next account',async()=>{
 let finish;const pending=new Promise(resolve=>finish=resolve);const t=await setup(n=>n===1?pending:{data:{schools:[]}});try{
 await t.wait(()=>t.calls.length===1);t.w.dispatchEvent(new t.w.Event('focus'));assert.equal(t.calls.length,1);
 t.w.changeActor({id:'teacher-b',role:'teacher'});await t.wait(()=>t.calls.length===2);finish(allocated);await new Promise(r=>setTimeout(r,60));assert.equal(t.link(),null);assert.deepEqual(t.errors,[]);
 }finally{t.dom.window.close();}
});
test('student accounts do not query teacher allocation or receive teacher navigation',async()=>{
 const t=await setup(()=>allocated,'student');try{await new Promise(r=>setTimeout(r,60));assert.equal(t.calls.length,0);assert.equal(t.link(),null);}finally{t.dom.window.close();}
});
test('teacher portal wires both dashboard and shared desktop/mobile menu to the allocation entry',()=>{
 const source=readFileSync('components/TeacherPortal.tsx','utf8');
 assert.match(source,/useIeltsTeacherProgrammeEntry\(profile.id, profile.role, profile.school_id\)/);
 assert.match(source,/ieltsProgramme.entry \? \[\{ id: 'ielts-programme'/);
 assert.match(source,/case 'ielts-programme':[\s\S]*?window.location.assign\(teacherProgrammeRoute\(ieltsProgramme.entry\)\)/);
 assert.match(source,/<TeacherIeltsProgrammeShortcut entry=\{ieltsProgramme.entry\}/);
 assert.match(source,/teacher-mobile-menu-grid[\s\S]*?navTabs.map/);
});
