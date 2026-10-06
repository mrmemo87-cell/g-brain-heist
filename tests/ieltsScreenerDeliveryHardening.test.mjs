import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const examMode = fs.readFileSync(new URL('../src/pages/ielts/IeltsExamMode.tsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20261006132000_ielts_screener_delivery_hardening.sql', import.meta.url), 'utf8');

test('Listening screener pauses on backgrounding and treats blur as non-blocking evidence', () => {
  assert.match(examMode, /onWindowBlur[\s\S]*pauseScreenerAudio\(\)/);
  assert.match(examMode, /const pauseScreenerAudio[\s\S]*checkpointAudio\(audio\)[\s\S]*audio\.pause\(\)/);
  assert.match(examMode, /logIncident\('window_blur', 'info'/);
  assert.match(examMode, /dedupeKey = incidentType === 'window_blur' \|\| incidentType === 'tab_hidden' \? 'backgrounding'/);
});

test('Listening screener records only sustained active-playback buffering as an interruption', () => {
  assert.match(examMode, /currentTime <= 0\) return/);
  assert.match(examMode, /setTimeout\(\(\) => \{[\s\S]*screener_audio_interruption[\s\S]*\}, 1500\)/);
  assert.doesNotMatch(examMode, /logIncident\('screener_audio_buffering'/);
});

test('governed result integrity ignores harmless blur but preserves meaningful interruption review', () => {
  assert.match(migration, /ielts_screener_integrity_incident/);
  assert.match(migration, /'screener_audio_interruption'/);
  assert.doesNotMatch(migration.match(/ielts_screener_integrity_incident[\s\S]*?\$\$;/)?.[0] ?? '', /'window_blur'/);
});

test('server-verified governed scoring synchronizes generic submission grading without duplicating scoring', () => {
  assert.match(migration, /if tg_op='UPDATE' then/);
  assert.match(migration, /new\.grading_status is distinct from 'graded'/);
  assert.match(migration, /new\.grading_result->>'source' is distinct from 'governed_screener'/);
  assert.match(migration, /update public\.ielts_exam_submissions[\s\S]*grading_status='graded'/);
  assert.match(migration, /where r\.submission_id=s\.id and r\.server_verified=true/);
});
