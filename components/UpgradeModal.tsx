import React, { useState } from 'react';
import {
  createCheckoutSession,
  startPilot,
  PAID_PLANS,
  PILOT_PLAN,
  PRO_FEATURES,
  type PlanInfo,
} from '../services/tierService';

// ============================================================================
// UpgradeModal — School subscription pricing
// ============================================================================

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureLabel?: string;
  onPilotStarted?: () => void;  // called after successful pilot activation
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  featureLabel,
  onPilotStarted,
}) => {
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('yearly');
  const [loading, setLoading] = useState<string | null>(null); // plan id being processed
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubscribe = async (plan: PlanInfo) => {
    setLoading(plan.id);
    setError(null);

    const result = await createCheckoutSession({
      plan: plan.id as 'core' | 'standard' | 'pro',
      interval,
    });

    if ('checkout_url' in result) {
      window.location.href = result.checkout_url;
    } else {
      setError(result.error);
      setLoading(null);
    }
  };

  const handleStartPilot = async () => {
    setLoading('pilot');
    setError(null);

    const result = await startPilot();

    if (result.success) {
      onPilotStarted?.();
    } else {
      setError(result.error || 'Failed to start pilot');
      setLoading(null);
    }
  };

  const savingsPercent = Math.round(
    (1 - PAID_PLANS[1].yearly / (PAID_PLANS[1].monthly * 12)) * 100,
  );

  const formatPrice = (plan: PlanInfo) => {
    const price = interval === 'yearly' ? plan.yearly : plan.monthly;
    return price.toLocaleString();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl border border-slate-700/60 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 shadow-2xl shadow-emerald-500/10">
        {/* Header glow */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-60"
          style={{
            background:
              'radial-gradient(ellipse at 50% 0%, rgba(16, 185, 129, 0.25), transparent 70%)',
          }}
        />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-slate-800/80 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
        >
          ✕
        </button>

        <div className="relative p-5 sm:p-8">
          {/* Title */}
          <div className="mb-5 text-center">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-1.5 text-sm font-semibold text-emerald-300">
              🧠 Brain Heist
            </div>
            <h2 className="text-xl font-bold text-white sm:text-2xl">
              Choose Your School Plan
            </h2>
            {featureLabel && (
              <p className="mt-1.5 text-sm text-slate-400">
                <span className="font-medium text-amber-300">{featureLabel}</span>{' '}
                requires a subscription
              </p>
            )}
          </div>

          {/* Pilot banner */}
          <div className="mb-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
                  🚀 {PILOT_PLAN.label} — {PILOT_PLAN.days} Days Free
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {PILOT_PLAN.seats.cambridge} Cambridge · {PILOT_PLAN.seats.ielts} IELTS · {PILOT_PLAN.seats.game} Game seats
                </p>
              </div>
              <button
                onClick={handleStartPilot}
                disabled={loading !== null}
                className="shrink-0 rounded-xl bg-cyan-500/20 border border-cyan-500/30 px-5 py-2.5 text-sm font-semibold text-cyan-200 transition-all hover:bg-cyan-500/30 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading === 'pilot' ? (
                  <span className="flex items-center gap-2">
                    <Spinner /> Starting…
                  </span>
                ) : (
                  'Start Free Pilot'
                )}
              </button>
            </div>
          </div>

          {/* Interval toggle */}
          <div className="mb-4 flex justify-center">
            <div className="inline-flex rounded-xl border border-slate-700 bg-slate-800/50 p-1">
              <button
                onClick={() => setInterval('monthly')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  interval === 'monthly'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setInterval('yearly')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  interval === 'yearly'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Annual
                <span className="ml-1.5 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">
                  Save ~{savingsPercent}%
                </span>
              </button>
            </div>
          </div>

          {/* Plan cards */}
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            {PAID_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-4 transition-all ${
                  plan.popular
                    ? 'border-emerald-500/40 bg-emerald-500/5 ring-1 ring-emerald-500/20'
                    : 'border-slate-700/60 bg-slate-800/30'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                    Most Popular
                  </div>
                )}

                <div className="mb-3 text-center">
                  <h3 className={`text-lg font-bold ${plan.popular ? 'text-emerald-300' : 'text-white'}`}>
                    {plan.label}
                  </h3>
                  <div className="mt-1 text-2xl font-bold text-white">
                    ${formatPrice(plan)}
                    <span className="text-sm font-normal text-slate-400">
                      /{interval === 'yearly' ? 'yr' : 'mo'}
                    </span>
                  </div>
                  {interval === 'yearly' && (
                    <p className="text-xs text-emerald-400/70">
                      ${Math.round(plan.yearly / 12).toLocaleString()}/mo billed annually
                    </p>
                  )}
                </div>

                {/* Seats */}
                <div className="mb-4 space-y-1.5 text-xs">
                  <SeatRow icon="📚" label="Cambridge" count={plan.seats.cambridge} />
                  <SeatRow icon="🎧" label="IELTS" count={plan.seats.ielts} />
                  <SeatRow icon="🎮" label="Game" count={plan.seats.game} />
                </div>

                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={loading !== null}
                  className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
                    plan.popular
                      ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-lg shadow-emerald-500/20 hover:brightness-110'
                      : 'bg-slate-700 text-white hover:bg-slate-600'
                  }`}
                >
                  {loading === plan.id ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner /> Redirecting…
                    </span>
                  ) : (
                    'Subscribe'
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Enterprise */}
          <div className="mb-5 rounded-2xl border border-slate-700/40 bg-slate-800/20 p-4 text-center">
            <p className="text-sm text-slate-300">
              <span className="font-semibold text-white">🏢 Enterprise</span>
              {' '}— Unlimited seats · Multi-campus · Custom pricing
            </p>
            <a
              href="mailto:sales@brainsheist.com?subject=Enterprise%20Plan%20Inquiry"
              className="mt-2 inline-block text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Contact sales@brainsheist.com →
            </a>
          </div>

          {/* What's included */}
          <details className="mb-4 group">
            <summary className="cursor-pointer text-sm font-medium text-slate-400 hover:text-slate-300 transition-colors">
              All plans include ▸
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {PRO_FEATURES.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2 rounded-xl border border-slate-800/60 bg-slate-800/30 px-3 py-2 text-xs text-slate-300"
                >
                  <span className="text-emerald-400">✓</span>
                  {f.label}
                </div>
              ))}
              <div className="flex items-center gap-2 rounded-xl border border-slate-800/60 bg-slate-800/30 px-3 py-2 text-xs text-slate-300">
                <span className="text-emerald-400">✓</span>
                All Lockdown maps
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-800/60 bg-slate-800/30 px-3 py-2 text-xs text-slate-300">
                <span className="text-emerald-400">✓</span>
                Unlimited duration
              </div>
            </div>
          </details>

          {/* Error */}
          {error && (
            <p className="mb-4 text-center text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-2.5 border border-red-500/20">
              {error}
            </p>
          )}

          {/* Trust signals */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
            <span>🔒 Secure via Stripe</span>
            <span>↩️ Cancel anytime</span>
            <span>⚡ Instant activation</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Sub-components ──

const Spinner: React.FC = () => (
  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
      fill="none"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
);

const SeatRow: React.FC<{ icon: string; label: string; count: number }> = ({
  icon,
  label,
  count,
}) => (
  <div className="flex items-center justify-between rounded-lg bg-slate-900/50 px-2.5 py-1.5">
    <span className="text-slate-400">
      {icon} {label}
    </span>
    <span className="font-semibold text-white">up to {count}</span>
  </div>
);

export default UpgradeModal;
