import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
// Targeted Reading 04 source contract: one guided practice and one fresh check for each remaining IELTS Reading skill,
// six keyed choice items each, keys among the options, no letter used more than three times, a pilot-only install with
// teacher review, and the migration matches the source exactly.
const src=JSON.parse(readFileSync('docs/ielts/practice/TARGETED_READING_04.json','utf8'));
const sql=readFileSync('supabase/migrations/20261020000000_ielts_targeted_reading_04.sql','utf8')+readFileSync('supabase/migrations/20261020000100_ielts_targeted_reading_04b.sql','utf8');
const GULZADA='b30e9c28-96f1-4d34-83e9-9b28b4926f42';
test('sixteen reading tasks: a practice and a fresh check for each of eight skills',()=>{
 assert.equal(src.tasks.length,16);
 const bySkill={};for(const t of src.tasks){const n=t.questions[0].taxonomy_node_id;(bySkill[n]??=[]).push(t.purpose);}
 assert.equal(Object.keys(bySkill).length,8);for(const p of Object.values(bySkill))assert.deepEqual(p.sort(),['guided_practice','independent_check']);
 for(const t of src.tasks){assert.equal(t.pilot_student,GULZADA);assert.equal(t.review_record.human_review,'pending');assert.ok(sql.includes(`'${t.code}'`));assert.ok(sql.includes(t.content_sha256));}
 assert.doesNotMatch(sql,/insert into private\.ielts_learning_releases/i,'installing never releases');
});
for(const t of src.tasks)test(`${t.code} is well formed`,()=>{
 assert.deepEqual(t.questions.map(q=>q.id),['q1','q2','q3','q4','q5','q6']);
 for(const q of t.questions){assert.equal(q.accepted_answers.length,1);assert.ok(q.options.some(o=>o.value===q.accepted_answers[0]));}
 const n=t.questions[0].options.length,keys=t.questions.map(q=>q.accepted_answers[0]);
 if(n===4){const c={};for(const k of keys)c[k]=(c[k]??0)+1;assert.ok(Math.max(...Object.values(c))<=3,'letters are spread');}
 else if(n===3)assert.deepEqual(t.questions[0].options.map(o=>o.value),['YES','NO','NOT GIVEN']);
 else{assert.ok(n>6);assert.equal(new Set(keys).size,6,'each function used once');}
 if(t.purpose==='independent_check')assert.match(t.instructions,/Work on your own/);
 assert.ok(t.content.passage.length>400&&t.content.teacher_notes.length>100);
});
