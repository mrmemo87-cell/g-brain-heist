import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

type BusyAction = 'idle' | 'loading' | 'creating_exam' | 'creating_form' | 'assigning';

const emptyJson = '{\n  \n}';
const defaultAnswerKey = '{\n  "reading": {},\n  "listening": {},\n  "writing": {}\n}';

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
  const [readingJson, setReadingJson] = useState(emptyJson);
  const [listeningJson, setListeningJson] = useState(emptyJson);
  const [writingJson, setWritingJson] = useState(emptyJson);
  const [speakingJson, setSpeakingJson] = useState('');
  const [answerKeyJson, setAnswerKeyJson] = useState(defaultAnswerKey);

  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(() => new Set());

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
    setSelectedStudentIds(new Set());
    setSelectedClassId('');
    void rpcIeltsGetExamAdminDetail(selectedExamId)
      .then((nextDetail) => {
        setDetail(nextDetail);
        const activeForm = nextDetail.forms.find((form) => form.is_active) ?? nextDetail.forms[0] ?? null;
        setSelectedFormId(activeForm?.id ?? null);
      })
      .catch((detailError) => setError(detailError instanceof Error ? detailError.message : 'Failed to load exam detail.'));
  }, [selectedExamId]);

  const activeExam = detail?.exam ?? exams.find((exam) => exam.id === selectedExamId) ?? null;
  const activeForm = detail?.forms.find((form) => form.id === selectedFormId) ?? detail?.forms.find((form) => form.is_active) ?? null;
  const students = useMemo(() => uniqueStudents(detail?.students ?? []), [detail?.students]);
  const filteredStudents = useMemo(() => {
    if (!selectedClassId) return students;
    return students.filter((student) => student.class_id === selectedClassId);
  }, [selectedClassId, students]);

  const studentLink = activeExam ? `${window.location.origin}/ielts/exam/${activeExam.id}` : '';
  const monitorLink = activeExam ? `${window.location.origin}/ielts/exam/${activeExam.id}/monitor` : '';

  const validateSchedule = () => {
    const startMs = Date.parse(startsAt);
    const endMs = Date.parse(endsAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 'Start and end time are required.';
    if (endMs <= startMs) return 'End time must be after start time.';
    if (!durationMinutes || durationMinutes <= 0) return 'Duration must be greater than zero.';
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
    const answerKeyMissing = !answerKeyJson.trim() || answerKeyJson.trim() === '{}' || answerKeyJson.trim() === emptyJson.trim();
    return {
      ok: true as const,
      reading: reading.value,
      listening: listening.value,
      writing: writing.value,
      speaking: speaking.value,
      answerKey: answerKey.value,
      publicPayloadHasAnswerKey,
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
          <Panel title="Manageable exams" subtitle="Select an exam to configure forms and assignments.">
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
                  <div className="font-semibold text-slate-950">{exam.title}</div>
                  <div className="text-xs text-slate-500">{formatDateTime(exam.starts_at)} · {exam.assignment_count} assigned</div>
                  <div className="mt-2 text-xs text-slate-500">Forms: {exam.form_count} · Submitted: {exam.submitted_count}</div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Create exam event" subtitle="Set the controlled exam window and duration.">
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
                  <option value="live">Live</option>
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
              <Panel title={activeExam.title} subtitle={`${formatDateTime(activeExam.starts_at)} → ${formatDateTime(activeExam.ends_at)} · ${activeExam.duration_minutes} minutes`}>
                <div className="grid gap-3 md:grid-cols-2">
                  <LinkBox label="Student link" value={studentLink} />
                  <LinkBox label="Monitor link" value={monitorLink} />
                </div>
                <div className="mt-3 grid gap-3 text-sm md:grid-cols-4">
                  <Stat label="Status" value={activeExam.status} />
                  <Stat label="Forms" value={String(activeExam.form_count ?? detail?.forms.length ?? 0)} />
                  <Stat label="Assigned" value={String(activeExam.assignment_count ?? detail?.assignments.length ?? 0)} />
                  <Stat label="Submitted" value={String(activeExam.submitted_count ?? 0)} />
                </div>
              </Panel>

              <Panel title="Exam form" subtitle="Paste public section payloads and keep the answer key separate.">
                <div className="mb-3 grid gap-3 md:grid-cols-2">
                  <TextInput label="Form code" value={formCode} onChange={setFormCode} />
                  <label className="block text-sm font-medium text-slate-700">Active form
                    <select className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" value={selectedFormId ?? ''} onChange={(event) => setSelectedFormId(event.target.value || null)}>
                      <option value="">No active form selected</option>
                      {detail?.forms.map((form) => <option key={form.id} value={form.id}>{form.form_code}{form.is_active ? ' (active)' : ''}</option>)}
                    </select>
                  </label>
                </div>
                <div className="grid gap-3 xl:grid-cols-2">
                  <JsonBox label="Reading JSON" value={readingJson} onChange={setReadingJson} />
                  <JsonBox label="Listening JSON" value={listeningJson} onChange={setListeningJson} />
                  <JsonBox label="Writing JSON" value={writingJson} onChange={setWritingJson} />
                  <JsonBox label="Speaking JSON (optional)" value={speakingJson} onChange={setSpeakingJson} />
                  <JsonBox label="Answer key JSON (protected)" value={answerKeyJson} onChange={setAnswerKeyJson} full />
                </div>
                <div className="mt-3 space-y-2">
                  {!formValidation.ok && <Banner tone="error" message={formValidation.error} />}
                  {formValidation.ok && formValidation.publicPayloadHasAnswerKey && <Banner tone="warning" message="One of the public section payloads contains answer_key. Remove it before saving; students must never receive keys in public payloads." />}
                  {formValidation.ok && formValidation.answerKeyMissing && <Banner tone="warning" message="Answer key appears empty. You can save drafts, but grading will need a protected answer key." />}
                </div>
                <button type="button" onClick={() => void handleCreateForm()} disabled={busy !== 'idle' || !formValidation.ok} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:bg-slate-400">
                  {busy === 'creating_form' ? 'Saving form…' : 'Save active form'}
                </button>
              </Panel>

              <Panel title="Assignments" subtitle="Assign this exam to an entire class or selected existing Brain Heist students.">
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
                    <p className="p-4 text-sm text-slate-500">No students available for this filter.</p>
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
                  Current assignments: {detail?.assignments.length ?? 0}
                </div>
              </Panel>
            </>
          )}
        </section>
      </main>
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

const JsonBox: React.FC<{ label: string; value: string; onChange: (value: string) => void; full?: boolean }> = ({ label, value, onChange, full }) => (
  <label className={`block text-sm font-medium text-slate-700 ${full ? 'xl:col-span-2' : ''}`}>{label}
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
