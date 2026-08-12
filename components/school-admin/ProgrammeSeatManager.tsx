import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  assignProgrammeSeat,
  getProgrammeSeatOverview,
  releaseProgrammeSeat,
  type ProgrammeSeatOverview,
  type SeatProgrammeKey,
  type SeatReleaseReason,
} from '../../services/programmeSeatService';

interface Props { schoolId: string; addToast: (message: string, type: 'success' | 'error' | 'info') => void }
const LABELS: Record<SeatProgrammeKey, string> = { cambridge: 'Cambridge', ielts: 'IELTS', writing: 'Writing Hub' };
const REASONS: Array<{ value: SeatReleaseReason; label: string }> = [
  { value: 'wrong_student', label: 'Wrong student selected' }, { value: 'left_school', label: 'Student left school' },
  { value: 'programme_change', label: 'Programme change' }, { value: 'academic_decision', label: 'Academic decision' },
  { value: 'other', label: 'Other' },
];

const ProgrammeSeatManager: React.FC<Props> = ({ schoolId, addToast }) => {
  const [overview, setOverview] = useState<ProgrammeSeatOverview | null>(null);
  const [programme, setProgramme] = useState<SeatProgrammeKey>('cambridge');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [reason, setReason] = useState<SeatReleaseReason>('programme_change');

  const load = useCallback(async () => {
    try { setOverview(await getProgrammeSeatOverview(schoolId)); }
    catch (error) { addToast(error instanceof Error ? error.message : 'Programme licences could not be loaded.', 'error'); }
  }, [addToast, schoolId]);
  useEffect(() => { void load(); }, [load]);

  const pool = overview?.programmes.find((item) => item.module_key === programme);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (overview?.students ?? []).filter((student) => !needle || `${student.student_name} ${student.class_name}`.toLowerCase().includes(needle));
  }, [overview?.students, query]);

  if (!overview || overview.programmes.length === 0) return null;
  const mutate = async (studentId: string, action: 'assign' | 'release') => {
    setBusyId(studentId);
    try {
      if (action === 'assign') await assignProgrammeSeat(schoolId, programme, studentId);
      else await releaseProgrammeSeat({ schoolId, programme, studentUserId: studentId, reason });
      addToast(action === 'assign' ? 'Programme licence assigned.' : 'Programme licence released under the transfer policy.', 'success');
      setReleaseId(null);
      await load();
    } catch (error) { addToast(error instanceof Error ? error.message : 'The licence change failed.', 'error'); }
    finally { setBusyId(null); }
  };

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="programme-licences-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="school-admin-eyebrow">Named-seat controls</p><h3 id="programme-licences-title" className="mt-1 text-xl font-bold text-slate-950">Programme licences</h3><p className="mt-1 text-sm text-slate-600">Assign purchased seats to named students. Used seats follow the monthly transfer and cooldown policy.</p></div><button type="button" onClick={() => void load()} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Refresh</button></div>
    <div className="mt-5 grid gap-3 md:grid-cols-3">{overview.programmes.map((item) => {
      const selected = item.module_key === programme;
      const remainingTransfers = Math.max(0, item.transfer_limit - item.transfers_used);
      return <button key={item.module_key} type="button" aria-pressed={selected} onClick={() => setProgramme(item.module_key)} className={`rounded-xl border p-4 text-left ${selected ? 'border-cyan-700 bg-cyan-50 ring-1 ring-cyan-700' : 'border-slate-200 bg-white'}`}><strong className="text-sm text-slate-950">{LABELS[item.module_key]}</strong><span className="mt-2 block text-2xl font-bold text-slate-950">{item.assigned}/{item.seat_limit ?? '∞'}</span><span className="mt-1 block text-xs text-slate-600">{remainingTransfers}/{item.transfer_limit} transfers left · {item.cooling_down} cooling down</span></button>;
    })}</div>
    {pool?.seat_limit == null ? <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">This legacy programme has no fixed seat limit yet. Brains Heist must activate an accepted seat-based agreement before named allocation begins.</p> : <>
      <label className="mt-5 block text-sm font-medium text-slate-700">Find a student<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or class" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950" /></label>
      <div className="mt-4 max-h-[480px] space-y-2 overflow-y-auto pr-1">{filtered.map((student) => {
        const assigned = student.modules.includes(programme);
        return <article key={student.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div><strong className="block text-sm text-slate-950">{student.student_name}</strong><span className="text-xs text-slate-500">{student.class_name}</span></div>{releaseId === student.user_id ? <div className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor={`reason-${student.user_id}`}>Release reason</label><select id={`reason-${student.user_id}`} value={reason} onChange={(event) => setReason(event.target.value as SeatReleaseReason)} className="rounded-lg border border-slate-300 px-2 py-2 text-xs">{REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><button type="button" disabled={busyId === student.user_id} onClick={() => void mutate(student.user_id, 'release')} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white">Confirm release</button><button type="button" onClick={() => setReleaseId(null)} className="px-2 py-2 text-xs font-semibold text-slate-600">Cancel</button></div> : <button type="button" disabled={busyId !== null || (!assigned && pool.assigned + pool.cooling_down >= pool.seat_limit)} onClick={() => assigned ? setReleaseId(student.user_id) : void mutate(student.user_id, 'assign')} className={`rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50 ${assigned ? 'border border-red-200 bg-red-50 text-red-800' : 'bg-cyan-800 text-white'}`}>{busyId === student.user_id ? 'Saving…' : assigned ? 'Release seat' : 'Assign seat'}</button>}</article>;
      })}</div>
    </>}
  </section>;
};
export default ProgrammeSeatManager;
