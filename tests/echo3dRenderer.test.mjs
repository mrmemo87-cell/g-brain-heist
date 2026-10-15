import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createEcho3DRenderer } from '../src/features/retention/echo3dRenderer.js';
const source=fs.readFileSync(new URL('../public/retention/gulla-prototype-v1.glb',import.meta.url));
const model=()=>source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength);
test('pilot 3D renderer animates real GLB joints, settles, suspends and releases resources',()=>{
 let queue=new Map(),id=0,clock=0,matrices=[],deleted=0,lost=0;const old={window:globalThis.window,performance:globalThis.performance,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
 globalThis.window={devicePixelRatio:3};Object.defineProperty(globalThis,'performance',{value:{now:()=>clock},configurable:true});globalThis.requestAnimationFrame=fn=>{queue.set(++id,fn);return id};globalThis.cancelAnimationFrame=n=>queue.delete(n);
 const gl=new Proxy({},{get(_,k){if(k==='getShaderParameter'||k==='getProgramParameter')return()=>true;if(k==='getUniformLocation')return(_,n)=>n;if(k==='uniformMatrix4fv')return(n,_,v)=>{if(n==='joints[0]')matrices.push([...v])};if(k==='getExtension')return()=>({loseContext:()=>lost++});if(k.startsWith('delete'))return()=>deleted++;if(k.startsWith('create'))return()=>({});return()=>{};}});
 const canvas=new EventTarget();Object.assign(canvas,{getContext:()=>gl,clientWidth:96,clientHeight:96,width:0,height:0});const step=()=>{clock+=34;const q=[...queue.values()];queue.clear();q.forEach(fn=>fn(clock))};
 try{
 const api=createEcho3DRenderer(canvas,model(),{palette:'cyan'});api.setPose('greeting');step();const first=matrices.at(-1);for(let i=0;i<20;i++)step();assert.ok(matrices.at(-1).some((v,i)=>Math.abs(v-first[i])>.001));assert.equal(canvas.width,144);assert.equal(canvas.height,144);
 for(let i=0;i<220;i++)step();assert.equal(queue.size,0);api.setPose('celebrate');step();assert.ok(queue.size);api.setVisible(false);assert.equal(queue.size,0);api.setVisible(true);step();assert.ok(queue.size);api.setReduced(true);for(let i=0;i<3;i++)step();assert.equal(queue.size,0);api.setPalette('pink');step();assert.equal(queue.size,0);
 api.dispose();assert.ok(deleted>100);assert.equal(lost,1);api.setPose('curious');assert.equal(queue.size,0);api.dispose();assert.equal(lost,1);
 }finally{globalThis.window=old.window;Object.defineProperty(globalThis,'performance',{value:old.performance,configurable:true});globalThis.requestAnimationFrame=old.requestAnimationFrame;globalThis.cancelAnimationFrame=old.cancelAnimationFrame}
});
test('unsupported WebGL uses the component fallback instead of a rendering loop',()=>{assert.throws(()=>createEcho3DRenderer({getContext:()=>null},model()),/unavailable/)});
