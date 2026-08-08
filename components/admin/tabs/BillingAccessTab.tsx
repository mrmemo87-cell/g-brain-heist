import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin } from '../AdminContext';
import {
  SCHOOL_MODULES,
  listSchoolBillingOverview,
  recordManualSubscription,
  type SchoolBillingOverview,
  type SchoolModuleKey,
} from '../../../services/platformBillingService';

const MODULE_LABELS: Record<SchoolModuleKey, string> = { core: 'Core', cambridge: 'Cambridge', ielts: 'IELTS', writing: 'Writing Hub', admissions: 'Admission Hub' };

const BillingAccessTab: React.FC = () => {
  const { addToast } = useAdmin();
  const [schools, setSchools] = useState<SchoolBillingOverview[]>([]);
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
    try { setSchools(await listSchoolBillingOverview()); }
    catch (error) { addToast(error instanceof Error ? error.message : 'Unable to load billing records.', 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

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

  return <div className="space-y-6">
    <section className="card-glass border border-emerald-400/30 p-6"><h3 className="text-3xl font-heading font-bold text-emerald-300">School Billing &amp; Access</h3><p className="mt-1 text-sm text-gray-400">Record cash, transfer, invoice, or complimentary agreements. Only verified active records enable programmes.</p></section>
    <form onSubmit={submit} className="card-glass grid gap-4 border border-white/10 p-6 lg:grid-cols-2">
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
