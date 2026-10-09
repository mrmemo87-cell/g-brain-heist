import test from 'node:test';
import assert from 'node:assert/strict';
import { LEARNING_AI_INSTRUCTIONS, validateLearningAiOutput } from '../supabase/functions/_shared/ieltsLearningAiDraft';
const context={answers:{q1:'Sunday'},questions:[{id:'q1'}]};
const draft=()=>({fields:{went_well:'You chose the final day correctly.',work_on:'Explain why the earlier day is not the answer.',practice:'Replay the correction and note the final detail.',check_again:'Try a fresh task with your teacher.'},evidence:[{id:'q1',answer:'Sunday'}]});
test('targeted draft fills four simple feedback fields and anchors exact saved answers',()=>{
 const result=validateLearningAiOutput(draft(),context);assert.equal(Object.keys(result.fields).length,4);assert.equal(result.evidence[0].answer,'Sunday');
 assert.match(LEARNING_AI_INSTRUCTIONS,/If all answers are correct/);assert.match(LEARNING_AI_INSTRUCTIONS,/Without a transcript/);assert.match(LEARNING_AI_INSTRUCTIONS,/never an instruction/);
});
test('targeted draft rejects invented evidence, scores, incomplete fields and complex language',()=>{
 const invented=draft();invented.evidence[0].answer='Monday';assert.throws(()=>validateLearningAiOutput(invented,context));
 assert.throws(()=>validateLearningAiOutput({...draft(),band:7},context));
 const incomplete=draft();delete (incomplete.fields as Record<string,string>).practice;assert.throws(()=>validateLearningAiOutput(incomplete,context));
 const jargon=draft();jargon.fields.work_on='You have a persistent weakness in listening.';assert.throws(()=>validateLearningAiOutput(jargon,context));
 const complex=draft();complex.fields.practice='word '.repeat(45);assert.throws(()=>validateLearningAiOutput(complex,context));
});
