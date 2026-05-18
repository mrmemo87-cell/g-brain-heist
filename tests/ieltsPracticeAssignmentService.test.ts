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
  rpcIeltsPracticeForceCompleteAssignment,
  rpcIeltsPracticeMarkItemCompleted,
  rpcIeltsPracticeMarkItemStarted,
  rpcIeltsPracticeMarkStarted,
  rpcIeltsPracticeAssignmentProgress,
  rpcIeltsPracticeStudentAssignments,
  type IeltsPracticeAssignmentRpcClient,
} from '../services/ieltsPracticeAssignmentService.js';
import {
  rpcIeltsPracticeContentCatalog,
  type IeltsPracticeContentRpcClient,
} from '../services/ieltsPracticeContentService.js';

const createClient = (handler: (name: string, params: Record<string, unknown>) => unknown): IeltsPracticeAssignmentRpcClient => ({
  rpc: ((name: string, params: Record<string, unknown>) => Promise.resolve({ data: handler(name, params), error: null })) as unknown as IeltsPracticeAssignmentRpcClient['rpc'],
});




test('IELTS practice content catalog service maps RPC names and parameters', async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const client: IeltsPracticeContentRpcClient = {
    rpc: ((name: string, params: Record<string, unknown>) => {
      calls.push({ name, params });
      return Promise.resolve({
        data: [
          {
            content_type: 'ielts_reading_set',
            content_id: '42',
            title: 'Reading A',
            skill: 'reading',
            description: 'Public description',
            difficulty: 'intermediate',
            band: '5-6',
          },
        ],
        error: null,
      });
    }) as unknown as IeltsPracticeContentRpcClient['rpc'],
  };

  const rows = await rpcIeltsPracticeContentCatalog({ skill: 'reading', search: 'Reading', limit: 25 }, client);

  assert.deepEqual(calls, [
    { name: 'rpc_ielts_practice_content_catalog', params: { p_skill: 'reading', p_search: 'Reading', p_limit: 25 } },
  ]);
  assert.equal(rows[0].content_type, 'ielts_reading_set');
  assert.equal(rows[0].content_id, '42');
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
    if (name === 'rpc_ielts_practice_assignment_progress' || name === 'rpc_ielts_practice_mark_item_started' || name === 'rpc_ielts_practice_mark_item_completed') {
      return { assignment_id: 'assignment-1', student_id: 'student-1', required_count: 1, completed_required_count: 1, item_count: 1, completed_item_count: 1, items: [] };
    }
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
  await rpcIeltsPracticeForceCompleteAssignment({ assignmentId: 'assignment-1', studentId: 'student-1', reason: 'excused by admin' }, client);
  await rpcIeltsPracticeAssignmentProgress('assignment-1', 'student-1', client);
  await rpcIeltsPracticeMarkItemStarted({ assignmentId: 'assignment-1', assignmentItemId: 'item-1' }, client);
  await rpcIeltsPracticeMarkItemCompleted({ assignmentId: 'assignment-1', assignmentItemId: 'item-1', practiceAttemptType: 'reading', practiceAttemptId: 'attempt-1' }, client);

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
    { name: 'rpc_ielts_practice_force_complete_assignment', params: { p_assignment_id: 'assignment-1', p_student_id: 'student-1', p_reason: 'excused by admin' } },
    { name: 'rpc_ielts_practice_assignment_progress', params: { p_assignment_id: 'assignment-1', p_student_id: 'student-1' } },
    { name: 'rpc_ielts_practice_mark_item_started', params: { p_assignment_id: 'assignment-1', p_assignment_item_id: 'item-1' } },
    { name: 'rpc_ielts_practice_mark_item_completed', params: { p_assignment_id: 'assignment-1', p_assignment_item_id: 'item-1', p_practice_attempt_type: 'reading', p_practice_attempt_id: 'attempt-1' } },
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



test('IELTS practice assignment detail repair uses class membership joins and safe progress statuses', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260516190000_fix_ielts_practice_assignment_detail_class_join.sql'),
    'utf8',
  );

  const detailSql = migration.slice(
    migration.indexOf('create or replace function public.rpc_ielts_practice_assignment_detail'),
  );

  assert.match(detailSql, /if not public\.can_manage_ielts_practice_assignment\(p_assignment_id\) then raise exception 'forbidden'/i, 'detail RPC must remain manager-only');
  assert.match(detailSql, /from public\.ielts_practice_assignment_students s[\s\S]*join public\.users u on u\.id = s\.student_id[\s\S]*join public\.ielts_practice_assignments a on a\.id = s\.assignment_id/i, 'detail roster must join assignment students, users, and assignments');
  assert.match(detailSql, /left join public\.class_students cs[\s\S]*cs\.student_id = s\.student_id[\s\S]*a\.class_id is null or cs\.class_id = a\.class_id/i, 'detail roster must resolve classes through class_students scoped to the assignment class');
  assert.match(detailSql, /left join public\.classes c[\s\S]*c\.id = coalesce\(cs\.class_id, a\.class_id\)/i, 'detail roster must join classes through the resolved class id');
  assert.match(detailSql, /'student_id'[\s\S]*'username'[\s\S]*'email'[\s\S]*'class_id'[\s\S]*'class_name'[\s\S]*'status'[\s\S]*'completed_at'[\s\S]*'updated_at'/i, 'detail RPC must return roster fields needed by the progress UI');
  assert.match(detailSql, /'required_count'[\s\S]*'completed_required_count'[\s\S]*'item_count'[\s\S]*'completed_item_count'/i, 'detail RPC must preserve item progress counts');
  assert.match(detailSql, /s\.status not in \('completed', 'excused'\)[\s\S]*else s\.status/i, 'completed students must remain completed in the roster status');
  assert.match(detailSql, /ielts_practice_assignment_progress_payload\(p_assignment_id, null\)/i, 'detail RPC must preserve manager item progress payload support');
  assert.doesNotMatch(detailSql, /u\.class_id/i, 'detail RPC must not read a missing users.class_id column');
  assert.doesNotMatch(migration, /answer_key/i, 'detail repair must not expose protected answer data');
  assert.doesNotMatch(migration, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i, 'detail repair must not use legacy IELTS admin permissions');
});

test('IELTS practice list counters are backed by synced parent student statuses', () => {
  const repair = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260516140000_ielts_practice_assignment_repairs.sql'),
    'utf8',
  );
  const foundation = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260516130000_ielts_practice_assignments_foundation.sql'),
    'utf8',
  );
  const itemProgress = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260516170000_ielts_practice_item_progress.sql'),
    'utf8',
  );

  const payloadSql = repair.slice(
    repair.indexOf('create or replace function public.ielts_practice_assignment_payload'),
    repair.indexOf('create or replace function public.rpc_ielts_practice_assignment_detail'),
  );
  const listSql = foundation.slice(
    foundation.indexOf('create or replace function public.rpc_ielts_practice_list_assignments'),
    foundation.indexOf('create or replace function public.rpc_ielts_practice_create_assignment'),
  );
  const completeSql = itemProgress.slice(
    itemProgress.indexOf('create or replace function public.rpc_ielts_practice_mark_item_completed'),
    itemProgress.indexOf('-- Add safe manager item-progress summaries'),
  );

  assert.match(listSql, /public\.ielts_practice_assignment_payload\(a\.id\)/i, 'list assignment cards must use the shared assignment payload');
  assert.match(payloadSql, /'completed_count'[\s\S]*count\(s\.id\) filter \(where s\.status = 'completed'\)[\s\S]*'completion_percent'/i, 'assignment payload counters must read parent assignment student statuses');
  assert.match(completeSql, /perform public\.ielts_practice_sync_parent_completion\(p_assignment_id, auth\.uid\(\)\)/i, 'item completion must sync the parent assignment student status used by list counters');
});


test('IELTS practice content catalog RPC returns only safe assignment picker metadata', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260518120000_ielts_practice_content_catalog.sql'),
    'utf8',
  );

  assert.match(migration, /create or replace function public\.rpc_ielts_practice_content_catalog\(/i, 'content catalog RPC must be added');
  assert.match(migration, /returns table \([\s\S]*content_type text,[\s\S]*content_id text,[\s\S]*title text,[\s\S]*skill text,[\s\S]*description text,[\s\S]*difficulty text,[\s\S]*band text/i, 'catalog RPC must return only picker metadata');
  assert.match(migration, /'ielts_reading_set'[\s\S]*from public\.ielts_reading_sets/i, 'catalog must include active reading sets');
  assert.match(migration, /'ielts_listening_set'[\s\S]*from public\.ielts_listening_sets/i, 'catalog must include active listening sets');
  assert.match(migration, /'ielts_writing_task'[\s\S]*from public\.ielts_writing_tasks/i, 'catalog must include active writing tasks');
  assert.match(migration, /'ielts_speaking_task'[\s\S]*from public\.ielts_speaking_tasks/i, 'catalog must include active speaking tasks');
  assert.match(migration, /coalesce\([a-z]\.is_active, true\) = true/i, 'catalog must be limited to active/public practice content');
  assert.match(migration, /c\.title ilike '%' \|\| n\.requested_search \|\| '%'/i, 'catalog must support title search');
  assert.match(migration, /least\(coalesce\(p_limit, 50\), 100\)/i, 'catalog must cap caller supplied limits');
  assert.match(migration, /grant execute on function public\.rpc_ielts_practice_content_catalog\(text, text, int\) to authenticated/i, 'catalog RPC should be callable through authenticated Supabase RPC');
  assert.doesNotMatch(migration, /correct_answer/i, 'catalog RPC must not expose correct answers');
  assert.doesNotMatch(migration, /answer_key/i, 'catalog RPC must not expose answer keys');
  assert.doesNotMatch(migration, /explanation/i, 'catalog RPC must not expose explanations');
  assert.doesNotMatch(migration, /sample_answer|follow_ups|passage_text|audio_url/i, 'catalog RPC must not expose long content payloads or samples');
  assert.doesNotMatch(migration, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i, 'catalog RPC must not use legacy IELTS admin permissions');
});

test('IELTS Practice tab uses school-scoped assignment service and avoids legacy content table queries', () => {
  const tab = fs.readFileSync(path.join(process.cwd(), 'components/school-admin/tabs/IeltsPracticeTab.tsx'), 'utf8');
  assert.match(tab, /rpcIeltsPracticeListAssignments/, 'Practice tab must list assignments through the scoped service');
  assert.match(tab, /rpcIeltsPracticeCreateAssignment/, 'Practice tab must create assignments through the scoped service');
  assert.match(tab, /rpcIeltsPracticeAssignToClass/, 'Practice tab must assign classes through the scoped service');
  assert.match(tab, /rpcIeltsPracticeAssignmentDetail/, 'Practice tab must load roster completion through the scoped detail service');
  assert.match(tab, /View progress/, 'Practice tab should expose a simple progress view action');
  assert.match(tab, /progressFilters/, 'Practice tab should include simple progress status filters');
  assert.match(tab, /rpcIeltsPracticeContentCatalog/, 'Practice tab must use the safe catalog service for the content picker');
  assert.match(tab, /Choose content/, 'Practice tab must make the content picker the main content selection path');
  assert.match(tab, /Search catalog/, 'Practice tab must allow title search through the picker');
  assert.match(tab, /Advanced manual fallback/, 'Practice tab must retain manual content ID fallback');
  assert.match(tab, /Choose content for item/, 'Practice tab must validate missing content before submit');
  assert.match(tab, /content type does not match the selected skill/, 'Practice tab must warn on skill/content type mismatch');
  assert.doesNotMatch(tab, /\.from\(['"]ielts_/i, 'Practice tab must not query legacy IELTS tables directly');
  assert.doesNotMatch(tab, /answer_key/i, 'Practice tab must not expose answer_key');
});


test('IELTS practice content service uses only the safe catalog RPC', () => {
  const service = fs.readFileSync(path.join(process.cwd(), 'services/ieltsPracticeContentService.ts'), 'utf8');

  assert.match(service, /rpc_ielts_practice_content_catalog/, 'content service must call the safe catalog RPC');
  assert.doesNotMatch(service, /\.from\(['"]ielts_/i, 'content service must not query raw IELTS content tables');
  assert.doesNotMatch(service, /correct_answer|answer_key|explanation/i, 'content service must not model protected solution fields');
});


test('assigned IELTS practice student page uses assignment RPCs without raw IELTS table reads', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsAssignedPractice.tsx'), 'utf8');
  const routes = fs.readFileSync(path.join(process.cwd(), 'index.tsx'), 'utf8');
  const home = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsHome.tsx'), 'utf8');

  assert.match(routes, /path:\s*'\/ielts\/practice\/assigned'/, 'assigned practice route must be registered');
  assert.match(home, /navigate\('\/ielts\/practice\/assigned'\)/, 'IELTS home should link to assigned practice');
  assert.match(page, /rpcIeltsPracticeStudentAssignments/, 'student page must load assigned practice through the assignment RPC wrapper');
  assert.match(page, /rpcIeltsPracticeMarkStarted/, 'opening assigned practice should mark assigned rows started');
  assert.doesNotMatch(page, /rpcIeltsPracticeMarkCompleted|Mark assignment completed|handleMarkCompleted/i, 'student page must not expose direct parent assignment completion');
  assert.match(page, /Assignment completes automatically after all required items are finished/i, 'student page must explain automatic required-item completion');
  assert.match(page, /getIeltsPracticeItemRoute/, 'student page must use the route helper for content links');
  assert.doesNotMatch(page, /\.from\(['"]ielts_/i, 'student assigned practice page must not query raw IELTS tables');
  assert.doesNotMatch(page, /answer_key/i, 'student assigned practice page must not expose answer keys');
});

test('IELTS practice item progress migration adds secure item tracking and parent auto-completion', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260516170000_ielts_practice_item_progress.sql'),
    'utf8',
  );

  assert.match(migration, /create table if not exists public\.ielts_practice_assignment_item_students/i, 'item progress table must be created');
  assert.match(migration, /unique \(assignment_item_id, student_id\)/i, 'item progress must be unique per item/student');
  assert.match(migration, /status text not null default 'assigned' check \(status in \('assigned', 'in_progress', 'completed', 'skipped'\)\)/i, 'item statuses must be constrained');
  assert.match(migration, /alter table public\.ielts_practice_assignment_item_students enable row level security/i, 'item progress table must enable RLS');
  assert.match(migration, /student_id = auth\.uid\(\)[\s\S]*or public\.can_manage_ielts_practice_assignment\(assignment_id\)/i, 'select policy must allow only own rows or scoped managers');
  assert.match(migration, /Student item progress writes are intentionally handled through the SECURITY DEFINER/i, 'direct student item writes must stay behind RPCs');
  assert.match(migration, /create or replace function public\.rpc_ielts_practice_mark_item_started/i, 'item started RPC must exist');
  assert.match(migration, /create or replace function public\.rpc_ielts_practice_mark_item_completed/i, 'item completed RPC must exist');
  assert.match(migration, /create or replace function public\.rpc_ielts_practice_assignment_progress/i, 'progress RPC must exist');
  assert.match(migration, /p_student_id <> auth\.uid\(\)[\s\S]*raise exception 'forbidden'/i, 'student update RPCs must reject cross-student writes');
  assert.match(migration, /not exists \([\s\S]*ielts_practice_assignment_items[\s\S]*i\.required = true[\s\S]*coalesce\(item_s\.status, 'assigned'\) <> 'completed'[\s\S]*set status = 'completed'/i, 'parent assignment must auto-complete only when all required items are complete');
  assert.match(migration, /practice_attempt_type[\s\S]*practice_attempt_id/i, 'completion RPC must persist practice attempt linkage');
  assert.match(migration, /can_manage_ielts_practice_assignment\(p_assignment_id\)/i, 'manager progress reads must use school-scoped assignment permissions');
  assert.doesNotMatch(migration, /answer_key/i, 'item progress migration must not expose answer keys');
  assert.doesNotMatch(migration, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i, 'item progress migration must not use legacy IELTS admin permissions');
});


test('Pilot integrity repair hardens parent completion and adds scoped manager override', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260516180000_ielts_practice_completion_integrity.sql'),
    'utf8',
  );
  const studentSql = migration.slice(
    migration.indexOf('create or replace function public.rpc_ielts_practice_mark_completed'),
    migration.indexOf('create or replace function public.rpc_ielts_practice_force_complete_assignment'),
  );
  const overrideSql = migration.slice(
    migration.indexOf('create or replace function public.rpc_ielts_practice_force_complete_assignment'),
    migration.indexOf('grant execute on function public.rpc_ielts_practice_mark_completed'),
  );

  assert.match(migration, /create table if not exists public\.ielts_practice_assignment_completion_overrides/i, 'manager overrides must be audit-recorded');
  assert.match(studentSql, /where assignment_id = p_assignment_id[\s\S]*and student_id = auth\.uid\(\)/i, 'student parent completion must only target the authenticated student row');
  assert.match(studentSql, /count\(\*\) filter \(where i\.required = true and coalesce\(item_s\.status, 'assigned'\) <> 'completed'\)/i, 'student parent completion must inspect incomplete required item rows');
  assert.match(studentSql, /raise exception 'required_items_incomplete'/i, 'student parent completion must reject premature completion');
  assert.match(studentSql, /set status = 'completed'[\s\S]*where assignment_id = p_assignment_id[\s\S]*and student_id = auth\.uid\(\)/i, 'student parent completion can only complete after the required-item gate');

  assert.match(overrideSql, /if not public\.can_manage_ielts_practice_school\(v_assignment\.school_id\) then[\s\S]*raise exception 'forbidden'/i, 'override must require scoped school manager permissions');
  assert.match(overrideSql, /join public\.users u on u\.id = s\.student_id and u\.school_id = v_assignment\.school_id/i, 'override must stay scoped to the assignment school');
  assert.match(overrideSql, /insert into public\.ielts_practice_assignment_completion_overrides/i, 'override must write an audit row');
  assert.match(migration, /grant execute on function public\.rpc_ielts_practice_force_complete_assignment\(uuid, uuid, text\) to authenticated/i, 'override RPC must be explicit and callable through normal auth/RLS checks');
  assert.doesNotMatch(overrideSql, /class_teacher_assignments/i, 'override must not grant assigned-teacher monitor/class scope');
  assert.doesNotMatch(migration, /answer_key/i, 'completion integrity migration must not expose protected answer data');
  assert.doesNotMatch(migration, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i, 'completion integrity migration must not depend on legacy IELTS admin permissions');
});

test('assigned IELTS practice preserves assignment context and ReadingPractice completes reading items', () => {
  const assignedPage = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsAssignedPractice.tsx'), 'utf8');
  const readingPage = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/ReadingPractice.tsx'), 'utf8');

  const assignmentUx = fs.readFileSync(path.join(process.cwd(), 'services/ieltsAssignmentUx.ts'), 'utf8');
  const assignmentUi = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/assignmentPracticeUi.tsx'), 'utf8');

  assert.match(assignmentUx, /new URLSearchParams\(\{[\s\S]*assignment_id: assignmentId[\s\S]*assignment_item_id: assignmentItemId/i, 'assigned item routes must include assignment query params');
  assert.match(assignedPage, /rpcIeltsPracticeMarkItemStarted/i, 'opening an item should mark item progress started');
  assert.match(assignmentUx, /assignment_item_count/i, 'assigned item routes should include refresh-safe item count context');
  assert.match(assignedPage, /navigate\(assignedRoute\)/i, 'navigation should use the refresh-safe assigned route');

  assert.match(readingPage, /readIeltsPracticeAssignmentContext\(\)/i, 'ReadingPractice must read assignment context through the shared helper');
  assert.match(assignmentUi, /assignmentSearchParams\.get\('assignment_id'\)/i, 'assignment helper must read assignment_id from query params');
  assert.match(assignmentUi, /assignmentSearchParams\.get\('assignment_item_id'\)/i, 'assignment helper must read assignment_item_id from query params');
  assert.match(assignmentUi, /assignmentSearchParams\.get\('assignment_item_count'\)/i, 'assignment helper must read item count context from query params');
  assert.match(readingPage, /rpcIeltsPracticeMarkItemCompleted\(\{[\s\S]*assignmentId[\s\S]*assignmentItemId[\s\S]*practiceAttemptType: 'reading'[\s\S]*practiceAttemptId: attempt\?\.id/i, 'ReadingPractice must mark reading item completed with attempt linkage');
  assert.match(assignmentUi, /assignment items completed/i, 'result UI must show item-level progress');
  assert.match(assignmentUi, /School assignment completed/i, 'result UI must show parent assignment completion');
  assert.doesNotMatch(readingPage, /rpcIeltsPracticeMarkCompleted\(/i, 'ReadingPractice must not directly complete the parent assignment');
  assert.doesNotMatch(readingPage, /answer_key/i, 'ReadingPractice must not expose answer keys');
});


test('Phase 2.9 practice skill pages complete assigned listening, writing, and speaking items', () => {
  const pages = [
    { skill: 'listening', path: 'src/pages/ielts/ListeningPractice.tsx', attemptTable: 'ielts_listening_attempts' },
    { skill: 'writing', path: 'src/pages/ielts/WritingPractice.tsx', attemptTable: 'ielts_writing_attempts' },
    { skill: 'speaking', path: 'src/pages/ielts/SpeakingPractice.tsx', attemptTable: 'ielts_speaking_attempts' },
  ];
  const helper = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/assignmentPracticeUi.tsx'), 'utf8');

  assert.match(helper, /assignmentSearchParams\.get\('assignment_id'\)/i, 'assignment helper must read assignment_id from query params');
  assert.match(helper, /assignmentSearchParams\.get\('assignment_item_id'\)/i, 'assignment helper must read assignment_item_id from query params');
  assert.match(helper, /assignmentSearchParams\.get\('assignment_item_count'\)/i, 'assignment helper must read assignment_item_count from query params');
  assert.match(helper, /Assignment item completed/i, 'assignment helper must render item completion success');
  assert.match(helper, /assignment items completed/i, 'assignment helper must render N of N item progress');
  assert.match(helper, /School assignment completed/i, 'assignment helper must render parent assignment completion');
  assert.match(helper, /could not be confirmed/i, 'assignment helper must render a non-blocking completion warning');
  assert.doesNotMatch(helper, /answer_key/i, 'assignment helper must not expose answer keys');
  assert.doesNotMatch(helper, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i, 'assignment helper must not depend on legacy IELTS admin permissions');

  for (const pageInfo of pages) {
    const page = fs.readFileSync(path.join(process.cwd(), pageInfo.path), 'utf8');
    assert.match(page, /readIeltsPracticeAssignmentContext\(\)/i, `${pageInfo.skill} must read assignment context through the shared helper`);
    assert.match(page, new RegExp(pageInfo.attemptTable, 'i'), `${pageInfo.skill} must still save its practice attempt`);
    assert.match(page, new RegExp(`rpcIeltsPracticeMarkItemCompleted\\(\\{[\\s\\S]*assignmentId[\\s\\S]*assignmentItemId[\\s\\S]*practiceAttemptType: '${pageInfo.skill}'[\\s\\S]*practiceAttemptId: (result|data)\\?\\.id`, 'i'), `${pageInfo.skill} must mark item completion with attempt linkage`);
    assert.match(page, /itemCompletionError = completionError instanceof Error/i, `${pageInfo.skill} must downgrade item-completion RPC failures to a warning state`);
    assert.match(page, /AssignmentCompletionStatus/i, `${pageInfo.skill} result UI must render assignment completion status`);
    assert.doesNotMatch(page, /rpcIeltsPracticeMarkCompleted\(/i, `${pageInfo.skill} must not directly complete parent assignments`);
    assert.doesNotMatch(page, /answer_key/i, `${pageInfo.skill} must not expose answer keys`);
    assert.doesNotMatch(page, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i, `${pageInfo.skill} must not depend on legacy IELTS admin permissions`);
  }
});
