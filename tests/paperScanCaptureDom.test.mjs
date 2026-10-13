import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Capture from './components/teacher/ScanPhotoCapture'; window.root=createRoot(document.getElementById('root')); window.root.render(<Capture limit={window.limit} onUse={files=>{window.used=files;window.root.unmount()}} onClose={()=>window.root.unmount()}/>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle:true, format:'iife', write:false, logLevel:'silent' });
const pause = () => new Promise(resolve=>setTimeout(resolve,15));
async function until(predicate) { for (let i=0;i<100;i++) { if (predicate()) return; await pause(); } assert.ok(predicate(), 'UI did not become ready'); }
async function take(t) { await until(()=>t.button('Take photo') && !t.button('Take photo').disabled); t.button('Take photo').click(); await until(()=>t.button('Take photo')); }
async function setup({limit=30, deny=false, deferred=false}={}) {
  const errors=[];
  const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM('<button id="origin">Open</button><div id="root"></div>', {url:'https://test.local', runScripts:'outside-only',pretendToBeVisual:true, virtualConsole:console});
  const w=dom.window; w.limit=limit;w.used=null;w.stopped=0;w.revoked=[];w.document.querySelector('#origin').focus();
  Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:()=>deny?Promise.reject(new Error('denied')):deferred?new Promise(resolve=>w.grant=()=>resolve({getTracks:()=>[{stop:()=>w.stopped++}]})):Promise.resolve({getTracks:()=>[{stop:()=>w.stopped++}]})}});
  w.HTMLMediaElement.prototype.play=async()=>{};
  Object.defineProperty(w.HTMLVideoElement.prototype,'videoWidth',{get:()=>1920});Object.defineProperty(w.HTMLVideoElement.prototype,'videoHeight',{get:()=>2560});
  w.HTMLCanvasElement.prototype.getContext=()=>({drawImage:()=>{}});w.HTMLCanvasElement.prototype.toBlob=function(callback){callback(new w.Blob(['photo'],{type:'image/jpeg'}))};
  w.URL.createObjectURL=()=>`blob:photo-${Math.random()}`;w.URL.revokeObjectURL=url=>w.revoked.push(url);
  w.eval(bundle.outputFiles[0].text);await until(()=>w.document.querySelector('[role="dialog"]'));await pause();
  return {dom,w,errors,button:text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===text)};
}
test('capture 13 consecutive shots; remove, recapture, and process only after Use 13 photos',async()=>{
 const t=await setup();try{
  for(let i=0;i<13;i++){await take(t);await pause();}
  assert.equal(t.w.document.querySelectorAll('figure').length,13);assert.equal(t.w.used,null);
  t.w.document.querySelector('[aria-label="Remove photo 4"]').click();await pause();assert.equal(t.w.document.querySelectorAll('figure').length,12);
  await take(t);await pause();t.button('Use 13 photos').click();await pause();
  assert.equal(t.w.used.length,13);assert.equal(t.w.stopped,1);assert.equal(t.w.revoked.length,14);assert.equal(t.w.document.body.style.overflow,'');assert.deepEqual(t.errors,[]);
 }finally{t.dom.window.close();}
});
test('camera tray cap and closing release media and local previews',async()=>{
 const t=await setup({limit:2});try{
  for(let i=0;i<2;i++){await take(t);await pause();}
  assert.equal(t.button('Take photo').disabled,true);t.button('Close').click();await pause();assert.equal(t.w.used,null);assert.equal(t.w.stopped,1);assert.equal(t.w.revoked.length,2);
 }finally{t.dom.window.close();}
});
test('camera denied still supports native camera and multiple gallery input',async()=>{
 const t=await setup({deny:true});try{
  assert.equal(t.button('Take photo').disabled,true);assert.match(t.w.document.querySelector('[role="status"]').textContent,/Allow camera access/);
  const input=t.w.document.querySelector('[aria-label="Add photos to camera tray"]');assert.equal(input.multiple,true);
  Object.defineProperty(input,'files',{value:[new t.w.File(['a'],'a.jpg',{type:'image/jpeg'}),new t.w.File(['b'],'b.jpg',{type:'image/jpeg'})]});input.dispatchEvent(new t.w.Event('change',{bubbles:true}));await pause();
  assert.ok(t.button('Use 2 photos'));assert.equal(t.w.used,null);t.button('Use 2 photos').click();await pause();assert.equal(t.w.used.length,2);
 }finally{t.dom.window.close();}
});
test('permission resolving after close cannot leak camera tracks',async()=>{
 const t=await setup({deferred:true});try{t.button('Close').click();await pause();t.w.grant();await pause();assert.equal(t.w.stopped,1);assert.equal(t.w.document.querySelector('[role="dialog"]'),null);}finally{t.dom.window.close();}
});

test('Escape closes the camera without closing the surrounding assignment dialog',async()=>{
 const t=await setup();try{
  let parentEscapes=0;t.w.document.addEventListener('keydown',event=>{if(event.key==='Escape')parentEscapes++});
  t.w.document.querySelector('[role="dialog"]').dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await pause();
  assert.equal(t.w.document.querySelector('[role="dialog"]'),null);assert.equal(parentEscapes,0);assert.equal(t.w.stopped,1);
 }finally{t.dom.window.close();}
});
