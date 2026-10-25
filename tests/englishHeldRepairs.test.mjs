import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateReadingRepairCandidates,validateHeldRepairDecisions} from '../scripts/validate-english-held-repairs.mjs';
const dir='content/english-curriculum-repair/held-repairs/';
const read=f=>JSON.parse(readFileSync(dir+f,'utf8'));
const source=read('source-questions.json'),pkg=read('reading-replacements.json'),decisions=read('decisions.json');
test('all held questions have one hash-bound decision; proposed focus names never become official identities',()=>{
 assert.deepEqual(validateHeldRepairDecisions(decisions,source),[]);
 assert.deepEqual(decisions.summary,{precise_focus_governance_proposal:105,new_self_contained_reading_replacement:12,new_connective_wording_replacement:4,subject_scope_review:7,existing_focus_mapping_proposal:1});
 assert.ok(decisions.decisions.filter(d=>d.action==='subject_scope_review').every(d=>!d.targetFocusCode&&!d.targetProposalKey));
});
test('replacement reading questions contain the full passage, supported answer quote and balanced keys',()=>{
 assert.deepEqual(validateReadingRepairCandidates(pkg,source),[]);
 for(const q of pkg.questions){assert.notEqual(q.externalId,q.sourceQuestionId);assert.ok(q.eligibleGrades.length>0);assert.equal(q.questionType,'multiple_choice');}
 const sql=readFileSync(dir+'validate-reading-replacements.sql','utf8');
 assert.match(sql,/rpc_import_registry_verified_mcq_package\(/);assert.match(sql,/::jsonb,true\);/);
 assert.doesNotMatch(sql,/::jsonb,false|\b(update|delete|insert|alter|drop)\s/i);
});
test('removing a passage, fabricating a quote, changing source hashes or expanding grades fails validation',()=>{
 for(const [mutate,expected] of [
 [p=>p.questions[0].questionText=p.questions[0].readingContext.stem,'self_contained_passage_required'],
 [p=>p.questions[0].readingContext.evidenceQuote='This was never in the passage.','evidence_quote_not_in_passage'],
 [p=>p.questions[0].sourceQuestionHash='0'.repeat(64),'stale_source_hash'],
 [p=>p.questions[0].eligibleGrades.push(12),'grade_expansion'],
 [p=>p.questions[0].options[1]=p.questions[0].options[0],'unique_options_and_key_required'],
 [p=>p.editorialReview.status='approved','candidate_must_remain_explicitly_unapproved'],
 ]){const candidate=structuredClone(pkg);mutate(candidate);assert.ok(validateReadingRepairCandidates(candidate,source).some(e=>e.includes(expected)),expected);}
});
test('correct existing keys survive mapping-only proposals and connective edits have one explicit key',()=>{
 for(const n of [33,34,119]){const d=decisions.decisions.find(d=>d.reviewIndex===n);assert.equal(d.contentChange,false);}
 for(const q of read('connective-replacements.json')){assert.equal(q.options.filter(o=>o===q.correctAnswer).length,1);assert.equal(new Set(q.options).size,4);assert.equal(q.status,'editorial_draft_not_publishable');}
 const loaf=decisions.decisions.find(d=>d.reviewIndex===119);assert.equal(loaf.action,'existing_focus_mapping_proposal');assert.ok(loaf.targetFocusCode.includes('plural'));
});
