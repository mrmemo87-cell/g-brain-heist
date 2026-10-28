import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
// Targeted Vocabulary 01 source contract: Vocabulary lessons V1-V6 step by step in the Lesson 6 format. For each lesson,
// five guided steps and one mixed check, six keyed items each, filed as auto-marked reading tasks mapped to vocabulary
// subskills; every step opens with LEARN FIRST and a worked example and explains every answer; steps that use the lesson's
// passage (or V2's chart data) carry it unchanged, and every quote and copied answer comes from it; pilot-only with teacher
// review; the install migrations store exactly the source and never release.
const src=JSON.parse(readFileSync('docs/ielts/practice/TARGETED_VOCABULARY_01.json','utf8'));
const BLOCK={v1:'IELTS-V1-P2',v3:'IELTS-V3-P2',v4:'IELTS-V4-L1',v5:'IELTS-V5-P2',v6:'IELTS-V6-P2'};
const GULZADA='b30e9c28-96f1-4d34-83e9-9b28b4926f42';
const VOCAB_NODES=new Set(['aafe14e8-c993-48b3-ae4a-2c26b2021897','e3155f38-aea7-4267-a0c3-44273b1d7d14','e55dff22-7ea2-4bb6-b724-7d129b554bb4','22e5951f-eefd-4db0-9ea8-ce06c4b7127c','c90adeab-a6e3-473a-8e53-b86f6738ccbd','dded4435-86bc-4f98-a822-5796ab2c9540','c3f8634b-03c1-4218-b582-05afc24e4eff','c57e0932-8d1d-4bae-9cfd-d87a0ee00bf6','fe66c90a-e788-44f7-8caa-4e0019026729','07c8e6ee-7ec1-412a-aa64-d2f74df41a6a','cefbe886-39b2-4efa-9123-6ad04ea0f631','1772911e-5c6a-4d17-b07f-336595e2f8ef','6daeb023-a3c8-49ca-961a-008bdcc94e39','6ac2c820-15a8-4318-8969-c1610e7180b8','0cba9b30-01e3-4504-b8e7-d207d731e4b4','2c90af36-6b23-4037-a9a8-b81e189c856c']);
const norm=s=>String(s).toLowerCase().replace(/\s+/g,' ');
const lessonOf=t=>{const n=t.lesson.slice(6,8).toLowerCase();const l=JSON.parse(readFileSync(`docs/ielts/lessons/lesson-${n}/lesson.json`,'utf8'));
 if(n==='v2'){const f=l.blocks.filter(b=>b.figure).map(b=>b.figure);return {n,version:l.version,figures:f,paras:null};}
 return {n,version:l.version,paras:l.blocks.find(b=>b.id===BLOCK[n]).stimulus.paragraphs};};
const migrations=readdirSync('supabase/migrations').filter(f=>/_ielts_targeted_vocabulary_v[1-6]_steps\.sql$/.test(f)).sort();

test('six lessons, five guided steps and one check each, pilot only with review',()=>{
 assert.equal(src.tasks.length,36);assert.equal(migrations.length,6);
 assert.deepEqual(src.tasks.map(t=>t.code),Array.from({length:36},(_,i)=>`bh-ielts-targeted-reading-r${58+i}-v1`));
 for(const [i,t] of src.tasks.entries()){
  const L=`V${Math.floor(i/6)+1}`;assert.equal(t.lesson,`IELTS-${L} v${lessonOf(t).version}`,'built from the current lesson version');
  assert.equal(t.purpose,i%6===5?'independent_check':'guided_practice');
  assert.match(t.title,new RegExp(`^Vocabulary ${L} step ${i%6+1} of 6: `));
  assert.equal(t.skill,'reading');assert.equal(t.version,'0.1.0');assert.equal(t.pilot_student,GULZADA);assert.equal(t.review_record.human_review,'pending');
  for(const q of t.questions)assert.ok(VOCAB_NODES.has(q.taxonomy_node_id)||VOCAB_NODES.has(q.supporting_node_id),`${t.code} ${q.id} maps to a vocabulary subskill`);
 }
});
for(const t of src.tasks)test(`${t.code} teaches first, keeps the lesson material unchanged, then practises and explains`,()=>{
 const les=lessonOf(t);const [learnPart,material]=t.content.passage.split('\n\n- - - - - - - - - - - - - - - - - - - -\n\n');
 assert.match(learnPart,/^LEARN FIRST: /);assert.match(learnPart,/WORKED EXAMPLE/);
 if(material!==undefined){
  if(les.paras)for(const p of les.paras)assert.ok(material.includes(p),`${t.code} passage differs from the lesson`);
  else for(const f of les.figures)for(const s of f.series)for(const v of s.values)assert.ok(material.includes(String(v)),`${t.code} data ${s.name} ${v}`);
 }
 const full=norm(material??'');
 assert.deepEqual(t.questions.map(q=>q.id),['q1','q2','q3','q4','q5','q6']);
 const notes=t.content.teacher_notes.split('\n');assert.equal(notes.length,7);
 for(let i=1;i<=6;i++)assert.ok(notes[i-1].startsWith(`${i} `)&&notes[i-1].length>=30,`explanation for question ${i}`);
 for(const text of [t.content.teacher_notes,learnPart])
  for(const m of text.matchAll(/"([^"]+)"/g))for(const part of m[1].split(' ... '))assert.ok(full.includes(norm(part.trim())),`quote not in the lesson material: ${part}`);
 const counts={};
 for(const q of t.questions){
  const a=q.accepted_answers[0];counts[a]=(counts[a]??0)+1;
  if(q.answer_format==='text'){assert.ok(!q.options);assert.match(q.prompt,/________/);for(const x of q.accepted_answers)assert.ok(x.split(/\s+/).length<=2);
   if(!/The correct word is/.test(q.prompt))for(const x of q.accepted_answers)assert.ok(full.includes(norm(x)),`"${x}" not copied from the passage`);}
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
 const rows=(await db.query('select * from private.ielts_learning_tasks')).rows;assert.equal(rows.length,36);
 for(const t of src.tasks){const r=rows.find(r=>r.code===t.code);assert.ok(r.requires_review);
  for(const k of ['questions','content','review_record'])assert.deepEqual(deep(r[k]),deep(t[k]),`${t.code} ${k}`);
  for(const k of ['title','version','purpose','instructions','success_description','content_sha256'])assert.equal(r[k],t[k]);}
 await db.close();
});
test('owner release pins exactly the 36 approved versions, records originality and changes nothing else',()=>{
 const rel=readdirSync('supabase/migrations').filter(f=>f.endsWith('_ielts_targeted_vocabulary_01_originality_and_release.sql'));assert.equal(rel.length,1);
 const sql=readFileSync('supabase/migrations/'+rel[0],'utf8');
 assert.doesNotMatch(sql,/\bupdate\b|\bdelete\b/i,'append-only');
 for(const [i,t] of src.tasks.entries())assert.ok(sql.includes(`(${58+i},'R-${String(80+i).padStart(3,'0')}','${t.code}','${t.content_sha256}','${t.lesson.slice(6,8)}')`),`${t.code} pinned to the approved hash`);
 assert.match(sql,/unexpected_originality_match/);assert.match(sql,/'fresh'/);assert.doesNotMatch(sql,/'variant'/,'no variant links, so each mixed check stays assignable');
 assert.match(sql,/insert into private\.ielts_learning_releases/);assert.match(sql,/release_not_effective/);
});
