import React, { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '../AdminContext';
import {
  activateAcceptedQuote,
  listProgrammeTransferExceptions,
  reviewProgrammeTransferException,
  type ProgrammeTransferException,
} from '../../../services/platformBillingService';
import {
  formatBillingMoney,
  listAdminBillingQuotes,
  reviewSchoolBillingQuote,
  type BillingQuoteStatus,
  type SchoolBillingQuote,
} from '../../../services/billingStudioService';

const BillingAccessTab: React.FC = () => {
  const { addToast } = useAdmin();
  const [quotes, setQuotes] = useState<SchoolBillingQuote[]>([]);
  const [exceptions, setExceptions] = useState<ProgrammeTransferException[]>([]);
  const [quoteFilter, setQuoteFilter] = useState<BillingQuoteStatus | 'all'>('submitted');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [exceptionNotes, setExceptionNotes] = useState<Record<string, string>>({});
  const [activationQuote, setActivationQuote] = useState<SchoolBillingQuote | null>(null);
  const [activationMethod, setActivationMethod] = useState<'cash' | 'bank_transfer' | 'invoice' | 'complimentary'>('bank_transfer');
  const [activationAmount, setActivationAmount] = useState('');
  const [activationCurrency, setActivationCurrency] = useState('USD');
  const [activationReference, setActivationReference] = useState('');
  const [activationEnd, setActivationEnd] = useState('');
  const [activationNotes, setActivationNotes] = useState('');
  const [activating, setActivating] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [quoteRows, exceptionRows] = await Promise.all([
        listAdminBillingQuotes(quoteFilter === 'all' ? null : quoteFilter),
        listProgrammeTransferExceptions(),
      ]);
      setQuotes(quoteRows);
      setExceptions(exceptionRows);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Unable to load billing records.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, quoteFilter]);

  useEffect(() => { void load(); }, [load]);

  const reviewQuote = async (quote: SchoolBillingQuote, action: 'approve' | 'request_revision' | 'reject') => {
    const note = reviewNotes[quote.id]?.trim() || '';
    if (action !== 'approve' && !note) {
      addToast('Add a clear note for the School Head.', 'error');
      return;
    }
    setReviewing(`${quote.id}:${action}`);
    try {
      await reviewSchoolBillingQuote(quote.id, action, note);
      addToast(
        action === 'approve'
          ? 'Quote approved. Access and payment remain unchanged.'
          : action === 'request_revision'
            ? 'Revision requested from the School Head.'
            : 'Quote rejected with an explanation.',
        'success',
      );
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'The quote could not be reviewed.', 'error');
    } finally {
      setReviewing(null);
    }
  };

  const reviewException = async (request: ProgrammeTransferException, action: 'approve' | 'reject') => {
    const reviewNote = exceptionNotes[request.id]?.trim() || '';
    if (reviewNote.length < 5) {
      addToast('Add a clear review note of at least five characters.', 'error');
      return;
    }
    setReviewing(`exception:${request.id}:${action}`);
    try {
      await reviewProgrammeTransferException(request.id, action, reviewNote);
      addToast(
        action === 'approve'
          ? `${request.requested_transfers} temporary transfers approved for this programme period.`
          : 'Transfer exception rejected with an explanation.',
        'success',
      );
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'The exception could not be reviewed.', 'error');
    } finally {
      setReviewing(null);
    }
  };

  const submitActivation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activationQuote || !activationEnd) return;
    setActivating(true);
    try {
      await activateAcceptedQuote({
        quoteId: activationQuote.id,
        paymentMethod: activationMethod,
        amountMinor: Math.round(Number(activationAmount || 0) * 100),
        currency: activationCurrency.trim().toUpperCase(),
        reference: activationReference,
        periodEnd: new Date(`${activationEnd}T23:59:59`).toISOString(),
        notes: activationNotes,
      });
      addToast(
        `Agreement activated with exact named-seat limits: Cambridge ${activationQuote.cambridge_seats}, IELTS ${activationQuote.ielts_seats}, Writing ${activationQuote.writing_seats}.`,
        'success',
      );
      setActivationQuote(null);
      setActivationAmount('');
      setActivationReference('');
      setActivationEnd('');
      setActivationNotes('');
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'The accepted agreement could not be activated.', 'error');
    } finally {
      setActivating(false);
    }
  };

  return <div className="space-y-6">
    <section className="card-glass overflow-hidden border border-emerald-400/30">
      <div className="bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-violet-500/10 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Single agreement authority</p>
        <h3 className="mt-1 text-3xl font-heading font-bold text-white">School Billing &amp; Access</h3>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-300">
          Every paid school now follows one immutable chain: approved quote → School Head acceptance → verified payment → exact contract capacities. Direct manual activation is retired.
        </p>
        <div className="mt-5 grid gap-2 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/25 p-3"><strong className="text-sm text-cyan-100">1 · Quote defines capacity</strong><p className="mt-1 text-xs text-gray-400">No freehand programme seat limits.</p></div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3"><strong className="text-sm text-violet-100">2 · Payment activates</strong><p className="mt-1 text-xs text-gray-400">The accepted quantities are copied atomically.</p></div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3"><strong className="text-sm text-emerald-100">3 · Database enforces truth</strong><p className="mt-1 text-xs text-gray-400">Capacity-less paid agreements are rejected.</p></div>
        </div>
      </div>
    </section>

    <section className="card-glass space-y-4 border border-cyan-400/20 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">Quote review centre</p>
          <h4 className="mt-1 text-xl font-bold text-white">School package requests</h4>
          <p className="mt-1 text-sm text-gray-400">Review → accept → verify → activate. The quote is the commercial source of truth.</p>
        </div>
        <label className="text-xs font-semibold text-gray-300">Queue
          <select value={quoteFilter} onChange={(event) => setQuoteFilter(event.target.value as typeof quoteFilter)} className="ml-2 rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-white">
            <option value="submitted">Awaiting review</option>
            <option value="revision_requested">Revision requested</option>
            <option value="approved">Approved</option>
            <option value="accepted">Accepted · ready to activate</option>
            <option value="scheduled">Scheduled renewals</option>
            <option value="active">Live agreements</option>
            <option value="all">All quotes</option>
          </select>
        </label>
      </div>

      {loading
        ? <p className="rounded-xl bg-white/5 p-4 text-sm text-gray-400">Loading quote queue…</p>
        : quotes.length === 0
          ? <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-gray-400">No quotes in this queue.</p>
          : <div className="grid gap-4 xl:grid-cols-2">{quotes.map((quote) => {
            const calculation = quote.calculation;
            const currencyCode = calculation.pricing_version.currency;
            const activeItems = calculation.line_items.filter((item) => item.quantity > 0);
            const isSubmitted = quote.status === 'submitted';
            return <article key={quote.id} className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h5 className="text-lg font-bold text-white">{quote.school_name}</h5><p className="text-sm text-cyan-100">{quote.title}</p><p className="mt-1 text-xs text-gray-500">{quote.school_head?.name || 'School Head'} · {quote.school_head?.email || 'email unavailable'}</p></div>
                <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-200">{quote.status.replace('_', ' ')}</span>
              </div>
              <dl className="mt-4 space-y-2 border-y border-white/10 py-4 text-sm">{activeItems.map((item) => <div key={item.key} className="flex justify-between gap-3"><dt className="text-gray-300">{item.name} · {item.quantity}</dt><dd className="font-semibold text-white">{formatBillingMoney(item.monthly_amount_minor, currencyCode)}/mo</dd></div>)}</dl>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs"><div className="rounded-lg bg-white/5 p-2"><span className="block text-gray-500">Term</span><strong className="text-white">{quote.contract_term.replace('_', ' ')}</strong></div><div className="rounded-lg bg-white/5 p-2"><span className="block text-gray-500">Contract total</span><strong className="text-white">{formatBillingMoney(calculation.totals.contract_total_minor, currencyCode)}</strong></div><div className="rounded-lg bg-white/5 p-2"><span className="block text-gray-500">Renewal</span><strong className="text-white">{formatBillingMoney(calculation.totals.renewal_total_minor, currencyCode)}</strong></div></div>
              {(calculation.discounts.combination_bps > 0 || calculation.discounts.term_bps > 0 || calculation.discounts.launch_minor > 0) && <p className="mt-3 text-xs text-emerald-300">Discounts: {calculation.discounts.combination_bps / 100}% combination · {calculation.discounts.term_bps / 100}% term{calculation.discounts.launch_minor > 0 ? ' · 15% Launch first year' : ''}</p>}
              {quote.school_note && <p className="mt-3 rounded-lg bg-white/5 p-3 text-xs text-gray-300">School note: {quote.school_note}</p>}
              {isSubmitted && <><textarea rows={2} value={reviewNotes[quote.id] || ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [quote.id]: event.target.value }))} className="mt-4 w-full rounded-lg border border-white/10 bg-black/60 p-3 text-sm text-white" placeholder="Approval note, requested change, or reason" /><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={reviewing !== null} onClick={() => void reviewQuote(quote, 'approve')} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-black disabled:opacity-50">{reviewing === `${quote.id}:approve` ? 'Approving…' : 'Approve quote'}</button><button type="button" disabled={reviewing !== null} onClick={() => void reviewQuote(quote, 'request_revision')} className="rounded-lg border border-amber-300/40 px-3 py-2 text-xs font-bold text-amber-200 disabled:opacity-50">Request revision</button><button type="button" disabled={reviewing !== null} onClick={() => void reviewQuote(quote, 'reject')} className="rounded-lg border border-red-300/30 px-3 py-2 text-xs font-bold text-red-200 disabled:opacity-50">Reject</button></div></>}
              {quote.status === 'accepted' && !quote.activated_at && <div className="mt-4 rounded-xl border border-violet-300/30 bg-violet-500/10 p-3"><p className="text-xs leading-5 text-violet-100"><strong>School Head accepted these exact quantities.</strong> Activation remains blocked until payment or complimentary authority is verified.</p><button type="button" onClick={() => { setActivationQuote(quote); setActivationCurrency(quote.calculation.pricing_version.currency); setActivationAmount(String(quote.calculation.totals.contract_total_minor / 100)); }} className="mt-3 rounded-lg bg-violet-300 px-3 py-2 text-xs font-bold text-violet-950">Prepare verified activation</button></div>}
              {quote.status === 'scheduled' && <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100"><strong>Scheduled renewal.</strong> Current capacities stay authoritative until {quote.effective_at ? new Date(quote.effective_at).toLocaleDateString() : 'the agreed effective date'}.</div>}
              {quote.status === 'active' && <div className="mt-4 rounded-xl border border-emerald-300/25 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-100"><strong>Live agreement.</strong> These exact quoted capacities are active and auditable.</div>}
              {quote.review_note && <p className="mt-3 text-xs text-gray-400">Review note: {quote.review_note}</p>}
            </article>;
          })}</div>}
    </section>

    {activationQuote && <form onSubmit={submitActivation} className="card-glass grid gap-4 border border-violet-400/30 p-6 lg:grid-cols-2">
      <div className="lg:col-span-2"><p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">Final controlled step</p><h4 className="mt-1 text-xl font-bold text-white">Activate accepted agreement · {activationQuote.school_name}</h4><p className="mt-1 text-sm text-gray-400">The database will copy these immutable quoted capacities: Cambridge <strong className="text-white">{activationQuote.cambridge_seats}</strong>, IELTS <strong className="text-white">{activationQuote.ielts_seats}</strong>, Writing <strong className="text-white">{activationQuote.writing_seats}</strong>. No manual seat entry is possible.</p></div>
      <label className="text-sm text-gray-300">Verified method<select value={activationMethod} onChange={(event) => setActivationMethod(event.target.value as typeof activationMethod)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/60 p-3 text-white"><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="invoice">Invoice</option><option value="complimentary">Complimentary authority</option></select></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm text-gray-300">Verified amount<input type="number" min="0" step="0.01" disabled={activationMethod === 'complimentary'} value={activationAmount} onChange={(event) => setActivationAmount(event.target.value)} required={activationMethod !== 'complimentary'} className="mt-1 w-full rounded-lg border border-white/10 bg-black/60 p-3 text-white" /></label><label className="text-sm text-gray-300">Currency<input maxLength={3} value={activationCurrency} onChange={(event) => setActivationCurrency(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/60 p-3 uppercase text-white" /></label></div>
      <label className="text-sm text-gray-300">Receipt / authority reference<input value={activationReference} onChange={(event) => setActivationReference(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/60 p-3 text-white" /></label>
      <label className="text-sm text-gray-300">Access expires<input type="date" value={activationEnd} onChange={(event) => setActivationEnd(event.target.value)} required className="mt-1 w-full rounded-lg border border-white/10 bg-black/60 p-3 text-white" /></label>
      <label className="text-sm text-gray-300 lg:col-span-2">Internal verification note<textarea rows={3} value={activationNotes} onChange={(event) => setActivationNotes(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/60 p-3 text-white" /></label>
      <div className="flex flex-wrap items-center gap-3 lg:col-span-2"><button type="submit" disabled={activating || !activationEnd || (activationMethod !== 'complimentary' && Number(activationAmount) <= 0)} className="rounded-lg bg-violet-300 px-5 py-3 font-bold text-violet-950 disabled:opacity-40">{activating ? 'Verifying and activating…' : 'Verify payment & activate exact seats'}</button><button type="button" onClick={() => setActivationQuote(null)} className="rounded-lg border border-white/20 px-4 py-3 text-sm text-white">Cancel</button><span className="text-xs text-gray-400">Atomic: subscription, quote provenance, entitlements and seat limits update together.</span></div>
    </form>}

    <section className="card-glass space-y-4 border border-amber-400/20 p-6">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">Governed flexibility</p><h4 className="mt-1 text-xl font-bold text-white">Transfer exception requests</h4><p className="mt-1 text-sm text-gray-400">Approve genuine cohort changes without weakening the standard anti-rotation policy. Overrides expire with the current programme period.</p></div>
      {exceptions.length === 0
        ? <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-gray-400">No transfer exceptions await review.</p>
        : <div className="grid gap-3 lg:grid-cols-2">{exceptions.map((request) => <article key={request.id} className="rounded-xl border border-white/10 bg-black/30 p-4"><div className="flex justify-between gap-3"><div><strong className="text-white">{request.school_name}</strong><p className="text-xs capitalize text-amber-200">{request.module_key} · +{request.requested_transfers} transfers</p></div><span className="text-xs text-gray-500">{new Date(request.created_at).toLocaleDateString()}</span></div><p className="mt-3 text-sm leading-6 text-gray-300">{request.reason}</p><textarea rows={2} value={exceptionNotes[request.id] || ''} onChange={(event) => setExceptionNotes((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Decision note (required)" className="mt-3 w-full rounded-lg border border-white/10 bg-black/60 p-3 text-sm text-white" /><div className="mt-3 flex gap-2"><button type="button" disabled={reviewing !== null} onClick={() => void reviewException(request, 'approve')} className="rounded-lg bg-amber-300 px-3 py-2 text-xs font-bold text-amber-950 disabled:opacity-40">Approve for this period</button><button type="button" disabled={reviewing !== null} onClick={() => void reviewException(request, 'reject')} className="rounded-lg border border-red-300/30 px-3 py-2 text-xs font-bold text-red-200 disabled:opacity-40">Reject</button></div></article>)}</div>}
    </section>
  </div>;
};

export default BillingAccessTab;
