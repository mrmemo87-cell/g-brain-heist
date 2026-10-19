import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {JSDOM} from 'jsdom';
// Owner report 2026-10-19: switching browser/phone tabs "reloaded" the teacher workspace. Supabase emits SIGNED_IN /
// TOKEN_REFRESHED for the same user on tab return; the route guard used to unmount everything behind a loader.
const bundle=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{RouterProvider,createBrowserRouter}from'./src/lib/router';import G from'./components/ielts/SchoolAdminIeltsRoute';
let n=0;const Child=()=>{const[id]=React.useState(()=>++n);window.mounts=n;return <p>workspace-{id}</p>;};
window.mount=()=>{window.root=createRoot(document.getElementById('root'));window.root.render(<RouterProvider router={createBrowserRouter([{path:'/x',element:<G ieltsTab="ielts-overview"><Child/></G>}])}/>);};`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},logLevel:'silent',
 plugins:[{name:'stubs',setup(b){
  b.onLoad({filter:/services[\\/]supabaseClient\.ts$/},()=>({contents:`export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),onAuthStateChange:(cb)=>{window.fireAuth=cb;return{data:{subscription:{unsubscribe(){}}}};}}};export const isMissingSupabaseConfig=false;`,loader:'js'}));
  b.onLoad({filter:/services[\\/]schoolAdminService\.ts$/},()=>({contents:`export async function resolveMySchoolCapabilities(){window.checks=(window.checks||0)+1;return{status:'ok',capabilities:{can_administer:true}}}`,loader:'js'}));
  b.onLoad({filter:/components[\\/]SchoolAdminPortal\.tsx$/},()=>({contents:`export default function P(p){return p.children??null}`,loader:'js'}));
 }}]});
test('a token refresh for the same user keeps the teacher workspace mounted; a different account re-checks',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/x',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 const wait=async f=>{for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,10));}throw Error(w.document.body.innerHTML.slice(0,300));};
 try{w.eval(bundle.outputFiles[0].text);w.mount();await wait(()=>w.checks===1&&typeof w.fireAuth==='function');
  await new Promise(r=>setTimeout(r,50));const before=w.mounts;
  for(const ev of ['SIGNED_IN','TOKEN_REFRESHED','SIGNED_IN'])w.fireAuth(ev,{user:{id:'u1'}});
  await new Promise(r=>setTimeout(r,80));
  assert.equal(w.checks,1,'no access re-check for the same user');assert.equal(w.mounts,before,'workspace not remounted');
  w.fireAuth('SIGNED_IN',{user:{id:'u2'}});await wait(()=>w.checks===2);
 }finally{w.root?.unmount();w.close();}
});
