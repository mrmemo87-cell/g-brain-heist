import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
// Targeted Reading 07 source contract: Lessons 2, 9, 13 and 18 step by step in the Lesson 6 format. For each lesson,
// five guided steps and one mixed check, six keyed items each; every step opens with LEARN FIRST and a worked example
// and explains every answer; quoted proof and typed answers come from the lesson's own passage; pilot-only with teacher
// review; the install migrations store exactly the source and never release.
const src=JSON.parse(readFileSync('docs/ielts/practice/TARGETED_READING_07.json','utf8'));
const LESSONS={'IELTS-02':['02','IELTS-02-R1'],'IELTS-09':['09','IELTS-09-R1'],'IELTS-13':['13','IELTS-13-R1'],'IELTS-18':['18','IELTS-18-R1']};
const GULZADA='b30e9c28-96f1-4d34-83e9-9b28b4926f42';
const norm=s=>String(s).toLowerCase().replace(/\s+/g,' ');
const passageOf=key=>{const [n,block]=LESSONS[key];const l=JSON.parse(readFileSync(`docs/ielts/lessons/lesson-${n}/lesson.json`,'utf8'));return {version:l.version,paras:l.blocks.find(b=>b.id===block).stimulus.paragraphs};};
const migrations=readdirSync('supabase/migrations').filter(f=>/_ielts_targeted_reading_lesson_(02|09|13|18)_steps\.sql$/.test(f)).sort();

test('four lessons, five guided steps and one check each, pilot only with review',()=>{
 assert.equal(src.tasks.length,24);assert.equal(migrations.length,4);
 assert.deepEqual(src.tasks.map(t=>t.code),Array.from({length:24},(_,i)=>`bh-ielts-targeted-reading-r${34+i}-v1`));
 for(const [i,t] of src.tasks.entries()){
  const key=t.lesson.split(' ')[0];assert.ok(LESSONS[key],t.lesson);
  assert.equal(t.lesson,`${key} v${passageOf(key).version}`,'built from the current lesson version');
  assert.equal(t.purpose,i%6===5?'independent_check':'guided_practice');
  assert.match(t.title,new RegExp(`^Lesson ${Number(LESSONS[key][0])} step ${i%6+1} of 6: `));
  assert.equal(t.skill,'reading');assert.equal(t.version,'0.1.0');assert.equal(t.pilot_student,GULZADA);assert.equal(t.review_record.human_review,'pending');
 }
});
for(const t of src.tasks)test(`${t.code} teaches first, uses the lesson passage, then practises and explains`,()=>{
 const {paras}=passageOf(t.lesson.split(' ')[0]);const full=norm(paras.join(' '));
 assert.match(t.content.passage,/^LEARN FIRST: /);assert.match(t.content.passage,/WORKED EXAMPLE/);
 const step=Number(t.title.match(/step (\d)/)[1]);
 if(step===1&&t.lesson.startsWith('IELTS-02'))assert.ok(!t.content.passage.includes(paras[0]),'Lesson 2 step 1 comes before reading');
 else for(const p of paras)assert.ok(t.content.passage.includes(p),`${t.code} passage differs from the lesson`);
 assert.deepEqual(t.questions.map(q=>q.id),['q1','q2','q3','q4','q5','q6']);
 const notes=t.content.teacher_notes.split('\n');assert.equal(notes.length,7);
 for(let i=1;i<=6;i++)assert.ok(notes[i-1].startsWith(`${i} `)&&notes[i-1].length>=40,`explanation for question ${i}`);
 for(const text of [t.content.teacher_notes,t.content.passage.split('- - - -')[0]])
  for(const m of text.matchAll(/"([^"]+)"/g))for(const part of m[1].split(' ... '))assert.ok(full.includes(norm(part.trim())),`quote not in passage: ${part}`);
 const counts={};
 for(const q of t.questions){
  const a=q.accepted_answers[0];counts[a]=(counts[a]??0)+1;
  if(q.answer_format==='text'){assert.ok(!q.options);for(const x of q.accepted_answers){assert.ok(x.split(/\s+/).length<=2);assert.ok(full.includes(norm(x)),`"${x}" not copied from the passage`);}assert.match(q.prompt,/________/);}
  else{assert.equal(q.accepted_answers.length,1);assert.ok(q.options.map(o=>o.value).includes(a),`${q.id} answer not an option`);}
 }
 assert.ok(Math.max(...Object.values(counts))<=3,'answers spread');
 if(t.purpose==='independent_check')assert.match(t.instructions,/Work on your own/);
});
test('install migrations are insert-only, keep review on, never release, and store exactly the source',async()=>{
 const db=new PGlite();
 await db.exec('create schema private;create table private.ielts_learning_tasks(code text primary key,version text,title text,skill text,purpose text,instructions text,success_description text,taxonomy_version_id uuid,pilot_student uuid,questions jsonb,content jsonb,review_record jsonb,content_sha256 text,requires_review boolean);');
 for(const f of migrations){const sql=readFileSync('supabase/migrations/'+f,'utf8');
  assert.doesNotMatch(sql,/insert into private\.ielts_learning_releases|\bupdate\b|\bdelete\b/i);
  assert.equal((sql.match(/,true\) on conflict \(code\) do nothing;/g)??[]).length,6);
  await db.exec(sql);}
 const deep=v=>Array.isArray(v)?v.map(deep):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,deep(v[k])])):v;
 const rows=(await db.query('select * from private.ielts_learning_tasks')).rows;assert.equal(rows.length,24);
 for(const t of src.tasks){const r=rows.find(r=>r.code===t.code);assert.ok(r.requires_review);
  for(const k of ['questions','content','review_record'])assert.deepEqual(deep(r[k]),deep(t[k]),`${t.code} ${k}`);
  for(const k of ['title','version','purpose','instructions','success_description','content_sha256'])assert.equal(r[k],t[k]);}
 await db.close();
});
