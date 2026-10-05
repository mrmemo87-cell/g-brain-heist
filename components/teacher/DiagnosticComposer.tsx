import React, { useEffect, useMemo, useState } from 'react';
import type { SchoolSubjectGroup } from '../../services/schoolSubjectGroupService';
import {
  composeDiagnostic,
  fetchDiagnosticComposerCapabilities,
  type DiagnosticComposerCapabilities,
  type PreparedDiagnostic,
} from '../../services/diagnosticComposerService';

interface DiagnosticComposerProps {
  open: boolean;
  schoolId: string;
  teachingGroups: SchoolSubjectGroup[];
  initialGroupId?: string | null;
  onClose: () => void;
  onPrepared: (diagnostic: PreparedDiagnostic) => void;
}

const reasonCopy = (reason?: string | null) => {
  if (reason === 'academic_context_incomplete') {
    return 'This teaching group is missing academic subject, grade, or academic-year context. Ask the school administrator to complete the group setup.';
  }
  if (reason === 'governed_pool_too_narrow') {
    return 'There are enough questions by count, but not enough distinct mapped skills or difficulty levels to call the result a trustworthy diagnostic yet.';
  }
  return 'Brains Heist does not yet have enough current, governed, grade-eligible questions to build a trustworthy diagnostic for this group.';
};

const DiagnosticComposer: React.FC<DiagnosticComposerProps> = ({
  open,
  schoolId,
  teachingGroups,
  initialGroupId,
  onClose,
  onPrepared,
}) => {
  const [groupId, setGroupId] = useState('');
  const [capabilities, setCapabilities] = useState<DiagnosticComposerCapabilities | null>(null);
  const [questionCount, setQuestionCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');

  const sortedGroups = useMemo(
    () => [...teachingGroups].sort((a, b) => (
      a.schoolSubjectName.localeCompare(b.schoolSubjectName)
      || Number(a.gradeLevel) - Number(b.gradeLevel)
      || a.name.localeCompare(b.name)
    )),
    [teachingGroups],
  );

  useEffect(() => {
    if (!open) return;
    const preferred = initialGroupId && sortedGroups.some((group) => group.id === initialGroupId)
      ? initialGroupId
      : sortedGroups[0]?.id || '';
    setGroupId(preferred);
    setCapabilities(null);
    setQuestionCount(null);
    setError('');
  }, [initialGroupId, open, sortedGroups]);

  useEffect(() => {
    if (!open || !schoolId || !groupId) return;
    let active = true;
    setLoading(true);
    setCapabilities(null);
    setQuestionCount(null);
    setError('');

    fetchDiagnosticComposerCapabilities(schoolId, groupId)
      .then((result) => {
        if (!active) return;
        setCapabilities(result);
        const recommended = result.depths.find((depth) => depth.recommended) || result.depths[0];
        setQuestionCount(recommended?.questionCount || null);
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'Diagnostic options could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [groupId, open, schoolId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !preparing) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open, preparing]);

  if (!open) return null;

  const selectedGroup = sortedGroups.find((group) => group.id === groupId) || null;
  const selectedDepth = capabilities?.depths.find((depth) => depth.questionCount === questionCount) || null;

  const handlePrepare = async () => {
    if (!questionCount || !capabilities?.ready || !groupId) return;
    setPreparing(true);
    setError('');
    try {
      const diagnostic = await composeDiagnostic(schoolId, groupId, questionCount);
      onPrepared(diagnostic);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The diagnostic could not be prepared.');
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="diagnostic-composer-title"
    >
      <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-[28px] border border-white/15 bg-slate-50 shadow-2xl">
        <header className="relative overflow-hidden rounded-t-[28px] bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-950 px-5 py-6 text-white sm:px-7">
          <div className="absolute -right-16 -top-20 h-60 w-60 rounded-full bg-cyan-400/15 blur-3xl" aria-hidden="true" />
          <div className="relative flex items-start justify-between gap-5">
            <div className="max-w-3xl">
              <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200">
                Governed diagnostic composer
              </span>
              <h2 id="diagnostic-composer-title" className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
                Prepare a diagnostic
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100/80">
                Choose the teaching group and evidence depth. Brains Heist will prepare a fresh, grade-eligible question set, then open the normal Assignment Wizard with everything already selected for teacher review.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={preparing}
              aria-label="Close diagnostic composer"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-black text-white hover:bg-white/10 disabled:opacity-50"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="text-xs font-black uppercase tracking-[0.15em] text-cyan-700">1 · Teaching group</span>
              <h3 className="mt-1 text-xl font-black text-slate-950">Who is this diagnostic for?</h3>
              <select
                value={groupId}
                onChange={(event) => setGroupId(event.target.value)}
                className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-500"
                aria-label="Choose teaching group"
              >
                {sortedGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.schoolSubjectName} · Grade {group.gradeLevel} · {group.name} · {group.studentCount} students
                  </option>
                ))}
              </select>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="text-xs font-black uppercase tracking-[0.15em] text-violet-700">2 · Evidence depth</span>
              <h3 className="mt-1 text-xl font-black text-slate-950">How much evidence do you need?</h3>

              {loading ? (
                <div className="py-10 text-center">
                  <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-600" />
                  <p className="mt-3 text-sm font-semibold text-slate-500">Checking the governed question pool…</p>
                </div>
              ) : capabilities?.ready ? (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {capabilities.depths.map((depth) => {
                      const selected = depth.questionCount === questionCount;
                      return (
                        <button
                          key={depth.questionCount}
                          type="button"
                          onClick={() => setQuestionCount(depth.questionCount)}
                          aria-pressed={selected}
                          className={`relative rounded-2xl border p-4 text-left transition ${selected ? 'border-cyan-500 bg-cyan-50 ring-2 ring-cyan-100' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
                        >
                          {depth.recommended ? (
                            <span className="absolute right-3 top-3 rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                              Recommended
                            </span>
                          ) : null}
                          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-700">
                            {depth.questionCount} questions · ~{depth.estimatedMinutes} min
                          </span>
                          <strong className="mt-2 block pr-20 text-base text-slate-950">{depth.name}</strong>
                          <p className="mt-2 text-xs leading-5 text-slate-500">{depth.description}</p>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Eligible pool</span>
                      <strong className="mt-1 block text-2xl text-slate-950">{capabilities.pool?.eligibleQuestions || 0}</strong>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Skills represented</span>
                      <strong className="mt-1 block text-2xl text-slate-950">{capabilities.pool?.distinctSkills || 0}</strong>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Not used recently</span>
                      <strong className="mt-1 block text-2xl text-slate-950">{capabilities.pool?.notRecentlyUsed || 0}</strong>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <strong className="text-sm text-amber-900">Diagnostic not ready for this teaching group</strong>
                  <p className="mt-2 text-sm leading-6 text-amber-800">{reasonCopy(capabilities?.reason)}</p>
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-cyan-50 p-5">
              <span className="text-xs font-black uppercase tracking-[0.15em] text-emerald-700">Quality contract</span>
              <h3 className="mt-1 text-lg font-black text-slate-950">Prepared, not auto-published</h3>
              <div className="mt-4 space-y-3 text-xs leading-5 text-slate-700">
                <p><strong className="text-slate-950">✓ Verified only.</strong> Current Brains Heist governed questions for the exact subject and grade.</p>
                <p><strong className="text-slate-950">✓ Fresh form.</strong> Questions used by this teaching group in the last 90 days are deprioritized where alternatives exist.</p>
                <p><strong className="text-slate-950">✓ Broad coverage.</strong> Each available depth must pass minimum skill and difficulty diversity before Brains Heist offers it.</p>
                <p><strong className="text-slate-950">✓ Balanced answer positions.</strong> A/B/C/D ordering is materialized safely in the assignment snapshot without changing canonical content.</p>
                <p><strong className="text-slate-950">✓ Teacher remains in control.</strong> The next screen is the normal Assignment Wizard, not an automatic publish action.</p>
              </div>
            </section>

            {selectedGroup && selectedDepth ? (
              <section className="rounded-3xl border border-blue-200 bg-blue-950 p-5 text-white">
                <span className="text-xs font-black uppercase tracking-[0.15em] text-blue-300">Next</span>
                <strong className="mt-2 block text-base">{selectedGroup.schoolSubjectName} · {selectedGroup.name}</strong>
                <p className="mt-2 text-xs leading-5 text-blue-100/80">
                  Prepare {selectedDepth.questionCount} questions, then review the exact questions, title, instructions, due date, scheduling, and student notification settings in Assignment Wizard.
                </p>
              </section>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800" role="alert">
                <strong className="block">Could not continue</strong>
                {error}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void handlePrepare()}
              disabled={preparing || loading || !capabilities?.ready || !questionCount}
              className="w-full rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {preparing ? 'Preparing governed form…' : 'Prepare in Assignment Wizard →'}
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default DiagnosticComposer;
