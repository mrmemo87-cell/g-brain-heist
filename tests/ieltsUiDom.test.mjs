import {JSDOM,VirtualConsole} from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=(await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Track from './src/components/ielts/IeltsSkillTrack';import {IeltsConfirm} from './src/components/ielts/IeltsUi';function App(){const [open,setOpen]=React.useState(false);return <><Track label="Reading" benefit="Follow the evidence" progress={window.progress} locked={window.locked} onNavigate={route=>window.route=route} onUnlock={()=>window.unlocked=true}/><button id="opener" onClick={()=>setOpen(true)}>Archive</button>{open&&<IeltsConfirm title="Archive assignment?" action="Archive assignment" busy={false} onCancel={()=>setOpen(false)} onConfirm={()=>window.confirmed=true}><p>Saved history is preserved.</p></IeltsConfirm>}</>;}createRoot(document.getElementById('root')).render(<App/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},logLevel:'silent'})).outputFiles[0].text;
const base={totalAvailableTasks:1,completedTaskCount:0,nextUnfinishedTaskRoute:'/ielts/reading/12',allTasksCompleted:false,buttonLabel:'Start',status:'not_started'};
async function mount(progress=base,locked=false){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window;w.progress=progress;w.locked=locked;w.eval(bundle);
 const wait=async f=>{for(let i=0;i<80;i++){if(f())return;await new Promise(r=>setTimeout(r,10));}throw Error(w.document.body.textContent);};await wait(()=>w.document.querySelector('article button'));
 return {dom,w,wait,errors};
}
test('skill cards open the exact unfinished task or saved progress when completed; unavailable and locked tracks stay honest',async()=>{
 for(const [progress,locked,expected] of [[base,false,'/ielts/reading/12'],[{...base,nextUnfinishedTaskRoute:null,completedTaskCount:1,allTasksCompleted:true,buttonLabel:'Completed'},false,'/ielts/journey'],[{...base,totalAvailableTasks:0,nextUnfinishedTaskRoute:null,buttonLabel:'Coming soon'},false,null],[base,true,'unlock']]){
  const m=await mount(progress,locked);try{
   const button=m.w.document.querySelector('article button');assert.equal(button.disabled,expected===null);button.click();
   if(expected==='unlock') assert.equal(m.w.unlocked,true);else assert.equal(m.w.route,expected??undefined);
   if(progress.allTasksCompleted)assert.equal(button.textContent,'View progress & feedback');assert.equal(m.w.document.querySelector('progress').getAttribute('max'),'100');assert.deepEqual(m.errors,[]);
  }finally{m.dom.window.close();}
 }
});
test('lifecycle dialog focuses Cancel, traps focus, isolates its background and restores the opener on Escape',async()=>{
 const m=await mount();try{
  const opener=m.w.document.getElementById('opener');opener.focus();opener.click();await m.wait(()=>m.w.document.querySelector('[role=dialog]'));
  const dialog=m.w.document.querySelector('[role=dialog]'),buttons=dialog.querySelectorAll('button');assert.equal(m.w.document.activeElement,buttons[0]);assert.equal(dialog.getAttribute('aria-modal'),'true');assert.ok(m.w.document.querySelector('article[inert]'));
  buttons[1].focus();buttons[1].dispatchEvent(new m.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(m.w.document.activeElement,buttons[0]);buttons[0].dispatchEvent(new m.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(m.w.document.activeElement,buttons[1]);
  buttons[1].dispatchEvent(new m.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await m.wait(()=>!m.w.document.querySelector('[role=dialog]'));assert.equal(m.w.document.activeElement,opener);assert.equal(m.w.document.querySelector('[inert]'),null);assert.equal(m.w.confirmed,undefined);assert.deepEqual(m.errors,[]);
 }finally{m.dom.window.close();}
});
