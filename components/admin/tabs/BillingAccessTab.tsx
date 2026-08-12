import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin } from '../AdminContext';
import {
  SCHOOL_MODULES,
  listSchoolBillingOverview,
  recordManualSubscription,
  type SchoolBillingOverview,
  type SchoolModuleKey,
} from '../../../services/platformBillingService';
import {
  formatBillingMoney,
  listAdminBillingQuotes,
  reviewSchoolBillingQuote,
  type BillingQuoteStatus,
  type SchoolBillingQuote,
} from '../../../services/billingStudioService';

const MODULE_LABELS: Record<SchoolModuleKey, string> = { core: 'Core', cambridge: 'Cambridge', ielts: 'IELTS', writing: 'Writing Hub', admissions: 'Admission Hub' };

const BillingAccessTab: React.FC = () => {
  const { addToast } = useAdmin();
  const [schools, setSchools] = useState<SchoolBillingOverview[]>([]);
  const [quotes, setQuotes] = useState<SchoolBillingQuote[]>([]);
  const [quoteFilter, setQuoteFilter] = useState<BillingQuoteStatus | 'all'>('submitted');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState('');
  const [plan, setPlan] = useState<'pilot' | 'core' | 'standard' | 'pro' | 'enterprise'>('core');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'invoice' | 'complimentary'>('cash');
  const [status, setStatus] = useState<'pending' | 'active'>('pending');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [reference, setReference] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [modules, setModules] = useState<SchoolModuleKey[]>(['core']);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schoolRows, quoteRows] = await Promise.all([
        listSchoolBillingOverview(),
        listAdminBillingQuotes(quoteFilter === 'all' ? null : quoteFilter),
      ]);
      setSchools(schoolRows);
      setQuotes(quoteRows);
    }
    catch (error) { addToast(error instanceof Error ? error.message : 'Unable to load billing records.', 'error'); }
    finally { setLoading(false); }
  }, [addToast, quoteFilter]);

  useEffect(() => { void load(); }, [load]);
  const selected = useMemo(() => schools.find((school) => school.school_id === schoolId) ?? null, [schoolId, schools]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!schoolId || !periodEnd) return;
    setSaving(true);
    const result = await recordManualSubscription({ schoolId, plan, paymentMethod, status, amountMinor: Math.round(Number(amount || 0) * 100), currency: currency.trim().toUpperCase(), reference, periodEnd: new Date(`${periodEnd}T23:59:59`).toISOString(), modules, notes });
    setSaving(false);
    if (!result.success) { addToast(result.error || 'Billing record could not be saved.', 'error'); return; }
    addToast(status === 'active' ? 'Manual payment verified and school access activated.' : 'Pending manual payment recorded. Access was not activated.', 'success');
    await load();
  };

  const reviewQuote = async (quote: SchoolBillingQuote, action: 'approve' | 'request_revision' | 'reject') => {
    const note = reviewNotes[quote.id]?.trim() || '';
    if (action !== 'approve' && !note) { addToast('Add a clear note for the School Head.', 'error'); return; }
    setReviewing(`${quote.id}:${action}`);
    try {
      await reviewSchoolBillingQuote(quote.id, action, note);
      addToast(action === 'approve' ? 'Quote approved. Access and payment remain unchanged.' : action === 'request_revision' ? 'Revision requested from the School Head.' : 'Quote rejected with an explanation.', 'success');
      await load();
    } catch (error) { addToast(error instanceof Error ? error.message : 'The quote could not be reviewed.', 'error'); }
    finally { setReviewing(null); }
  };

  return <div className="space-y-6">
    <section className="card-glass border border-emerald-400/30 p-6"><h3 className="text-3xl font-heading font-bold text-emerald-300">School Billing &amp; Access</h3><p className="mt-1 text-sm text-gray-400">Record cash, transfer, invoice, or complimentary agreements. Only verified active records enable programmes.</p></section>
    <section className="card-glass space-y-4 border border-cyan-400/20 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">Quote review centre</p><h4 className="mt-1 text-xl font-bold text-white">School package requests</h4><p className="mt-1 text-sm text-gray-400">Review the exact server receipt. Approval never changes access or records payment.</p></div><label className="text-xs font-semibold text-gray-300">Queue<select value={quoteFilter} onChange={(event) => setQuoteFilter(event.target.value as typeof quoteFilter)} className="ml-2 rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-white"><option value="submitted">Awaiting review</option><option value="revision_requested">Revision requested</option><option value="approved">Approved</option><option value="all">All quotes</option></select></label></div>
      {loading ? <p className="rounded-xl bg-white/5 p-4 text-sm text-gray-400">Loading quote queue…</p> : quotes.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-gray-400">No quotes in this queue.</p> : <div className="grid gap-4 xl:grid-cols-2">{quotes.map((quote) => {
        const calculation = quote.calculation;
        const currencyCode = calculation.pricing_version.currency;
        const activeItems = calculation.line_items.filter((item) => item.quantity > 0);
        const isSubmitted = quote.status === 'submitted';
        return <article key={quote.id} className="rounded-2xl border border-white/10 bg-black/30 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h5 className="text-lg font-bold text-white">{quote.school_name}</h5><p className="text-sm text-cyan-100">{quote.title}</p><p className="mt-1 text-xs text-gray-500">{quote.school_head?.name || 'School Head'} · {quote.school_head?.email || 'email unavailable'}</p></div><span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-200">{quote.status.replace('_',' ')}</span></div>
          <dl className="mt-4 space-y-2 border-y border-white/10 py-4 text-sm">{activeItems.map((item) => <div key={item.key} className="flex justify-between gap-3"><dt className="text-gray-300">{item.name} · {item.quantity}</dt><dd className="font-semibold text-white">{formatBillingMoney(item.monthly_amount_minor, currencyCode)}/mo</dd></div>)}</dl>
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs"><div className="rounded-lg bg-white/5 p-2"><span className="block text-gray-500">Term</span><strong className="text-white">{quote.contract_term.replace('_',' ')}</strong></div><div className="rounded-lg bg-white/5 p-2"><span className="block text-gray-500">Contract total</span><strong className="text-white">{formatBillingMoney(calculation.totals.contract_total_minor, currencyCode)}</strong></div><div className="rounded-lg bg-white/5 p-2"><span className="block text-gray-500">Renewal</span><strong className="text-white">{formatBillingMoney(calculation.totals.renewal_total_minor, currencyCode)}</strong></div></div>
          {(calculation.discounts.combination_bps > 0 || calculation.discounts.term_bps > 0 || calculation.discounts.launch_minor > 0) && <p className="mt-3 text-xs text-emerald-300">Discounts: {calculation.discounts.combination_bps / 100}% combination · {calculation.discounts.term_bps / 100}% term{calculation.discounts.launch_minor > 0 ? ' · 15% Launch first year' : ''}</p>}
          {quote.school_note && <p className="mt-3 rounded-lg bg-white/5 p-3 text-xs text-gray-300">School note: {quote.school_note}</p>}
          {isSubmitted && <><textarea rows={2} value={reviewNotes[quote.id] || ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [quote.id]: event.target.value }))} className="mt-4 w-full rounded-lg border border-white/10 bg-black/60 p-3 text-sm text-white" placeholder="Approval note, requested change, or reason" /><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={reviewing !== null} onClick={() => void reviewQuote(quote,'approve')} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-black disabled:opacity-50">{reviewing === `${quote.id}:approve` ? 'Approving…' : 'Approve quote'}</button><button type="button" disabled={reviewing !== null} onClick={() => void reviewQuote(quote,'request_revision')} className="rounded-lg border border-amber-300/40 px-3 py-2 text-xs font-bold text-amber-200 disabled:opacity-50">Request revision</button><button type="button" disabled={reviewing !== null} onClick={() => void reviewQuote(quote,'reject')} className="rounded-lg border border-red-300/30 px-3 py-2 text-xs font-bold text-red-200 disabled:opacity-50">Reject</button></div></>}
          {quote.review_note && <p className="mt-3 text-xs text-gray-400">Review note: {quote.review_note}</p>}
        </article>;
      })}</div>}
    </section>
    <form onSubmit={submit} className="card-glass grid gap-4 border border-white/10 p-6 lg:grid-cols-2">
      <div className="lg:col-span-2"><h4 className="text-lg font-bold text-white">Verified manual agreement</h4><p className="mt-1 text-xs text-gray-400">This remains separate from quote approval. Use only after payment or complimentary authority is verified.</p></div>
      <label className="text-sm text-gray-300">School<select value={schoolId} onChange={(event) => setSchoolId(event.target.value)} required className="mt-1 w-full rounded-lg border border-white/10 bg-black/60 p-3 text-white"><option value="">Choose a school</option>{schools.map((school) => <option key={school.school_id} value={school.school_id}>{school.school_name}</option>)}</select></label>
      <label className="text-sm text-gray-300">Plan<select value={plan} onChange={(event) => setPlan(event.target.value as typeof plan)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/60 p-3 text-white">{['pilot','core','standard','pro','enterprise'].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="text-sm text-gray-300">Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/60 p-3 text-white"><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="invoice">Invoice</option><option value="complimentary">Complimentary</option></select></label>
      <label className="text-sm text-gray-300">Verification status<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/60 p-3 text-white"><option value="pending">Pending — no access</option><option value="active">Verified — activate access</option></select></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm text-gray-300">Amount<input type="number" min="0" step="0.01" disabled={paymentMethod === 'complimentary'} value={amount} onChange={(event) => setAmount(event.target.value)} required={paymentMethod !== 'complimentary'} className="mt-1 w-full rounded-lg border border-white/10 bg-black/60 p-3 text-white" /></label><label className="text-sm text-gray-300">Currency<input maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/60 p-3 uppercase text-white" /></label></div>
      <label className="text-sm text-gray-300">Payment reference<input value={reference} onChange={(event) => setReference(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/60 p-3 text-white" placeholder="Receipt, transfer, or invoice reference" /></label>
      <label className="text-sm text-gray-300">Access expires<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} required className="mt-1 w-full rounded-lg border border-white/10 bg-black/60 p-3 text-white" /></label>
      <fieldset className="rounded-xl border border-white/10 p-4"><legend className="px-1 text-sm text-gray-300">Contracted programmes</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{SCHOOL_MODULES.map((moduleKey) => <label key={moduleKey} className="flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={modules.includes(moduleKey)} disabled={moduleKey === 'core'} onChange={(event) => setModules((current) => event.target.checked ? [...current, moduleKey] : current.filter((item) => item !== moduleKey))} />{MODULE_LABELS[moduleKey]}</label>)}</div></fieldset>
      <label className="text-sm text-gray-300">Internal notes<textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/60 p-3 text-white" /></label>
      {selected?.subscription && <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-4 text-sm text-gray-300"><p className="font-semibold text-cyan-100">Latest record: {selected.subscription.plan} · {selected.subscription.status}</p><p>{selected.subscription.provider} / {selected.subscription.payment_method || 'online'} · expires {selected.subscription.current_period_end ? new Date(selected.subscription.current_period_end).toLocaleDateString() : 'not set'}</p><p>Modules: {(selected.subscription.module_keys || ['core']).join(', ')}</p></div>}
      <div className="flex items-center gap-3 lg:col-span-2"><button type="submit" disabled={saving || !schoolId || !periodEnd} className="rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-black disabled:opacity-50">{saving ? 'Saving…' : status === 'active' ? 'Verify and activate' : 'Record pending payment'}</button><button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-white/20 px-4 py-3 text-sm text-white">Refresh</button><span className="text-xs text-gray-400">Changing a pending record to active requires a new verified entry.</span></div>
    </form>
  </div>;
};

export default BillingAccessTab;
