import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  getIeltsPracticeItemRoute,
  rpcIeltsPracticeAssignmentDetail,
  rpcIeltsPracticeAssignToClass,
  rpcIeltsPracticeAssignToStudents,
  rpcIeltsPracticeCreateAssignment,
  rpcIeltsPracticeListAssignments,
  rpcIeltsPracticeMarkCompleted,
  rpcIeltsPracticeMarkStarted,
  rpcIeltsPracticeStudentAssignments,
  type IeltsPracticeAssignmentRpcClient,
} from '../services/ieltsPracticeAssignmentService.js';

const createClient = (handler: (name: string, params: Record<string, unknown>) => unknown): IeltsPracticeAssignmentRpcClient => ({
  rpc: ((name: string, params: Record<string, unknown>) => Promise.resolve({ data: handler(name, params), error: null })) as unknown as IeltsPracticeAssignmentRpcClient['rpc'],
});


test('IELTS practice assignment route helper maps content types to existing student practice routes', () => {
  assert.equal(getIeltsPracticeItemRoute({ content_type: 'ielts_reading_set', content_id: 'read-1' }), '/ielts/reading/read-1');
  assert.equal(getIeltsPracticeItemRoute({ content_type: 'ielts_listening_set', content_id: 'listen-1' }), '/ielts/listening/listen-1');
  assert.equal(getIeltsPracticeItemRoute({ content_type: 'ielts_writing_task', content_id: 'write-1' }), '/ielts/writing/write-1');
  assert.equal(getIeltsPracticeItemRoute({ content_type: 'ielts_speaking_task', content_id: 'speak-1' }), '/ielts/speaking/speak-1');
  assert.equal(getIeltsPracticeItemRoute({ content_type: 'unknown', content_id: 'x' }), null);
  assert.equal(getIeltsPracticeItemRoute({ content_type: 'ielts_reading_set', content_id: '' }), null);
});

test('IELTS practice assignment service maps RPC names and parameters', async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const client = createClient((name, params) => {
    calls.push({ name, params });
    if (name === 'rpc_ielts_practice_list_assignments') return [];
    if (name === 'rpc_ielts_practice_student_assignments') return [];
    if (name === 'rpc_ielts_practice_assignment_detail') return { assignment: { id: 'assignment-1', title: 'Practice' }, items: [], students: [] };
    return { id: 'assignment-1', title: 'Practice' };
  });

  await rpcIeltsPracticeListAssignments({ schoolId: 'school-1', classId: 'class-1' }, client);
  await rpcIeltsPracticeCreateAssignment({
    schoolId: 'school-1',
    classId: 'class-1',
    title: 'Week 1',
    description: 'Intro practice',
    dueAt: '2026-05-20T10:00:00.000Z',
    items: [
      { skill: 'reading', contentType: 'ielts_reading_set', contentId: '42', title: 'Reading A', required: true, orderIndex: 0 },
    ],
  }, client);
  await rpcIeltsPracticeAssignToClass({ assignmentId: 'assignment-1', classId: 'class-1' }, client);
  await rpcIeltsPracticeAssignToStudents({ assignmentId: 'assignment-1', studentIds: ['student-1', 'student-2'] }, client);
  await rpcIeltsPracticeAssignmentDetail('assignment-1', client);
  await rpcIeltsPracticeStudentAssignments(client);
  await rpcIeltsPracticeMarkStarted('assignment-1', client);
  await rpcIeltsPracticeMarkCompleted('assignment-1', client);

  assert.deepEqual(calls, [
    { name: 'rpc_ielts_practice_list_assignments', params: { p_school_id: 'school-1', p_class_id: 'class-1' } },
    {
      name: 'rpc_ielts_practice_create_assignment',
      params: {
        p_school_id: 'school-1',
        p_class_id: 'class-1',
        p_title: 'Week 1',
        p_description: 'Intro practice',
        p_due_at: '2026-05-20T10:00:00.000Z',
        p_items: [
          { skill: 'reading', content_type: 'ielts_reading_set', content_id: '42', title: 'Reading A', required: true, order_index: 0 },
        ],
      },
    },
    { name: 'rpc_ielts_practice_assign_to_class', params: { p_assignment_id: 'assignment-1', p_class_id: 'class-1' } },
    { name: 'rpc_ielts_practice_assign_to_students', params: { p_assignment_id: 'assignment-1', p_student_ids: ['student-1', 'student-2'] } },
    { name: 'rpc_ielts_practice_assignment_detail', params: { p_assignment_id: 'assignment-1' } },
    { name: 'rpc_ielts_practice_student_assignments', params: {} },
    { name: 'rpc_ielts_practice_mark_started', params: { p_assignment_id: 'assignment-1' } },
    { name: 'rpc_ielts_practice_mark_completed', params: { p_assignment_id: 'assignment-1' } },
  ]);
});

test('IELTS practice assignment SQL has RLS, school scoping, self-progress and no legacy admin dependency', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260516130000_ielts_practice_assignments_foundation.sql'),
    'utf8',
  );

  for (const table of ['ielts_practice_assignments', 'ielts_practice_assignment_items', 'ielts_practice_assignment_students']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, 'i'), `${table} must be created`);
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'), `${table} must enable RLS`);
  }

  assert.match(migration, /school_id uuid not null references public\.schools/i, 'assignments must carry a non-null school_id');
  assert.match(migration, /u\.school_id = p_school_id/i, 'school admin create/manage must be scoped to own school');
  assert.match(migration, /class_teacher_assignments[\s\S]*cta\.teacher_user_id = auth\.uid\(\)/i, 'assigned teacher permissions must use class assignments');
  assert.match(migration, /where assignment_id = p_assignment_id[\s\S]*and student_id = auth\.uid\(\)/i, 'student progress RPCs must update only the authenticated student row');
  const detailSql = migration.slice(
    migration.indexOf('create or replace function public.rpc_ielts_practice_assignment_detail'),
    migration.indexOf('create or replace function public.rpc_ielts_practice_student_assignments'),
  );
  assert.match(detailSql, /public\.can_manage_ielts_practice_assignment\(p_assignment_id\)/i, 'roster detail RPC must require assignment manager scope');
  assert.match(migration, /class_teacher_assignments[\s\S]*cta\.teacher_user_id = auth\.uid\(\)[\s\S]*coalesce\(cta\.active, true\) = true/i, 'teacher access must be scoped to assigned active classes');
  assert.doesNotMatch(detailSql, /can_view_ielts_practice_assignment/i, 'roster detail must not use student self-view permission');
  assert.match(migration, /'total_students'[\s\S]*'excused_count'[\s\S]*'completion_percent'/i, 'assignment payload must include completion counters');
  assert.doesNotMatch(migration, /answer_key/i, 'practice assignment RPCs must not select or return answer_key');
  assert.doesNotMatch(migration, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i, 'practice assignments must not rely on legacy IELTS admin permissions');
});


test('IELTS practice repair migration hardens payload helper and student-safe RPCs', () => {
  const repair = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260516140000_ielts_practice_assignment_repairs.sql'),
    'utf8',
  );

  const payloadSql = repair.slice(
    repair.indexOf('create or replace function public.ielts_practice_assignment_payload'),
    repair.indexOf('create or replace function public.rpc_ielts_practice_assignment_detail'),
  );
  const detailSql = repair.slice(
    repair.indexOf('create or replace function public.rpc_ielts_practice_assignment_detail'),
    repair.indexOf('create or replace function public.rpc_ielts_practice_student_assignments'),
  );
  const studentSql = repair.slice(
    repair.indexOf('create or replace function public.rpc_ielts_practice_student_assignments'),
    repair.indexOf('-- Internal helper'),
  );

  assert.match(payloadSql, /v_is_manager\s*:=\s*public\.can_manage_ielts_practice_assignment\(p_assignment_id\)/i, 'payload helper must check manager scope internally');
  assert.match(payloadSql, /v_is_assigned_student[\s\S]*s\.student_id\s*=\s*auth\.uid\(\)/i, 'payload helper must allow only the assigned student self-scope');
  assert.match(payloadSql, /if not \(v_is_manager or v_is_assigned_student\) then raise exception 'forbidden'/i, 'payload helper must deny unrelated callers');
  assert.match(payloadSql, /if v_is_manager then[\s\S]*'total_students'[\s\S]*'completion_percent'/i, 'aggregate counters must be manager-only in the payload helper');
  assert.match(repair, /revoke execute on function public\.ielts_practice_assignment_payload\(uuid\) from public/i, 'payload helper execute must be revoked from public');
  assert.match(repair, /revoke execute on function public\.ielts_practice_assignment_payload\(uuid\) from authenticated/i, 'payload helper execute must be revoked from authenticated');

  assert.match(detailSql, /if not public\.can_manage_ielts_practice_assignment\(p_assignment_id\) then raise exception 'forbidden'/i, 'detail RPC must be manager-only');
  assert.match(detailSql, /'students'[\s\S]*'student_id'[\s\S]*'completed_at'[\s\S]*'updated_at'/i, 'detail RPC must return roster progress rows');
  assert.doesNotMatch(detailSql, /can_view_ielts_practice_assignment/i, 'detail RPC must not use student self-view permission');

  assert.match(studentSql, /where s\.student_id\s*=\s*auth\.uid\(\)/i, 'student assignment RPC must only select current student rows');
  assert.match(studentSql, /'student_status'[\s\S]*'completed_at'[\s\S]*'student_updated_at'/i, 'student assignment RPC must include only the student progress status fields');
  assert.doesNotMatch(studentSql, /'students'|'username'|'email'|'total_students'|'assigned_count'|'completion_percent'/i, 'student assignment RPC must not append roster detail or aggregate counters');

  assert.doesNotMatch(repair, /answer_key/i, 'repair migration must not expose answer keys');
  assert.doesNotMatch(repair, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i, 'repair migration must not use legacy IELTS admin permissions');
});

test('IELTS Practice tab uses school-scoped assignment service and avoids legacy content table queries', () => {
  const tab = fs.readFileSync(path.join(process.cwd(), 'components/school-admin/tabs/IeltsPracticeTab.tsx'), 'utf8');
  assert.match(tab, /rpcIeltsPracticeListAssignments/, 'Practice tab must list assignments through the scoped service');
  assert.match(tab, /rpcIeltsPracticeCreateAssignment/, 'Practice tab must create assignments through the scoped service');
  assert.match(tab, /rpcIeltsPracticeAssignToClass/, 'Practice tab must assign classes through the scoped service');
  assert.match(tab, /rpcIeltsPracticeAssignmentDetail/, 'Practice tab must load roster completion through the scoped detail service');
  assert.match(tab, /View progress/, 'Practice tab should expose a simple progress view action');
  assert.match(tab, /progressFilters/, 'Practice tab should include simple progress status filters');
  assert.doesNotMatch(tab, /\.from\(['"]ielts_/i, 'Practice tab must not query legacy IELTS tables directly');
  assert.doesNotMatch(tab, /answer_key/i, 'Practice tab must not expose answer_key');
});


test('assigned IELTS practice student page uses assignment RPCs without raw IELTS table reads', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsAssignedPractice.tsx'), 'utf8');
  const routes = fs.readFileSync(path.join(process.cwd(), 'index.tsx'), 'utf8');
  const home = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsHome.tsx'), 'utf8');

  assert.match(routes, /path:\s*'\/ielts\/practice\/assigned'/, 'assigned practice route must be registered');
  assert.match(home, /navigate\('\/ielts\/practice\/assigned'\)/, 'IELTS home should link to assigned practice');
  assert.match(page, /rpcIeltsPracticeStudentAssignments/, 'student page must load assigned practice through the assignment RPC wrapper');
  assert.match(page, /rpcIeltsPracticeMarkStarted/, 'opening assigned practice should mark assigned rows started');
  assert.match(page, /rpcIeltsPracticeMarkCompleted/, 'student page should allow marking assignments completed');
  assert.match(page, /getIeltsPracticeItemRoute/, 'student page must use the route helper for content links');
  assert.doesNotMatch(page, /\.from\(['"]ielts_/i, 'student assigned practice page must not query raw IELTS tables');
  assert.doesNotMatch(page, /answer_key/i, 'student assigned practice page must not expose answer keys');
});
