import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260812173635_allow_school_class_codes_in_user_batch_mirror.sql',
  'utf8',
);
const placement = readFileSync(
  'supabase/migrations/20260812172227_complete_phase3_student_placement_integrity.sql',
  'utf8',
);

test('school-configured class codes can be mirrored into users.batch', () => {
  assert.match(migration, /drop constraint if exists users_batch_check/i);
  assert.match(migration, /school_id is not null[\s\S]*length\(trim\(batch\)\) between 1 and 64/i);
  assert.match(migration, /batch = trim\(batch\)/i);
});

test('individual legacy batch validation remains constrained', () => {
  assert.match(migration, /school_id is null[\s\S]*\(6\|7\|8\|9\|10\|11\|12\)\[ABC\]/i);
  assert.match(migration, /batch = 'N\/A'/i);
});

test('reviewed placement still mirrors the destination class code', () => {
  assert.match(placement, /update public\.users set school_id=p_school_id,grade=v_to\.grade_level,batch=v_to\.class_code/i);
});
