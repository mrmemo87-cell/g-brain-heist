import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
// Targeted Reading 06 source contract: Lesson 6 step by step on the lesson's own passage. Five guided steps and one
// mixed check, six keyed items each; pilot-only install with teacher review; typed answers are copied from the passage;
// the passage matches the Lesson 6 source; migration matches the source and never releases.
const src=JSON.parse(readFileSync('docs/ielts/practice/TARGETED_READING_06.json','utf8'));
const lesson=JSON.parse(readFileSync('docs/ielts/lessons/lesson-06/lesson.json','utf8'));
const sql=readFileSync('supabase/migrations/20261026120158_ielts_targeted_reading_06.sql','utf8');
const GULZADA='b30e9c28-96f1-4d34-83e9-9b28b4926f42';
const norm=s=>String(s).toLowerCase().replace(/\s+/g,' ');
const lessonParas=lesson.blocks.find(b=>b.id==='IELTS-06-R1').stimulus.paragraphs;
test('five guided steps and one check, installed for the pilot only with review',()=>{
 assert.deepEqual(src.tasks.map(t=>t.purpose),['guided_practice','guided_practice','guided_practice','guided_practice','guided_practice','independent_check']);
 assert.deepEqual(src.tasks.map(t=>t.code),[28,29,30,31,32,33].map(n=>`bh-ielts-targeted-reading-r${n}-v1`));
 for(const t of src.tasks){assert.equal(t.skill,'reading');assert.equal(t.pilot_student,GULZADA);assert.equal(t.review_record.human_review,'pending');
  assert.ok(sql.includes(`'${t.code}'`));assert.ok(sql.includes(t.content_sha256));}
 assert.doesNotMatch(sql,/insert into private\.ielts_learning_releases/i,'installing never releases');
 assert.equal((sql.match(/,true\) on conflict \(code\) do nothing;/g)??[]).length,6,'requires_review set, never overwrites');
});
test('steps 2-6 use the exact Lesson 6 passage',()=>{
 for(const t of src.tasks.slice(1))for(const p of lessonParas)assert.ok(t.content.passage.includes(p),`${t.code} passage differs from Lesson 6`);
 assert.doesNotMatch(src.tasks[0].content.passage,/windless summer evenings/,'step 1 is done before reading the passage');
});
for(const t of src.tasks)test(`${t.code} is well formed`,()=>{
 assert.deepEqual(t.questions.map(q=>q.id),['q1','q2','q3','q4','q5','q6']);
 const counts={};
 for(const q of t.questions){
  assert.equal(q.accepted_answers.length,1);const a=q.accepted_answers[0];counts[a]=(counts[a]??0)+1;
  if(q.answer_format==='text'){assert.ok(!q.options);assert.ok(a.split(/\s+/).length<=2,`${q.id} over two words`);
   assert.ok(norm(t.content.passage).includes(norm(a)),`${q.id} answer "${a}" not copied from the passage`);assert.match(q.prompt,/________/);}
  else{assert.ok(q.options.map(o=>o.value).includes(a),`${q.id} answer not an option`);}
 }
 assert.ok(Math.max(...Object.values(counts))<=3,'answers spread');
 assert.ok(t.content.teacher_notes.split('\n').length>=6);
 if(t.purpose==='independent_check')assert.match(t.instructions,/Work on your own/);
});
