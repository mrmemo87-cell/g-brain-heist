import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WRITING_AI_KEYS, WRITING_AI_INSTRUCTIONS, validateWritingAiOutput } from '../supabase/functions/_shared/ieltsWritingAiDraft';
import { mergeWritingAiDraft, parseWritingAiDraft } from '../services/ieltsWritingAiReview';
import { IeltsWritingReviewWorkspace } from '../src/components/ielts/IeltsWritingReviewWorkspace';
import type { WritingScreenerResult, WritingObservations } from '../services/ieltsWritingScreener';
const context = { response_text: 'My view 😊. Schools should give students some choice.', prompt: 'Discuss the views and your opinion.', word_count: 10, response_state: 'answered', incident_count: 1, rubric_snapshot: { version: 'fixture' } };
const output = () => ({ observations: Object.fromEntries(WRITING_AI_KEYS.map(key => [key, { status:'developing', comment:'Your opinion is clear. Add an example to explain your reason.', quotes:['Schools should give students some choice.'] }])) as Record<typeof WRITING_AI_KEYS[number], {status:string;comment:string;quotes:string[]}>, next_step:'Add one example to your main paragraph. Check that it explains your reason.' });
const source: WritingScreenerResult = { ...context, response_state:'answered', attempt_id:'00000000-0000-4000-8000-000000000001', response_sha256:'a'.repeat(64), can_review:true,
 student_id:'student-fixture',submitted_at:'2026-10-07T09:00:00Z',evidence_kind:'first_sitting',review_status:'pending',review_id:null,criterion_observations:{},next_step:null,delivery_comment:null,reviewed_at:null,confidence:'low',readiness_available:false,persistent_weakness_available:false };
const draft = () => parseWritingAiDraft({ draft_id:'00000000-0000-4000-8000-000000000002', attempt_id:source.attempt_id, response_sha256:source.response_sha256, teacher_confirmation_required:true, fields:validateWritingAiOutput(output(),context) },source);
test('AI draft anchors all four criteria to exact Unicode essay evidence and fills conditions without guessing impact',()=>{
 const fields=validateWritingAiOutput(output(),context);
 assert.equal(fields.observations.task_response.evidence[0].start_char,11);
 assert.match(fields.delivery_comment,/teacher will check whether/);
 assert.doesNotMatch(fields.delivery_comment,/caused|reduced|lowered/);
 for(const key of WRITING_AI_KEYS) assert.equal(fields.observations[key].evidence[0].quote,context.response_text.slice(context.response_text.indexOf('Schools')));
});
test('AI draft rejects fabricated evidence, scores, missing criteria, advanced jargon and a false observation on blank writing',()=>{
 const fabricated=output();fabricated.observations.task_response.quotes=['Schools should teach everything.'];assert.throws(()=>validateWritingAiOutput(fabricated,context));
 const scored={...output(),band:8};assert.throws(()=>validateWritingAiOutput(scored,context));
 const missing=output();delete (missing.observations as Record<string,unknown>)['task_response'];assert.throws(()=>validateWritingAiOutput(missing,context));
 const jargon=output();jargon.observations.lexical_resource.comment='Improve your lexical sophistication and syntactic complexity.';assert.throws(()=>validateWritingAiOutput(jargon,context));
 const long=output();long.observations.task_response.comment=Array.from({length:45},()=> 'word').join(' ');assert.throws(()=>validateWritingAiOutput(long,context));
 assert.throws(()=>validateWritingAiOutput(output(),{...context,response_state:'unanswered',response_text:''}));
 const blank=output();for(const key of WRITING_AI_KEYS){blank.observations[key].status='insufficient_evidence';blank.observations[key].quotes=[];blank.observations[key].comment='There is no essay to review yet. Write a response to the task.';}
 assert.equal(validateWritingAiOutput(blank,{...context,response_state:'unanswered',response_text:''}).observations.task_response.evidence.length,0);
});
test('A late or mismatched draft cannot fill another essay, and existing teacher notes are kept',()=>{
 const value=draft();assert.throws(()=>parseWritingAiDraft({...value,response_sha256:'b'.repeat(64)},source));
 const current=WRITING_AI_KEYS.reduce((all,key)=>{all[key]={status:'insufficient_evidence',comment:'',evidence:[]};return all;},{} as WritingObservations);
 current.task_response={status:'developing',comment:'My own teacher note about this essay.',evidence:[]};
 const merged=mergeWritingAiDraft(current,'My teacher practice step.','My conditions note.',value);
 assert.equal(merged.observations.task_response.comment,current.task_response.comment);
 assert.equal(merged.observations.coherence_cohesion.comment,value.fields.observations.coherence_cohesion.comment);
 assert.equal(merged.nextStep,'My teacher practice step.');assert.equal(merged.delivery,'My conditions note.');
 assert.equal(current.coherence_cohesion.comment,'');
});
test('AI loading is labelled, review fields freeze, and sharing requires explicit teacher confirmation',()=>{
 const props={result:source,observations:draft().fields.observations,activeCriterion:'task_response' as const,selected:null,nextStep:'Practise an example.',delivery:'Check conditions.',saving:false,saved:false,
 onCriterion:()=>{},onEdit:()=>{},onSelect:()=>{},onNextStep:()=>{},onDelivery:()=>{},onSave:()=>{},onAi:()=>{},onAiConfirm:()=>{},onAiRemove:()=>{}};
 const busy=renderToStaticMarkup(React.createElement(IeltsWritingReviewWorkspace,{...props,aiBusy:true}));
 assert.match(busy,/aria-busy="true"/);assert.match(busy,/Preparing your feedback/);assert.match(busy,/<fieldset disabled=""/);
 const waiting=renderToStaticMarkup(React.createElement(IeltsWritingReviewWorkspace,{...props,aiApplied:true,aiConfirmed:false}));
 assert.match(waiting,/AI draft added/);assert.match(waiting,/I have checked the AI draft/);assert.match(waiting,/<button[^>]*disabled=""[^>]*>Share feedback with student/);
 const replace=renderToStaticMarkup(React.createElement(IeltsWritingReviewWorkspace,{...props,aiApplied:true,onAiReplace:()=>{}}));assert.match(replace,/Use AI draft in every field/);
 const checked=renderToStaticMarkup(React.createElement(IeltsWritingReviewWorkspace,{...props,aiApplied:true,aiConfirmed:true}));
 assert.doesNotMatch(checked,/<button[^>]*disabled=""[^>]*>Share feedback with student/);
 assert.match(readFileSync('src/styles/ielts-writing-review.css','utf8'),/prefers-reduced-motion:reduce/);
});
test('Prompt requires simple actions, task-specific evidence and prompt-injection resistance; generation cannot publish',()=>{
 assert.match(WRITING_AI_INSTRUCTIONS,/SIMPLE ENGLISH/);assert.match(WRITING_AI_INSTRUCTIONS,/never as instructions/);assert.match(WRITING_AI_INSTRUCTIONS,/actual task/);
 const edge=readFileSync('supabase/functions/ielts_writing_teacher_ai/index.ts','utf8');
 assert.match(edge,/auth.getUser/);assert.match(edge,/rpc_ielts_claim_writing_ai_draft/);assert.match(edge,/store: false/);
 assert.doesNotMatch(edge,/rpc_ielts_submit|answer_text|band_estimate/);
 assert.match(edge,/AbortSignal.timeout\(45000\)/);
 const page=readFileSync('src/pages/ielts/IeltsWritingScreenerReview.tsx','utf8');
 assert.match(page,/aiRequest.current !== controller/);assert.match(page,/setAiConfirmed\(false\)/);
});
