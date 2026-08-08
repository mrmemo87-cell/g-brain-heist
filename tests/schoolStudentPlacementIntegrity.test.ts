import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file: string) => readFileSync(file, 'utf8');
const migration = read('supabase/migrations/20260804120000_school_student_placement_integrity.sql');
const auditIndexes = read('supabase/migrations/20260804123000_school_student_placement_audit_indexes.sql');
const service = read('services/schoolAdminService.ts');
const portal = read('components/SchoolAdminPortal.tsx');
const memberModal = read('components/school-admin/modals/MemberActionModal.tsx');
const memberDirectory = read('components/school-admin/tabs/MembersTab.tsx');
const studentsTab = read('components/school-admin/tabs/StudentsTab.tsx');

const functionDefinition = (name: string) => migration.match(
  new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, 'i'),
)?.[0] ?? '';

test('placement history is append-only to clients and school-admin scoped', () => {
  assert.match(migration, /create table if not exists public\.school_student_placement_audit/i);
  assert.match(migration, /alter table public\.school_student_placement_audit enable row level security/i);
  assert.match(migration, /revoke all on table public\.school_student_placement_audit from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant select on table public\.school_student_placement_audit to authenticated/i);
  assert.match(migration, /using \(public\.can_administer_school\(school_id\)\)/i);
  assert.match(migration, /actor_user_id uuid references public\.users/i);
  assert.match(auditIndexes, /\(student_user_id, created_at desc\)/i);
  assert.match(auditIndexes, /\(actor_user_id, created_at desc\)[\s\S]*where actor_user_id is not null/i);
  assert.match(auditIndexes, /\(to_class_id, created_at desc\)[\s\S]*where to_class_id is not null/i);
});

test('existing duplicate placements reconcile deterministically before uniqueness is enforced', () => {
  assert.match(migration, /normalise|regexp_replace[\s\S]*class_code/i);
  assert.match(migration, /previous_grade[\s\S]*grade_level/i);
  assert.match(migration, /coalesce\(c\.is_active, false\) desc/i);
  assert.match(migration, /cs\.joined_at desc nulls last/i);
  assert.match(migration, /migration_reconciliation/i);
  assert.match(migration, /ambiguous cross-school class memberships remain/i);
  assert.match(migration, /create unique index if not exists class_students_one_current_class_per_student_idx[\s\S]*student_id/i);
});

test('the canonical move is admin-only, tenant-safe, transactional, and auditable', () => {
  const move = functionDefinition('move_student_between_classes');
  assert.match(move, /security definer[\s\S]*set search_path = ''/i);
  assert.match(move, /public\.can_administer_school\(v_to_class\.school_id\)/i);
  assert.match(move, /from public\.users u[\s\S]*for update/i);
  assert.match(move, /sm\.school_id = v_to_class\.school_id[\s\S]*sm\.status = 'active'[\s\S]*sm\.role_in_school = 'student'/i);
  assert.match(move, /v_student_school_id is distinct from v_to_class\.school_id/i);
  assert.match(move, /delete from public\.class_students[\s\S]*where student_id = p_student_id/i);
  assert.match(move, /set grade = v_to_class\.grade_level,[\s\S]*batch = v_to_class\.class_code/i);
  assert.match(move, /insert into public\.school_student_placement_audit/i);
  assert.match(migration, /revoke all on function public\.move_student_between_classes\(uuid, uuid, uuid\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.move_student_between_classes\(uuid, uuid, uuid\) to authenticated/i);
});

test('every placement mutation path preserves the single-class invariant', () => {
  const legacy = functionDefinition('school_admin_move_student_to_class');
  const legacyBody = legacy.split(/as \$\$/i)[1] ?? '';
  assert.doesNotMatch(legacyBody, /p_grade/i);
  assert.match(legacyBody, /move_student_between_classes\(p_student_id, null, p_class_id\)/i);
  assert.match(functionDefinition('add_student_to_class'), /move_student_between_classes\(p_student_id, null, p_class_id\)/i);
  assert.match(functionDefinition('bulk_add_students_to_class'), /can_administer_school\(v_school_id\)[\s\S]*move_student_between_classes\(v_student_id, null, p_class_id\)/i);
  assert.match(functionDefinition('bulk_remove_students_from_class'), /can_administer_school\(v_school_id\)[\s\S]*remove_student_from_class\(p_class_id, v_student_id\)/i);
  assert.match(functionDefinition('auto_enroll_students_by_grade'), /not exists \([\s\S]*class_students cs where cs\.student_id = u\.id/i);
});

test('the portal sends class identity only and refreshes without an artificial replication delay', () => {
  const moveService = service.match(/export async function moveStudentToClassViaRPC[\s\S]*?^}/m)?.[0] ?? '';
  const enrollmentHandler = portal.match(/const handleEnrollStudent[\s\S]*?^  };/m)?.[0] ?? '';
  assert.match(moveService, /rpc\('move_student_between_classes'/);
  assert.match(moveService, /p_from_class_id: fromClassId/);
  assert.match(moveService, /p_to_class_id: classId/);
  assert.doesNotMatch(moveService, /p_grade|school_admin_move_student_to_class/);
  assert.match(enrollmentHandler, /previousClassId = studentAssignments\[studentId\]/);
  assert.doesNotMatch(enrollmentHandler, /setTimeout|DB replication/i);
  assert.match(enrollmentHandler, /setMembers/);
  assert.match(enrollmentHandler, /listClassStudents/);
});

test('student management limits class selection to the chosen academic year', () => {
  assert.match(memberModal, /aria-label="Academic year \(grade\)"/);
  assert.match(memberModal, /classesForAcademicYear\.map/);
  assert.match(memberModal, /setSelectedClassId\(''\)/);
  assert.match(memberModal, /disabled=\{studentSaving \|\| !selectedClassId\}/);
  assert.doesNotMatch(memberModal, /handleEnrollStudent\(selectedMember\.user_id, selectedClassId, selectedGrade\)/);
  assert.match(studentsTab, /aria-label="Academic year \(grade\)"/);
  assert.match(studentsTab, /classesForAcademicYear\.map/);
  assert.match(studentsTab, /Select academic year first/);
  assert.match(memberDirectory, /grade: assignedClass\?\.grade_level \?\? teacherClass\?\.grade_level \?\? member\.grade/);
  assert.match(memberDirectory, /batch: assignedClass\?\.class_code \?\? teacherClass\?\.class_code \?\? member\.batch/);
});
