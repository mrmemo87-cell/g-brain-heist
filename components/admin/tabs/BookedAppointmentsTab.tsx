import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin } from '../AdminContext';
import {
  DEMO_INTEREST_OPTIONS,
  formatDemoBookingTime,
  listDemoBookings,
  updateDemoBooking,
  type DemoBookingRecord,
  type DemoBookingStatus,
} from '../../../services/demoBookingService';

const STATUS_OPTIONS: { value: DemoBookingStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const statusClasses: Record<DemoBookingStatus, string> = {
  new: 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200',
  contacted: 'border-violet-400/50 bg-violet-500/15 text-violet-200',
  confirmed: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200',
  completed: 'border-blue-400/50 bg-blue-500/15 text-blue-200',
  cancelled: 'border-slate-400/40 bg-slate-500/15 text-slate-300',
};

const interestLabels = new Map(DEMO_INTEREST_OPTIONS.map((option) => [option.value, option.label]));
const formatDate = (value: string, includeTime = false) => new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  ...(includeTime ? { timeStyle: 'short' as const } : {}),
}).format(new Date(includeTime ? value : `${value}T00:00:00`));

const BookedAppointmentsTab: React.FC = () => {
  const { addToast } = useAdmin();
  const [appointments, setAppointments] = useState<DemoBookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | DemoBookingStatus>('all');
  const [drafts, setDrafts] = useState<Record<string, { status: DemoBookingStatus; admin_notes: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const rows = await listDemoBookings();
      setAppointments(rows);
      setDrafts(Object.fromEntries(rows.map((row) => [row.id, {
        status: row.status,
        admin_notes: row.admin_notes ?? '',
      }])));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load appointments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAppointments(); }, [loadAppointments]);

  const stats = useMemo(() => ({
    total: appointments.length,
    new: appointments.filter((appointment) => appointment.status === 'new').length,
    confirmed: appointments.filter((appointment) => appointment.status === 'confirmed').length,
    upcoming: appointments.filter((appointment) =>
      appointment.preferred_date >= new Date().toISOString().slice(0, 10)
      && !['completed', 'cancelled'].includes(appointment.status)
    ).length,
  }), [appointments]);

  const filteredAppointments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return appointments.filter((appointment) => {
      if (statusFilter !== 'all' && appointment.status !== statusFilter) return false;
      if (!term) return true;
      return [appointment.school_name, appointment.contact_name, appointment.email, appointment.country, appointment.role_title]
        .some((value) => value?.toLowerCase().includes(term));
    });
  }, [appointments, search, statusFilter]);

  const updateDraft = (id: string, patch: Partial<{ status: DemoBookingStatus; admin_notes: string }>) => {
    setDrafts((current) => ({
      ...current,
      [id]: { status: current[id]?.status ?? 'new', admin_notes: current[id]?.admin_notes ?? '', ...patch },
    }));
  };

  const saveAppointment = async (appointment: DemoBookingRecord) => {
    const draft = drafts[appointment.id] ?? { status: appointment.status, admin_notes: appointment.admin_notes ?? '' };
    setSavingId(appointment.id);
    try {
      const updated = await updateDemoBooking(appointment.id, draft);
      setAppointments((current) => current.map((row) => row.id === updated.id ? updated : row));
      setDrafts((current) => ({ ...current, [updated.id]: { status: updated.status, admin_notes: updated.admin_notes ?? '' } }));
      addToast(`Appointment for ${appointment.school_name ?? appointment.contact_name} updated.`, 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not update appointment.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="card-glass border-2 border-cyan-400/40 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">School partnerships pipeline</p>
            <h3 className="mt-2 text-3xl font-heading font-bold text-white">📅 Booked Appointments</h3>
            <p className="mt-1 text-sm text-gray-400">Review demo requests, confirm meetings and keep follow-up notes in one place.</p>
          </div>
          <button onClick={() => void loadAppointments()} disabled={loading} className="rounded-lg border border-cyan-400/60 bg-cyan-500/15 px-4 py-2 text-sm font-bold text-cyan-100 transition hover:bg-cyan-500/25 disabled:opacity-60">
            {loading ? 'Refreshing…' : '↻ Refresh appointments'}
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[['New requests', stats.new, 'text-cyan-300'], ['Upcoming', stats.upcoming, 'text-amber-300'], ['Confirmed', stats.confirmed, 'text-emerald-300'], ['All bookings', stats.total, 'text-violet-300']].map(([label, value, color]) => (
            <div key={String(label)} className="rounded-xl border border-white/10 bg-black/25 p-4">
              <p className="text-xs uppercase tracking-wider text-gray-500">{label}</p>
              <p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search school, contact, email or country…" className="rounded-lg border border-white/15 bg-black/35 px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-cyan-400" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="rounded-lg border border-white/15 bg-black/35 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400">
            <option value="all">All statuses</option>{STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
          <div className="grid place-items-center rounded-lg border border-white/10 bg-black/25 px-4 py-2 text-sm text-gray-300">{filteredAppointments.length} shown</div>
        </div>

        {loadError && <div className="mt-4 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{loadError}</div>}
      </section>

      {loading && <div className="card-glass p-10 text-center text-cyan-100">Loading appointment pipeline…</div>}
      {!loading && !loadError && filteredAppointments.length === 0 && <div className="card-glass p-10 text-center text-gray-400">No appointments match the current filters.</div>}

      <div className="space-y-4">
        {filteredAppointments.map((appointment) => {
          const draft = drafts[appointment.id] ?? { status: appointment.status, admin_notes: appointment.admin_notes ?? '' };
          const changed = draft.status !== appointment.status || draft.admin_notes.trim() !== (appointment.admin_notes ?? '').trim();
          return (
            <article key={appointment.id} className="card-glass border border-white/10 p-5 md:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h4 className="text-xl font-bold text-white">{appointment.school_name ?? appointment.contact_name}</h4>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusClasses[appointment.status]}`}>{appointment.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-300">{appointment.school_name ? appointment.contact_name : 'Direct demo booking'}{appointment.role_title ? ` · ${appointment.role_title}` : ''}</p>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
                    {appointment.email && <a className="text-cyan-300 hover:text-cyan-200" href={`mailto:${appointment.email}`}>✉ {appointment.email}</a>}
                    {appointment.phone && <a className="text-cyan-300 hover:text-cyan-200" href={`tel:${appointment.phone}`}>☎ {appointment.phone}</a>}
                    {appointment.country && <span className="text-gray-400">⌖ {appointment.country}{appointment.school_size ? ` · ${appointment.school_size}` : ''}</span>}
                  </div>
                </div>
                <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/5 px-4 py-3 xl:min-w-[285px]">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Requested appointment</p>
                  <p className="mt-1 font-bold text-white">{formatDate(appointment.preferred_date)} · {formatDemoBookingTime(appointment.preferred_time)}</p>
                  <p className="mt-1 text-xs text-gray-400">{appointment.timezone ?? 'Asia/Bishkek'} · {(appointment.preferred_format ?? 'online').replace('_', ' ')}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Booking details</p>
                  {appointment.interests && appointment.interests.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{appointment.interests.map((interest) => <span key={interest} className="rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1 text-[11px] text-violet-200">{interestLabels.get(interest) ?? interest}</span>)}</div>}
                  {appointment.message && <blockquote className="mt-4 border-l-2 border-cyan-400/50 pl-4 text-sm leading-6 text-gray-300">“{appointment.message}”</blockquote>}
                  {!appointment.message && (!appointment.interests || appointment.interests.length === 0) && <p className="mt-2 text-sm text-gray-400">Quick booking · name and phone only</p>}
                  <p className="mt-5 text-[10px] text-gray-600">Submitted {formatDate(appointment.created_at, true)} · Ref {appointment.id.slice(0, 8).toUpperCase()}</p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400">Pipeline status
                    <select value={draft.status} onChange={(event) => updateDraft(appointment.id, { status: event.target.value as DemoBookingStatus })} className="mt-2 w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400">
                      {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                    </select>
                  </label>
                  <label className="mt-3 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Internal notes
                    <textarea rows={3} maxLength={2000} value={draft.admin_notes} onChange={(event) => updateDraft(appointment.id, { admin_notes: event.target.value })} placeholder="Add follow-up details, owner or confirmed meeting link…" className="mt-2 w-full resize-y rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm leading-5 text-white placeholder-gray-600 outline-none focus:border-cyan-400" />
                  </label>
                  <button onClick={() => void saveAppointment(appointment)} disabled={!changed || savingId === appointment.id} className="mt-3 w-full rounded-lg bg-gradient-to-r from-cyan-400 to-blue-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
                    {savingId === appointment.id ? 'Saving…' : changed ? 'Save appointment' : 'Saved'}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};

export default BookedAppointmentsTab;
