import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const identityMigration = readFileSync('supabase/migrations/20260922143000_school_subject_identity.sql', 'utf8');
const adminMigration = readFileSync('supabase/migrations/20260922143100_school_subject_admin_rpcs.sql', 'utf8');
const learningMigration = readFileSync('supabase/migrations/20260922143200_school_subject_learning_catalog.sql', 'utf8');
const reopenNotificationMigration = readFileSync('supabase/migrations/20260922143400_subject_mapping_reopen_notifications.sql', 'utf8');
const service = readFileSync('services/schoolSubjectCatalogService.ts', 'utf8');
const manager = readFileSync('components/school-admin/SchoolSubjectsManager.tsx', 'utf8');
const subjectsTab = readFileSync('components/school-admin/tabs/SubjectsTab.tsx', 'utf8');

test('school subjects are first-class school-owned identities', () => {
  assert.match(identityMigration, /create table if not exists public\.school_subject_offerings/i);
  assert.match(identityMigration, /school_subject_id uuid not null references public\.school_subjects/i);
  assert.match(identityMigration, /unique \(school_subject_id,academic_year_id,grade_level\)/i);
  assert.match(identityMigration, /create table if not exists public\.school_subject_enrolments/i);
  assert.match(identityMigration, /unique \(student_id,academic_year_id,school_subject_id\)/i);
  assert.doesNotMatch(identityMigration, /unique \(school_id,academic_year_id,grade_level,academic_subject_id\)/i);
});

test('compatibility backfill leaves retired curriculum mappings untouched', () => {
  assert.match(
    identityMigration,
    /update public\.school_curriculum_scope_mappings m[\s\S]*m\.status in \('planned','active'\)[\s\S]*fv\.status='published'/i,
  );
  assert.match(identityMigration, /Archived\/retired curriculum mappings are historical evidence/i);
});

test('academic mapping is explicit and optional instead of inferred from a label', () => {
  assert.match(identityMigration, /drop trigger if exists trg_academic_enrich_school_subject/i);
  assert.match(identityMigration, /Optional academic capability map/i);
  assert.match(adminMigration, /p_academic_subject_id uuid default null/i);
  assert.match(adminMigration, /case when p_academic_subject_id is null then 'unmapped' else 'mapped' end/i);
  assert.match(manager, /No academic mapping yet/);
  assert.match(manager, /Mapping shares curriculum\/questions; it never merges the subject/);
});

test('different school subjects can share one academic map without sharing operational identity', () => {
  assert.match(identityMigration, /class_teacher_assignments[\s\S]*school_subject_id uuid references public\.school_subjects/i);
  assert.match(identityMigration, /assignments[\s\S]*school_subject_id uuid references public\.school_subjects/i);
  assert.match(adminMigration, /admin_allocate_teacher_to_school_subject/i);
  assert.match(adminMigration, /school_subject_id=p_school_subject_id/i);
  assert.match(learningMigration, /ss\.academic_subject_id/i);
  assert.match(learningMigration, /schoolSubjectId/i);
});

test('teacher question access follows the academic map while the school subject remains local', () => {
  assert.match(learningMigration, /join public\.school_subjects ss[\s\S]*ss\.academic_subject_id is not null/i);
  assert.match(learningMigration, /join public\.school_subject_offerings offering/i);
  assert.match(learningMigration, /lower\(trim\(scope\.school_subject_name\)\)=lower\(trim\(p_subject\)\)/i);
  assert.match(learningMigration, /scope\.academic_subject_id=q0\.academic_subject_id/i);
});

test('school subject learning preserves the verified question pool contract and operational year', () => {
  assert.match(learningMigration, /academic_resolve_operational_year_id\(v_school,now\(\)\)/i);
  assert.match(learningMigration, /eligible_grade_levels smallint\[\],[\s\S]*pool_scope text,[\s\S]*owner_school_id uuid/i);
  assert.match(learningMigration, /q0\.pool_scope='global'[\s\S]*item\.school_id is null/i);
  assert.match(learningMigration, /q0\.pool_scope='school'[\s\S]*q0\.owner_school_id=v_school[\s\S]*not q0\.is_public/i);
  assert.match(learningMigration, /q0\.pool_scope='teacher'[\s\S]*q0\.teacher_id=v_teacher/i);
  assert.match(learningMigration, /q\.eligible_grade_levels,q\.pool_scope,q\.owner_school_id/i);
});

test('unmapped subjects remain valid and create platform academic attention', () => {
  assert.match(identityMigration, /create table if not exists public\.school_subject_mapping_requests/i);
  assert.match(adminMigration, /school_subject_mapping_requests/i);
  assert.match(adminMigration, /transactional_email_outbox/i);
  assert.match(adminMigration, /platform_owner/i);
  assert.match(adminMigration, /school_subject_mapping_requested/i);
  assert.match(learningMigration, /rpc_superadmin_subject_mapping_requests/i);
  assert.match(manager, /You can still create and use this school subject/);
});

test('mapping attention is silent for normal pending edits and re-alerts on a later reopen', () => {
  assert.match(reopenNotificationMigration, /old\.status in \('resolved','dismissed'\) and new\.status='pending'/i);
  assert.match(reopenNotificationMigration, /school_subject_mapping_requested/i);
  assert.match(reopenNotificationMigration, /school-subject-mapping-reopened:/i);
  assert.match(reopenNotificationMigration, /after update of status on public\.school_subject_mapping_requests/i);
  assert.match(reopenNotificationMigration, /on conflict \(idempotency_key\) do nothing/i);
});

test('school subject deletion removes active operations but preserves historical work', () => {
  assert.match(adminMigration, /rpc_school_admin_delete_school_subject/i);
  assert.match(adminMigration, /set is_active=false,archived_at=now\(\)/i);
  assert.match(adminMigration, /school_subject_offerings[\s\S]*status='archived'/i);
  assert.match(adminMigration, /school_subject_enrolments[\s\S]*status='withdrawn'/i);
  assert.match(adminMigration, /class_teacher_assignments[\s\S]*set active=false/i);
  assert.doesNotMatch(adminMigration, /delete from public\.assignments/i);
  assert.doesNotMatch(adminMigration, /delete from public\.(?:assignment_results|student_assignment_results|quiz_scores)/i);
  assert.match(adminMigration, /'historyPreserved',true/i);
});

test('School Subjects is the primary operational source of truth', () => {
  assert.match(subjectsTab, /SchoolSubjectsManager/);
  assert.match(subjectsTab, /useState<SubjectWorkspace>\('subjects'\)/);
  assert.match(subjectsTab, /School Subjects/);
  assert.match(subjectsTab, /Academic Setup/);
  assert.doesNotMatch(subjectsTab, /SubjectProvisioningPanel/);
  assert.match(manager, /Source of truth/);
  assert.match(manager, /Add subject/);
  assert.match(manager, />Edit</);
  assert.match(manager, />Delete</);
});

test('the school subject editor has no hardcoded school subject selector', () => {
  assert.match(manager, /value=\{name\}/);
  assert.match(manager, /onChange=\{\(event\) => updateName\(event\.target\.value\)\}/);
  assert.doesNotMatch(manager, /<option[^>]*value="(?:English|Maths|Science|ESL|Chinese|Math Club)"/i);
  assert.match(manager, /academicChoices\.map/);
});

test('frontend service uses the new governed subject catalogue RPCs', () => {
  assert.match(service, /rpc_school_admin_subject_catalog/);
  assert.match(service, /rpc_school_admin_save_school_subject/);
  assert.match(service, /rpc_school_admin_delete_school_subject/);
  assert.match(service, /rpc_superadmin_subject_mapping_requests/);
});
