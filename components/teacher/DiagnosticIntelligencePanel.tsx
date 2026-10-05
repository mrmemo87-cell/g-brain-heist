import React, { useMemo } from 'react';
import type {
  TeacherAssignmentDiagnosticIntelligence,
  TeacherDiagnosticFocus,
  TeacherDiagnosticStudentFocus,
} from '../../services/teacherDiagnosticService';

const focusTone = (accuracy?: number | null) => {
  if (accuracy == null) return { label: 'Waiting for results', chip: 'bg-slate-100 text-slate-600', bar: 'bg-slate-300' };
  if (accuracy < 50) return { label: 'Teach next', chip: 'bg-rose-100 text-rose-700', bar: 'bg-rose-500' };
  if (accuracy < 70) return { label: 'Review together', chip: 'bg-amber-100 text-amber-800', bar: 'bg-amber-500' };
  if (accuracy < 80) return { label: 'Check again', chip: 'bg-sky-100 text-sky-700', bar: 'bg-sky-500' };
  return { label: 'Mostly secure', chip: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' };
};

const classPrioritySort = (a: TeacherDiagnosticFocus, b: TeacherDiagnosticFocus) => {
  if (a.accuracyPercent == null && b.accuracyPercent == null) return a.orderIndex - b.orderIndex;
  if (a.accuracyPercent == null) return 1;
  if (b.accuracyPercent == null) return -1;
  return a.accuracyPercent - b.accuracyPercent || a.orderIndex - b.orderIndex;
};

const SignalPill: React.FC<{ signal: TeacherDiagnosticStudentFocus['signal'] }> = ({ signal }) => {
  if (signal === 'correct') return <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700">✓ Correct signal</span>;
  if (signal === 'needs_check') return <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-700">Needs check</span>;
  if (signal === 'not_completed') return <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">Not completed</span>;
  return <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">No final answer</span>;
};

export const DiagnosticStudentSkillMap: React.FC<{
  data: TeacherAssignmentDiagnosticIntelligence;
  studentId: string;
}> = ({ data, studentId }) => {
  const student = data.students.find((item) => item.studentId === studentId);
  if (!student) return null;

  const focuses = [...student.focuses].sort((a, b) => a.orderIndex - b.orderIndex);
  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-cyan-950 px-5 py-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">Diagnostic Skill Map</span>
            <h3 className="mt-1 text-xl font-bold">{student.studentName}</h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-300">Each tile is the governed Evidence Focus behind one diagnostic signal. Use misses to decide what to investigate next—not to label mastery.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-white/10 px-4 py-2"><strong className="block text-xl">{student.correctSignalCount}</strong><span className="text-xs text-slate-300">correct signals</span></div>
            <div className="rounded-xl bg-white/10 px-4 py-2"><strong className="block text-xl">{student.needsCheckCount}</strong><span className="text-xs text-slate-300">needs check</span></div>
          </div>
        </div>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {focuses.map((focus) => (
          <article key={focus.evidenceFocusCode} className={`rounded-xl border p-3 ${focus.signal === 'needs_check' ? 'border-rose-200 bg-rose-50/60' : focus.signal === 'correct' ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Evidence Focus {focus.orderIndex}</span>
                <h4 className="mt-1 text-sm font-bold text-slate-800">{focus.evidenceFocusName}</h4>
                {focus.subskillName ? <p className="mt-1 text-xs text-slate-500">{focus.subskillName}</p> : null}
              </div>
              <SignalPill signal={focus.signal} />
            </div>
            {focus.signal === 'needs_check' ? (
              <button
                type="button"
                aria-label="Open Interventions"
                data-student-id={student.studentId}
                data-subject={data.assignment.subjectName === 'ESL' ? 'English' : data.assignment.subjectName}
                data-focus-code={focus.evidenceFocusCode}
                data-focus-name={focus.evidenceFocusName}
                className="mt-3 inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-700"
              >
                Review support <span aria-hidden>→</span>
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
};

const DiagnosticIntelligencePanel: React.FC<{
  data: TeacherAssignmentDiagnosticIntelligence;
  loading?: boolean;
  onReviewStudent?: (studentId: string) => void;
}> = ({ data, loading = false, onReviewStudent }) => {
  const ranked = useMemo(() => [...data.focuses].sort(classPrioritySort), [data.focuses]);
  const priorities = ranked.filter((focus) => focus.accuracyPercent != null && focus.accuracyPercent < 70).slice(0, 3);
  const urgentCount = data.focuses.filter((focus) => focus.accuracyPercent != null && focus.accuracyPercent < 50).length;
  const completedPercent = data.assignment.studentCount
    ? Math.round((data.assignment.completedStudents / data.assignment.studentCount) * 100)
    : 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-cyan-200 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-slate-950 via-indigo-950 to-cyan-950 p-5 text-white sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <span className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300">Brains Heist · {data.assignment.subjectName} Diagnostic Intelligence</span>
            <h3 className="mt-2 text-2xl font-black tracking-tight">What should I teach next?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">The diagnostic is translated into governed Evidence Focuses so the teacher can see class-wide priorities and individual signals immediately.</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-right">
            <strong className="block text-2xl">{completedPercent}%</strong>
            <span className="text-xs text-slate-300">{data.assignment.completedStudents}/{data.assignment.studentCount} students completed</span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-white/10 p-3"><span className="text-xs text-slate-300">Evidence Focuses</span><strong className="mt-1 block text-2xl">{data.assignment.focusCount}</strong></div>
          <div className="rounded-xl bg-white/10 p-3"><span className="text-xs text-slate-300">Teach-next signals</span><strong className="mt-1 block text-2xl">{urgentCount}</strong></div>
          <div className="rounded-xl bg-white/10 p-3"><span className="text-xs text-slate-300">Governed questions</span><strong className="mt-1 block text-2xl">{data.assignment.focusQuestionCount}/{data.assignment.questionCount}</strong></div>
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        {loading ? <div className="rounded-xl bg-cyan-50 p-4 text-sm font-semibold text-cyan-800">Refreshing diagnostic intelligence…</div> : null}

        <div>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div><span className="text-xs font-bold uppercase tracking-[.14em] text-rose-600">Priority radar</span><h4 className="text-lg font-bold text-slate-900">Start with the weakest class signals</h4></div>
            <span className="text-xs text-slate-500">Completed submissions only</span>
          </div>
          {priorities.length ? (
            <div className="grid gap-3 lg:grid-cols-3">
              {priorities.map((focus, index) => {
                const tone = focusTone(focus.accuracyPercent);
                return <article key={focus.evidenceFocusCode} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2"><span className="text-xs font-black text-slate-400">#{index + 1}</span><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${tone.chip}`}>{tone.label}</span></div>
                  <h5 className="mt-2 text-sm font-bold text-slate-900">{focus.evidenceFocusName}</h5>
                  <div className="mt-3 flex items-end justify-between"><strong className="text-3xl text-slate-900">{focus.accuracyPercent}%</strong><span className="text-xs text-slate-500">{focus.correctCount}/{focus.attempts} correct</span></div>
                </article>;
              })}
            </div>
          ) : <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No class-wide priority can be calculated until completed diagnostic submissions arrive.</div>}
        </div>

        <details className="group rounded-xl border border-slate-200 bg-white" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <div><span className="text-xs font-bold uppercase tracking-[.14em] text-indigo-600">Class focus map</span><h4 className="text-base font-bold text-slate-900">All {data.focuses.length} Evidence Focuses</h4></div>
            <span className="text-sm font-bold text-slate-500 group-open:rotate-180">⌄</span>
          </summary>
          <div className="grid gap-2 border-t border-slate-200 p-3 md:grid-cols-2">
            {[...data.focuses].sort((a, b) => a.orderIndex - b.orderIndex).map((focus) => {
              const tone = focusTone(focus.accuracyPercent);
              const width = Math.max(0, Math.min(100, focus.accuracyPercent || 0));
              return <div key={focus.evidenceFocusCode} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3"><div><span className="text-[10px] font-bold uppercase text-slate-400">Focus {focus.orderIndex}</span><p className="mt-0.5 text-sm font-semibold text-slate-800">{focus.evidenceFocusName}</p></div><span className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold ${tone.chip}`}>{tone.label}</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${width}%` }} /></div>
                <div className="mt-1.5 flex justify-between text-[11px] text-slate-500"><span>{focus.accuracyPercent == null ? 'Waiting for completed work' : `${focus.accuracyPercent}% accuracy`}</span><span>{focus.studentsAnswered} students</span></div>
              </div>;
            })}
          </div>
        </details>

        <div>
          <div className="mb-3"><span className="text-xs font-bold uppercase tracking-[.14em] text-cyan-700">Student snapshots</span><h4 className="text-base font-bold text-slate-900">Who needs a closer look?</h4></div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {data.students.map((student) => (
              <article key={student.studentId} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="min-w-0"><strong className="block truncate text-sm text-slate-900">{student.studentName}</strong><span className="text-xs text-slate-500">{student.completedAt ? `${student.needsCheckCount} needs check · ${student.correctSignalCount} correct signals` : 'Diagnostic not completed'}</span></div>
                {student.completedAt && onReviewStudent ? <button type="button" onClick={() => onReviewStudent(student.studentId)} className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50">Skill map</button> : <span className="text-xs font-semibold text-slate-400">Waiting</span>}
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>Screening rule:</strong> {data.disclosure.message}</div>
      </div>
    </section>
  );
};

export default DiagnosticIntelligencePanel;
