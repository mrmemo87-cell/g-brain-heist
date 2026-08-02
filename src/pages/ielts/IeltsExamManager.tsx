import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  rpcIeltsAssignExamToClass,
  rpcIeltsAssignExamToStudents,
  rpcIeltsCreateExamEvent,
  rpcIeltsCreateExamForm,
  rpcIeltsGetExamAdminDetail,
  rpcIeltsListManageableExams,
  validateExamJsonText,
  type IeltsExamAdminDetail,
  type IeltsExamAdminStudent,
  type IeltsManageableExam,
} from '../../../services/ieltsExamModeService';
import { validateRenderableExamPayload } from '../../../services/ieltsExamPayloadParser';
import { resolveIeltsExamLifecycleMeta } from '../../../services/ieltsExamModeUx';
import { useSchoolBranding } from '../../hooks/useSchoolBranding';
import { createSchoolDocumentId, escapeSchoolDocumentHtml, openSchoolDocumentPreview, schoolDocumentFileName } from '../../lib/schoolDocument';

type BusyAction = 'idle' | 'loading' | 'creating_exam' | 'creating_form' | 'assigning';

const emptyJson = '{\n  \n}';
const defaultAnswerKey = '{\n  "reading": {},\n  "listening": {},\n  "writing": {}\n}';

const readingTemplate = JSON.stringify({
  title: 'Reading Passage 1',
  instructions: 'Read the passage and answer all questions. Do not include answer_key in this public payload.',
  tasks: [
    {
      id: 'reading-passage-1',
      title: 'Passage 1',
      passage: 'Paste the reading passage text here.',
      questions: [
        { id: 'r1', type: 'short_answer', prompt: 'What is the main idea of the passage?' },
        { id: 'r2', type: 'multiple_choice', prompt: 'Choose the best heading.', options: ['A', 'B', 'C', 'D'] },
      ],
    },
  ],
}, null, 2);

const listeningTemplate = JSON.stringify({
  title: 'Listening Section 1',
  instructions: 'Play the audio provided by the invigilator and answer all questions.',
  audio_url: 'https://example.com/listening-audio.mp3',
  tasks: [
    {
      id: 'listening-part-1',
      title: 'Part 1',
      questions: [
        { id: 'l1', type: 'short_answer', prompt: 'Complete the note: The appointment is on ____.' },
        { id: 'l2', type: 'multiple_choice', prompt: 'Where will the speaker go next?', options: ['Library', 'Station', 'Office'] },
      ],
    },
  ],
}, null, 2);

const writingTemplate = JSON.stringify({
  title: 'Writing Tasks',
  instructions: 'Answer both writing tasks in the boxes provided.',
  tasks: [
    { id: 'w1', type: 'essay', prompt: 'Task 1: Summarise the chart or diagram in at least 150 words.' },
    { id: 'w2', type: 'essay', prompt: 'Task 2: Write an essay response in at least 250 words.' },
  ],
}, null, 2);

const speakingTemplate = JSON.stringify({
  title: 'Speaking Prompts',
  instructions: 'Answer the speaking prompts when instructed by the examiner.',
  parts: [
    {
      id: 'speaking-part-1',
      title: 'Part 1',
      questions: [
        { id: 's1', type: 'spoken_response', prompt: 'Tell me about where you live.' },
        { id: 's2', type: 'spoken_response', prompt: 'What do you usually do at weekends?' },
      ],
    },
  ],
}, null, 2);

const toLocalInputValue = (date: Date) => {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const toIsoFromLocal = (value: string) => new Date(value).toISOString();

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const uniqueStudents = (students: IeltsExamAdminStudent[]) => {
  const seen = new Set<string>();
  return students.filter((student) => {
    if (seen.has(student.student_id)) return false;
    seen.add(student.student_id);
    return true;
  });
};

const IeltsExamManager: React.FC = () => {
  const [exams, setExams] = useState<IeltsManageableExam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IeltsExamAdminDetail | null>(null);
  const [busy, setBusy] = useState<BusyAction>('loading');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [title, setTitle] = useState('IELTS Controlled Exam');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState(() => toLocalInputValue(new Date(Date.now() + 60 * 60_000)));
  const [endsAt, setEndsAt] = useState(() => toLocalInputValue(new Date(Date.now() + 3 * 60 * 60_000)));
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [status, setStatus] = useState('draft');

  const [formCode, setFormCode] = useState('FORM-A');
  const [readingJson, setReadingJson] = useState(readingTemplate);
  const [listeningJson, setListeningJson] = useState(listeningTemplate);
  const [writingJson, setWritingJson] = useState(writingTemplate);
  const [speakingJson, setSpeakingJson] = useState(speakingTemplate);
  const [answerKeyJson, setAnswerKeyJson] = useState(defaultAnswerKey);

  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(() => new Set());
  const detailRequestIdRef = useRef(0);

  const loadExams = useCallback(async (preferredExamId?: string) => {
    setBusy((current) => current === 'idle' ? 'loading' : current);
    setError(null);
    try {
      const rows = await rpcIeltsListManageableExams();
      setExams(rows);
      const nextId = preferredExamId ?? selectedExamId ?? rows[0]?.id ?? null;
      setSelectedExamId(nextId);
      if (nextId) {
        const nextDetail = await rpcIeltsGetExamAdminDetail(nextId);
        setDetail(nextDetail);
        const activeForm = nextDetail.forms.find((form) => form.is_active) ?? nextDetail.forms[0] ?? null;
        setSelectedFormId(activeForm?.id ?? null);
      } else {
        setDetail(null);
        setSelectedFormId(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load manageable IELTS exams.');
    } finally {
      setBusy('idle');
    }
  }, [selectedExamId]);

  useEffect(() => {
    void loadExams();
    // Initial load intentionally runs once; explicit refreshes call loadExams directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedExamId) return;
    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;
    setSelectedStudentIds(new Set());
    setSelectedClassId('');
    void rpcIeltsGetExamAdminDetail(selectedExamId)
      .then((nextDetail) => {
        if (detailRequestIdRef.current !== requestId) return;
        setDetail(nextDetail);
        const activeForm = nextDetail.forms.find((form) => form.is_active) ?? nextDetail.forms[0] ?? null;
        setSelectedFormId(activeForm?.id ?? null);
      })
      .catch((detailError) => {
        if (detailRequestIdRef.current !== requestId) return;
        setError(detailError instanceof Error ? detailError.message : 'Failed to load exam detail.');
      });

    return () => {
      if (detailRequestIdRef.current === requestId) {
        detailRequestIdRef.current += 1;
      }
    };
  }, [selectedExamId]);

  const activeExam = detail?.exam ?? exams.find((exam) => exam.id === selectedExamId) ?? null;
  const { schoolName, schoolLogoUrl } = useSchoolBranding({ schoolId: activeExam?.school_id });
  const activeForm = detail?.forms.find((form) => form.id === selectedFormId) ?? detail?.forms.find((form) => form.is_active) ?? null;
  const students = useMemo(() => uniqueStudents(detail?.students ?? []), [detail?.students]);
  const filteredStudents = useMemo(() => {
    if (!selectedClassId) return students;
    return students.filter((student) => student.class_id === selectedClassId);
  }, [selectedClassId, students]);

  const studentLink = activeExam ? `${window.location.origin}/ielts/exam/${activeExam.id}` : '';
  const monitorLink = activeExam ? `${window.location.origin}/ielts/exam/${activeExam.id}/monitor` : '';

  const printExamOperationsPack = () => {
    if (!activeExam || !detail) return;
    const studentById = new Map(students.map((student) => [student.student_id, student]));
    const roster = detail.assignments.map((assignment, index) => {
      const student = studentById.get(assignment.student_id);
      return `<tr><td>${index + 1}</td><td>${escapeSchoolDocumentHtml(student?.username || assignment.username || 'Student')}</td><td>${escapeSchoolDocumentHtml(student?.class_name || assignment.class_name || '—')}</td><td>${escapeSchoolDocumentHtml(student?.grade ?? '—')}</td><td></td><td>□</td><td>□</td><td></td></tr>`;
    }).join('');
    try {
      openSchoolDocumentPreview({
        meta: {
          documentId: createSchoolDocumentId('ielts'),
          templateVersion: 'ielts-exam-operations-v1',
          title: 'IELTS Mock Exam Operations Pack',
          subtitle: activeExam.title,
          schoolName,
          schoolLogoUrl,
          audience: 'internal',
          status: activeExam.status === 'draft' ? 'draft' : 'final',
          confidentiality: 'confidential',
          generatedAt: new Date().toISOString(),
          schoolId: activeExam.school_id,
          sourceType: 'ielts_exam_event',
          sourceId: activeExam.id,
        },
        bodyHtml: `<h2>Exam arrangements</h2><div class="document-grid"><div class="document-card"><strong>Schedule</strong><p>${escapeSchoolDocumentHtml(formatDateTime(activeExam.starts_at))} – ${escapeSchoolDocumentHtml(formatDateTime(activeExam.ends_at))}</p></div><div class="document-card"><strong>Duration and form</strong><p>${activeExam.duration_minutes} minutes · ${escapeSchoolDocumentHtml(activeForm?.form_code || 'No active form')}</p></div></div><h2>Attendance and identity register</h2><table><thead><tr><th>No.</th><th>Student</th><th>Class</th><th>Grade</th><th>Seat</th><th>Present</th><th>ID checked</th><th>Signature / notes</th></tr></thead><tbody>${roster || '<tr><td colspan="8">No students are assigned to this exam.</td></tr>'}</tbody></table><section class="document-page-break"><h2>Invigilator checklist</h2><ul><li>Confirm the active form and protected answer key are not visible to candidates.</li><li>Verify candidate identity and seat allocation before admitting each student.</li><li>Record late arrivals, technical interruptions and approved extra time.</li><li>Use the live monitor for emergency pause, resume and incident handling.</li></ul><h2>Incident log</h2><table><thead><tr><th>Time</th><th>Student / seat</th><th>Incident</th><th>Action taken</th><th>Invigilator initials</th></tr></thead><tbody>${Array.from({ length: 8 }, () => '<tr><td style="height:12mm"></td><td></td><td></td><td></td><td></td></tr>').join('')}</tbody></table><div class="document-signatures"><div class="document-signature">Lead invigilator · Name / signature</div><div class="document-signature">School administrator · Name / signature</div></div></section>`,
        orientation: 'landscape',
        inkSaver: true,
        fileName: schoolDocumentFileName(schoolName, activeExam.title, 'Operations_Pack'),
      });
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : 'Unable to open the exam operations document.');
    }
  };

  const validateSchedule = () => {
    const startMs = Date.parse(startsAt);
    const endMs = Date.parse(endsAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 'Start and end time are required.';
    if (endMs <= startMs) return 'End time must be after start time.';
    if (!durationMinutes || durationMinutes <= 0) return 'Duration must be greater than zero.';
    const availableWindowMs = endMs - startMs;
    if (durationMinutes * 60_000 > availableWindowMs) return 'Duration must fit within start and end times.';
    return null;
  };

  const handleCreateExam = async () => {
    const scheduleError = validateSchedule();
    if (scheduleError) {
      setError(scheduleError);
      return;
    }
    setBusy('creating_exam');
    setError(null);
    setMessage(null);
    try {
      const created = await rpcIeltsCreateExamEvent({
        title,
        description,
        startsAt: toIsoFromLocal(startsAt),
        endsAt: toIsoFromLocal(endsAt),
        durationMinutes,
        status,
      });
      setMessage('Exam event created. Add an active form before assigning students.');
      await loadExams(created.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create exam event.');
    } finally {
      setBusy('idle');
    }
  };

  const validateFormJson = () => {
    const reading = validateExamJsonText(readingJson);
    const listening = validateExamJsonText(listeningJson);
    const writing = validateExamJsonText(writingJson);
    const speaking = validateExamJsonText(speakingJson, null);
    const answerKey = validateExamJsonText(answerKeyJson);
    const invalid = { reading, listening, writing, speaking, answerKey };
    for (const [label, result] of Object.entries(invalid)) {
      if (!result.ok) return { ok: false as const, error: `${label} JSON is invalid: ${result.error}` };
    }
    const publicPayloadHasAnswerKey = reading.containsAnswerKey || listening.containsAnswerKey || writing.containsAnswerKey || speaking.containsAnswerKey;
    const renderableChecks = {
      reading: validateRenderableExamPayload(reading.value, 'reading'),
      listening: validateRenderableExamPayload(listening.value, 'listening'),
      writing: validateRenderableExamPayload(writing.value, 'writing'),
      speaking: speaking.value === null ? { ok: true, questionCount: 0 } : validateRenderableExamPayload(speaking.value, 'speaking'),
    };
    for (const [label, result] of Object.entries(renderableChecks)) {
      if (!result.ok) return { ok: false as const, error: `${label} payload cannot render: ${result.message}` };
    }
    const answerKeyMissing = !answerKeyJson.trim() || answerKeyJson.trim() === '{}' || answerKeyJson.trim() === emptyJson.trim();
    return {
      ok: true as const,
      reading: reading.value,
      listening: listening.value,
      writing: writing.value,
      speaking: speaking.value,
      answerKey: answerKey.value,
      publicPayloadHasAnswerKey,
      renderableChecks,
      answerKeyMissing,
    };
  };

  const formValidation = validateFormJson();

  const handleCreateForm = async () => {
    if (!activeExam) {
      setError('Create or select an exam before adding a form.');
      return;
    }
    const validation = validateFormJson();
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    if (validation.publicPayloadHasAnswerKey) {
      setError('Remove answer_key from reading/listening/writing/speaking payloads before saving. Keep keys only in the protected answer_key JSON.');
      return;
    }
    if (validation.answerKeyMissing && !window.confirm('The answer_key appears empty. Create the form anyway?')) {
      return;
    }
    setBusy('creating_form');
    setError(null);
    setMessage(null);
    try {
      const form = await rpcIeltsCreateExamForm({
        examEventId: activeExam.id,
        formCode,
        readingPayload: validation.reading,
        listeningPayload: validation.listening,
        writingPayload: validation.writing,
        speakingPayload: validation.speaking,
        answerKey: validation.answerKey,
        isActive: true,
      });
      setSelectedFormId(form.id);
      setMessage('Active exam form saved. You can now assign students.');
      await loadExams(activeExam.id);
    } catch (formError) {
      setError(formError instanceof Error ? formError.message : 'Failed to create exam form.');
    } finally {
      setBusy('idle');
    }
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const handleAssignClass = async () => {
    if (!activeExam || !selectedClassId) {
      setError('Select an exam and class first.');
      return;
    }
    if (!activeForm) {
      setError('Cannot assign without an active form.');
      return;
    }
    setBusy('assigning');
    setError(null);
    setMessage(null);
    try {
      const result = await rpcIeltsAssignExamToClass({ examEventId: activeExam.id, classId: selectedClassId, formId: activeForm.id });
      setMessage(`Assigned exam to class. Rows affected: ${result.assigned_count}.`);
      await loadExams(activeExam.id);
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : 'Failed to assign class.');
    } finally {
      setBusy('idle');
    }
  };

  const handleAssignStudents = async () => {
    if (!activeExam) {
      setError('Select an exam first.');
      return;
    }
    if (!activeForm) {
      setError('Cannot assign without an active form.');
      return;
    }
    const studentIds = Array.from(selectedStudentIds);
    if (studentIds.length === 0) {
      setError('Select at least one student before assigning.');
      return;
    }
    setBusy('assigning');
    setError(null);
    setMessage(null);
    try {
      const result = await rpcIeltsAssignExamToStudents({ examEventId: activeExam.id, studentIds, formId: activeForm.id, classId: selectedClassId || null });
      setMessage(`Assigned selected students. Rows affected: ${result.assigned_count}.`);
      setSelectedStudentIds(new Set());
      await loadExams(activeExam.id);
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : 'Failed to assign students.');
    } finally {
      setBusy('idle');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-5 shadow-sm">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">IELTS Exam Admin</p>
          <h1 className="text-2xl font-semibold text-slate-950">Controlled Exam Manager</h1>
          <p className="mt-1 text-sm text-slate-600">Create controlled IELTS exams, attach forms, and assign existing Brain Heist students.</p>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-5">
          <Panel title="Manageable exams" subtitle="Pick an exam and continue through the pilot setup steps.">
            <button type="button" onClick={() => void loadExams()} disabled={busy !== 'idle'} className="mb-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
              Refresh list
            </button>
            <div className="space-y-2">
              {exams.length === 0 && <p className="text-sm text-slate-500">No manageable exams yet.</p>}
              {exams.map((exam) => (
                <button
                  key={exam.id}
                  type="button"
                  onClick={() => setSelectedExamId(exam.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${selectedExamId === exam.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-slate-950">{exam.title}</div>
                    <LifecycleBadge status={exam.status} startsAt={exam.starts_at} endsAt={exam.ends_at} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{formatDateTime(exam.starts_at)} · {exam.assignment_count} assigned</div>
                  <div className="mt-2 text-xs text-slate-500">Forms: {exam.form_count} · Submitted: {exam.submitted_count}</div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Step 1 Create Exam" subtitle="Name the exam, choose a local start/end window, and save it as Draft or Scheduled.">
            <div className="space-y-3">
              <TextInput label="Title" value={title} onChange={setTitle} />
              <label className="block text-sm font-medium text-slate-700">Description
                <textarea className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 p-2 text-sm" value={description} onChange={(event) => setDescription(event.target.value)} />
              </label>
              <TextInput label="Starts at" type="datetime-local" value={startsAt} onChange={setStartsAt} />
              <TextInput label="Ends at" type="datetime-local" value={endsAt} onChange={setEndsAt} />
              <TextInput label="Duration minutes" type="number" value={String(durationMinutes)} onChange={(value) => setDurationMinutes(Number(value))} />
              <label className="block text-sm font-medium text-slate-700">Status
                <select className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="live">Live now</option>
                  <option value="paused">Paused</option>
                  <option value="ended">Ended</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              {validateSchedule() && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">{validateSchedule()}</p>}
              <button type="button" onClick={() => void handleCreateExam()} disabled={busy !== 'idle'} className="w-full rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:bg-slate-400">
                {busy === 'creating_exam' ? 'Creating…' : 'Create exam event'}
              </button>
            </div>
          </Panel>
        </aside>

        <section className="space-y-5">
          {error && <Banner tone="error" message={error} />}
          {message && <Banner tone="success" message={message} />}

          {!activeExam ? (
            <Panel title="Select or create an exam" subtitle="Exam form and assignment controls appear after an exam is selected." />
          ) : (
            <>
              <Panel title="Step 4 Launch & Monitor" subtitle={`${activeExam.title} · ${formatDateTime(activeExam.starts_at)} → ${formatDateTime(activeExam.ends_at)} · ${activeExam.duration_minutes} minutes`}>
                <button type="button" onClick={printExamOperationsPack} className="mb-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Print attendance & invigilation pack</button>
                <div className="grid gap-3 md:grid-cols-2">
                  <LinkBox label="Student link" value={studentLink} />
                  <LinkBox label="Monitor link" value={monitorLink} />
                </div>
                <div className="mt-3 grid gap-3 text-sm md:grid-cols-4">
                  <LifecycleStat status={activeExam.status} startsAt={activeExam.starts_at} endsAt={activeExam.ends_at} />
                  <Stat label="Forms" value={String(activeExam.form_count ?? detail?.forms.length ?? 0)} />
                  <Stat label="Assigned" value={String(activeExam.assignment_count ?? detail?.assignments.length ?? 0)} />
                  <Stat label="Submitted" value={String(activeExam.submitted_count ?? 0)} />
                </div>
              </Panel>

              <Panel title="Step 2 Configure Form" subtitle="Choose the active form. Advanced JSON editors stay closed until you need them.">
                <div className="mb-3 grid gap-3 md:grid-cols-2">
                  <TextInput label="Form code" value={formCode} onChange={setFormCode} />
                  <label className="block text-sm font-medium text-slate-700">Active form
                    <select className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" value={selectedFormId ?? ''} onChange={(event) => setSelectedFormId(event.target.value || null)}>
                      <option value="">No active form selected</option>
                      {detail?.forms.map((form) => <option key={form.id} value={form.id}>{form.form_code}{form.is_active ? ' (active)' : ''}</option>)}
                    </select>
                  </label>
                </div>
                {!activeForm && <Banner tone="warning" message="No active form yet. Save one form before assigning students or launching the exam." />}
                <SectionPayloadGuide />
                <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800">Advanced form JSON editors (closed by default)</summary>
                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    <JsonBox label="Reading JSON" value={readingJson} onChange={setReadingJson} template={readingTemplate} help="Expected: title/instructions plus questions[] or tasks[] with nested questions[]." />
                    <JsonBox label="Listening JSON" value={listeningJson} onChange={setListeningJson} template={listeningTemplate} help="Expected: title/instructions, optional audio_url, and questions[] or tasks[] with nested questions[]." />
                    <JsonBox label="Writing JSON" value={writingJson} onChange={setWritingJson} template={writingTemplate} help="Expected: title/instructions plus tasks[] or questions[]; writing tasks render as essay boxes." />
                    <JsonBox label="Speaking JSON (optional)" value={speakingJson} onChange={setSpeakingJson} template={speakingTemplate} help="Expected: title/instructions plus parts[] with nested questions[] or direct questions[]. Leave blank only if speaking is not used." />
                    <JsonBox label="Answer key JSON (protected)" value={answerKeyJson} onChange={setAnswerKeyJson} full help="Protected grading data only. Never paste answer_key inside public section JSON." />
                  </div>
                </details>
                <div className="mt-3 space-y-2">
                  {!formValidation.ok && <Banner tone="error" message={formValidation.error} />}
                  {formValidation.ok && formValidation.publicPayloadHasAnswerKey && <Banner tone="warning" message="One of the public section payloads contains answer_key. Remove it before saving; students must never receive keys in public payloads." />}
                  {formValidation.ok && <Banner tone="success" message={`Renderable payloads: reading ${formValidation.renderableChecks.reading.questionCount}, listening ${formValidation.renderableChecks.listening.questionCount}, writing ${formValidation.renderableChecks.writing.questionCount}, speaking ${formValidation.renderableChecks.speaking.questionCount}.`} />}
                  {formValidation.ok && formValidation.answerKeyMissing && <Banner tone="warning" message="Answer key appears empty. You can save drafts, but grading will need a protected answer key." />}
                </div>
                <button type="button" onClick={() => void handleCreateForm()} disabled={busy !== 'idle' || !formValidation.ok} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:bg-slate-400">
                  {busy === 'creating_form' ? 'Saving form…' : 'Save active form'}
                </button>
              </Panel>

              <Panel title="Step 3 Assign Students" subtitle="Assign this exam to an entire class or selected existing Brain Heist students.">
                {!activeForm && <Banner tone="warning" message="Cannot assign students until this exam has an active form." />}
                <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
                  <label className="block text-sm font-medium text-slate-700">Class
                    <select className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" value={selectedClassId} onChange={(event) => { setSelectedClassId(event.target.value); setSelectedStudentIds(new Set()); }}>
                      <option value="">All manageable students</option>
                      {detail?.classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.class_name} {schoolClass.class_code ? `(${schoolClass.class_code})` : ''}</option>)}
                    </select>
                  </label>
                  <button type="button" onClick={() => void handleAssignClass()} disabled={busy !== 'idle' || !activeForm || !selectedClassId} className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:bg-slate-400">
                    Assign class
                  </button>
                  <button type="button" onClick={() => void handleAssignStudents()} disabled={busy !== 'idle' || !activeForm || selectedStudentIds.size === 0} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:bg-slate-400">
                    Assign selected ({selectedStudentIds.size})
                  </button>
                </div>
                <div className="mt-4 max-h-96 overflow-auto rounded-xl border border-slate-200">
                  {filteredStudents.length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">No assigned or available students found for this class filter. Choose another class or add students before launch.</p>
                  ) : filteredStudents.map((student) => (
                    <label key={student.student_id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0">
                      <span>
                        <span className="font-semibold text-slate-900">{student.username ?? student.email ?? student.student_id}</span>
                        <span className="ml-2 text-slate-500">{student.class_name ?? 'Unassigned'} · Grade {student.grade ?? '—'}</span>
                      </span>
                      <input type="checkbox" checked={selectedStudentIds.has(student.student_id)} onChange={() => toggleStudent(student.student_id)} />
                    </label>
                  ))}
                </div>
                <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                  {(detail?.assignments.length ?? 0) === 0
                    ? 'No assigned students yet. Assign a class or selected students before pilot launch.'
                    : `Current assignments: ${detail?.assignments.length ?? 0}`}
                </div>
              </Panel>
            </>
          )}
        </section>
      </main>
    </div>
  );
};

const LifecycleBadge: React.FC<{ status?: string | null; startsAt?: string | null; endsAt?: string | null }> = ({ status, startsAt, endsAt }) => {
  const meta = resolveIeltsExamLifecycleMeta(status, startsAt, endsAt);
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${meta.badgeClass}`}>{meta.label}</span>;
};

const LifecycleStat: React.FC<{ status?: string | null; startsAt?: string | null; endsAt?: string | null }> = ({ status, startsAt, endsAt }) => {
  const meta = resolveIeltsExamLifecycleMeta(status, startsAt, endsAt);
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lifecycle</p>
      <p className="mt-1"><span className={`inline-flex rounded-full px-2.5 py-1 text-sm font-semibold ring-1 ${meta.badgeClass}`}>{meta.label}</span></p>
      <p className="mt-2 text-xs text-slate-500">{meta.description}</p>
    </div>
  );
};

const Panel: React.FC<React.PropsWithChildren<{ title: string; subtitle?: string }>> = ({ title, subtitle, children }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
    {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    {children && <div className="mt-4">{children}</div>}
  </section>
);

const TextInput: React.FC<{ label: string; value: string; onChange: (value: string) => void; type?: string }> = ({ label, value, onChange, type = 'text' }) => (
  <label className="block text-sm font-medium text-slate-700">{label}
    <input className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
  </label>
);

const SectionPayloadGuide: React.FC = () => (
  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
    <p className="font-semibold">Required public payload schema</p>
    <ul className="mt-2 list-disc space-y-1 pl-5">
      <li><code>title</code> and <code>instructions</code> are optional display strings.</li>
      <li>Use either <code>questions</code>/<code>items</code>/<code>prompts</code> directly, or <code>tasks</code>/<code>parts</code>/<code>passages</code> containing nested <code>questions</code>.</li>
      <li>Each question should include <code>id</code>, <code>prompt</code>, optional <code>type</code>, and optional <code>options</code> for radio choices.</li>
      <li>Do not include <code>answer_key</code> anywhere in reading/listening/writing/speaking JSON; keep keys only in the protected answer key box.</li>
    </ul>
  </div>
);

const JsonBox: React.FC<{ label: string; value: string; onChange: (value: string) => void; full?: boolean; help?: string; template?: string }> = ({ label, value, onChange, full, help, template }) => (
  <label className={`block text-sm font-medium text-slate-700 ${full ? 'xl:col-span-2' : ''}`}>{label}
    <span className="mt-1 flex items-center justify-between gap-2 text-xs font-normal text-slate-500">
      <span>{help}</span>
      {template && <button type="button" className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100" onClick={() => onChange(template)}>Use example</button>}
    </span>
    <textarea className="mt-1 min-h-40 w-full rounded-lg border border-slate-300 bg-slate-950 p-3 font-mono text-xs text-slate-50" value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} />
  </label>
);

const LinkBox: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <a className="mt-1 block break-all text-sm font-semibold text-blue-700 underline" href={value}>{value}</a>
  </div>
);

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl bg-slate-50 p-3">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 font-semibold text-slate-900">{value}</p>
  </div>
);

const Banner: React.FC<{ tone: 'success' | 'warning' | 'error'; message: string }> = ({ tone, message }) => {
  const cls = tone === 'success'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-red-200 bg-red-50 text-red-800';
  return <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{message}</div>;
};

export default IeltsExamManager;
