import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir='content/english-curriculum-repair/editorial/';
const source=JSON.parse(readFileSync(dir+'source-manifest.json','utf8'));
const review=JSON.parse(readFileSync(dir+'review-package.json','utf8'));
test('editorial outcomes cover every source focus exactly once or place it on explicit hold',()=>{
 assert.equal(review.sourceHash,createHash('sha256').update(JSON.stringify(source)).digest('hex'));
 assert.equal(new Set(source.focuses.map(f=>f.id)).size,369);
 assert.equal(review.objectives.length,399);
 const seen=new Set(review.objectives.flatMap(o=>o.evidenceFocusIds)),held=new Set(review.held.map(h=>h.focusId));
 for(const f of source.focuses){assert.notEqual(seen.has(f.id),held.has(f.id),f.name);}
 for(const o of review.objectives){assert.equal(o.reviewStatus,'proposed');assert.match(o.statement,/^(Select|Identify|Interpret|Infer|Distinguish|Locate)\b/);assert.match(o.assessmentBoundary,/does not establish independent writing or speaking/);assert.ok(!o.statement.startsWith('Core demonstration'));}
});
test('every proposed mapping is bound to a source question hash, exact focus, grade and explicitly allowed objective',()=>{
 const questions=new Map(source.questions.map(q=>[q.id,q]));const heldQuestions=new Set(review.heldQuestions.map(h=>h.questionId));const objectives=new Map(review.objectives.map(o=>[o.code,o]));
 const held=new Set(review.held.map(h=>h.focusId)),seen=new Set();
 for(const m of review.mappings){const q=questions.get(m.questionId),o=objectives.get(m.objectiveCode);assert.ok(q&&o);assert.equal(m.questionContentHash,q.contentHash);assert.equal(m.evidenceFocusId,q.focusId);assert.ok(q.grades.includes(m.grade));assert.ok(o.evidenceFocusIds.includes(q.focusId));assert.equal(o.grade,m.grade);assert.equal(m.status,'proposed');assert.ok(!held.has(q.focusId));assert.ok(!heldQuestions.has(q.id));const key=m.questionId+':'+m.grade;assert.ok(!seen.has(key));seen.add(key);}
 assert.equal(review.summary.heldQuestions,heldQuestions.size);
 assert.equal(review.summary.multiFocusQuestions,32);
 for(const q of source.questions)assert.ok(heldQuestions.has(q.id)||review.mappings.some(m=>m.questionId===q.id));
});
test('draft preparation rejects source drift and contains no school adoption, approval or learner mutation',()=>{
 const sql=readFileSync(dir+'prepare-reviewed-draft.sql','utf8');
 assert.match(sql,/editorial_source_questions_changed/);assert.match(sql,/editorial_source_taxonomy_changed/);
 assert.doesNotMatch(sql,/\b(update|delete from|insert into)\s+(public\.)?(school_subject_offerings|assignments|student_\w+|verified_question_registry_taxonomy)\b/i);
 assert.doesNotMatch(sql,/insert into public.curriculum_item_objective_mappings/i);
 assert.match(sql,/'proposed'/);
});
