import React, { useEffect } from 'react';
import {
  PAID_PLANS,
  PILOT_PLAN,
  type SchoolPlanDetails,
  type PlanInfo,
} from '../../services/tierService';

interface BillingTabProps {
  planDetails: SchoolPlanDetails | null;
  loading: boolean;
  billingAction: string | null;
  billingInterval: 'monthly' | 'yearly';
  setBillingInterval: (v: 'monthly' | 'yearly') => void;
  onRefreshPlan: () => void;
  onStartPilot: () => void;
  onSubscribe: (plan: PlanInfo) => void;
}

const BillingTab: React.FC<BillingTabProps> = ({
  planDetails,
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
      <div className="flex items-center justify-center py-12 text-gray-400">
        <svg className="h-5 w-5 animate-spin mr-2" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
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

  // Trial days remaining
  const trialDaysLeft = isPilot && planDetails.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(planDetails.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const planLabel: Record<string, string> = {
    none: 'Free (Lockdown Only)',
    pilot: 'Pilot Trial',
    core: 'Core',
    standard: 'Standard',
    pro: 'Pro',
    enterprise: 'Enterprise',
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Current Plan Status */}
      <div className={`rounded-xl p-6 border ${
        isPaid ? 'bg-emerald-900/20 border-emerald-500/30' :
        isPilot && isActive ? 'bg-cyan-900/20 border-cyan-500/30' :
        trialExpired ? 'bg-red-900/20 border-red-500/30' :
        'bg-gray-800 border-gray-700'
      }`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">
              {isPaid && '✅ '}{isPilot && isActive && '🚀 '}{trialExpired && '⏰ '}{isNone && '🔓 '}
              {planLabel[plan] || plan}
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              {isNone && 'Your school is using the free Lockdown mode. Start a pilot or subscribe to unlock everything.'}
              {isPilot && isActive && `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} remaining. Subscribe to keep access after the trial.`}
              {trialExpired && 'Your pilot trial has expired. Subscribe to restore full access.'}
              {isPaid && 'All features are unlocked for your school.'}
            </p>
          </div>
          {planDetails.seats && (isPaid || (isPilot && isActive)) && (
            <div className="flex gap-3 text-xs">
              <span className="bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-700">
                📚 {planDetails.seats.cambridge ?? '∞'} Cambridge
              </span>
              <span className="bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-700">
                🎧 {planDetails.seats.ielts ?? '∞'} IELTS
              </span>
              <span className="bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-700">
                🎮 {planDetails.seats.game ?? '∞'} Game
              </span>
            </div>
          )}
        </div>
        {planDetails.current_members > 0 && (
          <p className="text-xs text-gray-500 mt-3">
            Current members: {planDetails.current_members}
          </p>
        )}
      </div>

      {/* Pilot CTA (only show for 'none') */}
      {isNone && (
        <div className="rounded-xl p-5 border border-cyan-500/20 bg-cyan-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-cyan-300">🚀 {PILOT_PLAN.label} — {PILOT_PLAN.days} Days Free</div>
              <p className="text-xs text-gray-400 mt-1">
                {PILOT_PLAN.seats.cambridge} Cambridge · {PILOT_PLAN.seats.ielts} IELTS · {PILOT_PLAN.seats.game} Game seats. No credit card needed.
              </p>
            </div>
            <button
              onClick={onStartPilot}
              disabled={billingAction !== null}
              className="shrink-0 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-4 py-2 text-sm font-medium text-white transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {billingAction === 'pilot' ? 'Starting…' : 'Start Free Pilot'}
            </button>
          </div>
        </div>
      )}

      {/* Paid plans (show when not on a paid plan, or on pilot/expired) */}
      {!isPaid && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">
              {isNone ? 'Or subscribe now' : trialExpired ? 'Choose a plan to restore access' : 'Upgrade to a paid plan'}
            </h3>
            <div className="inline-flex rounded-xl border border-gray-700 bg-gray-800/50 p-1">
              <button
                onClick={() => setBillingInterval('monthly')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  billingInterval === 'monthly' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingInterval('yearly')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  billingInterval === 'yearly' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                Annual
                <span className="ml-1 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">Save ~17%</span>
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {PAID_PLANS.map((p) => {
              const price = billingInterval === 'yearly' ? p.yearly : p.monthly;
              return (
                <div
                  key={p.id}
                  className={`relative rounded-2xl border p-5 ${
                    p.popular
                      ? 'border-emerald-500/40 bg-emerald-500/5 ring-1 ring-emerald-500/20'
                      : 'border-gray-700 bg-gray-800/40'
                  }`}
                >
                  {p.popular && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                      Most Popular
                    </div>
                  )}
                  <h4 className={`text-lg font-bold ${p.popular ? 'text-emerald-300' : 'text-white'}`}>
                    {p.label}
                  </h4>
                  <div className="mt-1 text-2xl font-bold text-white">
                    ${price.toLocaleString()}
                    <span className="text-sm font-normal text-gray-400">/{billingInterval === 'yearly' ? 'yr' : 'mo'}</span>
                  </div>
                  {billingInterval === 'yearly' && (
                    <p className="text-xs text-emerald-400/70">${Math.round(p.yearly / 12).toLocaleString()}/mo billed annually</p>
                  )}

                  <div className="mt-3 space-y-1.5 text-xs">
                    <div className="flex justify-between rounded-lg bg-gray-900/50 px-2.5 py-1.5">
                      <span className="text-gray-400">📚 Cambridge</span>
                      <span className="font-semibold text-white">up to {p.seats.cambridge}</span>
                    </div>
                    <div className="flex justify-between rounded-lg bg-gray-900/50 px-2.5 py-1.5">
                      <span className="text-gray-400">🎧 IELTS</span>
                      <span className="font-semibold text-white">up to {p.seats.ielts}</span>
                    </div>
                    <div className="flex justify-between rounded-lg bg-gray-900/50 px-2.5 py-1.5">
                      <span className="text-gray-400">🎮 Game</span>
                      <span className="font-semibold text-white">up to {p.seats.game}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => onSubscribe(p)}
                    disabled={billingAction !== null}
                    className={`mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
                      p.popular
                        ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-lg shadow-emerald-500/20 hover:brightness-110'
                        : 'bg-gray-700 text-white hover:bg-gray-600'
                    }`}
                  >
                    {billingAction === p.id ? 'Redirecting…' : 'Subscribe'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Enterprise */}
          <div className="rounded-xl border border-gray-700/40 bg-gray-800/20 p-4 text-center">
            <p className="text-sm text-gray-300">
              <span className="font-semibold text-white">🏢 Enterprise</span> — Unlimited seats · Multi-campus · Custom pricing
            </p>
            <a
              href="mailto:sales@brainsheist.com?subject=Enterprise%20Plan%20Inquiry"
              className="mt-1 inline-block text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Contact sales@brainsheist.com →
            </a>
          </div>
        </>
      )}

      {/* Already on paid — show manage links */}
      {isPaid && (
        <div className="rounded-xl p-5 border border-gray-700 bg-gray-800/40">
          <h4 className="font-semibold text-white mb-2">Manage Subscription</h4>
          <p className="text-sm text-gray-400 mb-3">
            Update your payment method, change plans, or cancel via the Paddle customer portal.
          </p>
          <div className="flex flex-wrap gap-3 mb-3">
            {planDetails?.update_payment_url && (
              <a
                href={planDetails.update_payment_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors active:scale-[0.98]"
              >
                💳 Update Payment Method
              </a>
            )}
            {planDetails?.management_url && planDetails.management_url !== planDetails.update_payment_url && (
              <a
                href={planDetails.management_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 px-4 py-2 text-sm font-medium text-white transition-colors active:scale-[0.98]"
              >
                ⚙️ Cancel / Change Plan
              </a>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Contact <a href="mailto:support@brainsheist.com" className="text-cyan-400 hover:underline">support@brainsheist.com</a> if you need help managing your subscription.
          </p>
        </div>
      )}

      {/* Trust / FAQ */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-500 pt-2">
        <span>🔒 Secure payment via Paddle</span>
        <span>↩️ Cancel anytime</span>
        <span>⚡ Instant activation</span>
        <span>👥 Covers all teachers & students</span>
      </div>

      {/* Legal links */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-gray-600 pt-1.5">
        <a href="/pricing.html" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">Pricing</a>
        <span>·</span>
        <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">Terms</a>
        <span>·</span>
        <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">Privacy</a>
        <span>·</span>
        <a href="/refund.html" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">Refunds</a>
        <span>·</span>
        <a href="/contact.html" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">Contact</a>
      </div>
    </div>
  );
};


export default BillingTab;
