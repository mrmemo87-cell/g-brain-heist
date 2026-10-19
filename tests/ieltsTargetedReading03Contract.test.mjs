import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
// Targeted Reading 03 source contract: six keyed items, answers found in the passage within the word limit, heading keys
// unique and among the options, pilot-only install with teacher review, and the migration matches the source exactly.
const src=JSON.parse(readFileSync('docs/ielts/practice/TARGETED_READING_03.json','utf8'));
const sql=readFileSync('supabase/migrations/20261019230000_ielts_targeted_reading_03.sql','utf8');
const GULZADA='b30e9c28-96f1-4d34-83e9-9b28b4926f42';
test('seven reading tasks: three guided practices and four fresh checks',()=>{
 assert.equal(src.tasks.length,7);assert.equal(src.tasks.filter(t=>t.purpose==='independent_check').length,4);
 for(const t of src.tasks){assert.equal(t.skill,'reading');assert.equal(t.pilot_student,GULZADA);assert.equal(t.review_record.human_review,'pending');assert.ok(sql.includes(`'${t.code}'`));assert.ok(sql.includes(t.content_sha256));}
 assert.match(sql,/,true\) on conflict \(code\) do nothing;/);assert.doesNotMatch(sql,/insert into private\.ielts_learning_releases/i,'installing never releases');
});
for(const t of src.tasks)test(`${t.code} keys are answerable from the passage`,()=>{
 const passage=t.content.passage.toLowerCase();assert.deepEqual(t.questions.map(q=>q.id),['q1','q2','q3','q4','q5','q6']);
 const limit=/ONE WORD ONLY/.test(t.instructions)?1:3;
 for(const q of t.questions){assert.ok(q.accepted_answers.length>0);
  if(q.answer_format==='text'){assert.ok(q.accepted_answers.some(a=>passage.includes(a.toLowerCase())),`${q.id} answer in passage`);assert.ok(q.accepted_answers[0].split(/\s+/).length<=limit);}
  else if(q.options)assert.ok(q.options.some(o=>o.value===q.accepted_answers[0]));
  else assert.ok(['TRUE','FALSE','NOT GIVEN'].includes(q.accepted_answers[0]));}
 if(t.questions[0].options){const keys=t.questions.map(q=>q.accepted_answers[0]);assert.equal(new Set(keys).size,6);assert.ok(t.questions[0].options.length>6,'more headings than paragraphs');}
 if(t.purpose==='independent_check')assert.match(t.instructions,/Work on your own/);
});
