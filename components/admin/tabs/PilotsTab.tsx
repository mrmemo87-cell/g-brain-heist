import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../services/supabaseClient';
import {
  createSchoolDocumentId,
  escapeSchoolDocumentHtml,
  openSchoolDocumentPreview,
  schoolDocumentFileName,
} from '../../../src/lib/schoolDocument';

// Superadmin view of measured school pilots (see supabase/migrations/20261103200000_pilot_studies.sql).
// A pilot study is only a measurement window: it never changes a school's plan or trial date.
// Cohort = students who completed a baseline assignment (+ any extra student ids).
// Activity = completed work only; logins and PvP don't count.

export interface PilotMetrics {
  study: {
    id: string; school_id: string; school_name: string; name: string; starts_on: string; ends_on: string; notes: string | null;
    baseline_assignment_ids: string[]; endline_assignment_ids: string[]; extra_student_ids: string[]; group_ids: string[];
    current_week: number; total_weeks: number; finished: boolean;
  };
  cohort_n: number;
  weekly: Array<{ week: number; week_start: string; complete: boolean; active: number; questions: number; completions: number }>;
  latest_complete_week: { week: number; active: number; work_per_active: number | null } | null;
  return: { base_n: number; week_1: number; week_4: number; week_1_mature: boolean; week_4_mature: boolean };
  interventions: { started: number; with_outcome: number; improved: number; open: number };
  scores: {
    baseline_n: number; endline_n: number; paired_n: number; baseline_mean: number | null; endline_mean: number | null;
    mean_change: number | null; improved_n: number;
  };
  groups: Array<{ id: string; name: string; n: number; active_latest: number; baseline_n: number; paired_n: number; mean_change: number | null }>;
  min_n: number;
}
interface GroupOption { id: string; name: string; group_type: string; students: number }
interface SchoolOption { id: string; name: string; plan: string | null }
interface AssignmentOption { id: string; title: string; created_at: string; completed_n: number }

const pct = (num: number, den: number, minN: number): string => (den < minN ? 'Too few students' : `${Math.round((num / den) * 100)}%`);
const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export const pilotHeadline = (m: PilotMetrics) => {
  const latest = m.latest_complete_week;
  return {
    weeklyActive: latest ? pct(latest.active, m.cohort_n, m.min_n) : 'No full week yet',
    returnW1: m.return.week_1_mature ? pct(m.return.week_1, m.return.base_n, m.min_n) : 'Not yet',
    returnW4: m.return.week_4_mature ? pct(m.return.week_4, m.return.base_n, m.min_n) : 'Not yet',
    work: latest?.work_per_active != null ? `${latest.work_per_active}` : '—',
    interventions: `${m.interventions.started}`,
    success: m.interventions.with_outcome ? pct(m.interventions.improved, m.interventions.with_outcome, 1) : 'No outcomes yet',
    scoreChange: m.scores.paired_n === 0 ? 'No endline yet'
      : m.scores.paired_n < m.min_n ? 'Too few students'
      : `${m.scores.mean_change! > 0 ? '+' : ''}${m.scores.mean_change} pts`,
  };
};

const lowEngagement = (m: PilotMetrics) => {
  const done = m.weekly.filter((w) => w.complete).slice(-2);
  return m.cohort_n >= m.min_n && done.length === 2 && done.every((w) => w.active / m.cohort_n < 0.5);
};

const WeeklyBars: React.FC<{ m: PilotMetrics }> = ({ m }) => {
  const n = Math.max(1, m.cohort_n);
  return (
    <div className="flex items-end gap-2 h-40" role="img" aria-label="Weekly active students as a share of the cohort">
      {m.weekly.map((w) => {
        const share = w.active / n;
        return (
          <div key={w.week} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
            <span className="text-[11px] text-slate-300 mb-1">{Math.round(share * 100)}%</span>
            <div className={`w-full rounded-t ${w.complete ? 'bg-cyan-400/80' : 'bg-cyan-400/30'}`} style={{ height: `${Math.max(2, share * 100)}%` }} />
            <span className="text-[11px] text-slate-400 mt-1">W{w.week}</span>
          </div>
        );
      })}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; note?: string }> = ({ label, value, note }) => (
  <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
    <p className="text-xs text-slate-400">{label}</p>
    <p className="text-2xl font-bold text-white mt-1">{value}</p>
    {note && <p className="text-[11px] text-slate-500 mt-1">{note}</p>}
  </div>
);

const buildSummaryHtml = (m: PilotMetrics) => {
  const h = pilotHeadline(m);
  const e = escapeSchoolDocumentHtml;
  const rows = m.weekly.map((w) => `<tr><td>Week ${w.week}${w.complete ? '' : ' (in progress)'}</td><td>${w.active} of ${m.cohort_n}</td><td>${m.cohort_n ? Math.round((w.active / m.cohort_n) * 100) : 0}%</td><td>${w.questions}</td><td>${w.completions}</td></tr>`).join('');
  const scoreLine = m.scores.paired_n
    ? `${m.scores.paired_n} students took both tests. Average score moved from ${m.scores.baseline_mean}% to ${m.scores.endline_mean}% (${h.scoreChange}); ${m.scores.improved_n} of ${m.scores.paired_n} improved.`
    : `${m.scores.baseline_n} students took the baseline test. The endline test has not been taken yet.`;
  return `
    <h2>Pilot overview</h2>
    <p>${e(m.study.name)} · ${e(fmtDate(m.study.starts_on))} – ${e(fmtDate(m.study.ends_on))} · ${m.cohort_n} students · week ${m.study.current_week} of ${m.study.total_weeks}</p>
    <table><tbody>
      <tr><th>Weekly active (latest full week)</th><td>${e(h.weeklyActive)}</td></tr>
      <tr><th>Still active in week 2</th><td>${e(h.returnW1)}</td></tr>
      <tr><th>Still active in week 5</th><td>${e(h.returnW4)}</td></tr>
      <tr><th>Questions + tasks per active student per week</th><td>${e(h.work)}</td></tr>
      <tr><th>Interventions started</th><td>${e(h.interventions)}</td></tr>
      <tr><th>Interventions improved or resolved</th><td>${e(h.success)}</td></tr>
      <tr><th>Score change, baseline → endline</th><td>${e(h.scoreChange)}</td></tr>
    </tbody></table>
    <h2>Progress</h2><p>${e(scoreLine)}</p>
    ${m.groups.length ? `<h2>By class</h2><table><thead><tr><th>Class</th><th>Students</th><th>Active (latest full week)</th><th>Took baseline</th><th>Score change</th></tr></thead><tbody>${m.groups.map((g) => `<tr><td>${e(g.name)}</td><td>${g.n}</td><td>${g.active_latest}</td><td>${g.baseline_n}</td><td>${g.paired_n ? `${g.mean_change! > 0 ? '+' : ''}${g.mean_change} pts (n=${g.paired_n})` : '—'}</td></tr>`).join('')}</tbody></table>` : ''}
    <h2>Week by week</h2>
    <table><thead><tr><th>Week</th><th>Active students</th><th>Share</th><th>Questions answered</th><th>Tasks completed</th></tr></thead><tbody>${rows}</tbody></table>
    <p><small>Active = completed at least one question, assignment or quiz that week. Logins and game battles are not counted. Percentages are hidden when fewer than ${m.min_n} students are measured.</small></p>`;
};

export const openPilotSummary = (m: PilotMetrics) => {
  const generatedAt = new Date().toISOString();
  openSchoolDocumentPreview({
    meta: {
      documentId: createSchoolDocumentId('pilot'),
      templateVersion: 'pilot-summary-v1',
      documentTypeLabel: 'Pilot summary',
      title: `${m.study.name} — pilot summary`,
      subtitle: 'Brains Heist pilot · engagement and progress',
      schoolName: m.study.school_name,
      audience: 'internal',
      status: m.study.finished ? 'final' : 'draft',
      confidentiality: 'school-use',
      generatedAt,
      generatedBy: 'Brains Heist',
      schoolId: m.study.school_id,
      sourceType: 'pilot_study',
      sourceId: m.study.id,
    },
    bodyHtml: buildSummaryHtml(m),
    fileName: schoolDocumentFileName(m.study.school_name, 'pilot-summary', generatedAt.slice(0, 10)),
  });
};

interface FormState {
  id: string | null; school_id: string; name: string; starts_on: string; ends_on: string;
  baseline: string[]; endline: string[]; groups: string[]; notes: string;
}
const emptyForm = (): FormState => {
  const today = new Date().toISOString().slice(0, 10);
  return { id: null, school_id: '', name: '', starts_on: today, ends_on: addDays(today, 55), baseline: [], endline: [], groups: [], notes: '' };
};

const PilotsTab: React.FC = () => {
  const [studies, setStudies] = useState<PilotMetrics[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [assignments, setAssignments] = useState<AssignmentOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const { data, error: err } = await supabase.rpc('admin_list_pilot_metrics');
    if (err) setError(err.message);
    else { setStudies((data?.studies ?? []) as PilotMetrics[]); setSchools((data?.schools ?? []) as SchoolOption[]); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!form?.school_id) { setAssignments([]); setGroups([]); return; }
    let active = true;
    supabase.rpc('admin_list_school_assignments_for_pilot', { p_school_id: form.school_id }).then(({ data }) => {
      if (active) setAssignments((data ?? []) as AssignmentOption[]);
    });
    supabase.rpc('admin_list_school_groups_for_pilot', { p_school_id: form.school_id }).then(({ data }) => {
      if (active) setGroups(((data ?? []) as GroupOption[]).filter((g) => g.students > 0));
    });
    return () => { active = false; };
  }, [form?.school_id]);

  const open = useMemo(() => studies.find((s) => s.study.id === openId) ?? null, [studies, openId]);

  const edit = (m: PilotMetrics) => setForm({
    id: m.study.id, school_id: m.study.school_id, name: m.study.name, starts_on: m.study.starts_on, ends_on: m.study.ends_on,
    baseline: m.study.baseline_assignment_ids, endline: m.study.endline_assignment_ids, groups: m.study.group_ids ?? [], notes: m.study.notes ?? '',
  });

  const save = async () => {
    if (!form || saving) return;
    if (!form.school_id || !form.name.trim()) { setError('Choose a school and give the pilot a name.'); return; }
    if (form.ends_on <= form.starts_on) { setError('The end date must be after the start date.'); return; }
    setSaving(true); setError('');
    const { error: err } = await supabase.rpc('admin_upsert_pilot_study', {
      p_school_id: form.school_id, p_name: form.name.trim(), p_starts_on: form.starts_on, p_ends_on: form.ends_on,
      p_baseline_assignment_ids: form.baseline, p_endline_assignment_ids: form.endline,
      p_extra_student_ids: studies.find((s) => s.study.id === form.id)?.study.extra_student_ids ?? [],
      p_notes: form.notes, p_study_id: form.id, p_group_ids: form.groups,
    });
    setSaving(false);
    if (err) { setError(err.message === 'ASSIGNMENT_NOT_IN_SCHOOL' ? 'Every test must belong to the chosen school.' : err.message === 'GROUP_NOT_IN_SCHOOL' ? 'Every class must belong to the chosen school.' : err.message); return; }
    setForm(null); void load();
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this pilot? Student data is not affected; only the pilot record is removed.')) return;
    const { error: err } = await supabase.rpc('admin_delete_pilot_study', { p_study_id: id });
    if (err) setError(err.message); else { setOpenId(null); void load(); }
  };

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const input = 'bg-slate-900/70 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm w-full';

  return (
    <div className="space-y-6">
      <div className="card-glass p-6 border-2 border-cyan-400/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-2xl font-heading font-bold text-cyan-300">Pilots</h3>
            <p className="text-sm text-slate-400">Measured school pilots: weekly engagement, return rates, interventions and baseline → endline scores. Setting up a pilot never changes a school's plan.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void load()} className="px-3 py-2 rounded-lg border border-slate-600 text-sm text-slate-200">Refresh</button>
            <button type="button" onClick={() => setForm(emptyForm())} className="px-3 py-2 rounded-lg bg-cyan-500 text-slate-950 text-sm font-semibold">New pilot</button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}
      </div>

      {form && (
        <div className="card-glass p-6 border border-slate-600 space-y-4">
          <h4 className="text-lg font-bold text-white">{form.id ? 'Edit pilot' : 'New pilot'}</h4>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-300">School
              <select className={input} value={form.school_id} onChange={(e) => setForm({ ...form, school_id: e.target.value, baseline: [], endline: [], groups: [] })}>
                <option value="">Choose a school…</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}{s.plan ? ` (${s.plan})` : ''}</option>)}
              </select>
            </label>
            <label className="text-sm text-slate-300">Pilot name
              <input className={input} value={form.name} maxLength={120} placeholder="e.g. Grade 7 ESL autumn pilot" onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="text-sm text-slate-300">Start date (can be in the past, e.g. the diagnostic date)
              <input type="date" className={input} value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} />
            </label>
            <label className="text-sm text-slate-300">End date
              <div className="flex gap-2">
                <input type="date" className={input} value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} />
                <button type="button" className="px-3 rounded-lg border border-slate-600 text-xs text-slate-200 whitespace-nowrap" onClick={() => setForm({ ...form, ends_on: addDays(form.starts_on, 55) })}>8 weeks</button>
              </div>
            </label>
          </div>
          {form.school_id && (
            <fieldset className="rounded-xl border border-slate-700 p-3 max-h-64 overflow-y-auto">
              <legend className="px-1 text-sm font-semibold text-slate-200">Classes and groups in the pilot (every student in them is measured)</legend>
              {groups.length === 0 && <p className="text-xs text-slate-500">No classes with students found. Without classes, the cohort is whoever took a baseline test.</p>}
              <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                {groups.map((g) => (
                  <label key={g.id} className="flex items-center gap-2 py-1 text-sm text-slate-300">
                    <input type="checkbox" checked={form.groups.includes(g.id)} onChange={() => setForm({ ...form, groups: toggle(form.groups, g.id) })} />
                    <span>{g.name} <span className="text-slate-500">· {g.students} students</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {form.school_id && (
            <div className="grid gap-4 md:grid-cols-2">
              {(['baseline', 'endline'] as const).map((key) => (
                <fieldset key={key} className="rounded-xl border border-slate-700 p-3 max-h-64 overflow-y-auto">
                  <legend className="px-1 text-sm font-semibold text-slate-200">{key === 'baseline' ? 'Baseline tests (start of pilot)' : 'Endline tests (same students, similar difficulty)'}</legend>
                  {assignments.length === 0 && <p className="text-xs text-slate-500">No assignments found for this school.</p>}
                  {assignments.map((a) => (
                    <label key={a.id} className="flex items-start gap-2 py-1 text-sm text-slate-300">
                      <input type="checkbox" checked={form[key].includes(a.id)} onChange={() => setForm({ ...form, [key]: toggle(form[key], a.id) })} />
                      <span>{a.title} <span className="text-slate-500">· {fmtDate(a.created_at.slice(0, 10))} · {a.completed_n} completed</span></span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          )}
          <label className="block text-sm text-slate-300">Notes
            <textarea className={input} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={() => void save()} className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 text-sm font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save pilot'}</button>
            <button type="button" onClick={() => setForm(null)} className="px-4 py-2 rounded-lg border border-slate-600 text-sm text-slate-200">Cancel</button>
          </div>
        </div>
      )}

      <div className="card-glass p-0 overflow-x-auto border border-slate-700">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-400 border-b border-slate-700">
            <tr>{['School / pilot', 'Week', 'Students', 'Weekly active', 'Week-5 return', 'Interventions improved', 'Score change'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-6 text-slate-400">Loading pilots…</td></tr>}
            {!loading && studies.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-slate-400">No pilots yet. Create one to start measuring.</td></tr>}
            {studies.map((m) => {
              const h = pilotHeadline(m);
              return (
                <tr key={m.study.id} onClick={() => setOpenId(m.study.id === openId ? null : m.study.id)}
                  className={`border-b border-slate-800 cursor-pointer hover:bg-slate-800/40 ${lowEngagement(m) ? 'bg-amber-500/10' : ''}`}>
                  <td className="px-4 py-3"><p className="font-semibold text-white">{m.study.school_name}</p><p className="text-xs text-slate-400">{m.study.name}</p></td>
                  <td className="px-4 py-3 text-slate-300">{m.study.finished ? 'Finished' : `${m.study.current_week} of ${m.study.total_weeks}`}</td>
                  <td className="px-4 py-3 text-slate-300">{m.cohort_n}</td>
                  <td className="px-4 py-3 text-slate-200">{h.weeklyActive}{lowEngagement(m) && <span className="ml-2 text-xs text-amber-300">low 2 weeks</span>}</td>
                  <td className="px-4 py-3 text-slate-200">{h.returnW4}</td>
                  <td className="px-4 py-3 text-slate-200">{h.success}</td>
                  <td className="px-4 py-3 text-slate-200">{h.scoreChange}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && (() => {
        const h = pilotHeadline(open);
        return (
          <div className="card-glass p-6 border border-cyan-400/30 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-xl font-bold text-white">{open.study.school_name} · {open.study.name}</h4>
                <p className="text-sm text-slate-400">{fmtDate(open.study.starts_on)} – {fmtDate(open.study.ends_on)} · {open.cohort_n} students in the cohort</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => openPilotSummary(open)} className="px-3 py-2 rounded-lg bg-cyan-500 text-slate-950 text-sm font-semibold">Pilot summary (PDF)</button>
                <button type="button" onClick={() => edit(open)} className="px-3 py-2 rounded-lg border border-slate-600 text-sm text-slate-200">Edit</button>
                <button type="button" onClick={() => void remove(open.study.id)} className="px-3 py-2 rounded-lg border border-red-500/50 text-sm text-red-300">Delete</button>
              </div>
            </div>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              <Stat label="Weekly active (latest full week)" value={h.weeklyActive} note={`n = ${open.cohort_n}`} />
              <Stat label="Still active in week 2" value={h.returnW1} note={`of ${open.return.base_n} active in week 1`} />
              <Stat label="Still active in week 5" value={h.returnW4} note={`of ${open.return.base_n} active in week 1`} />
              <Stat label="Questions + tasks per active student" value={h.work} note="latest full week" />
              <Stat label="Interventions started" value={h.interventions} note={`${open.interventions.open} still open`} />
              <Stat label="Interventions improved or resolved" value={h.success} note={`n = ${open.interventions.with_outcome} with an outcome`} />
              <Stat label="Score change" value={h.scoreChange} note={`${open.scores.paired_n} took both tests · ${open.scores.baseline_n} baseline · ${open.scores.endline_n} endline`} />
              <Stat label="Improved their score" value={open.scores.paired_n ? `${open.scores.improved_n} of ${open.scores.paired_n}` : '—'} />
            </div>
            {open.groups.length > 0 && (
              <div className="overflow-x-auto">
                <p className="text-sm font-semibold text-slate-200 mb-2">By class (a student in two groups counts in both)</p>
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-400 border-b border-slate-700">
                    <tr>{['Class', 'Students', `Active in week ${open.latest_complete_week?.week ?? '—'}`, 'Took baseline', 'Took both tests', 'Score change'].map((x) => <th key={x} className="px-3 py-2 font-medium">{x}</th>)}</tr>
                  </thead>
                  <tbody>
                    {open.groups.map((g) => (
                      <tr key={g.id} className="border-b border-slate-800 text-slate-200">
                        <td className="px-3 py-2">{g.name}</td>
                        <td className="px-3 py-2">{g.n}</td>
                        <td className="px-3 py-2">{g.active_latest} ({g.n ? Math.round((g.active_latest / g.n) * 100) : 0}%)</td>
                        <td className="px-3 py-2">{g.baseline_n} of {g.n}</td>
                        <td className="px-3 py-2">{g.paired_n}</td>
                        <td className="px-3 py-2">{g.paired_n ? `${g.mean_change! > 0 ? '+' : ''}${g.mean_change} pts` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-slate-200 mb-2">Weekly active students (share of cohort)</p>
              <WeeklyBars m={open} />
            </div>
            {open.scores.baseline_n > 0 && open.scores.endline_n > 0 && open.scores.paired_n === 0 && (
              <p className="text-sm text-amber-300">The baseline and endline tests were taken by different students, so no scores can be compared. Give the endline to the baseline class.</p>
            )}
            <p className="text-xs text-slate-500">Active = completed at least one question, assignment or quiz that week. Logins and game battles are not counted. Percentages are hidden below {open.min_n} students.</p>
          </div>
        );
      })()}
    </div>
  );
};

export default PilotsTab;
