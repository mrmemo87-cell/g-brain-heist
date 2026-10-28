import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
// Targeted Listening 06 source contract: Listening Lessons 10 and 14 step by step in the Lesson 6 format. For each lesson,
// five guided steps and one mixed check, six keyed items each; every step opens with LEARN FIRST and a worked example,
// never shows the transcript before answering, and explains every answer; quoted proof and typed answers come from the
// part of the owner-approved recording that the step plays; audio is cut from that recording and pinned by SHA-256;
// pilot-only with teacher review; the install migrations store exactly the source and never release.
const src=JSON.parse(readFileSync('docs/ielts/practice/TARGETED_LISTENING_06.json','utf8'));
const GULZADA='b30e9c28-96f1-4d34-83e9-9b28b4926f42';
const norm=s=>String(s).toLowerCase().replace(/\s+/g,' ');
const lessonOf=t=>{const n=t.lesson.slice(6,8);const l=JSON.parse(readFileSync(`docs/ielts/lessons/lesson-${n}/lesson.json`,'utf8'));
 const prod=JSON.parse(readFileSync(`docs/ielts/lessons/lesson-${n}/AUDIO_PRODUCTION_v1.json`,'utf8'));
 return {n,version:l.version,paras:l.blocks.find(b=>b.id===`IELTS-${n}-L1`).stimulus.paragraphs,rec:Object.values(prod.recordings)[0]};};
const migrations=readdirSync('supabase/migrations').filter(f=>/_ielts_targeted_listening_06_lesson_(10|14)_steps_[12]\.sql$/.test(f)).sort();

test('two lessons, five guided steps and one check each, pilot only with review',()=>{
 assert.equal(src.tasks.length,12);assert.equal(migrations.length,4);
 assert.deepEqual(src.tasks.map(t=>t.code),Array.from({length:12},(_,i)=>`bh-ielts-targeted-listening-l${15+i}-v1`));
 for(const [i,t] of src.tasks.entries()){
  const L=i<6?'10':'14';assert.equal(t.lesson,`IELTS-${L} v${lessonOf(t).version}`,'built from the current lesson version');
  assert.equal(t.purpose,i%6===5?'independent_check':'guided_practice');
  assert.match(t.title,new RegExp(`^Listening Lesson ${L} step ${i%6+1} of 6: `));
  assert.equal(t.skill,'listening');assert.equal(t.version,'0.1.0');assert.equal(t.pilot_student,GULZADA);assert.equal(t.review_record.human_review,'pending');
  assert.equal(t.audio_path,`targeted-listening-06/${t.audio_sha256}/${t.review_record.audio_file.file}`);
  assert.equal(t.review_record.audio_file.sha256,t.audio_sha256);
  assert.equal(t.review_record.audio_file.derived_from.sha256,lessonOf(t).rec.sha256,'cut from the owner-approved recording');
 }
 assert.equal(new Set(src.tasks.map(t=>t.audio_sha256)).size,6,'six audio files: part A, part B and the whole talk for each lesson');
});
for(const t of src.tasks)test(`${t.code} teaches first, hides the transcript until submission, then explains`,()=>{
 const {paras}=lessonOf(t);
 const cut=paras.findIndex(p=>p.includes(t.lesson.startsWith('IELTS-10')?'pleasantly surprised':"We've used pie charts for everything"))+1;
 const part={A:paras.slice(0,cut),B:paras.slice(cut),F:paras}[t.audio_part];const heard=norm(part.join(' '));
 assert.match(t.content.passage,/^LEARN FIRST: /);assert.match(t.content.passage,/WORKED EXAMPLE/);
 assert.doesNotMatch(t.content.passage,/- - - -|THE PASSAGE:/,'no transcript or article before answering');
 for(const p of paras)assert.ok(!t.content.passage.includes(p),'no transcript paragraph in LEARN FIRST');
 assert.deepEqual(t.questions.map(q=>q.id),['q1','q2','q3','q4','q5','q6']);
 const [notesPart,transcript]=t.content.teacher_notes.split('\n\nTranscript of what you heard:\n');
 assert.equal(transcript,part.join('\n'),'the transcript shown after submitting is exactly the part played');
 const notes=notesPart.split('\n');assert.equal(notes.length,7);
 for(let i=1;i<=6;i++)assert.ok(notes[i-1].startsWith(`${i} `)&&notes[i-1].length>=30,`explanation for question ${i}`);
 for(const m of notesPart.matchAll(/"([^"]+)"/g))for(const piece of m[1].split(' ... '))assert.ok(heard.includes(norm(piece.trim())),`quote not in the part played: ${piece}`);
 const counts={};
 for(const q of t.questions){
  const a=q.accepted_answers[0];counts[a]=(counts[a]??0)+1;
  if(q.answer_format==='text'){assert.ok(!q.options);assert.match(q.prompt,/________/);for(const x of q.accepted_answers){assert.ok(x.split(/\s+/).length<=2);if(!/^\d+$/.test(x))assert.ok(heard.includes(norm(x)),`"${x}" is not heard in this part`);}}
  else{assert.equal(q.accepted_answers.length,1);assert.ok(q.options.map(o=>o.value).includes(a),`${q.id} answer not an option`);}
 }
 assert.ok(Math.max(...Object.values(counts))<=3,'answers spread');
 if(t.purpose==='independent_check')assert.match(t.instructions,/ONCE, without pausing/);
 else assert.match(t.instructions,/You may pause or replay/);
});
test('install migrations are insert-only, keep review on, never release, and store exactly the source',async()=>{
 const db=new PGlite();
 await db.exec('create schema private;create table private.ielts_learning_tasks(code text primary key,version text,title text,skill text,purpose text,audio_path text,audio_sha256 text,instructions text,success_description text,taxonomy_version_id uuid,pilot_student uuid,questions jsonb,content jsonb,review_record jsonb,content_sha256 text,requires_review boolean);');
 for(const f of migrations){const sql=readFileSync('supabase/migrations/'+f,'utf8');
  assert.doesNotMatch(sql,/insert into private\.ielts_learning_releases|\bupdate\b|\bdelete\b/i);
  assert.equal((sql.match(/,true\) on conflict \(code\) do nothing;/g)??[]).length,3);
  await db.exec(sql);}
 const deep=v=>Array.isArray(v)?v.map(deep):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,deep(v[k])])):v;
 const rows=(await db.query('select * from private.ielts_learning_tasks')).rows;assert.equal(rows.length,12);
 for(const t of src.tasks){const r=rows.find(r=>r.code===t.code);assert.ok(r.requires_review);
  for(const k of ['questions','content','review_record'])assert.deepEqual(deep(r[k]),deep(t[k]),`${t.code} ${k}`);
  for(const k of ['title','version','purpose','instructions','success_description','content_sha256','audio_path','audio_sha256'])assert.equal(r[k],t[k]);}
 await db.close();
});
