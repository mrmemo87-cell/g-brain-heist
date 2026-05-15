import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rpcIeltsExamWhoami,
  rpcIeltsStartAttempt,
  rpcIeltsAutosaveAttempt,
  rpcIeltsSubmitAttempt,
  rpcIeltsLogIncident,
  rpcIeltsExamMonitoring,
  rpcIeltsPauseExam,
  rpcIeltsResumeExam,
  rpcIeltsExtendAttempt,
  rpcIeltsForceSubmitAttempt,
  rpcIeltsVoidAttempt,
  rpcIeltsCreateExamEvent,
  rpcIeltsCreateExamForm,
  rpcIeltsAssignExamToClass,
  rpcIeltsAssignExamToStudents,
  rpcIeltsListManageableExams,
  rpcIeltsGetExamAdminDetail,
  validateExamJsonText,
  payloadContainsAnswerKey,
  sanitizePublicFormPayload,
  type IeltsExamRpcClient,
} from '../services/ieltsExamModeService.js';

const createClient = (handler: (name: string, params: Record<string, unknown>) => unknown): IeltsExamRpcClient => ({
  rpc: ((name: string, params: Record<string, unknown>) => Promise.resolve({ data: handler(name, params), error: null })) as unknown as IeltsExamRpcClient['rpc'],
});

test('IELTS exam service strips answer_key from public form payloads defensively', async () => {
  const client = createClient((name, params) => {
    assert.equal(name, 'rpc_ielts_exam_whoami');
    assert.deepEqual(params, { p_exam_event_id: 'exam-1' });
    return {
      allowed: true,
      reason: 'ok',
      form_public_payload: {
        id: 'form-1',
        answer_key: { reading: ['A'] },
        reading_payload: { title: 'Reading', answer_key: { hidden: true } },
      },
    };
  });

  const response = await rpcIeltsExamWhoami('exam-1', client);
  assert.equal(response.form_public_payload?.id, 'form-1');
  assert.equal(Object.prototype.hasOwnProperty.call(response.form_public_payload ?? {}, 'answer_key'), false);
  assert.deepEqual(response.form_public_payload?.reading_payload, { title: 'Reading' });
});

test('IELTS exam service wraps RPC names and parameters', async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const client = createClient((name, params) => {
    calls.push({ name, params });
    if (name === 'rpc_ielts_start_attempt') return { attempt_id: 'attempt-1', lock_token: 'lock' };
    if (name === 'rpc_ielts_autosave_attempt') return { attempt_id: 'attempt-1', section: 'reading', draft_version: 2 };
    if (name === 'rpc_ielts_submit_attempt') return { submission_id: 'submission-1', attempt_id: 'attempt-1', status: 'submitted' };
    if (name === 'rpc_ielts_log_incident') return { incident_id: 'incident-1' };
    return {};
  });

  await rpcIeltsStartAttempt('assignment-1', client);
  await rpcIeltsAutosaveAttempt({
    attemptId: 'attempt-1',
    lockToken: 'lock',
    section: 'reading',
    payload: { answers: { q1: 'A' } },
    draftVersion: 2,
    clientSavedAt: '2026-05-15T00:00:00.000Z',
  }, client);
  await rpcIeltsSubmitAttempt({
    attemptId: 'attempt-1',
    lockToken: 'lock',
    payload: { reading: {} },
    idempotencyKey: 'attempt-1:key',
  }, client);
  await rpcIeltsLogIncident({
    attemptId: 'attempt-1',
    lockToken: 'lock',
    incidentType: 'window_blur',
    severity: 'warning',
    payload: { at: 'now' },
  }, client);

  assert.deepEqual(calls, [
    { name: 'rpc_ielts_start_attempt', params: { p_assignment_id: 'assignment-1' } },
    {
      name: 'rpc_ielts_autosave_attempt',
      params: {
        p_attempt_id: 'attempt-1',
        p_lock_token: 'lock',
        p_section: 'reading',
        p_payload: { answers: { q1: 'A' } },
        p_draft_version: 2,
        p_client_saved_at: '2026-05-15T00:00:00.000Z',
      },
    },
    {
      name: 'rpc_ielts_submit_attempt',
      params: {
        p_attempt_id: 'attempt-1',
        p_lock_token: 'lock',
        p_payload: { reading: {} },
        p_idempotency_key: 'attempt-1:key',
      },
    },
    {
      name: 'rpc_ielts_log_incident',
      params: {
        p_attempt_id: 'attempt-1',
        p_lock_token: 'lock',
        p_incident_type: 'window_blur',
        p_severity: 'warning',
        p_payload: { at: 'now' },
      },
    },
  ]);
});

test('sanitizePublicFormPayload returns null for empty payloads', () => {
  assert.equal(sanitizePublicFormPayload(null), null);
  assert.equal(sanitizePublicFormPayload(undefined), null);
});


test('IELTS exam monitoring and emergency service wrappers map RPC parameters', async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const client = createClient((name, params) => {
    calls.push({ name, params });
    if (name === 'rpc_ielts_exam_monitoring') return [{ student_id: 'student-1', attempt_id: 'attempt-1', status: 'in_progress' }];
    return { ok: true };
  });

  await rpcIeltsExamMonitoring('exam-1', client);
  await rpcIeltsPauseExam({ examEventId: 'exam-1', reason: 'Drill pause' }, client);
  await rpcIeltsResumeExam({ examEventId: 'exam-1', reason: 'Drill resume' }, client);
  await rpcIeltsExtendAttempt({ attemptId: 'attempt-1', extraMinutes: 7, reason: 'Network issue' }, client);
  await rpcIeltsForceSubmitAttempt({ attemptId: 'attempt-1', reason: 'Teacher action' }, client);
  await rpcIeltsVoidAttempt({ attemptId: 'attempt-1', reason: 'Invalid attempt' }, client);

  assert.deepEqual(calls, [
    { name: 'rpc_ielts_exam_monitoring', params: { p_exam_event_id: 'exam-1' } },
    { name: 'rpc_ielts_pause_exam', params: { p_exam_event_id: 'exam-1', p_reason: 'Drill pause' } },
    { name: 'rpc_ielts_resume_exam', params: { p_exam_event_id: 'exam-1', p_reason: 'Drill resume' } },
    { name: 'rpc_ielts_extend_attempt', params: { p_attempt_id: 'attempt-1', p_extra_minutes: 7, p_reason: 'Network issue' } },
    { name: 'rpc_ielts_force_submit_attempt', params: { p_attempt_id: 'attempt-1', p_reason: 'Teacher action' } },
    { name: 'rpc_ielts_void_attempt', params: { p_attempt_id: 'attempt-1', p_reason: 'Invalid attempt' } },
  ]);
});


test('IELTS exam manager service wrappers map create and assignment RPC parameters', async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const client = createClient((name, params) => {
    calls.push({ name, params });
    if (name === 'rpc_ielts_list_manageable_exams') return [];
    if (name === 'rpc_ielts_get_exam_admin_detail') return { exam: { id: 'exam-1' }, forms: [], classes: [], students: [], assignments: [] };
    return { id: 'created-1', assigned_count: 2 };
  });

  await rpcIeltsCreateExamEvent({
    title: 'Mock exam',
    description: 'Description',
    startsAt: '2026-05-15T09:00:00.000Z',
    endsAt: '2026-05-15T11:00:00.000Z',
    durationMinutes: 120,
    status: 'scheduled',
    schoolId: 'school-1',
  }, client);
  await rpcIeltsCreateExamForm({
    examEventId: 'exam-1',
    formCode: 'A',
    readingPayload: { reading: true },
    listeningPayload: { listening: true },
    writingPayload: { writing: true },
    speakingPayload: null,
    answerKey: { key: true },
    isActive: true,
  }, client);
  await rpcIeltsAssignExamToClass({ examEventId: 'exam-1', classId: 'class-1', formId: 'form-1' }, client);
  await rpcIeltsAssignExamToStudents({ examEventId: 'exam-1', studentIds: ['student-1', 'student-2'], formId: 'form-1', classId: 'class-1' }, client);
  await rpcIeltsListManageableExams(client);
  await rpcIeltsGetExamAdminDetail('exam-1', client);

  assert.deepEqual(calls, [
    {
      name: 'rpc_ielts_create_exam_event',
      params: {
        p_title: 'Mock exam',
        p_description: 'Description',
        p_starts_at: '2026-05-15T09:00:00.000Z',
        p_ends_at: '2026-05-15T11:00:00.000Z',
        p_duration_minutes: 120,
        p_status: 'scheduled',
        p_school_id: 'school-1',
      },
    },
    {
      name: 'rpc_ielts_create_exam_form',
      params: {
        p_exam_event_id: 'exam-1',
        p_form_code: 'A',
        p_reading_payload: { reading: true },
        p_listening_payload: { listening: true },
        p_writing_payload: { writing: true },
        p_answer_key: { key: true },
        p_speaking_payload: null,
        p_is_active: true,
      },
    },
    { name: 'rpc_ielts_assign_exam_to_class', params: { p_exam_event_id: 'exam-1', p_class_id: 'class-1', p_form_id: 'form-1' } },
    { name: 'rpc_ielts_assign_exam_to_students', params: { p_exam_event_id: 'exam-1', p_student_ids: ['student-1', 'student-2'], p_form_id: 'form-1', p_class_id: 'class-1' } },
    { name: 'rpc_ielts_list_manageable_exams', params: {} },
    { name: 'rpc_ielts_get_exam_admin_detail', params: { p_exam_event_id: 'exam-1' } },
  ]);
});

test('IELTS exam JSON validation reports parse errors and nested answer keys', () => {
  const valid = validateExamJsonText('{"questions":[{"id":1}]}');
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.value, { questions: [{ id: 1 }] });
  assert.equal(valid.containsAnswerKey, false);

  const withKey = validateExamJsonText('{"section":{"answer_key":{"q1":"A"}}}');
  assert.equal(withKey.ok, true);
  assert.equal(withKey.containsAnswerKey, true);
  assert.equal(payloadContainsAnswerKey([{ nested: { answer_key: true } }]), true);

  const invalid = validateExamJsonText('{not-json}', { fallback: true });
  assert.equal(invalid.ok, false);
  assert.deepEqual(invalid.value, { fallback: true });
  assert.match(invalid.error ?? '', /JSON|property|position|Expected/i);
});
