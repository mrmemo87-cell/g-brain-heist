import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
// Regression (2026-11-21): ExamGuard auto-submit on IELTS Writing practice saved essays blank with 0 words.
test('auto-submit reads the latest text and never submits a blank answer',()=>{
  const src=readFileSync('src/pages/ielts/WritingPractice.tsx','utf8');
  const fn=src.slice(src.indexOf('const handleSubmit ='),src.indexOf('const formatTime'));
  assert.match(src,/latestRef\.current = \{ answer, wordCount, timeElapsed \}/);
  assert.match(fn,/const latest = latestRef\.current;/);
  assert.match(fn,/if \(!taskId \|\| !latest\.answer\.trim\(\)\) return;/,'blank is refused even when forced');
  assert.match(fn,/answer: latest\.answer\.trim\(\)/);
  assert.doesNotMatch(fn,/answer: answer\.trim\(\)/,'no stale closure over the first-render answer');
});
test('the database refuses blank writing attempts but keeps old rows',async()=>{
  const db=new PGlite();
  await db.exec(`create table public.ielts_writing_attempts(id serial primary key,answer_text text,word_count int);insert into public.ielts_writing_attempts(answer_text,word_count) values('',0);`);
  await db.exec(readFileSync('supabase/migrations/20261121060000_ielts_writing_attempts_no_blank.sql','utf8'));
  await assert.rejects(db.query(`insert into public.ielts_writing_attempts(answer_text,word_count) values('   ',0)`),/answer_not_blank/);
  await assert.rejects(db.query(`insert into public.ielts_writing_attempts(answer_text,word_count) values(null,0)`),/answer_not_blank/);
  await db.query(`insert into public.ielts_writing_attempts(answer_text,word_count) values('A real essay.',3)`);
  assert.equal((await db.query('select count(*)::int c from public.ielts_writing_attempts')).rows[0].c,2);
});
test('teacher review list skips blank Writing answers without deleting history',()=>{
  const sql=readFileSync('supabase/migrations/20261121070000_ielts_review_queue_skip_blank.sql','utf8');
  const writing=sql.slice(sql.indexOf("p_skill = 'writing'"),sql.indexOf("p_skill = 'speaking'"));
  assert.match(writing,/and btrim\(coalesce\(a\.answer_text, ''\)\) <> ''/);
  assert.doesNotMatch(sql,/\bdelete\b/i);
});
