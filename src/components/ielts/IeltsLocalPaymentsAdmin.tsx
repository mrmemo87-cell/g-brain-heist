import React, { useCallback, useEffect, useState } from 'react';
import {
  getAdminLocalPayments,
  reviewLocalPayment,
  saveLocalPaymentSettings,
  type AdminLocalPayment,
  type LocalPaymentSettings,
} from '../../../services/ieltsLocalPaymentService';

/** Owner-only: confirm IELTS Prime bank transfers and set where learners send money. */

const PLAN: Record<string, string> = { monthly: '1 month', quarterly: '3 months', yearly: '1 year' };
const som = (n: number) => `${new Intl.NumberFormat('ru-RU').format(n)} som`;
const when = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek' }).format(new Date(iso));

const IeltsLocalPaymentsAdmin: React.FC = () => {
  const [view, setView] = useState<'pending' | 'all'>('pending');
  const [rows, setRows] = useState<AdminLocalPayment[] | null>(null);
  const [settings, setSettings] = useState<LocalPaymentSettings | null>(null);
  const [draft, setDraft] = useState<LocalPaymentSettings | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getAdminLocalPayments(view);
      setRows(data.payments);
      setSettings(data.settings);
      setDraft((d) => d ?? data.settings);
    } catch {
      setError('Local payments could not load.');
    }
  }, [view]);
  useEffect(() => { void load(); }, [load]);

  const review = async (row: AdminLocalPayment, approve: boolean) => {
    if (!approve && !window.confirm(`Reject ${row.payer_name}'s payment of ${som(row.amount_som)}?`)) return;
    setBusy(row.id);
    setError(null);
    try {
      const result = await reviewLocalPayment(row.id, approve, notes[row.id]);
      setMessage(approve
        ? `Prime is on for ${row.email || row.payer_name} until ${result.ends_at ? when(result.ends_at) : '—'}. They get an email.`
        : `Rejected. ${row.email || row.payer_name} gets an email asking them to check the transfer.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the decision.');
    } finally {
      setBusy(null);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy('settings');
    setError(null);
    try {
      const saved = await saveLocalPaymentSettings(draft);
      setSettings(saved);
      setDraft(saved);
      setMessage(saved.enabled && saved.recipient_phone ? 'Saved. Learners now see "Pay by transfer" on the Prime page.' : 'Saved. Transfer payment is hidden from learners.');
    } catch {
      setError('Settings could not be saved. Check the prices are whole numbers.');
    } finally {
      setBusy(null);
    }
  };

  const field = (key: keyof LocalPaymentSettings, label: string, type = 'text', hint?: string) => (
    <label className="lp-field">
      <span>{label}</span>
      <input
        type={type}
        value={draft ? String(draft[key] ?? '') : ''}
        onChange={(e) => setDraft((d) => (d ? { ...d, [key]: type === 'number' ? Number(e.target.value) : e.target.value } : d))}
      />
      {hint && <small className="ic-muted">{hint}</small>}
    </label>
  );

  const live = Boolean(settings?.enabled && settings?.recipient_phone);

  return (
    <section className="ic-card lp-admin" aria-label="Local payments">
      <div className="lp-head">
        <h2>Local payments (MBank, O!Dengi, Elsom)</h2>
        <span className={`lp-badge ${live ? 'is-on' : ''}`}>{live ? 'Live on Prime page' : 'Off'}</span>
      </div>
      <p className="ic-muted">Learners transfer the som amount, then tell us. Check your bank app, then approve: Prime switches on for exactly the plan they paid for and ends by itself.</p>

      {message && <div className="ic-notice" role="status">{message}</div>}
      {error && <div className="ic-notice ic-notice--error" role="alert">{error}</div>}

      <div className="gd-range" role="group" aria-label="Show">
        <button type="button" className={view === 'pending' ? 'is-on' : ''} aria-pressed={view === 'pending'} onClick={() => setView('pending')}>To confirm</button>
        <button type="button" className={view === 'all' ? 'is-on' : ''} aria-pressed={view === 'all'} onClick={() => setView('all')}>All</button>
      </div>

      {!rows ? <div className="ic-skeleton" style={{ height: 80 }} /> : rows.length === 0 ? (
        <p className="ic-muted">{view === 'pending' ? 'Nothing to confirm right now.' : 'No transfers yet.'}</p>
      ) : (
        <ul className="lp-list">
          {rows.map((r) => (
            <li key={r.id} className="lp-row">
              <div className="lp-main">
                <b>{som(r.amount_som)}</b> · {PLAN[r.plan]} · {r.method}
                <div>From <b>{r.payer_name}</b>{r.payer_phone ? `, ${r.payer_phone}` : ''}{r.reference ? ` · ${r.reference}` : ''}</div>
                <small className="ic-muted">{r.email || r.name || r.user_id} · {when(r.created_at)}{r.campaign ? ` · ${r.campaign}` : ''}</small>
              </div>
              {r.status === 'pending' ? (
                <div className="lp-actions">
                  <input
                    aria-label="Note to learner (optional)"
                    placeholder="Note (optional)"
                    value={notes[r.id] || ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  />
                  <button type="button" className="lp-ok" disabled={busy === r.id} onClick={() => void review(r, true)}>Money arrived · Approve</button>
                  <button type="button" className="lp-no" disabled={busy === r.id} onClick={() => void review(r, false)}>Not found · Reject</button>
                </div>
              ) : (
                <span className={`lp-status lp-status--${r.status}`}>{r.status}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <details className="lp-settings" open={!live}>
        <summary>Where learners send money</summary>
        {draft && (
          <form onSubmit={save}>
            <label className="lp-check">
              <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
              Show "Pay by transfer" on the Prime page
            </label>
            {field('bank_label', 'Main bank or wallet', 'text', 'Shown in the heading, e.g. MBank')}
            {field('recipient_phone', 'Phone number to transfer to', 'tel', 'Required before the option appears')}
            {field('recipient_name', 'Recipient name as the bank shows it', 'text', 'e.g. Mohamed S. — helps learners trust the transfer')}
            {field('instructions', 'Extra instruction (optional, Russian)')}
            <div className="lp-prices">
              {field('price_monthly_som', '1 month, som', 'number')}
              {field('price_quarterly_som', '3 months, som', 'number')}
              {field('price_yearly_som', '1 year, som', 'number')}
            </div>
            <button type="submit" className="lp-ok" disabled={busy === 'settings'}>{busy === 'settings' ? 'Saving…' : 'Save'}</button>
          </form>
        )}
      </details>
    </section>
  );
};

export default IeltsLocalPaymentsAdmin;
