import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createEcho3DRenderer } from '../src/features/retention/echo3dRenderer.js';
const source=fs.readFileSync(new URL('../public/retention/gulla-prototype-v1.glb',import.meta.url));
const model=()=>source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength);
test('pilot 3D renderer animates real GLB joints, settles, suspends and releases resources',()=>{
 let queue=new Map(),id=0,clock=0,matrices=[],deleted=0,lost=0;const old={window:globalThis.window,performance:globalThis.performance,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
 globalThis.window={devicePixelRatio:3};Object.defineProperty(globalThis,'performance',{value:{now:()=>clock},configurable:true});globalThis.requestAnimationFrame=fn=>{queue.set(++id,fn);return id};globalThis.cancelAnimationFrame=n=>queue.delete(n);
 const gl=new Proxy({},{get(_,k){if(k==='NO_ERROR')return 0;if(k==='getError')return()=>0;if(k==='getShaderParameter'||k==='getProgramParameter')return()=>true;if(k==='getUniformLocation')return(_,n)=>n;if(k==='uniformMatrix4fv')return(n,_,v)=>{if(n==='joints[0]')matrices.push([...v])};if(k==='getExtension')return()=>({loseContext:()=>lost++});if(k.startsWith('delete'))return()=>deleted++;if(k.startsWith('create'))return()=>({});return()=>{};}});
 const canvas=new EventTarget();Object.assign(canvas,{getContext:()=>gl,clientWidth:96,clientHeight:96,width:0,height:0});const step=()=>{clock+=34;const q=[...queue.values()];queue.clear();q.forEach(fn=>fn(clock))};
 try{
 let ready=0;const api=createEcho3DRenderer(canvas,model(),{palette:'cyan',onReady:()=>ready++});api.setPose('greeting');step();const first=matrices.at(-1);assert.equal(ready,1);for(let i=0;i<20;i++)step();assert.ok(matrices.at(-1).some((v,i)=>Math.abs(v-first[i])>.001));assert.equal(canvas.width,144);assert.equal(canvas.height,144);
 for(let i=0;i<220;i++)step();assert.equal(queue.size,0);api.setPose('celebrate');step();assert.ok(queue.size);api.setVisible(false);assert.equal(queue.size,0);api.setVisible(true);step();assert.ok(queue.size);api.setReduced(true);for(let i=0;i<3;i++)step();assert.equal(queue.size,0);api.setPalette('pink');step();assert.equal(queue.size,0);
 api.dispose();assert.ok(deleted>100);assert.equal(lost,1);api.setPose('curious');assert.equal(queue.size,0);api.dispose();assert.equal(lost,1);
 }finally{globalThis.window=old.window;Object.defineProperty(globalThis,'performance',{value:old.performance,configurable:true});globalThis.requestAnimationFrame=old.requestAnimationFrame;globalThis.cancelAnimationFrame=old.cancelAnimationFrame}
});
test('unsupported WebGL uses the component fallback instead of a rendering loop',()=>{assert.throws(()=>createEcho3DRenderer({getContext:()=>null},model()),/unavailable/)});

test('visible 3D wrapper loads without any observer callback, confirms first draw and can retry context loss',async()=>{
 const {build}=await import('esbuild');const {JSDOM}=await import('jsdom');const React=await import('react');const {act}=React;
 const dom=new JSDOM('<div id="root"></div>',{url:'https://brainsheist.com',pretendToBeVisual:true});const w=dom.window;
 globalThis.window=w;globalThis.document=w.document;Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
 globalThis.requestAnimationFrame=fn=>setTimeout(()=>fn(performance.now()),0);globalThis.cancelAnimationFrame=id=>clearTimeout(id);
 const observers=[];globalThis.IntersectionObserver=class{constructor(){observers.push(this)}observe(node){this.node=node}disconnect(){this.disconnected=true}};
 const original=w.HTMLElement.prototype.getBoundingClientRect;w.HTMLElement.prototype.getBoundingClientRect=function(){return this.classList.contains('echo-3d-avatar')?{width:96,height:96,top:100,left:10,right:106,bottom:196}:original.call(this)};
 const gl=new Proxy({NO_ERROR:0},{get(t,k){if(k in t)return t[k];if(k==='getError')return()=>0;if(k==='getShaderParameter'||k==='getProgramParameter')return()=>true;if(k==='getExtension')return()=>null;if(k==='getUniformLocation')return(_,n)=>n;if(k.startsWith('create'))return()=>({});return()=>{}}});w.HTMLCanvasElement.prototype.getContext=()=>gl;
 let requests=0;const previous=globalThis.fetch;globalThis.fetch=async()=>{requests++;return{ok:true,arrayBuffer:async()=>model()}};
 const tmp=fs.mkdtempSync(new URL('./.echo3d-dom-',import.meta.url));const out=tmp+'/ui.mjs';await build({entryPoints:['src/features/retention/Echo3DAvatar.tsx'],bundle:true,platform:'node',format:'esm',outfile:out,external:['react','react-dom','react/jsx-runtime'],logLevel:'silent'});const {default:Avatar}=await import(out);const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));const states=[];
 const render=async retry=>{await act(async()=>{root.render(React.createElement(Avatar,{pose:'greeting',palette:'pink',retry,onState:s=>states.push(s.status)}));await new Promise(r=>setTimeout(r,40))});};await render(0);await act(async()=>new Promise(r=>setTimeout(r,40)));
 try{
 assert.equal(requests,1);assert.ok(observers.some(o=>o.node?.classList.contains('echo-3d-avatar')));assert.ok(!observers.some(o=>o.node?.tagName==='CANVAS'));
 assert.equal(document.querySelector('[data-echo-3d]').getAttribute('data-echo-3d'),'ready');assert.equal(states.at(-1),'ready');assert.ok(!document.querySelector('.echo-avatar'));
 const first=document.querySelector('canvas');await act(async()=>first.dispatchEvent(new w.Event('webglcontextlost',{cancelable:true})));assert.equal(document.querySelector('[data-echo-3d]').getAttribute('data-echo-3d'),'failed');assert.ok(document.querySelector('.echo-avatar'));
 await render(1);await act(async()=>new Promise(r=>setTimeout(r,40)));assert.equal(requests,2);assert.notEqual(document.querySelector('canvas'),first);assert.equal(states.at(-1),'ready');assert.ok(observers.some(o=>o.disconnected));
 }finally{await act(async()=>root.unmount());globalThis.fetch=previous;delete globalThis.IntersectionObserver;dom.window.close();fs.rmSync(tmp,{recursive:true,force:true})}
});
