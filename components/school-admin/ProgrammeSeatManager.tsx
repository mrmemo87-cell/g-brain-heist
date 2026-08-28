import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  assignProgrammeSeat, bulkAssignProgrammeSeats, getProgrammeSeatOverview, releaseProgrammeSeat,
  requestProgrammeTransferException, subscribeToProgrammeAccessRequestChanges, switchProgrammeSeat, type ProgrammeSeatAssignment,
  type ProgrammeSeatOverview, type ProgrammeSeatStudent, type SeatProgrammeKey, type SeatReleaseReason,
} from '../../services/programmeSeatService';

interface Props { schoolId: string; addToast: (message: string, type: 'success' | 'error' | 'info') => void }
const LABELS: Record<SeatProgrammeKey, string> = { cambridge: 'Cambridge', ielts: 'IELTS', writing: 'Writing Hub' };
const REASONS: Array<{ value: SeatReleaseReason; label: string }> = [
  { value: 'wrong_student', label: 'Wrong student selected' }, { value: 'programme_change', label: 'Programme change' },
  { value: 'academic_decision', label: 'Academic decision' }, { value: 'other', label: 'Other' },
];

const dateTime = (value?: string | null) => value ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const shortDate = (value?: string | null) => value ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value)) : '—';
const assignmentFor = (student: ProgrammeSeatStudent, programme: SeatProgrammeKey) => student.assignments.find((item) => item.module_key === programme);

function ReleaseImpact({ assignment, leftSchool }: { assignment: ProgrammeSeatAssignment; leftSchool: boolean }) {
  const correction = !assignment.has_usage && Date.parse(assignment.correction_until) > Date.now();
  if (leftSchool) return <p className="rounded-lg bg-emerald-50 p-3 text-xs leading-5 text-emerald-900"><strong>Immediate return.</strong> A verified inactive membership does not use a transfer or create a cooldown.</p>;
  if (correction) return <p className="rounded-lg bg-emerald-50 p-3 text-xs leading-5 text-emerald-900"><strong>Free correction.</strong> No learning usage was found and the 24-hour correction window is open until {dateTime(assignment.correction_until)}.</p>;
  return <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-950"><strong>Protected transfer.</strong> This uses one monthly transfer and the seat returns after a 7-day cooldown. The change is recorded in the audit history.</p>;
}

const ProgrammeSeatManager: React.FC<Props> = ({ schoolId, addToast }) => {
  const [overview, setOverview] = useState<ProgrammeSeatOverview | null>(null);
  const [programme, setProgramme] = useState<SeatProgrammeKey>('cambridge');
  const [view, setView] = useState<'roster' | 'activity' | 'policy'>('roster');
  const [isExpanded, setIsExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [className, setClassName] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [reason, setReason] = useState<SeatReleaseReason>('programme_change');
  const [note, setNote] = useState('');
  const [switchTarget, setSwitchTarget] = useState<SeatProgrammeKey>('ielts');
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [exceptionCount, setExceptionCount] = useState(2);
  const [exceptionReason, setExceptionReason] = useState('');

  const load = useCallback(async () => {
    try { setOverview(await getProgrammeSeatOverview(schoolId)); }
    catch (error) { addToast(error instanceof Error ? error.message : 'Programme licences could not be loaded.', 'error'); }
  }, [addToast, schoolId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const channel = subscribeToProgrammeAccessRequestChanges(schoolId, () => { void load(); });
    return () => { void channel.unsubscribe(); };
  }, [load, schoolId]);

  const pool = overview?.programmes.find((item) => item.module_key === programme);
  const classes = useMemo(() => Array.from(new Set((overview?.students ?? []).map((student) => student.class_name))).sort(), [overview?.students]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (overview?.students ?? []).filter((student) => (className === 'all' || student.class_name === className)
      && (!needle || `${student.student_name} ${student.class_name}`.toLowerCase().includes(needle)));
  }, [className, overview?.students, query]);
  const classCandidates = useMemo(() => (overview?.students ?? []).filter((student) => className !== 'all' && student.class_name === className
    && student.member_status === 'active' && !assignmentFor(student, programme)), [className, overview?.students, programme]);

  if (!overview) return null;
  const remainingTransfers = pool ? Math.max(0, pool.transfer_limit - pool.transfers_used) : 0;
  const pendingRequestCount = overview.student_requests.length;

  const run = async (key: string, action: () => Promise<void>, message: string) => {
    setBusy(key);
    try { await action(); addToast(message, 'success'); setReleaseId(null); setNote(''); await load(); }
    catch (error) { addToast(error instanceof Error ? error.message : 'The licence change failed.', 'error'); }
    finally { setBusy(null); }
  };

  const bulkAssign = async () => {
    if (className === 'all' || classCandidates.length === 0) return;
    setBusy('bulk');
    try {
      const assigned = await bulkAssignProgrammeSeats(schoolId, programme, classCandidates.map((student) => student.user_id));
      addToast(`${assigned} ${LABELS[programme]} seat${assigned === 1 ? '' : 's'} assigned to ${className}.`, 'success');
      await load();
    } catch (error) { addToast(error instanceof Error ? error.message : 'The class could not be assigned.', 'error'); }
    finally { setBusy(null); }
  };

  const submitException = async () => {
    setBusy('exception');
    try {
      await requestProgrammeTransferException({ schoolId, programme, requestedTransfers: exceptionCount, reason: exceptionReason });
      addToast('Transfer exception sent for platform review. Your current limits remain unchanged.', 'success');
      setExceptionOpen(false); setExceptionReason(''); await load();
    } catch (error) { addToast(error instanceof Error ? error.message : 'The exception request could not be sent.', 'error'); }
    finally { setBusy(null); }
  };

  return <section id="programme-access-requests" className="scroll-mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="programme-licences-title">
    <div className={`${isExpanded ? 'border-b border-slate-200' : ''} bg-gradient-to-r from-slate-950 via-cyan-950 to-slate-950 p-5 text-white sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          aria-expanded={isExpanded}
          aria-controls="programme-seat-manager-content"
          className="min-w-0 flex-1 rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Named-seat command centre</p>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <span id="programme-licences-title" className="text-2xl font-bold">Programme access and seat allocation</span>
            {pendingRequestCount > 0 ? <span className="inline-flex"><span className="school-admin-nav-badge" aria-label={`${pendingRequestCount} pending programme request${pendingRequestCount === 1 ? '' : 's'}`}>{Math.min(pendingRequestCount, 99)}</span></span> : null}
            <span className={`ml-auto grid h-8 w-8 flex-none place-items-center rounded-full border border-white/20 bg-white/10 transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true">
              <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" /></svg>
            </span>
          </span>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{isExpanded ? 'Allocate by learner or class, see the consequence before every change, and switch programmes atomically. The live agreement—not a percentage estimate—is always authoritative.' : pendingRequestCount > 0 ? `${pendingRequestCount} student programme request${pendingRequestCount === 1 ? '' : 's'} waiting for review. Expand to review and allocate seats.` : 'Expand to manage programme access, learner seats, transfers and allocation activity.'}</p>
        </button>
        {isExpanded ? <button type="button" onClick={() => void load()} className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold">Refresh</button> : null}
      </div>
      {isExpanded ? <div className="mt-5 grid gap-2 sm:grid-cols-4"><div className="rounded-xl bg-white/10 p-3"><strong className="block text-sm">1 · Name learners</strong><span className="text-xs text-slate-300">Seats follow students, not logins.</span></div><div className="rounded-xl bg-white/10 p-3"><strong className="block text-sm">2 · Correct safely</strong><span className="text-xs text-slate-300">Unused mistakes: 24 hours.</span></div><div className="rounded-xl bg-white/10 p-3"><strong className="block text-sm">3 · Change fairly</strong><span className="text-xs text-slate-300">10% transfers, minimum two.</span></div><div className="rounded-xl bg-white/10 p-3"><strong className="block text-sm">4 · Reuse after 7 days</strong><span className="text-xs text-slate-300">Stops rapid seat rotation.</span></div></div> : null}
    </div>

    {isExpanded ? <div id="programme-seat-manager-content" className="p-5 sm:p-6">
      <div className="grid gap-3 md:grid-cols-3">{overview.programmes.map((item) => {
        const selected = item.module_key === programme; const limit = item.seat_limit ?? 0;
        const occupancy = limit ? Math.round(((item.assigned + item.cooling_down) / limit) * 100) : 0;
        return <button key={item.module_key} type="button" aria-pressed={selected} onClick={() => { setProgramme(item.module_key); setReleaseId(null); }} className={`rounded-xl border p-4 text-left transition ${selected ? 'border-cyan-700 bg-cyan-50 ring-1 ring-cyan-700' : 'border-slate-200 hover:border-cyan-300'}`}>
          <span className="flex items-center justify-between gap-2"><strong className="text-sm text-slate-950">{LABELS[item.module_key]}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${occupancy >= 100 ? 'bg-red-100 text-red-800' : occupancy >= 80 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{item.seat_limit == null ? 'Legacy' : `${occupancy}% committed`}</span></span>
          <span className="mt-3 block text-2xl font-bold text-slate-950">{item.available} <small className="text-xs font-medium text-slate-500">available</small></span>
          <span className="mt-2 block h-2 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-cyan-700" style={{ width: `${Math.min(100, occupancy)}%` }} /></span>
          <span className="mt-2 block text-xs text-slate-600">{item.assigned} allocated · {item.cooling_down} cooling · {Math.max(0, item.transfer_limit - item.transfers_used)}/{item.transfer_limit} transfers</span>
        </button>;
      })}</div>

      {overview.student_requests.length > 0 ? <section className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4" aria-labelledby="student-programme-requests-title">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 id="student-programme-requests-title" className="font-bold text-emerald-950">Student programme requests</h4><p className="mt-1 text-xs leading-5 text-emerald-800">These requests are advisory only. Review the learner and available capacity before allocating a seat.</p></div><span className="rounded-full bg-emerald-800 px-2.5 py-1 text-xs font-bold text-white">{overview.student_requests.length} pending</span></div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">{overview.student_requests.slice(0, 8).map((request) => {
          const studentName = request.student?.full_name || request.student?.username || 'Student';
          const programmePurchased = overview.programmes.some((item) => item.module_key === request.module_key);
          return <article key={request.id} className="rounded-lg border border-emerald-200 bg-white p-3"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-slate-950">{studentName}</strong><p className="mt-1 text-xs text-slate-600">{request.student?.batch ? `Class ${request.student.batch} · ` : ''}{LABELS[request.module_key]} · {request.access_reason === 'not_purchased' ? 'not in the current agreement' : 'seat not yet allocated'}</p><time className="mt-1 block text-[11px] text-slate-500">Requested {shortDate(request.requested_at)}</time></div><button type="button" onClick={() => { if (programmePurchased) { setProgramme(request.module_key); setView('roster'); setQuery(studentName); } else { document.getElementById('billing-studio-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }} className="flex-none rounded-lg bg-emerald-800 px-3 py-2 text-xs font-bold text-white">{programmePurchased ? 'Allocate seat' : 'Review package'}</button></div></article>;
        })}</div>
      </section> : null}

      {pool?.seat_limit == null ? <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Seat allocation is waiting for a fixed agreement.</strong><p className="mt-1">Accept an approved package in Plan &amp; Billing Studio. Brains Heist will activate the exact quoted capacities after payment verification.</p><button type="button" onClick={() => document.getElementById('billing-studio-builder')?.scrollIntoView({ behavior: 'smooth' })} className="mt-3 font-bold text-amber-950 underline">Review plan options</button></div> : <>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200"><div className="flex gap-1">{(['roster','activity','policy'] as const).map((item) => <button key={item} type="button" onClick={() => setView(item)} className={`border-b-2 px-3 py-3 text-sm font-bold capitalize ${view === item ? 'border-cyan-700 text-cyan-800' : 'border-transparent text-slate-500'}`}>{item}</button>)}</div><p className="pb-2 text-xs text-slate-500">{pool.unique_students_served} unique learners served this period</p></div>

        {view === 'roster' && <div className="mt-5">
          {(pool.available === 0 || remainingTransfers === 0) && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><div><strong>{pool.available === 0 ? 'This programme is fully committed.' : 'Monthly transfers are used.'}</strong><p className="mt-1 text-xs">{pool.next_available_at ? `Next cooling seat returns ${dateTime(pool.next_available_at)}.` : 'Add capacity or request a reviewed exception when circumstances genuinely changed.'}</p></div><div className="flex gap-2"><button type="button" onClick={() => setExceptionOpen(true)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold">Request exception</button><button type="button" onClick={() => document.getElementById('billing-studio-builder')?.scrollIntoView({ behavior: 'smooth' })} className="rounded-lg bg-amber-900 px-3 py-2 text-xs font-bold text-white">Request more seats</button></div></div>}
          <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto]"><label className="text-sm font-medium text-slate-700">Find a learner<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or class" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label><label className="text-sm font-medium text-slate-700">Class<select value={className} onChange={(event) => setClassName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5"><option value="all">All classes</option>{classes.map((item) => <option key={item}>{item}</option>)}</select></label><button type="button" disabled={className === 'all' || classCandidates.length === 0 || busy !== null || classCandidates.length > pool.available} onClick={() => void bulkAssign()} className="self-end rounded-xl bg-cyan-800 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy === 'bulk' ? 'Allocating…' : `Allocate class${className === 'all' ? '' : ` · ${classCandidates.length}`}`}</button></div>
          <div className="mt-4 max-h-[620px] space-y-2 overflow-y-auto pr-1">{filtered.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No learners match this view.</p> : filtered.map((student) => {
            const assignment = assignmentFor(student, programme); const isInactive = student.member_status !== 'active';
            const targets = overview.programmes.filter((item) => item.module_key !== programme && item.available > 0 && !assignmentFor(student, item.module_key));
            return <article key={student.user_id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong className="text-sm text-slate-950">{student.student_name}</strong><p className="mt-1 text-xs text-slate-500">{student.class_name} · <span className={isInactive ? 'font-bold text-amber-700' : 'text-emerald-700'}>{isInactive ? 'Inactive membership' : 'Active student'}</span></p>{assignment && <p className="mt-1 text-xs text-slate-600">{assignment.has_usage ? 'Learning has started' : `Unused · free correction until ${dateTime(assignment.correction_until)}`}</p>}</div>
              {!assignment ? <button type="button" disabled={busy !== null || isInactive || pool.available === 0} onClick={() => void run(student.user_id, () => assignProgrammeSeat(schoolId, programme, student.user_id), `${LABELS[programme]} seat allocated to ${student.student_name}.`)} className="rounded-lg bg-cyan-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{busy === student.user_id ? 'Allocating…' : 'Allocate seat'}</button> : <button type="button" onClick={() => { setReleaseId(releaseId === student.user_id ? null : student.user_id); setReason(isInactive ? 'left_school' : 'programme_change'); setSwitchTarget(targets[0]?.module_key ?? programme); }} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">{releaseId === student.user_id ? 'Close change panel' : 'Change allocation'}</button>}</div>
              {assignment && releaseId === student.user_id && <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 lg:grid-cols-2"><div><h6 className="text-sm font-bold text-slate-950">Release this seat</h6><select value={reason} onChange={(event) => setReason(event.target.value as SeatReleaseReason)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}{isInactive && <option value="left_school">Student left school</option>}</select><textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional internal note" className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm" /><ReleaseImpact assignment={assignment} leftSchool={reason === 'left_school'} /><button type="button" disabled={busy !== null} onClick={() => void run(student.user_id, async () => { await releaseProgrammeSeat({ schoolId, programme, studentUserId: student.user_id, reason, note }); }, 'Seat released exactly as previewed.')} className="mt-3 rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Confirm release</button></div>
                <div><h6 className="text-sm font-bold text-slate-950">Switch programme safely</h6><p className="mt-1 text-xs leading-5 text-slate-600">The source release and target assignment succeed together or neither happens.</p>{targets.length > 0 ? <><select value={switchTarget} onChange={(event) => setSwitchTarget(event.target.value as SeatProgrammeKey)} className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{targets.map((item) => <option key={item.module_key} value={item.module_key}>{LABELS[item.module_key]} · {item.available} available</option>)}</select><button type="button" disabled={busy !== null || switchTarget === programme} onClick={() => void run(`switch:${student.user_id}`, () => switchProgrammeSeat({ schoolId, studentUserId: student.user_id, fromProgramme: programme, toProgramme: switchTarget }), `${student.student_name} switched to ${LABELS[switchTarget]}.`)} className="mt-3 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Review understood · switch atomically</button></> : <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">No other purchased programme currently has an available seat.</p>}</div></div>}
            </article>;
          })}</div>
        </div>}

        {view === 'activity' && <div className="mt-5 space-y-2">{overview.events.filter((event) => event.module_key === programme).length === 0 ? <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No allocation activity yet.</p> : overview.events.filter((event) => event.module_key === programme).map((event) => <article key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div><strong className="text-sm text-slate-950">{event.student_name}</strong><p className="text-xs text-slate-500">{event.event_type.replace('_',' ')}{event.reason ? ` · ${event.reason.replace('_',' ')}` : ''}</p></div><time className="text-xs text-slate-500">{dateTime(event.created_at)}</time></article>)}</div>}

        {view === 'policy' && <div className="mt-5 grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-slate-200 p-5"><h5 className="font-bold text-slate-950">What schools can change</h5><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600"><li>• Allocate any available seat to an active learner.</li><li>• Correct an unused mistake within {overview.policy.correction_hours} hours.</li><li>• Transfer up to {overview.policy.base_transfer_percent}% of seats monthly, minimum two.</li><li>• Return a seat immediately after the membership is genuinely inactive.</li></ul></div><div className="rounded-xl border border-slate-200 p-5"><h5 className="font-bold text-slate-950">What prevents manipulation</h5><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600"><li>• Learning usage closes the free-correction path.</li><li>• Ordinary transfers cool down for {overview.policy.cooldown_days} days.</li><li>• “Left school” is rejected while membership remains active.</li><li>• Every allocation, correction, release and override is auditable.</li></ul></div></div>}

        {exceptionOpen && <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50 p-4"><h5 className="font-bold text-violet-950">Request a reviewed transfer exception</h5><p className="mt-1 text-xs leading-5 text-violet-800">For genuine timetable or cohort changes. Approval adds only the requested transfers for the current programme period; it does not add seats.</p><div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr_auto]"><label className="text-xs font-bold text-violet-950">Extra transfers<input type="number" min={1} max={1000} value={exceptionCount} onChange={(event) => setExceptionCount(Math.max(1, Number(event.target.value) || 1))} className="mt-1 w-full rounded-lg border border-violet-300 px-3 py-2" /></label><label className="text-xs font-bold text-violet-950">Why is this exceptional?<textarea rows={2} minLength={20} value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} className="mt-1 w-full rounded-lg border border-violet-300 p-2" placeholder="Explain the cohort or timetable change (20+ characters)" /></label><div className="flex items-end gap-2"><button type="button" disabled={busy !== null || exceptionReason.trim().length < 20} onClick={() => void submitException()} className="rounded-lg bg-violet-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Send for review</button><button type="button" onClick={() => setExceptionOpen(false)} className="px-2 py-2 text-xs font-bold text-violet-800">Cancel</button></div></div></div>}
        {overview.exception_requests.length > 0 && <div className="mt-5"><h5 className="text-sm font-bold text-slate-950">Exception decisions</h5><div className="mt-2 grid gap-2 md:grid-cols-2">{overview.exception_requests.slice(0,4).map((request) => <article key={request.id} className="rounded-lg border border-slate-200 p-3 text-xs"><span className="font-bold text-slate-950">{LABELS[request.module_key]} · {request.requested_transfers} transfers</span><span className="float-right capitalize text-slate-500">{request.status}</span><p className="mt-1 text-slate-600">Requested {shortDate(request.created_at)}{request.review_note ? ` · ${request.review_note}` : ''}</p></article>)}</div></div>}
      </>}
    </div> : null}
  </section>;
};

export default ProgrammeSeatManager;
