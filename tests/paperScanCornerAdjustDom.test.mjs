import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const bundle = await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Adjust from './components/teacher/ScanCornerAdjust';window.root=createRoot(document.getElementById('root'));window.root.render(<Adjust file={new File(['photo'],'retained.jpg',{type:'image/jpeg'})} onUse={points=>{window.points=points;window.root.unmount()}} onClose={()=>window.root.unmount()}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false});
const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
test('retained photo accepts four ordered relative corner hints, zoom and correction, then releases its URL',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://test.local',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;w.revoked=[];w.URL.createObjectURL=()=> 'blob:retained';w.URL.revokeObjectURL=url=>w.revoked.push(url);
 try{
  w.eval(bundle.outputFiles[0].text);await pause();await pause();
  const image=w.document.querySelector('img');image.getBoundingClientRect=()=>({left:0,top:0,width:100,height:200});image.dispatchEvent(new w.Event('load'));await pause();
  const submit=()=>[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Read adjusted photo');assert.equal(submit().disabled,true);
  for(const [x,y] of [[5,10],[95,10],[95,190],[5,190]]){image.dispatchEvent(new w.MouseEvent('click',{bubbles:true,clientX:x,clientY:y}));await pause();}
  assert.equal(submit().disabled,false);assert.equal(w.document.querySelectorAll('.psc-align-point').length,4);
  const slider=w.document.querySelector('input');slider.value='2';slider.dispatchEvent(new w.Event('input',{bubbles:true}));slider.dispatchEvent(new w.Event('change',{bubbles:true}));await pause();
  submit().click();await pause();assert.deepEqual(JSON.parse(JSON.stringify(w.points)),[{x:.05,y:.05},{x:.95,y:.05},{x:.95,y:.95},{x:.05,y:.95}]);assert.deepEqual(w.revoked,['blob:retained']);assert.equal(w.document.body.style.overflow,'');
 }finally{w.root.unmount();dom.window.close();}
});
