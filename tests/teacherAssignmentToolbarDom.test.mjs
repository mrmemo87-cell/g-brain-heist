import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const result = await build({ stdin:{ contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import Toolbar from './components/teacher/AssignmentToolbar'; createRoot(document.getElementById('root')).render(<Toolbar {...window.props}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',loader:{'.css':'empty'},logLevel:'silent' });
const pause = () => new Promise(resolve => setTimeout(resolve, 30));
async function setup(canCreate=true) {
  const dom = new JSDOM('<div id="root"></div>',{runScripts:'dangerously',url:'http://localhost'});
  const calls=[];
  dom.window.props={ classes:['7A','Grade 8 ESL'],counts:new Map([['7a',0],['grade 8 esl',4]]),total:6,shown:4,selectedClass:'Grade 8 ESL',search:'future',subjects:['ESL','English'],subject:'ESL',status:'in-progress',canCreate,...Object.fromEntries(['Class','Search','Subject','Status','Assignment','Diagnostic'].map(name=>['on'+name,value=>calls.push([name,value])])) };
  dom.window.eval(result.outputFiles[0].text); await pause();
  return {dom,doc:dom.window.document,calls};
}
test('class selection, search, subject and progress preserve their callbacks; clear resets every filter',async()=>{
  const {dom,doc,calls}=await setup();
  try {
    doc.querySelector('.assignment-toolbar__classes button').click();
    const mobile=doc.querySelector('.assignment-toolbar__mobile-class select');mobile.value='7A';mobile.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    doc.querySelector('.assignment-toolbar__status button:last-child').click();
    doc.querySelector('.assignment-toolbar__filter-button').click();await pause();
    const subject=doc.querySelector('.assignment-toolbar__subject select');subject.value='English';subject.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    doc.querySelector('.assignment-toolbar__summary button').click();
    assert.deepEqual(calls,[['Class','all'],['Class','7A'],['Status','completed'],['Subject','English'],['Class','all'],['Search',''],['Subject','all'],['Status','all']]);
    assert.equal(doc.querySelector('input').type,'search');
    assert.match(doc.querySelector('[role=status]').textContent,/4 of 6 shown · ESL/);
  } finally {dom.window.close();}
});
test('Create choices close after use; Escape restores focus and outside click dismisses',async()=>{
  const {dom,doc,calls}=await setup();
  try {
    const trigger=doc.querySelector('.assignment-toolbar__primary');
    for(const index of [0,1]) {trigger.click();await pause();doc.querySelectorAll('.assignment-toolbar__create-options button')[index].click();await pause();assert.equal(trigger.getAttribute('aria-expanded'),'false');}
    assert.deepEqual(calls,[['Assignment',undefined],['Diagnostic',undefined]]);
    trigger.click();await pause();doc.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await pause();assert.equal(doc.activeElement,trigger);assert.equal(trigger.getAttribute('aria-expanded'),'false');
    trigger.click();await pause();doc.body.dispatchEvent(new dom.window.Event('pointerdown',{bubbles:true}));await pause();assert.equal(trigger.getAttribute('aria-expanded'),'false');
  } finally {dom.window.close();}
});
test('creation stays disabled without assignment entitlement',async()=>{const {dom,doc,calls}=await setup(false);try{const trigger=doc.querySelector('.assignment-toolbar__primary');assert.equal(trigger.disabled,true);trigger.click();await pause();assert.equal(doc.querySelector('.assignment-toolbar__create-options'),null);assert.deepEqual(calls,[]);}finally{dom.window.close();}});
