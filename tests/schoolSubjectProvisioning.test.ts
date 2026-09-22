import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const provisioningMigration = read('supabase/migrations/20260922110000_school_subject_provisioning.sql');
const teacherAliasMigration = read('supabase/migrations/20260922111000_school_subject_alias_teacher_allocation.sql');
const atomicityMigration = read('supabase/migrations/20260922112000_subject_provisioning_atomicity.sql');
const panel = read('components/school-admin/SubjectProvisioningPanel.tsx');
const service = read('services/subjectProvisioningService.ts');
const subjectsTab = read('components/school-admin/tabs/SubjectsTab.tsx');

test('school subject provisioning keeps a school label mapped to canonical academic authority', () => {
  assert.match(provisioningMigration, /add column if not exists display_name text/i);
  assert.match(provisioningMigration, /add column if not exists school_subject_id uuid/i);
  assert.match(provisioningMigration, /academic_subject_aliases/i);
  assert.match(provisioningMigration, /rpc_school_admin_provision_subject/i);
  assert.match(provisioningMigration, /school_subjects/i);
  assert.match(provisioningMigration, /academic_subject_id = p_academic_subject_id/i);
});

test('selective access is enforced by the existing student subject enrolment authority', () => {
  assert.match(atomicityMigration, /p_access_mode not in \('all_grade', 'selected'\)/i);
  assert.match(atomicityMigration, /student_subject_enrolments/i);
  assert.match(atomicityMigration, /select_at_least_one_student/i);
  assert.match(atomicityMigration, /selected_student_not_in_grade/i);
  assert.match(atomicityMigration, /status = 'withdrawn'/i);
  assert.match(atomicityMigration, /subject_requirement = excluded\.subject_requirement/i);
});

test('provisioning validates the whole audience and staffing scope before writes', () => {
  const audienceValidation = atomicityMigration.indexOf('-- Validate the full selective audience before any writes.');
  const staffingValidation = atomicityMigration.indexOf('-- Validate staffing before any writes.');
  const firstAliasWrite = atomicityMigration.indexOf('insert into public.academic_subject_aliases');
  assert.ok(audienceValidation >= 0 && audienceValidation < firstAliasWrite);
  assert.ok(staffingValidation >= 0 && staffingValidation < firstAliasWrite);
  assert.match(atomicityMigration, /teacher_class_required/i);
  assert.match(atomicityMigration, /raise exception using[\s\S]+teacher_allocation_failed/i);
});

test('student catalogue exposes school-facing subject label without changing canonical code or id', () => {
  assert.match(provisioningMigration, /'name', coalesce\(nullif\(trim\(school_mapping\.display_name\)/i);
  assert.match(provisioningMigration, /'canonicalName', subject\.name/i);
  assert.match(provisioningMigration, /'code', subject\.code/i);
  assert.match(provisioningMigration, /'id', subject\.id/i);
});

test('teacher allocation resolves school aliases back to canonical subject permissions', () => {
  assert.match(teacherAliasMigration, /academic_subject_aliases/i);
  assert.match(teacherAliasMigration, /alias\.school_id = p_school_id/i);
  assert.match(teacherAliasMigration, /v_subject := coalesce/i);
  assert.match(teacherAliasMigration, /teacher_assignment_subject_key\(subject\) = private\.teacher_assignment_subject_key\(v_subject\)/i);
  assert.match(teacherAliasMigration, /'canonical_subject', v_subject/i);
});

test('Subject Studio gives school admins one workflow for mapping grade audience students and teachers', () => {
  assert.match(panel, /Subject Studio/);
  assert.match(panel, /School subject name/);
  assert.match(panel, /Academic mapping/);
  assert.match(panel, /Selected students/);
  assert.match(panel, /Teacher allocation/);
  assert.match(panel, /Publish subject/);
  assert.match(panel, /provisionSchoolSubject/);
  assert.match(service, /rpc_school_admin_provision_subject/);
  assert.match(service, /rpc_school_admin_subject_provisioning_state/);
  assert.match(subjectsTab, /SubjectProvisioningPanel/);
});
