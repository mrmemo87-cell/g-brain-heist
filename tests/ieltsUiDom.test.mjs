import {readFileSync} from 'node:fs';
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

test('performance mode preserves the opaque IELTS dialog and readable theme colors',async()=>{
 const m=await mount();try{
  m.w.document.body.classList.add('light-mode');
  const tokens=Object.fromEntries([...readFileSync('src/styles/ielts-design-system.css','utf8').matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(x=>[x[1],x[2]]));
  for(const file of ['src/styles/ielts-ui.css','src/styles/light-mode.css']){
   const style=m.w.document.createElement('style');style.textContent=readFileSync(file,'utf8').replace(/@import[^;]+;/g,'').replace(/var\((--[\w-]+)\)/g,(_,name)=>tokens[name]);m.w.document.head.append(style);
  }
  m.w.document.getElementById('opener').click();await m.wait(()=>m.w.document.querySelector('[role=dialog]'));
  const dialog=m.w.document.querySelector('[role=dialog]');const css=m.w.getComputedStyle(dialog);
  assert.equal(css.backgroundColor,'rgb(255, 255, 255)');assert.equal(css.color,'rgb(21, 36, 58)');
  const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
  assert.ok(1.05/(luminance([21,36,58])+0.05)>=4.5,'Dialog text must meet normal-text AA contrast');
  const stylesheet=[...m.w.document.styleSheets].at(-1);
  for(const rule of stylesheet.cssRules){
   if(rule.selectorText&&rule.style?.getPropertyPriority('background-color')==='important')
    assert.equal(dialog.matches(rule.selectorText),false,'A performance-mode dark background must not target a semantic dialog');
  }
  assert.equal(dialog.querySelectorAll('button').length,2);
 }finally{m.dom.window.close();}
});
