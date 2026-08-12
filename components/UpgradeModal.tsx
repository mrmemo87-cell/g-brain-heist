import React, { useState, useEffect } from 'react';
import {
  createCheckoutSession,
  startPilot,
  fetchSchoolPlanDetails,
  PAID_PLANS,
  PILOT_PLAN,
  PRO_FEATURES,
  type PlanInfo,
} from '../services/tierService';
import VisualFallbackImage from './VisualFallbackImage';
import { getMySchoolCapabilities } from '../services/schoolAdminService';
import { visualAssets, neonIcon } from './visualAssets';
import DotLottieAnimation from './DotLottieAnimation';

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
  const [pilotAlreadyUsed, setPilotAlreadyUsed] = useState(false);
  const [planLoading, setPlanLoading] = useState(true);
  const [viewerIsSchoolMember, setViewerIsSchoolMember] = useState(false);
  const [canManageSchoolBilling, setCanManageSchoolBilling] = useState(true);

  // Fetch the school plan together with the caller's school authority. Billing
  // controls are never shown to ordinary school members.
  useEffect(() => {
    if (!isOpen) {
      setPlanLoading(true);
      setViewerIsSchoolMember(false);
      setCanManageSchoolBilling(true);
      return;
    }

    Promise.all([fetchSchoolPlanDetails(), getMySchoolCapabilities()])
      .then(([details, capabilities]) => {
        const hasSchoolContext = Boolean(capabilities?.school_id);
        const alreadyUsed = hasSchoolContext
          && (details.plan === 'pilot' || details.trial_ends_at !== null);
        setPilotAlreadyUsed(alreadyUsed);
        setViewerIsSchoolMember(hasSchoolContext);
        setCanManageSchoolBilling(Boolean(capabilities?.can_manage_billing));
        setPlanLoading(false);
      })
      .catch(() => {
        // Fail closed for school billing controls. If authority cannot be
        // resolved, do not expose a purchase/pilot action to a school member.
        setViewerIsSchoolMember(true);
        setCanManageSchoolBilling(false);
        setPlanLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const showSchoolManagedAccess = !planLoading && viewerIsSchoolMember && !canManageSchoolBilling;

  if (showSchoolManagedAccess) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
        <div className="relative z-10 w-full max-w-lg rounded-3xl border border-cyan-500/25 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl sm:p-8">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white"
          >
            ✕
          </button>
          <div className="pr-10">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-sm font-semibold text-cyan-200">
              🏫 School-managed access
            </div>
            <h2 className="text-2xl font-bold text-white">School Access Not Active</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {featureLabel ? <><span className="font-semibold text-white">{featureLabel}</span> is not active for your school yet. </> : null}
              Your School Head manages the school plan and the free pilot. You do not need to buy anything from your student or teacher account.
            </p>
            <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4 text-sm text-amber-100">
              Ask your School Head to activate the 30-day pilot or a school plan. Access will update for school members after activation.
            </div>
            <button
              onClick={onClose}
              className="mt-6 w-full rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            <div className="flex justify-center mb-2">
              <DotLottieAnimation
                src="/lotties/Premium Gold.lottie"
                width={80}
                height={80}
                loop
              />
            </div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-1.5 text-sm font-semibold text-emerald-300">
              <img src={neonIcon('premium')} alt="" className="h-5 w-5 object-contain" />
              Brains Heist
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

          <VisualFallbackImage
            src={visualAssets.prime.upgrade}
            alt="Upgrade visual"
            className="mb-5 w-full overflow-hidden rounded-2xl border border-emerald-500/20"
            imgClassName="block w-full h-auto object-contain"
            fallback={(
              <div className="mb-5 flex h-24 items-center justify-between rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-blue-500/10 px-4">
                <div>
                  <p className="text-sm font-semibold text-white">Unlock premium school features</p>
                  <p className="text-xs text-emerald-200">More seats, more tools, better engagement</p>
                </div>
                <span className="text-2xl" aria-hidden>⭐</span>
              </div>
            )}
          />

          {/* Pilot banner */}
          {featureLabel && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-500/5 p-3">
              <img src={visualAssets.prime.onlyPrime} alt="" className="h-10 w-10 object-contain flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <p className="text-xs text-amber-200">This feature is included when your school has an active plan or pilot.</p>
            </div>
          )}
          {!planLoading && (
            <div className={`mb-5 rounded-2xl border p-4 ${
              pilotAlreadyUsed
                ? 'border-slate-700/40 bg-slate-800/20'
                : 'border-cyan-500/20 bg-cyan-500/5'
            }`}>
              {pilotAlreadyUsed ? (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                      Free Pilot Trial — Already Used
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Your school has already completed its free pilot trial. Subscribe to a plan below to restore full access.
                    </p>
                  </div>
                </div>
              ) : (
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
              )}
            </div>
          )}

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
          <div className="flex flex-col items-center gap-2">
            <DotLottieAnimation
              src="/lotties/Payment Card Security animation - Floating Cards Morphing into Padlock.lottie"
              width={120}
              height={80}
              loop
            />
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
              <span>🔒 Secure checkout via Paddle</span>
              <span>↩️ Cancel anytime</span>
              <span>⚡ Instant activation</span>
            </div>
          </div>

          {/* Legal links */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-600">
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">Terms of Service</a>
            <span>·</span>
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">Privacy Policy</a>
            <span>·</span>
            <a href="/refund.html" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">Refund Policy</a>
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
