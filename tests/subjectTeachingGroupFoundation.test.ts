import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync('supabase/migrations/20260923071008_subject_teaching_group_foundation.sql', 'utf8');
const behavior = readFileSync('supabase/tests/subject_teaching_groups.sql', 'utf8');

test('group foundation has separate access/delivery and compound tenant foreign keys', () => {
  assert.match(sql, /delivery_mode in \('by_class','whole_grade','custom_groups'\)/);
  assert.match(sql, /foreign key \(school_subject_offering_id,school_id\)/);
  assert.match(sql, /foreign key \(group_id,school_id\)/);
  assert.match(sql, /group_identity_is_immutable_create_replacement/);
  assert.match(sql, /on delete restrict/);
});

test('group roster intersects explicit membership with independent current subject eligibility', () => {
  assert.match(sql, /academic_resolve_operational_year_id/);
  assert.match(sql, /e.school_subject_id=o.school_subject_id/);
  assert.match(sql, /e.academic_year_id=o.academic_year_id/);
  assert.match(sql, /g.group_type='custom' and exists/);
  assert.match(sql, /r.class_id=g.registration_class_id/);
  assert.match(sql, /t.active and t.can_create/);
  assert.doesNotMatch(sql, /join public.class_teacher_assignments/);
});

test('group APIs require authenticated tenant authority and expose no raw roster tables', () => {
  assert.match(sql, /revoke all on public.school_subject_groups,public.school_subject_group_students,public.school_subject_group_teachers from public,anon,authenticated/);
  for (const table of ['school_subject_groups', 'school_subject_group_students', 'school_subject_group_teachers']) {
    assert.ok(sql.includes(`alter table public.${table} enable row level security`));
  }
  assert.match(sql, /teaching_group_allocation_required/);
  assert.match(sql, /school_administrator_access_required/);
  assert.match(sql, /teaching_school_membership_required/);
});

test('delivery changes archive identities and assignments keep immutable group snapshots', () => {
  assert.match(sql, /confirm_archive_existing_groups/);
  assert.match(sql, /set status='archived' where school_subject_offering_id=new.id/);
  assert.match(sql, /new.subject_group_name_snapshot:=old.subject_group_name_snapshot/);
  assert.match(sql, /published_group_assignment_identity_is_immutable/);
  assert.doesNotMatch(sql, /delete from public.assignments|delete from public.school_subject_groups/);
});

test('SQL behavior suite covers real roster permissions and history rather than SQL patterns alone', () => {
  for (const failure of ['cross-class roster expected 2', 'unselected student admitted',
    'cross-school group accepted', 'read-only teacher can assign', 'withdrawn student retained access',
    'shared curriculum merged local groups', 'anonymous roster visible', 'group was reparented',
    'unmapping lost operational identity', 'delivery changed without confirmation',
    'historical group destroyed', 'registration roster changed', 'unguarded Data API access']) {
    assert.ok(behavior.includes(failure), failure);
  }
});
