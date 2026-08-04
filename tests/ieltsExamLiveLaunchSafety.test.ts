import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  rpcIeltsLaunchExam,
  rpcIeltsScheduleExam,
  type IeltsExamRpcClient,
} from '../services/ieltsExamModeService.js';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260804152000_ielts_exam_live_launch_safety.sql',
);

const readMigration = () => fs.readFileSync(migrationPath, 'utf8');

const readAdversarialHarness = () => fs.readFileSync(
  path.join(process.cwd(), 'supabase/tests/ielts_exam_live_launch_safety.sql'),
  'utf8',
);

const readFunction = (name: string): string => {
  const migration = readMigration();
  const start = migration.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} must exist in the Phase 2 migration`);
  const end = migration.indexOf('\n$$;', start);
  assert.notEqual(end, -1, `${name} must have a complete function body`);
  return migration.slice(start, end + 4);
};

const createClient = (
  handler: (name: string, params: Record<string, unknown>) => unknown,
): IeltsExamRpcClient => ({
  rpc: ((name: string, params: Record<string, unknown>) => Promise.resolve({
    data: handler(name, params),
    error: null,
  })) as unknown as IeltsExamRpcClient['rpc'],
});

test('IELTS schedule and launch services map the controlled lifecycle RPCs', async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const client = createClient((name, params) => {
    calls.push({ name, params });
    return {
      exam_event_id: 'exam-1',
      previous_status: 'scheduled',
      status: 'live',
      active_form_id: 'form-1',
      assignment_count: 12,
    };
  });

  await rpcIeltsScheduleExam({
    examEventId: 'exam-1',
    startsAt: '2026-08-04T08:00:00.000Z',
    endsAt: '2026-08-04T11:00:00.000Z',
    durationMinutes: 120,
  }, client);
  const result = await rpcIeltsLaunchExam({
    examEventId: 'exam-1',
    confirmation: 'LAUNCH',
    reason: 'Invigilators are ready',
  }, client);

  assert.deepEqual(calls, [
    {
      name: 'rpc_ielts_schedule_exam',
      params: {
        p_exam_event_id: 'exam-1',
        p_starts_at: '2026-08-04T08:00:00.000Z',
        p_ends_at: '2026-08-04T11:00:00.000Z',
        p_duration_minutes: 120,
      },
    },
    {
      name: 'rpc_ielts_launch_exam',
      params: {
        p_exam_event_id: 'exam-1',
        p_confirmation: 'LAUNCH',
        p_reason: 'Invigilators are ready',
      },
    },
  ]);
  assert.equal(result.status, 'live');
  assert.equal(result.assignment_count, 12);
});

test('IELTS drafts have an audited manager-only path to scheduled', () => {
  const migration = readMigration();

  assert.match(
    migration,
    /rpc_ielts_schedule_exam[\s\S]*from public\.ielts_exam_events e[\s\S]*for update;/i,
    'schedule must lock the draft before changing its lifecycle state',
  );
  assert.match(
    migration,
    /rpc_ielts_schedule_exam[\s\S]*not public\.can_manage_ielts_exam\(v_event\.id\)[\s\S]*not public\.can_create_ielts_exam\(v_event\.school_id\)[\s\S]*raise exception 'forbidden'/i,
    'schedule must require management authority for the exact school',
  );
  assert.match(
    migration,
    /v_event\.status\s*<>\s*'draft'[\s\S]*raise exception 'invalid_schedule_state'[\s\S]*set status = 'scheduled'/i,
    'schedule must only allow draft to scheduled',
  );
  assert.match(
    migration,
    /p_starts_at\s*\+\s*make_interval\(mins\s*=>\s*p_duration_minutes\)\s*>\s*p_ends_at[\s\S]*duration_exceeds_exam_window/i,
    'server-side schedule validation must require the duration to fit inside the window',
  );
  assert.match(
    migration,
    /'schedule_exam'[\s\S]*'previous_status',\s*'draft'[\s\S]*'status',\s*'scheduled'[\s\S]*'previous_starts_at'[\s\S]*'duration_minutes'/i,
    'schedule must audit both the lifecycle transition and schedule change',
  );
  assert.match(
    migration,
    /revoke all on function public\.rpc_ielts_schedule_exam\([\s\S]*from public, anon, authenticated, service_role;[\s\S]*grant execute on function public\.rpc_ielts_schedule_exam\([\s\S]*to authenticated;/i,
    'schedule RPC must have an explicit least-privilege execution grant',
  );
});

test('IELTS exam creation and direct table paths cannot create a live event', () => {
  const migration = readMigration();

  assert.match(
    migration,
    /v_initial_status\s+not\s+in\s*\('draft',\s*'scheduled'\)[\s\S]*raise exception 'invalid_initial_status'/i,
    'creation RPC must reject live and all other non-initial states',
  );
  assert.match(
    migration,
    /tg_op\s*=\s*'INSERT'\s+and\s+new\.status\s*=\s*'live'[\s\S]*raise exception 'direct_live_creation_forbidden'/i,
    'a trigger must reject privileged/direct live inserts as defense in depth',
  );
  assert.match(
    migration,
    /revoke all privileges on table public\.ielts_exam_events from anon, authenticated;[\s\S]*grant select on table public\.ielts_exam_events to authenticated;/i,
    'authenticated clients must have read-only table privileges',
  );
});

test('IELTS launch rejects invalid and cross-school paths before changing state', () => {
  const migration = readMigration();

  assert.match(
    migration,
    /rpc_ielts_launch_exam[\s\S]*from public\.ielts_exam_events e[\s\S]*for update;/i,
    'launch must serialize against concurrent event transitions',
  );
  assert.match(
    migration,
    /not public\.can_manage_ielts_exam\(v_event\.id\)[\s\S]*not public\.can_create_ielts_exam\(v_event\.school_id\)[\s\S]*raise exception 'forbidden'/i,
    'launch actor must have management authority for the exact event school',
  );
  assert.match(
    migration,
    /v_event\.status\s*<>\s*'scheduled'[\s\S]*raise exception 'invalid_launch_state'/i,
    'launch must only accept the scheduled prior state',
  );
  assert.match(
    migration,
    /p_confirmation is distinct from 'LAUNCH'[\s\S]*raise exception 'launch_confirmation_required'/i,
    'launch must require a separate explicit confirmation value',
  );
  assert.match(
    migration,
    /v_event\.starts_at\s*>\s*v_now[\s\S]*'exam_not_started'[\s\S]*v_event\.ends_at\s*<=\s*v_now[\s\S]*'exam_window_expired'/i,
    'launch must stay inside the configured schedule',
  );
  assert.match(
    migration,
    /v_active_form_count\s*<>\s*1[\s\S]*'exactly_one_active_form_required'/i,
    'launch readiness must require exactly one active form',
  );
  for (const crossSchoolCheck of [
    /a\.school_id is distinct from p_school_id/i,
    /u\.school_id is distinct from p_school_id/i,
    /c\.school_id is distinct from p_school_id/i,
    /a\.form_id is distinct from v_active_form_id/i,
  ]) {
    assert.match(migration, crossSchoolCheck, `missing assignment boundary check: ${crossSchoolCheck}`);
  }
  assert.match(
    migration,
    /v_assignment_count\s*=\s*0[\s\S]*raise exception 'assignments_required'[\s\S]*v_invalid_assignment_count\s*<>\s*0[\s\S]*raise exception 'invalid_exam_assignments'/i,
    'launch must require at least one usable, internally consistent assignment',
  );
  const actorControl = migration.match(
    /create or replace function public\.ielts_exam_actor_can_control[\s\S]*?\n\$\$;/i,
  )?.[0] ?? '';
  for (const actorBoundaryCheck of [
    /a\.school_id\s*=\s*p_school_id/i,
    /c\.school_id\s*=\s*p_school_id/i,
    /cta\.school_id\s*=\s*p_school_id/i,
    /cta\.teacher_user_id\s*=\s*auth\.uid\(\)/i,
    /coalesce\(cta\.active,\s*true\)\s*=\s*true/i,
    /sm\.school_id\s*=\s*p_school_id/i,
    /sm\.user_id\s*=\s*auth\.uid\(\)/i,
    /sm\.status\s*=\s*'active'/i,
    /coalesce\(sm\.can_teach,\s*false\)\s*=\s*true/i,
  ]) {
    assert.match(actorControl, actorBoundaryCheck, `missing emergency-control boundary check: ${actorBoundaryCheck}`);
  }
});

test('IELTS launch and resume are guarded, audited, and explicitly granted only to authenticated callers', () => {
  const migration = readMigration();

  assert.match(
    migration,
    /current_setting\('brainsheist\.ielts_live_transition_exam_id'[\s\S]*current_setting\('brainsheist\.ielts_live_transition_actor_id'[\s\S]*current_setting\('brainsheist\.ielts_live_transition_action'/i,
    'live transitions must be protected by an event-, actor-, and action-specific transaction guard',
  );
  assert.match(
    migration,
    /'launch_exam'[\s\S]*'previous_status',\s*'scheduled'[\s\S]*'status',\s*'live'[\s\S]*'active_form_id'[\s\S]*'assignment_count'[\s\S]*'confirmed',\s*true/i,
    'launch audit metadata must capture the validated transition and readiness snapshot',
  );
  assert.match(
    migration,
    /rpc_ielts_pause_exam[\s\S]*ielts_exam_actor_can_control\(v_event\.id, v_event\.school_id\)[\s\S]*v_event\.status\s*<>\s*'live'[\s\S]*invalid_pause_state[\s\S]*'pause_exam'/i,
    'pause must only accept live so draft -> paused cannot bypass launch confirmation',
  );
  assert.match(
    migration,
    /rpc_ielts_resume_exam[\s\S]*ielts_exam_actor_can_control\(v_event\.id, v_event\.school_id\)[\s\S]*v_event\.status\s*<>\s*'paused'[\s\S]*invalid_resume_state[\s\S]*ielts_exam_assert_live_ready[\s\S]*'resume_exam'/i,
    'resume must preserve monitor authorization while enforcing paused state and current readiness',
  );
  assert.match(
    migration,
    /revoke all on function public\.rpc_ielts_launch_exam\(uuid, text, text\)[\s\S]*from public, anon, authenticated, service_role;[\s\S]*grant execute on function public\.rpc_ielts_launch_exam\(uuid, text, text\)[\s\S]*to authenticated;/i,
    'launch RPC must have an explicit least-privilege execution grant',
  );
  assert.match(
    migration,
    /revoke all on function public\.ielts_exam_assert_live_ready\(uuid, uuid\)[\s\S]*from public, anon, authenticated, service_role;/i,
    'the internal readiness helper must not be exposed through the Data API',
  );
});

test('live-transition capabilities are consumed immediately and the database harness is bounded', () => {
  for (const functionName of ['rpc_ielts_launch_exam', 'rpc_ielts_resume_exam']) {
    const body = readFunction(functionName);
    const stateCheck = body.indexOf('if v_event.id is null then');
    const auditInsert = body.indexOf('insert into public.ielts_exam_audit_log');

    assert.notEqual(stateCheck, -1, `${functionName} must validate the guarded update`);
    assert.notEqual(auditInsert, -1, `${functionName} must write an audit record`);
    for (const key of ['exam_id', 'actor_id', 'action']) {
      const reset = body.indexOf(
        `set_config('brainsheist.ielts_live_transition_${key}', '', true)`,
      );
      assert.ok(
        reset > stateCheck && reset < auditInsert,
        `${functionName} must consume its ${key} guard immediately after the state update`,
      );
    }
  }

  const wrapper = fs.readFileSync(
    path.join(process.cwd(), 'tests/ieltsExamLiveLaunchRlsIntegration.test.ts'),
    'utf8',
  );
  assert.match(wrapper, /timeout:\s*120_000/);
  assert.match(wrapper, /PGCONNECT_TIMEOUT:\s*'10'/);
});

test('student attempt start is live-only and preserves same-school resume behavior', () => {
  const startAttempt = readFunction('rpc_ielts_start_attempt');

  assert.match(
    startAttempt,
    /v_event\.status\s*<>\s*'live'[\s\S]*raise exception 'exam_not_startable'/i,
    'scheduled, draft, paused, and terminal events must be rejected at the authoritative start boundary',
  );
  assert.doesNotMatch(
    startAttempt,
    /v_event\.status\s+not\s+in\s*\([^)]*'scheduled'/i,
    'scheduled must never be included in the startable state set',
  );
  assert.match(
    startAttempt,
    /v_assignment\.school_id is distinct from v_event\.school_id[\s\S]*v_student_school_id is distinct from v_event\.school_id[\s\S]*raise exception 'forbidden'/i,
    'attempt start must reject stale or cross-school assignment links',
  );
  assert.match(
    startAttempt,
    /v_attempt\.status\s*=\s*'not_started'[\s\S]*set status = 'in_progress'[\s\S]*ends_at = coalesce\(a\.ends_at, v_ends_at\)/i,
    'not-started attempts must retain the existing single-attempt resume transition and timer',
  );
  assert.match(
    startAttempt,
    /v_assignment\.status not in \('assigned', 'started'\)[\s\S]*raise exception 'assignment_not_startable'/i,
    'submitted and auto-submitted assignments must never be reopened',
  );
  assert.match(
    startAttempt,
    /v_attempt\.id is null or v_attempt\.status = 'not_started'[\s\S]*v_now < v_event\.starts_at or v_now >= v_event\.ends_at[\s\S]*outside_exam_window/i,
    'new and not-started attempts must remain inside the shared event window',
  );
  assert.match(
    startAttempt,
    /v_attempt\.status = 'in_progress'[\s\S]*v_attempt\.ends_at is null or v_now >= v_attempt\.ends_at[\s\S]*raise exception 'attempt_expired'/i,
    'only an unexpired in-progress attempt may resume beyond the shared event end',
  );
  assert.match(
    startAttempt,
    /else\s+raise exception 'attempt_not_startable'/i,
    'terminal attempts must never return a lock token from the start boundary',
  );
  assert.match(
    startAttempt,
    /f\.id = v_assignment\.form_id[\s\S]*f\.exam_event_id = v_event\.id[\s\S]*f\.is_active = true[\s\S]*raise exception 'form_unavailable'/i,
    'start must revalidate the exact active form instead of trusting stale bootstrap state',
  );
});

test('whoami exposes content only for a current live start or unexpired nonterminal attempt', () => {
  const whoami = readFunction('rpc_ielts_exam_whoami');

  assert.match(
    whoami,
    /v_content_available\s*:=\s*v_form\.id is not null[\s\S]*v_assignment\.status in \('assigned', 'started'\)[\s\S]*v_event\.status = 'live'[\s\S]*v_now >= v_event\.starts_at[\s\S]*v_now < v_event\.ends_at[\s\S]*v_attempt\.id is null[\s\S]*v_attempt\.status = 'not_started'/i,
    'new/not-started content must require confirmed live state and the shared event window',
  );
  assert.match(
    whoami,
    /v_event\.status in \('live', 'paused'\)[\s\S]*v_attempt\.status = 'in_progress'[\s\S]*v_attempt\.ends_at is not null[\s\S]*v_now < v_attempt\.ends_at/i,
    'an in-progress attempt may retain content only until its own timer ends, including a legitimate extension',
  );
  assert.match(
    whoami,
    /when v_event\.status not in \('live', 'paused'\) then 'exam_not_available'/i,
    'scheduled events must report a waiting/unavailable state',
  );
  assert.match(
    whoami,
    /'form_public_payload', case[\s\S]*when not v_content_available then null[\s\S]*else jsonb_build_object/i,
    'scheduled bootstrap must not return protected exam form content',
  );
  assert.match(
    whoami,
    /if v_content_available then[\s\S]*from public\.ielts_exam_drafts/i,
    'server drafts must never be hydrated once content availability fails',
  );
  assert.match(
    whoami,
    /when not v_content_available then 'exam_not_available'/i,
    'expired and terminal attempts must report unavailable rather than leaking content',
  );
  const unassignedBranch = whoami.match(
    /if v_assignment\.id is null[\s\S]*?end if;/i,
  )?.[0] ?? '';
  assert.match(unassignedBranch, /'reason', 'not_assigned'/i);
  assert.doesNotMatch(unassignedBranch, /event_status|starts_at|ends_at|exam_event_id/i, 'unassigned callers must not receive another school exam metadata');
});

test('student bootstrap and start SECURITY DEFINER functions have explicit authenticated-only grants', () => {
  const migration = readMigration();
  for (const functionName of ['rpc_ielts_exam_whoami', 'rpc_ielts_start_attempt']) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${functionName}\\(uuid\\)[\\s\\S]*from public, anon, authenticated, service_role;[\\s\\S]*grant execute on function public\\.${functionName}\\(uuid\\)[\\s\\S]*to authenticated;`, 'i'),
      `${functionName} must not inherit PUBLIC execution`,
    );
  }
});

test('adversarial lifecycle harness creates matching Auth identities and always rolls back', () => {
  const harness = readAdversarialHarness();

  assert.match(
    harness,
    /insert into auth\.users[\s\S]*e2000000-0000-4000-8000-000000000001[\s\S]*e2000000-0000-4000-8000-000000000002[\s\S]*e2000000-0000-4000-8000-000000000003[\s\S]*e2000000-0000-4000-8000-000000000004/i,
    'every lifecycle fixture referenced by Auth foreign keys must have a matching identity',
  );
  assert.match(harness, /only against a disposable\/staging database/i);
  assert.match(harness, /never point the wrapper at production/i);
  assert.match(harness, /^begin;/m, 'adversarial lifecycle tests must start a transaction');
  assert.match(harness, /rollback;\s*$/i, 'adversarial lifecycle tests must never persist fixtures');
});
