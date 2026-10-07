import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getIeltsScreenerAudio } from '../services/ieltsDiagnosticEvidenceService';
const migration = readFileSync('supabase/migrations/20261005163109_ielts_governed_evidence_foundation.sql', 'utf8');
test('audio only accepts screener HTTPS media, never executable or insecure URLs', () => {
  assert.equal(getIeltsScreenerAudio({ assessment_mode: 'screener', audio_url: 'https://example.com/audio.mp3' }), 'https://example.com/audio.mp3');
  for (const audio_url of ['javascript:alert(1)', 'data:text/html,hi', 'http://example.com/audio.mp3', 'invalid']) assert.equal(getIeltsScreenerAudio({ assessment_mode: 'screener', audio_url }), null);
  assert.equal(getIeltsScreenerAudio({ audio_url: 'https://example.com/audio.mp3' }), null);
});
test('foundation never introduces readiness conversion or duplicate attempt infrastructure', () => {
  assert.doesNotMatch(migration, /create table (?:public|private)\.ielts_diagnostic_attempts\b/i);
  assert.doesNotMatch(migration, /insert into public\.ielts_funnel_events|create or replace function public\.ielts_latest_skill_readiness/i);
  assert.match(migration, /new\.mode<>'screener'/);
  assert.match(migration, /diagnostic_review_does_not_match_content/);
  assert.match(migration, /'readiness_available',false/);
  assert.match(migration, /'persistent_weakness_available',false/);
});


test('Listening delivery keeps measured pauses and scoped audio review in the canonical contract', () => {
  const bible = readFileSync('docs/ielts/IELTS_DIAGNOSTIC_BIBLE.md', 'utf8');
  assert.match(bible, /Measured reading and response intervals/);
  assert.match(bible, /Clear instruction\/passage separation/);
  assert.match(bible, /Approval of sound, pacing or pauses does not silently approve the answer key/);
  assert.match(bible, /not official IELTS timing rules/);
  const exam = readFileSync('src/pages/ielts/IeltsExamMode.tsx', 'utf8');
  assert.match(exam, /controls=\{syncState === 'active'\}/);
  for (const event of ['onPlay', 'onPlaying']) {
    const handler = exam.match(new RegExp(event + '=\\{\\(event\\) => \\{([\\s\\S]*?)\\}\\}'))?.[1] ?? '';
    assert.match(handler, /if \(syncStateRef\.current !== 'active' \|\| document\.hidden\) event\.currentTarget\.pause\(\)/);
  }
});

test('screener delivery uses narrow assessment labels and plain-language submission copy', () => {
  const exam = readFileSync('src/pages/ielts/IeltsExamMode.tsx', 'utf8');
  assert.ok(exam.includes("SECTIONS.find(section => section.id === activeSection)?.label"));
  assert.ok(exam.includes('starting-point check'));
  assert.match(exam, /isScreener \? 'Submit screener' : 'Submit IELTS Exam'/);
  assert.doesNotMatch(exam, /same idempotency key is reused/);
});
