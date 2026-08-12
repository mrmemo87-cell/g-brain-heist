import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  billingPercent,
  calculateSchoolQuote,
  formatBillingMoney,
  listSchoolBillingQuotes,
  saveSchoolBillingQuote,
  type BillingCalculation,
  type BillingContractTerm,
  type BillingProgrammeKey,
  type BillingQuoteInputs,
  type SchoolBillingQuote,
} from '../../services/billingStudioService';

interface BillingStudioProps {
  schoolId: string;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const TERMS: Array<{ key: BillingContractTerm; label: string; note: string }> = [
  { key: 'monthly', label: 'Monthly', note: 'Flexible · no term discount' },
  { key: 'annual', label: 'Annual', note: '10% prepaid discount' },
  { key: 'two_year', label: '2 years', note: '15% prepaid discount' },
  { key: 'three_year', label: '3 years', note: '20% prepaid discount' },
];

const PROGRAMMES: Array<{ key: BillingProgrammeKey; label: string; description: string }> = [
  { key: 'cambridge', label: 'Cambridge', description: 'Only students enrolled in Cambridge' },
  { key: 'ielts', label: 'IELTS', description: 'Only students enrolled in IELTS' },
  { key: 'writing', label: 'Writing Hub', description: '10 AI reviews per student each month' },
  { key: 'admissions', label: 'Admission Hub', description: 'Candidate seats; separate from platform seats' },
];

const statusLabel: Record<string, string> = {
  draft: 'Draft', submitted: 'Awaiting review', revision_requested: 'Changes requested',
  approved: 'Approved quote', accepted: 'Accepted', rejected: 'Not approved', expired: 'Expired', cancelled: 'Cancelled',
};

const programmeInputKey: Record<BillingProgrammeKey, keyof BillingQuoteInputs> = {
  cambridge: 'cambridgeSeats', ielts: 'ieltsSeats', writing: 'writingSeats', admissions: 'admissionsCandidates',
};

const initialInput: BillingQuoteInputs = {
  contractTerm: 'annual', platformSeats: 50, cambridgeSeats: 0, ieltsSeats: 0,
  writingSeats: 0, admissionsCandidates: 0, launchDiscountRequested: true,
};

const safeInt = (value: string, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
};

const BillingStudio: React.FC<BillingStudioProps> = ({ schoolId, addToast }) => {
  const [input, setInput] = useState<BillingQuoteInputs>(initialInput);
  const [calculation, setCalculation] = useState<BillingCalculation | null>(null);
  const [quotes, setQuotes] = useState<SchoolBillingQuote[]>([]);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [title, setTitle] = useState('School plan scenario');
  const [note, setNote] = useState('');
  const [calculating, setCalculating] = useState(true);
  const [saving, setSaving] = useState<'save' | 'submit' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadQuotes = useCallback(async () => {
    try { setQuotes(await listSchoolBillingQuotes(schoolId)); }
    catch (loadError) { addToast(loadError instanceof Error ? loadError.message : 'Saved scenarios could not be loaded.', 'error'); }
  }, [addToast, schoolId]);

  useEffect(() => { void loadQuotes(); }, [loadQuotes]);

  useEffect(() => {
    let active = true;
    setCalculating(true);
    const timer = window.setTimeout(async () => {
      try {
        const next = await calculateSchoolQuote(schoolId, input);
        if (!active) return;
        setCalculation(next);
        setError(null);
      } catch (calculateError) {
        if (!active) return;
        setCalculation(null);
        setError(calculateError instanceof Error ? calculateError.message : 'The quote could not be calculated.');
      } finally {
        if (active) setCalculating(false);
      }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [input, schoolId]);

  const catalogue = useMemo(() => new Map(calculation?.catalogue.map((item) => [item.key, item]) ?? []), [calculation]);
  const currency = calculation?.pricing_version.currency ?? 'USD';
  const currentStudents = calculation?.usage.current_students ?? 0;
  const applicationEstimate = calculation?.usage.application_estimate ?? null;

  const setProgrammeEnabled = (key: BillingProgrammeKey, enabled: boolean) => {
    const inputKey = programmeInputKey[key];
    const minimum = catalogue.get(key)?.minimum_quantity ?? (key === 'admissions' ? 50 : 25);
    setInput((current) => ({
      ...current,
      [inputKey]: enabled ? (key === 'admissions' ? minimum : Math.max(minimum, Math.min(current.platformSeats, current.platformSeats))) : 0,
    }));
  };

  const setProgrammeQuantity = (key: BillingProgrammeKey, quantity: number) => {
    setInput((current) => ({ ...current, [programmeInputKey[key]]: quantity }));
  };

  const useQuote = (quote: SchoolBillingQuote) => {
    if (!['draft', 'revision_requested'].includes(quote.status)) return;
    setQuoteId(quote.id);
    setTitle(quote.title);
    setNote(quote.school_note ?? '');
    setInput({
      contractTerm: quote.contract_term,
      platformSeats: quote.platform_seats,
      cambridgeSeats: quote.cambridge_seats,
      ieltsSeats: quote.ielts_seats,
      writingSeats: quote.writing_seats,
      admissionsCandidates: quote.admissions_candidates,
      launchDiscountRequested: quote.launch_discount_requested,
    });
    document.getElementById('billing-studio-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const resetScenario = () => {
    setQuoteId(null);
    setTitle('School plan scenario');
    setNote('');
    setInput((current) => ({ ...initialInput, platformSeats: Math.max(50, currentStudents || current.platformSeats) }));
  };

  const persist = async (submit: boolean) => {
    if (!calculation) return;
    setSaving(submit ? 'submit' : 'save');
    try {
      const saved = await saveSchoolBillingQuote(schoolId, { ...input, quoteId, title, note, submit });
      setQuoteId(saved.id);
      addToast(submit ? 'Package request sent for review. Your access has not changed.' : 'Scenario saved.', 'success');
      await loadQuotes();
      if (submit) resetScenario();
    } catch (saveError) {
      addToast(saveError instanceof Error ? saveError.message : 'The scenario could not be saved.', 'error');
    } finally { setSaving(null); }
  };

  return (
    <section className="space-y-6" aria-labelledby="billing-studio-title">
      <div className="overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-white to-violet-50 shadow-sm">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="school-admin-eyebrow">Plan &amp; Billing Studio</p>
            <h3 id="billing-studio-title" className="mt-1 text-2xl font-bold text-slate-950">Test the real numbers before you request anything</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Change students, programmes and term length. Every figure comes from the protected Brains Heist pricing engine. Scenarios never change access or charge the school.</p>
          </div>
          <div className="rounded-xl border border-cyan-200 bg-white/80 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-950">30-day pilot</p>
            <p>All programmes · up to 50 students</p>
            <p>10 teachers · 50 admission candidates · no card</p>
          </div>
        </div>
      </div>

      <div id="billing-studio-builder" className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">1 · School size</p><h4 className="mt-1 text-lg font-bold text-slate-950">How many students need the platform?</h4></div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Teachers and admins are free</span>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_140px] sm:items-end">
              <label className="text-sm font-medium text-slate-700">Platform student seats
                <input type="range" min={50} max={Math.max(2000, input.platformSeats)} step={5} value={input.platformSeats} onChange={(event) => setInput((current) => ({ ...current, platformSeats: safeInt(event.target.value, 50) }))} className="mt-3 w-full accent-cyan-700" />
              </label>
              <label className="text-sm font-medium text-slate-700">Exact number
                <input type="number" min={50} step={1} value={input.platformSeats} onChange={(event) => setInput((current) => ({ ...current, platformSeats: safeInt(event.target.value, 50) }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-right text-lg font-bold text-slate-950" />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {currentStudents > 0 && <button type="button" onClick={() => setInput((current) => ({ ...current, platformSeats: Math.max(50, currentStudents) }))} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">Use current count · {currentStudents}</button>}
              {applicationEstimate && <button type="button" onClick={() => setInput((current) => ({ ...current, platformSeats: Math.max(50, applicationEstimate) }))} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">Use application estimate · {applicationEstimate}</button>}
              <span className="px-2 py-2 text-xs text-slate-500">50-seat minimum · increases immediately · decreases at renewal</span>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">2 · Programmes</p>
            <div className="mt-1 flex flex-wrap items-end justify-between gap-2"><h4 className="text-lg font-bold text-slate-950">Choose only what this school needs</h4><p className="text-xs text-slate-500">2 add-ons save 5% · 3 save 10% · all 4 save 15%</p></div>
            <div className="mt-5 space-y-3">
              {PROGRAMMES.map((programme) => {
                const value = input[programmeInputKey[programme.key]] as number;
                const enabled = value > 0;
                const item = catalogue.get(programme.key);
                const minimum = item?.minimum_quantity ?? (programme.key === 'admissions' ? 50 : 25);
                const max = programme.key === 'admissions' ? Math.max(2000, value) : input.platformSeats;
                return <article key={programme.key} className={`rounded-xl border p-4 transition ${enabled ? 'border-cyan-300 bg-cyan-50/60' : 'border-slate-200 bg-slate-50/50'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex min-w-0 items-start gap-3"><input type="checkbox" checked={enabled} onChange={(event) => setProgrammeEnabled(programme.key, event.target.checked)} className="mt-1 h-4 w-4 accent-cyan-700" /><span><strong className="block text-sm text-slate-950">{programme.label} <span className="font-normal text-slate-500">· {item ? `${formatBillingMoney(item.unit_amount_minor, currency)}/${programme.key === 'admissions' ? 'candidate' : 'student'}/mo` : 'loading price'}</span></strong><small className="text-xs text-slate-600">{programme.description}</small></span></label>
                    {enabled && <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><span>{programme.key === 'admissions' ? 'Candidates' : 'Students'}</span><input type="number" min={minimum} max={programme.key === 'admissions' ? undefined : input.platformSeats} value={value} onChange={(event) => setProgrammeQuantity(programme.key, safeInt(event.target.value, minimum))} className="w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-right text-sm font-bold text-slate-950" /></label>}
                  </div>
                  {enabled && <div className="mt-3 grid grid-cols-4 gap-2">{[25,50,75,100].map((percent) => <button key={percent} type="button" onClick={() => setProgrammeQuantity(programme.key, Math.max(minimum, Math.round((programme.key === 'admissions' ? Math.max(input.platformSeats, minimum) : input.platformSeats) * percent / 100)))} className="rounded-lg border border-cyan-200 bg-white px-2 py-1.5 text-xs font-semibold text-cyan-900 hover:bg-cyan-100">{percent}%</button>)}</div>}
                  {enabled && value > max && programme.key !== 'admissions' && <p className="mt-2 text-xs font-medium text-red-700">Programme students cannot exceed platform seats.</p>}
                </article>;
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">3 · Agreement</p>
            <h4 className="mt-1 text-lg font-bold text-slate-950">Choose a billing term</h4>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{TERMS.map((term) => <button key={term.key} type="button" aria-pressed={input.contractTerm === term.key} onClick={() => setInput((current) => ({ ...current, contractTerm: term.key }))} className={`rounded-xl border p-3 text-left transition ${input.contractTerm === term.key ? 'border-cyan-700 bg-cyan-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}><strong className="block text-sm">{term.label}</strong><span className={`mt-1 block text-xs ${input.contractTerm === term.key ? 'text-cyan-50' : 'text-slate-500'}`}>{term.note}</span></button>)}</div>
            <label className="mt-4 flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950"><input type="checkbox" checked={input.launchDiscountRequested} onChange={(event) => setInput((current) => ({ ...current, launchDiscountRequested: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-violet-700" /><span><strong>Request the 15% Launch discount</strong><small className="mt-1 block text-violet-800">Applies to the first contract year only, requires approval, and the total discount never exceeds 35%.</small></span></label>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">4 · Save or request</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Scenario name<input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950" /></label>
              <label className="text-sm font-medium text-slate-700">Note for Brains Heist<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1 w-full resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950" placeholder="Timing, procurement needs, or questions" /></label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" disabled={!calculation || saving !== null} onClick={() => void persist(false)} className="rounded-xl border border-cyan-700 bg-white px-4 py-2.5 text-sm font-bold text-cyan-800 disabled:opacity-50">{saving === 'save' ? 'Saving…' : quoteId ? 'Update scenario' : 'Save scenario'}</button><button type="button" disabled={!calculation || saving !== null} onClick={() => void persist(true)} className="rounded-xl bg-cyan-800 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-cyan-900 disabled:opacity-50">{saving === 'submit' ? 'Sending…' : 'Request this package'}</button>{quoteId && <button type="button" onClick={resetScenario} className="px-2 py-2 text-sm font-semibold text-slate-600">Start a new scenario</button>}<span className="text-xs text-slate-500">A request does not change access or take payment.</span></div>
          </section>
        </div>

        <aside className="sticky top-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-white shadow-xl" aria-live="polite">
          <div className="border-b border-white/10 p-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Live price receipt</p><h4 className="mt-1 text-xl font-bold">Your tested package</h4><p className="mt-1 text-xs text-slate-400">Server-calculated · {calculation?.pricing_version.name ?? 'loading catalogue'}</p></div>
          <div className="p-5">
            {calculating && <p className="rounded-lg bg-white/5 p-3 text-sm text-slate-300">Recalculating…</p>}
            {error && <p className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
            {calculation && <>
              <dl className="space-y-3 text-sm">{calculation.line_items.filter((item) => item.quantity > 0).map((item) => <div key={item.key} className="flex items-start justify-between gap-4"><dt className="text-slate-300"><strong className="block font-medium text-white">{item.name}</strong><span className="text-xs">{item.quantity} × {formatBillingMoney(item.unit_amount_minor, currency)}</span></dt><dd className="font-semibold">{formatBillingMoney(item.monthly_amount_minor, currency)}</dd></div>)}</dl>
              <div className="my-4 border-t border-white/10" />
              <dl className="space-y-2 text-sm text-slate-300">
                {calculation.discounts.combination_bps > 0 && <div className="flex justify-between gap-3 text-emerald-300"><dt>Combination discount · {billingPercent(calculation.discounts.combination_bps)}</dt><dd>−{formatBillingMoney(calculation.discounts.combination_monthly_minor, currency)}/mo</dd></div>}
                {calculation.discounts.term_bps > 0 && <div className="flex justify-between gap-3 text-emerald-300"><dt>Term discount · {billingPercent(calculation.discounts.term_bps)}</dt><dd>−{formatBillingMoney(calculation.discounts.term_minor, currency)}</dd></div>}
                {calculation.discounts.launch_minor > 0 && <div className="flex justify-between gap-3 text-violet-300"><dt>Launch discount · first year</dt><dd>−{formatBillingMoney(calculation.discounts.launch_minor, currency)}</dd></div>}
              </dl>
              <div className="my-4 border-t border-white/10" />
              <div className="flex items-end justify-between gap-4"><div><p className="text-xs text-slate-400">{input.contractTerm === 'monthly' ? 'Estimated monthly invoice' : `${calculation.totals.months}-month prepaid total`}</p><p className="mt-1 text-3xl font-bold tracking-tight">{formatBillingMoney(calculation.totals.contract_total_minor, currency)}</p></div><span className="pb-1 text-xs text-slate-400">{formatBillingMoney(calculation.totals.effective_monthly_minor, currency)}/mo effective</span></div>
              <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-white/5 p-3"><p className="text-[11px] text-slate-400">First year</p><strong className="mt-1 block text-sm">{formatBillingMoney(calculation.totals.first_year_total_minor, currency)}</strong></div><div className="rounded-xl bg-white/5 p-3"><p className="text-[11px] text-slate-400">Renewal, no Launch discount</p><strong className="mt-1 block text-sm">{formatBillingMoney(calculation.totals.renewal_total_minor, currency)}</strong></div></div>
              <p className="mt-4 rounded-lg bg-cyan-400/10 p-3 text-xs leading-5 text-cyan-100">Effective package cost: <strong>{formatBillingMoney(calculation.totals.effective_platform_student_month_minor, currency)}</strong> per platform student/month. No automatic overage charges.</p>
            </>}
          </div>
        </aside>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">Saved scenarios &amp; requests</p><h4 className="mt-1 text-lg font-bold text-slate-950">Compare without changing the live agreement</h4></div><button type="button" onClick={() => void loadQuotes()} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Refresh</button></div>
        {quotes.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No saved scenarios yet. Build one above and keep up to three editable versions.</p> : <div className="mt-4 grid gap-3 lg:grid-cols-3">{quotes.slice(0, 9).map((quote) => <article key={quote.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><h5 className="font-bold text-slate-950">{quote.title}</h5><p className="mt-1 text-xs text-slate-500">{quote.platform_seats} students · {quote.contract_term.replace('_',' ')}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${quote.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : quote.status === 'revision_requested' ? 'bg-amber-100 text-amber-800' : quote.status === 'submitted' ? 'bg-cyan-100 text-cyan-800' : 'bg-slate-100 text-slate-700'}`}>{statusLabel[quote.status] ?? quote.status}</span></div><p className="mt-3 text-lg font-bold text-slate-950">{formatBillingMoney(quote.calculation.totals.contract_total_minor, quote.calculation.pricing_version.currency)}</p>{quote.review_note && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Brains Heist: {quote.review_note}</p>}{['draft','revision_requested'].includes(quote.status) && <button type="button" onClick={() => useQuote(quote)} className="mt-3 text-xs font-bold text-cyan-800">Open and edit →</button>}</article>)}</div>}
      </section>
    </section>
  );
};

export default BillingStudio;
