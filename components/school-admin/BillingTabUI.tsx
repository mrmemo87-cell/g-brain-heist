import React, { useEffect } from 'react';
import {
  PILOT_PLAN,
  type SchoolPlanDetails,
} from '../../services/tierService';
import './BillingContrast.css';

interface BillingTabProps {
  planDetails: SchoolPlanDetails | null;
  canManageBilling: boolean;
  loading: boolean;
  billingAction: string | null;
  onRefreshPlan: () => void;
  onStartPilot: () => void;
  billingStudio?: React.ReactNode;
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e4b82] focus-visible:ring-offset-2';

const BillingTab: React.FC<BillingTabProps> = ({
  planDetails,
  canManageBilling,
  loading,
  billingAction,
  onRefreshPlan,
  onStartPilot,
  billingStudio,
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
              {planLabel[plan] || plan}
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              {isNone && 'Your school is using the free Lockdown mode. The School Head can start a pilot or build a school package below.'}
              {isPilot && isActive && `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} remaining. All programmes are available during the pilot; contracted seat quantities apply only after a paid agreement.`}
              {trialExpired && 'Your pilot trial has expired. Build and request a school package to restore access.'}
              {isPaid && 'Core access is active. Optional programmes depend on your school agreement.'}
            </p>
          </div>
          {planDetails.seats && isPaid && (
            <div className="flex flex-wrap gap-2 text-xs text-slate-700">
              <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5">{planDetails.seats.cambridge ?? '∞'} Cambridge</span>
              <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5">{planDetails.seats.ielts ?? '∞'} IELTS</span>
              <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5">{planDetails.seats.game ?? '∞'} Game</span>
            </div>
          )}
          {isPilot && isActive && (
            <span className="rounded-lg border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-950">Full pilot access · paid seat caps are not applied during the trial</span>
          )}
        </div>
        {planDetails.current_members > 0 && <p className="mt-3 text-xs text-slate-500">Current members: {planDetails.current_members}</p>}
      </section>

      {!canManageBilling && <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950" role="status"><h3 className="font-semibold">Read-only billing access</h3><p className="mt-1">Only the School Head can start trials, purchase plans, or manage payment details. Ask your School Head when a subscription change is needed.</p></section>}

      {isNone && canManageBilling && (
        <section className="rounded-xl border border-cyan-200 bg-cyan-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-cyan-900">{PILOT_PLAN.label} — {PILOT_PLAN.days} Days Free</h3>
              <p className="mt-1 text-xs text-slate-600">
                All programmes · up to 50 students · 10 teachers · 50 admission candidates. No credit card needed.
              </p>
            </div>
            <button onClick={onStartPilot} disabled={billingAction !== null} className={`billing-on-dark w-full shrink-0 rounded-lg bg-[#1e4b82] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#173d6c] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${focusRing}`}>
              {billingAction === 'pilot' ? 'Starting…' : 'Start Free Pilot'}
            </button>
          </div>
        </section>
      )}

      {canManageBilling && billingStudio}

      {isPaid && canManageBilling && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="mb-2 font-semibold text-slate-900">Manage current agreement</h4>
          <p className="mb-3 text-sm text-slate-600">Use the secure billing portal when it is available, or contact billing for a programme or capacity change.</p>
          <div className="mb-3 flex flex-wrap gap-3">
            {planDetails.update_payment_url && <a href={planDetails.update_payment_url} target="_blank" rel="noopener noreferrer" className={`billing-on-dark inline-flex items-center gap-1.5 rounded-lg bg-[#1e4b82] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#173d6c] ${focusRing}`}>Update payment method</a>}
            {planDetails.management_url && planDetails.management_url !== planDetails.update_payment_url && <a href={planDetails.management_url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 ${focusRing}`}>Cancel or change plan</a>}
          </div>
          <p className="text-xs text-slate-500">Contact <a href="mailto:support@brainsheist.com" className="font-medium text-emerald-700 hover:underline">support@brainsheist.com</a> if you need help managing your subscription.</p>
        </section>
      )}

      <div className="billing-trust-row flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
        <span>Server-calculated pricing</span><span>Teachers and admins are free</span><span>Approval before activation</span><span>No surprise overages</span>
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
