import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IELTS_WRITING_CRITERIA, type WritingObservations, type WritingScreenerResult } from '../services/ieltsWritingScreener';
import { getWritingReviewReadiness } from '../services/ieltsWritingReviewUx';
import { IeltsWritingReviewWorkspace } from '../src/components/ielts/IeltsWritingReviewWorkspace';
import { IeltsWritingResult } from '../src/components/ielts/IeltsWritingResult';

const observations = () => Object.fromEntries(IELTS_WRITING_CRITERIA.map(({key}) => [key, {status:'observed',comment:'A clear and specific observation.',evidence:[{quote:'An original essay.',start_char:0,end_char:18}]}])) as WritingObservations;
const result = {response_text:'An original essay.',prompt:'An original task.',word_count:3,evidence_kind:'first_sitting',incident_count:0} as WritingScreenerResult;
test('Review guidance retains exact-evidence requirements and directs the teacher to missing work', () => {
  const notes = observations();
  assert.equal(getWritingReviewReadiness(notes,'Practise developing a relevant example.','',0).message,null);
  notes.task_response.evidence=[];
  assert.equal(getWritingReviewReadiness(notes,'Practise examples.','',0).incompleteCriterion,'task_response');
  assert.equal(getWritingReviewReadiness(notes,'Practise examples.','',0).completed,3);
  notes.task_response.status='insufficient_evidence';
  assert.equal(getWritingReviewReadiness(notes,'Practise examples.','',0).completed,4);
  assert.match(getWritingReviewReadiness(notes,'Practise examples.','',1).message!,/interruptions/);
  assert.equal(getWritingReviewReadiness(notes,'Practise examples.','Discuss the interruption with the student.',1).message,null);
});
test('The focused review shows one criterion with readable original evidence and a clear sharing action', () => {
  const html=renderToStaticMarkup(React.createElement(IeltsWritingReviewWorkspace,{
    result,observations:observations(),activeCriterion:'task_response',selected:null,nextStep:'',delivery:'',saving:false,saved:false,
    onCriterion:()=>{},onEdit:()=>{},onSelect:()=>{},onNextStep:()=>{},onDelivery:()=>{},onSave:()=>{},
  }));
  assert.match(html,/readOnly=""/i);assert.match(html,/View the writing task/);
  assert.match(html,/aria-current="step"/);assert.match(html,/4 of 4 ready/);
  assert.match(html,/Share feedback with student/);assert.match(html,/More evidence needed/);
  assert.equal((html.match(/Describe what you noticed/g)||[]).length,1);
  assert.doesNotMatch(html,/confidence: high|band score|auto.?saved/i);
});
test('Review foregrounds meet contrast on white and the split workspace stacks on phones', () => {
  const css=readFileSync('src/styles/ielts-writing-review.css','utf8');
  const luminance=(hex:string)=>{const c=hex.match(/\w{2}/g)!.map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
  for(const color of ['17243b','475569','174fa4','58677e']) assert.ok(1.05/(luminance(color)+.05)>=4.5);
  assert.match(css,/color:#17243b!important; -webkit-text-fill-color:#17243b!important/);
  assert.match(css,/@media\(max-width:900px\).*grid-template-columns:1fr/s);
  assert.match(css,/:focus-visible/);assert.match(css,/color-scheme:light/);
});
test('Required excerpts explain readiness; missing-evidence observations do not demand a quote', () => {
  const notes = observations();
  notes.task_response.evidence = [];
  const props = { result, observations: notes, activeCriterion: 'task_response' as const, selected: null, nextStep: '', delivery: '', saving: false, saved: false,
    onCriterion:()=>{},onEdit:()=>{},onSelect:()=>{},onNextStep:()=>{},onDelivery:()=>{},onSave:()=>{} };
  const required = renderToStaticMarkup(React.createElement(IeltsWritingReviewWorkspace, props));
  assert.match(required, /Supporting excerpt · Required/);
  assert.match(required, /Still needed: an attached excerpt/);
  notes.task_response.status = 'insufficient_evidence';
  const optional = renderToStaticMarkup(React.createElement(IeltsWritingReviewWorkspace, props));
  assert.match(optional, /Supporting excerpt · Optional/);
  assert.match(optional, /This criterion is ready/);
  assert.doesNotMatch(optional, /Still needed: an attached excerpt/);
});
test('Student feedback explicitly attributes teacher notes and separates original essay quotes', () => {
  const html = renderToStaticMarkup(React.createElement(IeltsWritingResult, { result: {
    ...result, review_status: 'teacher_reviewed', can_review: true, criterion_observations: observations(),
    next_step: 'Practise a focused example.', delivery_comment: 'Consider the recorded interruption.',
  }}));
  assert.equal((html.match(/Teacher feedback/g) || []).length, 4);
  assert.equal((html.match(/From your essay/g) || []).length, 4);
  assert.match(html, /Teacher’s recommended practice/);
  assert.match(html, /Teacher’s note on assessment conditions/);
  assert.match(html, /bg-rose-50/);
  assert.match(html, /color:#9f1239/);
  assert.match(html, /Confidence: low/);
});
