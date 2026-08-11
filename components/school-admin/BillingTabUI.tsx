import React, { useEffect } from 'react';
import {
  PAID_PLANS,
  PILOT_PLAN,
  type SchoolPlanDetails,
  type PlanInfo,
} from '../../services/tierService';

interface BillingTabProps {
  planDetails: SchoolPlanDetails | null;
  canManageBilling: boolean;
  loading: boolean;
  billingAction: string | null;
  billingInterval: 'monthly' | 'yearly';
  setBillingInterval: (v: 'monthly' | 'yearly') => void;
  onRefreshPlan: () => void;
  onStartPilot: () => void;
  onSubscribe: (plan: PlanInfo) => void;
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e4b82] focus-visible:ring-offset-2';

const BillingTab: React.FC<BillingTabProps> = ({
  planDetails,
  canManageBilling,
  loading,
  billingAction,
  billingInterval,
  setBillingInterval,
  onRefreshPlan,
  onStartPilot,
  onSubscribe,
}) => {
  useEffect(() => {
    if (!planDetails) onRefreshPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planDetails]);

  if (loading || !planDetails) {
    return (
      <div className="billing-loading flex items-center justify-center rounded-xl border border-slate-200 bg-white py-12 text-slate-600" role="status" aria-live="polite">
        <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading plan details…
      </div>
    );
  }

  const plan = planDetails.plan;
  const isActive = planDetails.is_active;
  const trialExpired = planDetails.trial_expired;
  const isNone = plan === 'none';
  const isPilot = plan === 'pilot';
  const isPaid = ['core', 'standard', 'pro', 'enterprise'].includes(plan);
  const trialDaysLeft = isPilot && planDetails.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(planDetails.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  const planLabel: Record<string, string> = {
    none: 'Free (Lockdown Only)', pilot: 'Pilot Trial', core: 'Core', standard: 'Standard', pro: 'Pro', enterprise: 'Enterprise',
  };
  const statusClasses = isPaid
    ? 'border-emerald-200 bg-emerald-50'
    : isPilot && isActive
      ? 'border-cyan-200 bg-cyan-50'
      : trialExpired
        ? 'border-red-200 bg-red-50'
        : 'border-slate-200 bg-white';

  return (
    <div className="billing-tab-ui max-w-none space-y-6" aria-busy={billingAction !== null}>
      <section className={`rounded-xl border p-5 shadow-sm sm:p-6 ${statusClasses}`} aria-label="Current plan">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-900">
              {isPaid && '✅ '}{isPilot && isActive && '🚀 '}{trialExpired && '⏰ '}{isNone && '🔓 '}
              {planLabel[plan] || plan}
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              {isNone && 'Your school is using the free Lockdown mode. The School Head can start a pilot or subscribe.'}
              {isPilot && isActive && `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} remaining. Contracted programmes remain separate from Core access.`}
              {trialExpired && 'Your pilot trial has expired. Subscribe to restore full access.'}
              {isPaid && 'Core access is active. Optional programmes depend on your school agreement.'}
            </p>
          </div>
          {planDetails.seats && (isPaid || (isPilot && isActive)) && (
            <div className="flex flex-wrap gap-2 text-xs text-slate-700">
              <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5">📚 {planDetails.seats.cambridge ?? '∞'} Cambridge</span>
              <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5">🎧 {planDetails.seats.ielts ?? '∞'} IELTS</span>
              <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5">🎮 {planDetails.seats.game ?? '∞'} Game</span>
            </div>
          )}
        </div>
        {planDetails.current_members > 0 && <p className="mt-3 text-xs text-slate-500">Current members: {planDetails.current_members}</p>}
      </section>

      {!canManageBilling && <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950" role="status"><h3 className="font-semibold">Read-only billing access</h3><p className="mt-1">Only the School Head can start trials, purchase plans, or manage payment details. Ask your School Head when a subscription change is needed.</p></section>}

      {isNone && canManageBilling && (
        <section className="rounded-xl border border-cyan-200 bg-cyan-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-cyan-900">🚀 {PILOT_PLAN.label} — {PILOT_PLAN.days} Days Free</h3>
              <p className="mt-1 text-xs text-slate-600">
                {PILOT_PLAN.seats.cambridge} Cambridge · {PILOT_PLAN.seats.ielts} IELTS · {PILOT_PLAN.seats.game} Game seats. No credit card needed.
              </p>
            </div>
            <button onClick={onStartPilot} disabled={billingAction !== null} className={`billing-on-dark w-full shrink-0 rounded-lg bg-[#1e4b82] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#173d6c] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${focusRing}`}>
              {billingAction === 'pilot' ? 'Starting…' : 'Start Free Pilot'}
            </button>
          </div>
        </section>
      )}

      {!isPaid && canManageBilling && (
        <>
          <div className="billing-plan-heading flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
            <p className="school-admin-eyebrow">Choose your capacity</p>
            <h3 className="text-xl font-bold text-slate-900">
              {isNone ? 'Or subscribe now' : trialExpired ? 'Choose a plan to restore access' : 'Upgrade to a paid plan'}
            </h3>
            <p className="mt-1 text-sm text-slate-600">Every plan includes the complete school administration suite. Choose capacity based on active learners.</p>
            </div>
            <div className="inline-flex w-full rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-auto" aria-label="Billing interval">
              {(['monthly', 'yearly'] as const).map((interval) => {
                const selected = billingInterval === interval;
                return (
                  <button
                    key={interval}
                    type="button"
                    onClick={() => setBillingInterval(interval)}
                    aria-pressed={selected}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition sm:flex-none ${focusRing} ${selected ? 'billing-on-dark bg-[#1e4b82] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                  >
                    {interval === 'monthly' ? 'Monthly' : 'Annual'}
                    {interval === 'yearly' && <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${selected ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>Save ~17%</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid items-stretch gap-4 md:grid-cols-3">
            {PAID_PLANS.map((p) => {
              const price = billingInterval === 'yearly' ? p.yearly : p.monthly;
              const isPopular = p.popular;
              const featureRowClasses = isPopular ? 'border border-blue-100 bg-white' : 'border border-slate-100 bg-slate-50';
              return (
                <article key={p.id} className={`billing-plan-card relative flex min-w-0 flex-col rounded-2xl border p-5 shadow-sm transition-shadow hover:shadow-md ${isPopular ? 'is-popular border-[#1e4b82] bg-blue-50 ring-1 ring-[#1e4b82]/20' : 'border-slate-200 bg-white'}`}>
                  {isPopular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#1e4b82] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">Recommended</div>}
                  <h4 className="text-lg font-bold text-slate-900">{p.label}</h4>
                  <div className="mt-1 break-words text-2xl font-bold text-slate-900">
                    ${price.toLocaleString()}<span className="text-sm font-normal text-slate-500">/{billingInterval === 'yearly' ? 'yr' : 'mo'}</span>
                  </div>
                  <div className="min-h-5">
                    {billingInterval === 'yearly' && <p className="text-xs text-slate-600">${Math.round(p.yearly / 12).toLocaleString()}/mo billed annually</p>}
                  </div>
                  <p className="mt-2 rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-semibold text-slate-700">Best for schools with up to {p.seats.game} active learners</p>
                  <div className="mt-3 space-y-2 text-xs">
                    {([['📚 Cambridge', p.seats.cambridge], ['🎧 IELTS', p.seats.ielts], ['🎮 Game', p.seats.game]] as const).map(([label, seats]) => (
                      <div key={label} className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 ${featureRowClasses}`}>
                        <span className="text-slate-600">{label}</span>
                        <span className="text-right font-semibold text-slate-900">up to {seats}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex-1" />
                  <button onClick={() => onSubscribe(p)} disabled={billingAction !== null} className={`billing-on-dark mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing} ${isPopular ? 'bg-[#173d6c] hover:bg-[#102f57]' : 'bg-[#1e4b82] hover:bg-[#173d6c]'}`}>
                    {billingAction === p.id ? 'Redirecting…' : `Choose ${p.label} · ${billingInterval}`}
                  </button>
                </article>
              );
            })}
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm">
            <p className="text-sm text-slate-600"><span className="font-semibold text-slate-900">🏢 Enterprise</span> — Unlimited seats · Multi-campus · Custom pricing</p>
            <a href="mailto:sales@brainsheist.com?subject=Enterprise%20Plan%20Inquiry" className={`mt-1 inline-block text-sm font-semibold text-[#1e4b82] transition-colors hover:text-[#173d6c] ${focusRing}`}>Contact sales@brainsheist.com →</a>
          </section>
        </>
      )}

      {isPaid && canManageBilling && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="mb-2 font-semibold text-slate-900">Manage Subscription</h4>
          <p className="mb-3 text-sm text-slate-600">Update your payment method, change plans, or cancel via the Paddle customer portal.</p>
          <div className="mb-3 flex flex-wrap gap-3">
            {planDetails.update_payment_url && <a href={planDetails.update_payment_url} target="_blank" rel="noopener noreferrer" className={`billing-on-dark inline-flex items-center gap-1.5 rounded-lg bg-[#1e4b82] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#173d6c] ${focusRing}`}>💳 Update Payment Method</a>}
            {planDetails.management_url && planDetails.management_url !== planDetails.update_payment_url && <a href={planDetails.management_url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 ${focusRing}`}>⚙️ Cancel / Change Plan</a>}
          </div>
          <p className="text-xs text-slate-500">Contact <a href="mailto:support@brainsheist.com" className="font-medium text-emerald-700 hover:underline">support@brainsheist.com</a> if you need help managing your subscription.</p>
        </section>
      )}

      <div className="billing-trust-row flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
        <span>🔒 Secure payment via Paddle</span><span>↩️ Cancel anytime</span><span>⚡ Instant activation</span><span>👥 Covers all teachers & students</span>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 pt-1.5 text-[11px] text-slate-500">
        {['Pricing', 'Terms', 'Privacy', 'Refunds', 'Contact'].map((label, index) => (
          <React.Fragment key={label}>
            {index > 0 && <span aria-hidden="true">·</span>}
            <a href={`/${label.toLowerCase() === 'refunds' ? 'refund' : label.toLowerCase()}.html`} target="_blank" rel="noopener noreferrer" className={`transition-colors hover:text-[#1e4b82] ${focusRing}`}>{label}</a>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default BillingTab;
