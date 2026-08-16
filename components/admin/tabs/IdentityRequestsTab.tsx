import React from 'react';
import type { ToastMessage } from '../../../types';
import * as SchoolAdminService from '../../../services/schoolAdminService';

interface IdentityRequestsTabProps {
  addToast: (message: string, type: ToastMessage['type']) => void;
}

const IdentityRequestsTab: React.FC<IdentityRequestsTabProps> = ({ addToast }) => {
  const [status, setStatus] = React.useState<SchoolAdminService.SchoolIdentityChangeRequestStatus | 'all'>('pending');
  const [requests, setRequests] = React.useState<SchoolAdminService.SuperadminSchoolIdentityChangeRequest[]>([]);
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await SchoolAdminService.listSuperadminSchoolIdentityChangeRequests(status));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Identity change requests could not be loaded.');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  React.useEffect(() => { void load(); }, [load]);

  const decide = async (request: SchoolAdminService.SuperadminSchoolIdentityChangeRequest, decision: 'approve' | 'reject') => {
    const note = notes[request.id]?.trim() || '';
    if (decision === 'reject' && note.length < 5) {
      addToast('Add a short reason before rejecting the request.', 'error');
      return;
    }
    setBusy(request.id);
    const result = await SchoolAdminService.decideSchoolIdentityChangeRequest(request.id, decision, note);
    setBusy(null);
    if (!result.success) {
      addToast(result.error || 'The request could not be reviewed.', 'error');
      return;
    }
    addToast(result.message || 'Identity change request updated.', 'success');
    setNotes((current) => ({ ...current, [request.id]: '' }));
    await load();
  };

  return <div className="space-y-6">
    <section className="card-glass border border-cyan-400/30 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">School governance</p><h2 className="mt-1 text-2xl font-bold text-white">School identity change requests</h2><p className="mt-2 max-w-3xl text-sm text-gray-400">Approve only when the school’s reason is valid. Approval unlocks its verified name and logo so an authorised school administrator can make the change and reconfirm the identity.</p></div>
        <label className="text-sm font-semibold text-gray-300">Status<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="ml-2 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-white"><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="completed">Completed</option><option value="all">All</option></select></label>
      </div>
    </section>

    {error ? <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-100"><strong>Requests unavailable</strong><p className="mt-1">{error}</p><button type="button" onClick={() => void load()} className="mt-3 rounded-lg border border-red-300/40 px-3 py-2 font-semibold">Try again</button></div> : null}
    {loading ? <div className="card-glass p-8 text-center text-gray-300">Loading identity requests…</div> : null}
    {!loading && !error && requests.length === 0 ? <div className="card-glass p-8 text-center"><h3 className="text-lg font-bold text-white">No {status === 'all' ? '' : `${status} `}identity requests</h3><p className="mt-2 text-sm text-gray-400">New school requests will appear here automatically.</p></div> : null}

    <div className="grid gap-4">
      {requests.map((request) => <article key={request.id} className="card-glass border border-white/10 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">{request.schoolLogoUrl ? <img src={request.schoolLogoUrl} alt="" className="h-12 w-12 rounded-xl bg-white object-contain p-1" /> : <span className="grid h-12 w-12 place-items-center rounded-xl bg-cyan-400/10 font-bold text-cyan-200">S</span>}<div className="min-w-0"><h3 className="truncate text-lg font-bold text-white">{request.schoolName}</h3><p className="text-xs text-gray-400">Requested by {request.requesterName}{request.requesterEmail ? ` · ${request.requesterEmail}` : ''}</p></div></div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${request.status === 'pending' ? 'bg-amber-400/15 text-amber-200' : request.status === 'approved' ? 'bg-cyan-400/15 text-cyan-200' : request.status === 'completed' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-red-400/15 text-red-200'}`}>{request.status}</span>
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4"><span className="text-xs font-bold uppercase tracking-wider text-gray-500">School reason</span><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-200">{request.reason}</p></div>
        <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-2"><span>Verified name when requested: <strong className="text-gray-300">{request.schoolNameAtRequest}</strong></span><time dateTime={request.createdAt}>Requested {new Date(request.createdAt).toLocaleString()}</time></div>
        {request.reviewNote ? <p className="mt-3 rounded-lg bg-white/5 p-3 text-sm text-gray-300"><strong>Review note:</strong> {request.reviewNote}</p> : null}
        {request.status === 'pending' ? <div className="mt-4 grid gap-3"><label className="text-sm font-semibold text-gray-300">Review note<textarea rows={3} maxLength={1000} value={notes[request.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Add approval guidance or a reason for rejection…" className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-white" /></label><div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy === request.id} onClick={() => void decide(request, 'reject')} className="rounded-lg border border-red-300/30 bg-red-500/10 px-4 py-2 font-semibold text-red-100 disabled:opacity-50">Reject</button><button type="button" disabled={busy === request.id} onClick={() => void decide(request, 'approve')} className="rounded-lg bg-cyan-300 px-4 py-2 font-bold text-slate-950 disabled:opacity-50">{busy === request.id ? 'Updating…' : 'Approve and unlock'}</button></div></div> : null}
      </article>)}
    </div>
  </div>;
};

export default IdentityRequestsTab;
