import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAMBRIDGE_WRITING_BANK_VERSION, CAMBRIDGE_WRITING_RUBRIC_VERSION, getCambridgeWritingProfile, getCambridgeWritingTaskLabel } from '../src/lib/brains_heist/cambridgeWritingProfiles.js';
test('Cambridge ESL profiles cover Grades 1-12 without First Language English', () => {
    const profiles = Array.from({ length: 12 }, (_, i) => getCambridgeWritingProfile(i + 1));
    assert.deepEqual(profiles.slice(0, 6).map(p => p.syllabus_code), Array(6).fill('0057'));
    assert.deepEqual(profiles.slice(6, 9).map(p => p.syllabus_code), Array(3).fill('0876'));
    assert.deepEqual(profiles.slice(9).map(p => p.syllabus_code), Array(3).fill('0510'));
    assert.equal(profiles[0]?.minimum_word_count, 15);
    assert.match(getCambridgeWritingTaskLabel(10, 'story'), /aligned skill task/);
    assert.doesNotMatch(JSON.stringify(profiles), /First Language/i);
});
test('formal bank creates 10 tasks for each of 7 genres and 12 grades', () => {
    const sql = readFileSync('supabase/migrations/20260817152418_cambridge_esl_formal_writing_hub.sql', 'utf8');
    assert.match(sql, new RegExp(CAMBRIDGE_WRITING_BANK_VERSION));
    assert.match(sql, new RegExp(CAMBRIDGE_WRITING_RUBRIC_VERSION));
    assert.match(sql, /<>840/);
    assert.match(sql, /having count\(\*\)<>10/);
    assert.match(sql, /'0057'/);
    assert.match(sql, /'0876'/);
    assert.match(sql, /'0510'/);
    assert.match(sql, /'verification_passes',2/);
    assert.doesNotMatch(sql, /First Language/i);
});
test('formal integrity archives interrupted attempts and exposes teacher evidence', () => {
    const sql = readFileSync('supabase/migrations/20260817152418_cambridge_esl_formal_writing_hub.sql', 'utf8');
    const hub = readFileSync('src/pages/writing/WritingHub.tsx', 'utf8');
    const monitor = readFileSync('src/pages/writing/WritingMonitoringView.tsx', 'utf8');
    assert.match(sql, /bh_writing_voided_attempts/);
    assert.match(sql, /second_tab_change/);
    assert.match(sql, /time_expired/);
    assert.match(hub, /second tab change ended and archived/i);
    assert.match(hub, /recordWritingIntegrityVoid/);
    assert.match(monitor, /Time spent:/);
    assert.match(monitor, /Tab changes:/);
    assert.match(monitor, /Largest attempted paste:/);
});
