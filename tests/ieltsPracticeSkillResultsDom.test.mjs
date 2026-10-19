import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {JSDOM} from 'jsdom';
// Pilot finding 2026-10-19: result tips were generic ("listen to podcasts"). Results are now per mapped skill.
const bundle=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import S from'./src/components/ielts/IeltsPracticeSkillResults';window.mount=(review)=>{window.root=createRoot(document.getElementById('root'));window.root.render(<S review={review}/>);};`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,logLevel:'silent'});
const item=(id,ok,code,name)=>({question_id:id,correct_answer:['x'],explanation:null,is_correct:ok,construct:code?{code,name}:null});
async function render(review){const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;w.eval(bundle.outputFiles[0].text);w.mount(review);await new Promise(r=>setTimeout(r,30));const t=w.document.body.textContent;w.root.unmount();w.close();return t;}
test('shows each mapped skill with its score and a tip only for skills that were missed',async()=>{
 const t=await render({raw_score:4,total:6,percent:66.67,items:[item(1,false,'bh-ielts-listening-v1-sequencing','Sequencing'),...[2,3,4,5].map(i=>item(i,true,'bh-ielts-listening-v1-sequencing','Sequencing')),item(6,false,'bh-ielts-listening-v1-distractor-resistance','Distractor resistance')]});
 assert.match(t,/Your skills in this set/);assert.match(t,/Distractor resistance0\/1/);assert.match(t,/Sequencing4\/5/);
 assert.match(t,/Distractor resistance:.*change their minds/);assert.match(t,/Sequencing:.*first, next/);
 assert.doesNotMatch(t,/podcast/i);
});
test('renders nothing for sets without mapped skills, so the general guidance stays',async()=>{
 assert.equal(await render({raw_score:1,total:2,percent:50,items:[item(1,true,null,null),item(2,false,null,null)]}),'');
});
