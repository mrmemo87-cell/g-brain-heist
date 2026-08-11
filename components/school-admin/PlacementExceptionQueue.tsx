import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as SchoolAdminService from '../../services/schoolAdminService';

type PlacementClass = { class_id: string; class_code: string; class_name: string; is_active: boolean };

interface Props {
  schoolId: string;
  classes: PlacementClass[];
  addToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onChanged: () => void;
}

const localDate = () => {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};

const labelIssue = (code: string) => code.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

const PlacementExceptionQueue: React.FC<Props> = ({ schoolId, classes, addToast, onChanged }) => {
  const [items, setItems] = useState<SchoolAdminService.PlacementException[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SchoolAdminService.PlacementException | null>(null);
  const [review, setReview] = useState<SchoolAdminService.StudentPlacementReview | null>(null);
  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('Administrator reviewed placement evidence');
  const [effectiveDate, setEffectiveDate] = useState(localDate());
  const [saving, setSaving] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const requestId = useRef(0);
  const schoolIdRef = useRef(schoolId);
  schoolIdRef.current = schoolId;

  const load = useCallback(async (scan = false) => {
    const currentRequest = ++requestId.current;
    const requestedSchool = schoolId;
    setLoading(true);
    setUnavailable(false);
    try {
      if (scan) await SchoolAdminService.refreshPlacementExceptions(schoolId);
      const nextItems = await SchoolAdminService.listPlacementExceptions(schoolId);
      if (currentRequest === requestId.current && requestedSchool === schoolIdRef.current) setItems(nextItems);
    } catch (error) {
      if (currentRequest === requestId.current && requestedSchool === schoolIdRef.current) {
        const message = error instanceof Error ? error.message : '';
        if (message.includes('PGRST202') || message.includes('rpc_school_admin_list_placement_exceptions')) {
          setUnavailable(true);
        } else {
          addToast(message || 'Placement review queue could not be loaded.', 'error');
        }
      }
    } finally {
      if (currentRequest === requestId.current && requestedSchool === schoolIdRef.current) setLoading(false);
    }
  }, [schoolId, addToast]);

  useEffect(() => {
    requestId.current += 1;
    setItems([]);
    setSelected(null);
    setReview(null);
    void load(true);
    return () => { requestId.current += 1; };
  }, [load]);

  const openReview = async (item: SchoolAdminService.PlacementException) => {
    const currentRequest = ++requestId.current;
    const requestedSchool = schoolId;
    setSelected(item);
    setReview(null);
    try {
      const detail = await SchoolAdminService.getStudentPlacementReview(schoolId, item.studentUserId);
      if (currentRequest !== requestId.current || requestedSchool !== schoolIdRef.current) return;
      setReview(detail);
      setDestination(detail.currentClassId ?? '');
      setReason('Administrator reviewed placement evidence');
      setEffectiveDate(localDate());
    } catch (error) {
      if (currentRequest !== requestId.current || requestedSchool !== schoolIdRef.current) return;
      addToast(error instanceof Error ? error.message : 'Student placement could not be reviewed.', 'error');
      setSelected(null);
    }
  };

  const resolve = async (action: 'place' | 'unassign') => {
    if (!selected || !review?.studentUserId || reason.trim().length < 3 || !effectiveDate) return;
    if (!window.confirm(`Confirm this reviewed placement decision effective ${effectiveDate}?`)) return;
    setSaving(true);
    const result = action === 'unassign'
      ? review.currentClassId
        ? await SchoolAdminService.unassignStudentPlacement({
          schoolId, studentId: review.studentUserId, expectedFromClassId: review.currentClassId,
          reason: reason.trim(), effectiveDate, exceptionId: selected.id,
        })
        : { success: false, error: 'The student is already unassigned. Choose a class to confirm the reviewed placement.' }
      : destination
        ? await SchoolAdminService.transferStudentPlacement({
          schoolId, studentId: review.studentUserId, expectedFromClassId: review.currentClassId ?? null,
          toClassId: destination, reason: reason.trim(), effectiveDate, exceptionId: selected.id,
        })
        : { success: false, error: 'Choose a destination class.' };
    setSaving(false);
    if (!result.success) { addToast(result.error ?? 'Placement decision could not be saved.', 'error'); return; }
    addToast('Reviewed placement decision saved with immutable history.', 'success');
    setSelected(null);
    setReview(null);
    await load(false);
    onChanged();
  };

  return (
    <section className="placement-review-panel" aria-labelledby="placement-review-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="placement-review-title">Placement review queue</h3>
          <p>Historical reconciliations and placement mismatches require an explicit administrator decision.</p>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={loading} className="admin-button-ghost admin-button-small">
          {loading ? 'Checking…' : 'Refresh checks'}
        </button>
      </div>
      {unavailable ? <div className="admin-access-note"><strong>Advanced check temporarily unavailable</strong><span>Normal student placement still works. This optional historical reconciliation check will return after the database update is deployed.</span></div> : null}
      {!loading && items.length === 0 ? <p className="mt-3 text-sm text-emerald-300">No open placement exceptions.</p> : null}
      {items.length > 0 ? (
        <ul className="mt-4 grid gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-950/50 p-3">
              <div><strong className="text-slate-100">{labelIssue(item.issueCode)}</strong><p className="text-xs text-slate-400">Severity: {item.severity} · opened {new Date(item.openedAt).toLocaleDateString()}</p></div>
              <button type="button" onClick={() => void openReview(item)} className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950">Review decision</button>
            </li>
          ))}
        </ul>
      ) : null}

      {selected ? (
        <div role="dialog" aria-modal="true" aria-labelledby="placement-decision-title" className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-600 bg-slate-900 p-6 text-slate-100">
            <h3 id="placement-decision-title" className="text-xl font-bold">Review student placement</h3>
            {!review ? <p className="mt-4">Loading protected placement history…</p> : (
              <>
                <p className="mt-2 text-slate-300">{review.displayName ?? 'Student'} · current class {review.currentClassCode ?? 'Unassigned'}</p>
                <label className="mt-4 block text-sm">Reviewed class
                  <select value={destination} onChange={(event) => setDestination(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 p-2">
                    <option value="">Choose a class…</option>
                    {classes.filter((item) => item.is_active).map((item) => <option key={item.class_id} value={item.class_id}>{item.class_code} — {item.class_name}</option>)}
                  </select>
                </label>
                <label className="mt-3 block text-sm">Decision note
                  <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 p-2" />
                </label>
                <label className="mt-3 block text-sm">Effective date
                  <input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 p-2" />
                </label>
                {review.history?.length ? <div className="mt-4"><h4 className="font-semibold">Recent history</h4><ul className="mt-2 space-y-1 text-sm text-slate-300">{review.history.slice(0, 5).map((entry) => <li key={entry.id}>{entry.effectiveDate}: {entry.fromClassCode ?? 'Unassigned'} → {entry.toClassCode ?? 'Unassigned'} · {entry.reason}</li>)}</ul></div> : null}
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => { setSelected(null); setReview(null); }} className="rounded-lg border border-slate-600 px-4 py-2">Cancel</button>
                  {review.currentClassId ? <button type="button" onClick={() => void resolve('unassign')} disabled={saving || reason.trim().length < 3 || !effectiveDate} className="rounded-lg border border-red-500 px-4 py-2 text-red-200 disabled:opacity-50">Confirm unassignment</button> : null}
                  <button type="button" onClick={() => void resolve('place')} disabled={saving || !destination || reason.trim().length < 3 || !effectiveDate} className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">{saving ? 'Saving…' : destination === review.currentClassId ? 'Confirm current class' : 'Save reviewed class'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default PlacementExceptionQueue;
