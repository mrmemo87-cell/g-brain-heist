import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
// Targeted Reading 06 source contract: Lesson 6 step by step on the lesson's own passage. Five guided steps and one
// mixed check, six keyed items each; every step opens with LEARN FIRST and a worked example and explains every answer;
// pilot-only with teacher review; typed answers are copied from the passage; the passage matches the Lesson 6 source;
// v0.1.0 install and the guarded v0.2.0 upgrade match the source and never release.
const src=JSON.parse(readFileSync('docs/ielts/practice/TARGETED_READING_06.json','utf8'));
const lesson=JSON.parse(readFileSync('docs/ielts/lessons/lesson-06/lesson.json','utf8'));
const install=readFileSync('supabase/migrations/20261026120158_ielts_targeted_reading_06.sql','utf8');
const V2=['20261026132950','20261026133027','20261026133123','20261026133157','20261026133229','20261026133303'];const v2=V2.map((v,i)=>readFileSync(`supabase/migrations/${v}_ielts_targeted_reading_06_step${i+1}_v2.sql`,'utf8'));const upgrade=v2.join('\n');
const GULZADA='b30e9c28-96f1-4d34-83e9-9b28b4926f42';
const norm=s=>String(s).toLowerCase().replace(/\s+/g,' ');
const lessonParas=lesson.blocks.find(b=>b.id==='IELTS-06-R1').stimulus.paragraphs;
const full=norm(lessonParas.join(' '));
test('five guided steps and one check, pilot only with review, v2 installed beside v1 without release',()=>{
 assert.deepEqual(src.tasks.map(t=>t.purpose),['guided_practice','guided_practice','guided_practice','guided_practice','guided_practice','independent_check']);
 assert.deepEqual(src.tasks.map(t=>t.code),[28,29,30,31,32,33].map(n=>`bh-ielts-targeted-reading-r${n}-v2`));
 assert.deepEqual(src.tasks.map(t=>t.supersedes.code),[28,29,30,31,32,33].map(n=>`bh-ielts-targeted-reading-r${n}-v1`));
 for(const t of src.tasks){assert.equal(t.skill,'reading');assert.equal(t.version,'0.2.0');assert.equal(t.pilot_student,GULZADA);assert.equal(t.review_record.human_review,'pending');
  assert.ok(install.includes(`'${t.supersedes.code}'`)&&install.includes(t.supersedes.content_sha256),'v0.1.0 install recorded');
  assert.ok(upgrade.includes(`'${t.code}'`)&&upgrade.includes(`'${t.content_sha256}'`),'v2 install carries the code and hash');}
 for(const sql of [install,upgrade])assert.doesNotMatch(sql,/insert into private\.ielts_learning_releases/i,'never releases');
 for(const m of v2){assert.equal((m.match(/,true\) on conflict \(code\) do nothing;/g)??[]).length,1,'requires_review, never overwrites');assert.doesNotMatch(m,/\bupdate\b/i,'never rewrites a task');}
});
test('steps 2-6 use the exact Lesson 6 passage; step 1 comes before reading',()=>{
 for(const t of src.tasks.slice(1))for(const p of lessonParas)assert.ok(t.content.passage.includes(p),`${t.code} passage differs from Lesson 6`);
 assert.doesNotMatch(src.tasks[0].content.passage,/windless summer evenings/);
});
for(const t of src.tasks)test(`${t.code} teaches first, then practises and explains`,()=>{
 assert.match(t.content.passage,/^LEARN FIRST: /);assert.match(t.content.passage,/WORKED EXAMPLE/);
 assert.deepEqual(t.questions.map(q=>q.id),['q1','q2','q3','q4','q5','q6']);
 const notes=t.content.teacher_notes.split('\n');assert.ok(notes.length>=7);
 for(let i=1;i<=6;i++)assert.ok(notes[i-1].startsWith(`${i} `)&&notes[i-1].length>=40,`explanation for question ${i}`);
 for(const m of t.content.teacher_notes.matchAll(/"([^"]+)"/g))for(const part of m[1].split(' ... '))assert.ok(full.includes(norm(part.trim())),`quote not in passage: ${part}`);
 const counts={};
 for(const q of t.questions){
  assert.equal(q.accepted_answers.length,1);const a=q.accepted_answers[0];counts[a]=(counts[a]??0)+1;
  if(q.answer_format==='text'){assert.ok(!q.options);assert.ok(a.split(/\s+/).length<=2);assert.ok(full.includes(norm(a)),`"${a}" not copied from the passage`);assert.match(q.prompt,/________/);}
  else assert.ok(q.options.map(o=>o.value).includes(a),`${q.id} answer not an option`);
 }
 assert.ok(Math.max(...Object.values(counts))<=3,'answers spread');
 if(t.purpose==='independent_check')assert.match(t.instructions,/Work on your own/);
});
