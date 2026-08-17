import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (filePath: string) => readFileSync(filePath, 'utf8');
const migration = read('supabase/migrations/20260815181500_teacher_allocation_terminology.sql');
const service = read('services/schoolAdminService.ts');
const teacherAllocationTab = read('components/school-admin/tabs/TeachersTab.tsx');
const schoolAdminPortal = read('components/SchoolAdminPortal.tsx');
const schoolHeadPortal = read('components/SchoolHeadPortal.tsx');
const teacherPortal = read('components/TeacherPortal.tsx');
const assignmentWizard = read('components/teacher/AssignmentWizard.tsx');

test('database exposes allocation-named contracts while retaining compatibility storage', () => {
  assert.match(migration, /view public\.class_teacher_allocations/);
  assert.match(migration, /security_invoker = true/);
  assert.match(migration, /school_admin_list_teacher_allocations/);
  assert.match(migration, /admin_allocate_teacher_to_class_subject/);
  assert.match(migration, /school_admin_delete_teacher_allocation/);
  assert.match(migration, /get_teacher_allocated_classes/);
  assert.match(migration, /school_admin_get_my_allocation_capabilities/);
  assert.match(migration, /has_active_teacher_allocation/);
  assert.match(migration, /normalize_teacher_allocation_payload/);
  assert.match(migration, /revoke all on function public\.school_admin_list_teacher_allocations/);
  assert.match(migration, /grant execute on function public\.school_admin_list_teacher_allocations\(uuid\)\s+to authenticated/);
  assert.match(migration, /Legacy physical storage for teacher allocations/);
});

test('application services use allocation-named database APIs', () => {
  for (const rpc of [
    'school_admin_get_my_allocation_capabilities',
    'school_admin_list_allocation_teachers',
    'school_admin_list_teacher_allocations',
    'admin_allocate_teacher_to_class_subject',
    'school_admin_delete_teacher_allocation',
    'get_teacher_allocated_classes',
  ]) assert.match(service, new RegExp(`rpc\\('${rpc}'`));

  assert.match(service, /interface ClassTeacherAllocation/);
  assert.match(service, /interface TeacherAllocatedClass/);
  assert.match(service, /has_active_teacher_allocation/);
});

test('school administration and executive UX reserve assignment for academic work', () => {
  const allocationUx = [teacherAllocationTab, schoolAdminPortal, schoolHeadPortal].join('\n');
  assert.doesNotMatch(allocationUx, /Teacher Assignments|teaching assignments?|teacher assignments?|Assign teacher|Assigning…|Teacher assigned/i);
  assert.match(teacherAllocationTab, /Teacher Allocation/);
  assert.match(teacherAllocationTab, /InvitesTab/);
  assert.match(teacherAllocationTab, /Allocate teacher|Allocating…|Date allocated/);
  assert.match(schoolHeadPortal, /With active allocations/);
});

test('teacher workspace calls classes allocations but keeps academic work as assignments', () => {
  assert.match(teacherPortal, /getTeacherAllocatedClasses/);
  assert.match(teacherPortal, /Your Allocated Classes/);
  assert.match(assignmentWizard, /Create an assignment/);
  assert.match(assignmentWizard, /Assignment title/);
});
