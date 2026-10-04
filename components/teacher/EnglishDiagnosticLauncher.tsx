import React, { useEffect, useMemo, useState } from 'react';
import {
  createEnglishDiagnostic,
  fetchEnglishDiagnosticLauncher,
  type CreateEnglishDiagnosticResult,
  type EnglishDiagnosticLauncher,
  type EnglishDiagnosticPreset,
  type EnglishDiagnosticPublishStatus,
} from '../../services/englishDiagnosticLauncherService';

interface EnglishDiagnosticLauncherProps {
  open: boolean;
  schoolId: string;
  groupId: string;
  groupName: string;
  onClose: () => void;
  onCreated?: (result: CreateEnglishDiagnosticResult) => void;
}

const toLocalInputValue = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const defaultDueAt = () => {
  const due = new Date();
  due.setDate(due.getDate() + 7);
  due.setHours(23, 59, 0, 0);
  return toLocalInputValue(due);
};

const defaultScheduledAt = () => {
  const scheduled = new Date();
  scheduled.setHours(scheduled.getHours() + 1, 0, 0, 0);
  return toLocalInputValue(scheduled);
};

const toIsoOrNull = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const difficultyLabel = (preset: EnglishDiagnosticPreset) => (
  preset.difficultyBreakdown
    .map((item) => `${item.count} ${item.level}`)
    .join(' · ')
);

const EnglishDiagnosticLauncher: React.FC<EnglishDiagnosticLauncherProps> = ({
  open,
  schoolId,
  groupId,
  groupName,
  onClose,
  onCreated,
}) => {
  const [blueprint, setBlueprint] = useState<EnglishDiagnosticLauncher | null>(null);
  const [selectedPresetKey, setSelectedPresetKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [publishStatus, setPublishStatus] = useState<EnglishDiagnosticPublishStatus>('published');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledAt);
  const [dueAt, setDueAt] = useState(defaultDueAt);
  const [notifyStudents, setNotifyStudents] = useState(false);
  const [closeAfterDue, setCloseAfterDue] = useState(true);
  const [created, setCreated] = useState<CreateEnglishDiagnosticResult | null>(null);

  useEffect(() => {
    if (!open || !schoolId || !groupId) return;
    let active = true;
    setLoading(true);
    setError('');
    setCreated(null);
    setBlueprint(null);
    setTitleTouched(false);
    setPublishStatus('published');
    setScheduledAt(defaultScheduledAt());
    setDueAt(defaultDueAt());
    setNotifyStudents(false);
    setCloseAfterDue(true);

    fetchEnglishDiagnosticLauncher(schoolId, groupId)
      .then((result) => {
        if (!active) return;
        setBlueprint(result);
        const defaultPreset = result.presets.find((preset) => preset.recommended) || result.presets[0];
        setSelectedPresetKey(defaultPreset?.key || '');
        setTitle(defaultPreset ? `${defaultPreset.name} · ${result.group.name}` : '');
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'English diagnostic options could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [groupId, open, schoolId]);

  const selectedPreset = useMemo(
    () => blueprint?.presets.find((preset) => preset.key === selectedPresetKey) || null,
    [blueprint, selectedPresetKey],
  );

  useEffect(() => {
    if (!selectedPreset || titleTouched) return;
    setTitle(`${selectedPreset.name} · ${blueprint?.group.name || groupName}`);
  }, [blueprint?.group.name, groupName, selectedPreset, titleTouched]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !creating) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [creating, onClose, open]);

  if (!open) return null;

  const handleCreate = async () => {
    if (!selectedPreset || !blueprint) return;
    setError('');

    if (!title.trim()) {
      setError('Give this diagnostic a clear title before continuing.');
      return;
    }

    const assignedIso = publishStatus === 'scheduled'
      ? toIsoOrNull(scheduledAt)
      : new Date().toISOString();
    const dueIso = toIsoOrNull(dueAt);

    if (publishStatus === 'scheduled' && !assignedIso) {
      setError('Choose when the scheduled diagnostic should become available.');
      return;
    }
    if (publishStatus === 'scheduled' && assignedIso && new Date(assignedIso).getTime() <= Date.now()) {
      setError('Scheduled publication must be in the future.');
      return;
    }
    if (dueIso && assignedIso && new Date(dueIso).getTime() <= new Date(assignedIso).getTime()) {
      setError('The due date must be later than the diagnostic start time.');
      return;
    }

    setCreating(true);
    try {
      const result = await createEnglishDiagnostic({
        schoolId,
        groupId,
        presetKey: selectedPreset.key,
        title,
        publishStatus,
        assignedAt: assignedIso,
        dueAt: dueIso,
        notifyStudentsByEmail: notifyStudents,
        closeSubmissionsAfterDue: closeAfterDue,
        clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      });
      setCreated(result);
      onCreated?.(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The English diagnostic could not be created.');
    } finally {
      setCreating(false);
    }
  };

  const actionLabel = publishStatus === 'draft'
    ? 'Save diagnostic draft'
    : publishStatus === 'scheduled'
      ? 'Schedule diagnostic'
      : 'Publish diagnostic';

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="english-diagnostic-launcher-title"
    >
      <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-[28px] border border-white/15 bg-slate-50 shadow-2xl">
        <div className="relative overflow-hidden rounded-t-[28px] bg-gradient-to-br from-slate-950 via-blue-950 to-violet-950 px-5 py-6 text-white sm:px-7">
          <div className="absolute -right-16 -top-20 h-60 w-60 rounded-full bg-cyan-400/15 blur-3xl" aria-hidden="true" />
          <div className="absolute -bottom-24 left-1/3 h-60 w-60 rounded-full bg-pink-500/10 blur-3xl" aria-hidden="true" />
          <div className="relative flex items-start justify-between gap-5">
            <div className="max-w-3xl">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200">Independent assessment</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-blue-100">Fresh form · balanced answers</span>
              </div>
              <h2 id="english-diagnostic-launcher-title" className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Create English Diagnostic</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100/80">
                Build a fresh governed English language-use diagnostic for {blueprint?.group.name || groupName}. Brains Heist selects verified questions, avoids recent repeats where possible, and balances A/B/C/D automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={creating}
              aria-label="Close English diagnostic launcher"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-black text-white hover:bg-white/10 disabled:opacity-50"
            >
              ✕
            </button>
          </div>

          <div className="relative mt-5 grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-300">Teaching group</span>
              <strong className="mt-1 block text-sm">{blueprint?.group.name || groupName}</strong>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-300">Students</span>
              <strong className="mt-1 block text-sm">{blueprint?.group.studentCount ?? '—'} in current roster</strong>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-300">Form policy</span>
              <strong className="mt-1 block text-sm">Fresh set + recent-repeat avoidance</strong>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-600" />
            <p className="mt-3 text-sm font-semibold text-slate-500">Loading governed English diagnostic blueprints…</p>
          </div>
        ) : created ? (
          <div className="p-6 sm:p-8">
            <div className="mx-auto max-w-2xl rounded-3xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-2xl" aria-hidden="true">✓</div>
              <span className="mt-4 block text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Fresh diagnostic created</span>
              <h3 className="mt-1 text-2xl font-black text-slate-950">{created.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {created.questionCount} governed questions are assigned to {created.studentCount} students. The form uses a balanced answer-position pattern and remains immutable after creation.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-3"><strong className="block text-xl text-slate-950">{created.questionCount}</strong><span className="text-xs text-slate-500">questions</span></div>
                <div className="rounded-2xl bg-slate-50 p-3"><strong className="block text-xl text-slate-950">{created.studentCount}</strong><span className="text-xs text-slate-500">students</span></div>
                <div className="rounded-2xl bg-slate-50 p-3"><strong className="block text-sm capitalize text-slate-950">{created.publishStatus}</strong><span className="text-xs text-slate-500">status</span></div>
              </div>
              <button type="button" onClick={onClose} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800">Done</button>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 p-5 sm:p-7 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <section>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <span className="text-xs font-black uppercase tracking-[0.15em] text-cyan-700">1 · Choose evidence depth</span>
                    <h3 className="mt-1 text-xl font-black text-slate-950">How much evidence do you need?</h3>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">Each launch creates a fresh equivalent form</span>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  {(blueprint?.presets || []).map((preset) => {
                    const selected = preset.key === selectedPresetKey;
                    return (
                      <button
                        type="button"
                        key={preset.key}
                        onClick={() => {
                          setSelectedPresetKey(preset.key);
                          setTitleTouched(false);
                        }}
                        className={`relative rounded-2xl border p-4 text-left transition ${selected ? 'border-cyan-500 bg-cyan-50 shadow-md ring-2 ring-cyan-100' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'}`}
                        aria-pressed={selected}
                      >
                        {preset.recommended ? <span className="absolute right-3 top-3 rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">Recommended</span> : null}
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-700">{preset.questionCount} questions · ~{preset.estimatedMinutes} min</span>
                        <strong className="mt-2 block pr-12 text-base text-slate-950">{preset.shortName}</strong>
                        <p className="mt-2 text-xs leading-5 text-slate-500">{preset.description}</p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {selectedPreset ? (
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <span className="text-xs font-black uppercase tracking-[0.15em] text-violet-700">2 · Measurement preview</span>
                      <h3 className="mt-1 text-xl font-black text-slate-950">{selectedPreset.name}</h3>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{selectedPreset.questionCount} questions · ~{selectedPreset.estimatedMinutes} min</span>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <span className="text-xs font-bold text-slate-600">Difficulty mix</span>
                      <strong className="mt-1 block text-sm text-slate-950">{difficultyLabel(selectedPreset)}</strong>
                      <p className="mt-2 text-xs leading-5 text-slate-500">Question selection is spread across skills before repeating the same skill where possible.</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <span className="text-xs font-bold text-emerald-700">Answer-position quality gate</span>
                      <strong className="mt-1 block text-sm text-slate-950">Balanced A/B/C/D automatically</strong>
                      <p className="mt-2 text-xs leading-5 text-slate-600">Correct positions differ by at most one and never repeat three times in a row.</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <span className="text-xs font-bold text-blue-700">What this diagnostic measures</span>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{selectedPreset.coverageNote}</p>
                    {selectedPreset.notDirectlyAssessed.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedPreset.notDirectlyAssessed.map((item) => (
                          <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">Not directly assessed · {item}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="text-xs font-black uppercase tracking-[0.15em] text-cyan-700">3 · Publish</span>
                <h3 className="mt-1 text-xl font-black text-slate-950">Set the classroom experience</h3>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="md:col-span-2">
                    <span className="mb-1.5 block text-xs font-bold text-slate-600">Diagnostic title</span>
                    <input
                      value={title}
                      onChange={(event) => {
                        setTitle(event.target.value);
                        setTitleTouched(true);
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-500"
                    />
                  </label>

                  <div className="md:col-span-2">
                    <span className="mb-1.5 block text-xs font-bold text-slate-600">Availability</span>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {([
                        ['published', 'Publish now', 'Students can start immediately'],
                        ['scheduled', 'Schedule', 'Open at a chosen time'],
                        ['draft', 'Save draft', 'Prepare without releasing'],
                      ] as const).map(([value, label, helper]) => (
                        <button
                          type="button"
                          key={value}
                          onClick={() => setPublishStatus(value)}
                          className={`rounded-xl border p-3 text-left ${publishStatus === value ? 'border-cyan-500 bg-cyan-50 ring-2 ring-cyan-100' : 'border-slate-200 bg-slate-50'}`}
                          aria-pressed={publishStatus === value}
                        >
                          <strong className="block text-sm text-slate-900">{label}</strong>
                          <span className="mt-1 block text-[11px] leading-4 text-slate-500">{helper}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {publishStatus === 'scheduled' ? (
                    <label>
                      <span className="mb-1.5 block text-xs font-bold text-slate-600">Opens</span>
                      <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500" />
                    </label>
                  ) : null}

                  <label className={publishStatus === 'scheduled' ? '' : 'md:col-span-2'}>
                    <span className="mb-1.5 block text-xs font-bold text-slate-600">Due</span>
                    <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500" />
                  </label>

                  <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <input type="checkbox" checked={closeAfterDue} onChange={(event) => setCloseAfterDue(event.target.checked)} className="mt-1 h-4 w-4" />
                    <span><strong className="block text-sm text-slate-800">Close after due date</strong><span className="text-xs leading-5 text-slate-500">Prevent late submissions after the deadline.</span></span>
                  </label>

                  <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <input type="checkbox" checked={notifyStudents} onChange={(event) => setNotifyStudents(event.target.checked)} className="mt-1 h-4 w-4" />
                    <span><strong className="block text-sm text-slate-800">Notify students by email</strong><span className="text-xs leading-5 text-slate-500">Use the existing assignment notification workflow.</span></span>
                  </label>
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-cyan-50 p-5">
                <span className="text-xs font-black uppercase tracking-[0.15em] text-emerald-700">Evidence contract</span>
                <h3 className="mt-1 text-lg font-black text-slate-950">Designed for trustworthy follow-up</h3>
                <div className="mt-4 space-y-3 text-xs leading-5 text-slate-700">
                  <p><strong className="text-slate-950">✓ Verified bank only.</strong> The form uses current governed Brains Heist questions.</p>
                  <p><strong className="text-slate-950">✓ Fresh form.</strong> Recent questions from this teaching group are deprioritized for 90 days where the bank allows it.</p>
                  <p><strong className="text-slate-950">✓ Balanced answer positions.</strong> No all-A or A/B-heavy key can pass the diagnostic quality gate.</p>
                  <p><strong className="text-slate-950">✓ Longitudinal evidence.</strong> Results feed Curriculum Intelligence without pretending one test proves mastery.</p>
                </div>
              </section>

              <section className="rounded-3xl border border-blue-200 bg-blue-950 p-5 text-white">
                <span className="text-xs font-black uppercase tracking-[0.15em] text-blue-300">English scope</span>
                <p className="mt-3 text-xs leading-5 text-blue-100/80">
                  This launcher diagnoses English language knowledge and applied language use. Speaking, listening and extended writing should be assessed through their own direct tasks before making a complete English-profile judgement.
                </p>
              </section>

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800" role="alert">
                  <strong className="block">Could not continue</strong>
                  {error}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating || !selectedPreset || !blueprint?.presets.length}
                className="w-full rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? 'Creating fresh governed form…' : actionLabel}
              </button>
              <p className="text-center text-[11px] leading-5 text-slate-500">
                {selectedPreset ? `${selectedPreset.questionCount} questions · ${blueprint?.group.studentCount || 0} students · balanced independent assessment` : 'Choose a diagnostic preset to continue.'}
              </p>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnglishDiagnosticLauncher;
