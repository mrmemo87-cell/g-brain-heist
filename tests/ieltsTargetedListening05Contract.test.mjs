import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
// Targeted Listening 05 source contract: a guided practice and a fresh check for each of the five Listening skills that had
// none, six items each mapped to that skill, answers short enough for the server's two-word listening rule, keys among the
// options, transcripts that contain the key evidence, and exact-file audio metadata awaiting the owner's listen.
const src=JSON.parse(readFileSync('docs/ielts/practice/TARGETED_LISTENING_05.json','utf8'));
const LISTENING_V1='d4ad52b6-fd0f-4068-9982-28b89ff389c5';
const NODES={distractor:'f9064b63-e3f1-4bfa-8e8e-97a02756afb2',paraphrase:'94c5d4f7-ab5b-464a-a1f8-4cac4f1d2d2d',sequencing:'5bcb6e11-1f2d-4ce6-b1af-093acc342ff1',attitude:'0c24d56c-a8ad-4747-8fab-0a99042e6d77',purpose:'896804e2-f2eb-4c92-80f3-4479e71c377b'};
const ALL=new Set([...Object.values(NODES),'0dbe1c8f-403a-493f-afd3-c219310fb18a','d0aa0bad-ecfa-4598-8f2f-07e93d3fa59b','d5b1fddb-ba6f-4be1-8513-bb26d822357a']);
test('ten tasks: a practice and a fresh check for each of five skills, nothing approved by the pack itself',()=>{
 assert.equal(src.taxonomy_version_id,LISTENING_V1);assert.equal(src.tasks.length,10);
 for(const [focus,node] of Object.entries(NODES)){const ts=src.tasks.filter(t=>t.focus===focus);assert.deepEqual(ts.map(t=>t.purpose).sort(),['guided_practice','independent_check']);
  for(const t of ts)for(const q of t.questions)assert.equal(q.taxonomy_node_id,node,`${t.code} ${q.id} primary is the focus skill`);}
 assert.equal(new Set(src.tasks.map(t=>t.code)).size,10);
 for(const t of src.tasks)assert.equal(t.audio.owner_audio_approval,null,'owner approval is recorded only after the owner listens');
});
for(const t of src.tasks)test(`${t.code} is well formed`,()=>{
 assert.match(t.code,/^bh-ielts-targeted-listening-l(\d+)-v1$/);assert.equal(t.skill,'listening');
 assert.deepEqual(t.questions.map(q=>q.id),['q1','q2','q3','q4','q5','q6']);
 const transcript=t.script.map(s=>s.text).join(' ').toLowerCase();
 for(const q of t.questions){
  assert.ok(ALL.has(q.supporting_node_id)&&q.supporting_node_id!==q.taxonomy_node_id);
  for(const a of q.accepted_answers)assert.ok(a.trim().split(/\s+/).length<=2,`${a} fits the two-word rule`);
  if(q.options){assert.deepEqual(q.options.map(o=>o.value),['A','B','C']);assert.deepEqual(q.accepted_answers.length,1);assert.ok(q.options.some(o=>o.value===q.accepted_answers[0]));}
  else assert.ok(q.accepted_answers.some(a=>transcript.includes(a.toLowerCase().replace(/^the /,''))||/^\d/.test(a)),`${q.id} key is heard`);
 }
 if(t.format==='mcq'){const c={};for(const q of t.questions)c[q.accepted_answers[0]]=(c[q.accepted_answers[0]]??0)+1;assert.ok(Math.max(...Object.values(c))<=3,'letters are spread');}
 assert.match(t.instructions,t.purpose==='independent_check'?/fresh check: listen once/:/pause or replay/);
 assert.ok(t.content.teacher_notes.includes('Transcript:')&&t.content.teacher_notes.includes('Key and teaching notes:'));
 assert.match(t.audio.sha256,/^[a-f0-9]{64}$/);assert.ok(t.audio.duration_seconds>90&&t.audio.duration_seconds<240);
 assert.equal(t.audio.decoded_clipped_samples,0);assert.deepEqual(t.audio.detected_pauses_seconds.map(Math.round),[30,15]);
 assert.ok(t.script_chars<=2000,'fits one dialogue generation');
});
test('review pack lists every exact file for the owner to listen to',()=>{
 const md=readFileSync('docs/ielts/practice/TARGETED_LISTENING_05_REVIEW.md','utf8');
 for(const t of src.tasks){assert.ok(md.includes(t.audio.sha256));assert.ok(md.includes(t.code));}
 assert.match(md,/listen to every recording/);assert.match(md,/has not approved anything/);
});
