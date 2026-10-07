import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { anchorWritingQuote, countWritingWords, parseWritingScreenerResult, writingEvidenceMatches, type WritingScreenerResult } from '../services/ieltsWritingScreener';
import { IeltsWritingEditor } from '../src/components/ielts/IeltsWritingEditor';
import { IeltsWritingResult } from '../src/components/ielts/IeltsWritingResult';
import { WRITING_SCREENER_A_DRAFT } from '../services/ieltsWritingScreenerDraft';
const fixture: WritingScreenerResult = {
  attempt_id:'fixture', student_id:'fixture',submitted_at:'2026-10-07T00:00:00Z',prompt:'Synthetic task',response_text:'A clear opinion 😊. A relevant example.',
  response_sha256:'a'.repeat(64),response_state:'answered',word_count:7,evidence_kind:'first_sitting',review_status:'pending',review_id:null,criterion_observations:{},next_step:null,delivery_comment:null,reviewed_at:null,confidence:'low',incident_count:0,can_review:false,readiness_available:false,persistent_weakness_available:false,
};
test('Writing quotes use exact Unicode code-point anchors and reject approximate or invented evidence',()=>{
 const span=anchorWritingQuote(fixture.response_text,'A relevant example.');assert.ok(span);
 assert.equal(writingEvidenceMatches(fixture.response_text,span),true);
 assert.equal(writingEvidenceMatches(fixture.response_text,{...span,start_char:span.start_char+1}),false);
 assert.equal(anchorWritingQuote(fixture.response_text,'relevant examples'),null);
 assert.equal(countWritingWords(' \n '),0);assert.equal(countWritingWords('one\n two\tthree'),3);
});
test('Writing editor has no hard upper word target, coaching or submit barrier below 250',()=>{
 const html=renderToStaticMarkup(React.createElement(IeltsWritingEditor,{prompt:WRITING_SCREENER_A_DRAFT.prompt,value:'Short draft.',onChange:()=>{}}));
 assert.match(html,/Minimum 250/);assert.match(html,/Your essay/);assert.match(html,/spellCheck="false"/i);
 assert.doesNotMatch(html,/maxLength=|250–|Go to this passage|band estimate|contenteditable/);
});
test('Pending Writing result promises review, preserves original and never substitutes an objective score',()=>{
 assert.equal(parseWritingScreenerResult(fixture)?.review_status,'pending');
 const html=renderToStaticMarkup(React.createElement(IeltsWritingResult,{result:fixture}));
 assert.match(html,/Awaiting teacher review/);assert.match(html,/Task Response/);assert.match(html,/Grammatical Range and Accuracy/);
 assert.match(html,/Confidence: low/);assert.match(html,/original task and submitted essay/);
 assert.doesNotMatch(html,/0 \/ 1|Your band|High confidence|persistent weakness:/i);
 assert.throws(()=>parseWritingScreenerResult({...fixture,readiness_available:true}));
 assert.throws(()=>parseWritingScreenerResult({...fixture,review_status:'teacher_reviewed'}));
});
