import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bundle = await build({stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client';
import Panel from './components/teacher/PhysicsAssessmentPanel'; import Preview from './components/teacher/QuestionPreviewModal';
createRoot(document.getElementById('root')).render(window.preview ? <Preview question={window.question} onClose={()=>{}} /> : <Panel evidence={window.evidence}/>);`,loader:'tsx',resolveDir:process.cwd()},
bundle:true,format:'iife',write:false,loader:{'.css':'empty'},logLevel:'silent'});
async function render(values) {
  const dom = new JSDOM('<div id="root"></div>',{runScripts:'outside-only',pretendToBeVisual:true});
  Object.assign(dom.window,values);dom.window.eval(bundle.outputFiles[0].text);
  for(let i=0;i<40&&!dom.window.document.querySelector('section');i++) await new Promise((resolve)=>setTimeout(resolve,10));
  return dom;
}
test('Physics panel distinguishes missing evidence from unavailable data and shows fresh evidence counts', async()=>{
  for (const [evidence,expected] of [[null,/unavailable.*not a zero score/],
    [{components:[],programmeConfigured:true},/No profiled Physics answers yet/],
    [{programmeConfigured:true,components:[{ao:'AO2',component:'BH-CIE0654-AO2-problem-solving',independentFreshCount:4,independentFreshCorrectCount:3,distinctQuestions:4,distinctAssignments:2,studentsWithIndependentEvidence:2,practiceOrRepeatedCount:5}]},/3\/4/]]) {
    const dom=await render({evidence});try {
      const text=dom.window.document.body.textContent;
      assert.match(text,expected); assert.match(text,/not a predicted grade or mastery judgement/);
      if(evidence?.components.length) {assert.match(text,/Solving quantitative problems/);assert.match(text,/4 questions · 2 assignments · 2 students/);assert.equal(dom.window.document.querySelectorAll('th[scope="col"]').length,4);}
    } finally {dom.window.close();}
  }
});
test('teacher preview renders official programme separately from canonical skill and internal AO',async()=>{
  const dom=await render({preview:true,question:{subject:'Physics',topic:'Radioactivity',question_type:'multiple_choice',question_text:'Half-life test',difficulty:'medium',correct_answer:'10',options:['5','10','15','20'],analytics_eligible:true,verification_status:'verified',
    assessment_profiles:[{programmeCode:'0654',sourceVersion:'2025-2027',syllabusReference:'P5.2.4.1',syllabusTier:'core',assessmentObjectives:['AO2'],objectiveComponents:['BH-CIE0654-AO2-problem-solving']}],
    registry_mappings:[{registryCode:'bh-science-core-v1',skill:'Atomic and nuclear physics',subskill:'Radioactivity',evidenceFocus:'Determine half-life from decay data',evidenceStatement:'Uses decay data.',assessmentProcess:'BH-AO2'}]}});
  try {const text=dom.window.document.body.textContent;for(const expression of [/0654 · 2025-2027/,/P5.2.4.1/,/Core \(also used in Extended\)/,/Determine half-life from decay data/,/Solving quantitative problems/,/does not assess practical performance/])assert.match(text,expression);}
  finally {dom.window.close();}
});
