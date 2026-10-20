import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
// Targeted Reading 05 source contract: the screener's purpose-and-audience construct gets a guided practice and a fresh
// check, six keyed A-D items each, letters spread, pilot-only install with teacher review, migration matches the source.
const src=JSON.parse(readFileSync('docs/ielts/practice/TARGETED_READING_05.json','utf8'));
const sql=readFileSync('supabase/migrations/20261020030000_ielts_targeted_reading_05.sql','utf8');
const GULZADA='b30e9c28-96f1-4d34-83e9-9b28b4926f42',PURPOSE_AUDIENCE='05df1e51-68c3-4315-b79f-bf9a420298f3';
test('a practice and a fresh check for purpose and audience, installed for the pilot only',()=>{
 assert.deepEqual(src.tasks.map(t=>t.purpose),['guided_practice','independent_check']);
 for(const t of src.tasks){assert.equal(t.pilot_student,GULZADA);assert.equal(t.review_record.human_review,'pending');assert.ok(sql.includes(`'${t.code}'`));assert.ok(sql.includes(t.content_sha256));
  for(const q of t.questions)assert.equal(q.taxonomy_node_id,PURPOSE_AUDIENCE);}
 assert.doesNotMatch(sql,/insert into private\.ielts_learning_releases/i,'installing never releases');
 assert.equal((sql.match(/,true\) on conflict \(code\) do nothing;/g)??[]).length,2,'requires_review set, never overwrites');
});
for(const t of src.tasks)test(`${t.code} is well formed`,()=>{
 assert.deepEqual(t.questions.map(q=>q.id),['q1','q2','q3','q4','q5','q6']);
 const c={};for(const q of t.questions){assert.deepEqual(q.options.map(o=>o.value),['A','B','C','D']);assert.equal(q.accepted_answers.length,1);c[q.accepted_answers[0]]=(c[q.accepted_answers[0]]??0)+1;}
 assert.ok(Math.max(...Object.values(c))<=3);
 for(let i=1;i<=6;i++)assert.match(t.content.passage,new RegExp(`Text ${i}\\. `));
 if(t.purpose==='independent_check')assert.match(t.instructions,/Work on your own/);
 assert.ok(t.content.teacher_notes.split('\n').length>=6);
});
