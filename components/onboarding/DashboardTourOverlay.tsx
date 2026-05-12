import React from 'react';
import type { Profile } from '../../types';
import { getOnboardingFlags } from '../../src/features/onboarding/featureFlags';
import { emitOnboardingEvent } from '../../src/features/onboarding/onboardingAnalytics';
import { getOnboardingState, updateOnboardingState } from '../../src/features/onboarding/onboardingService';
import type { OnboardingState } from '../../src/features/onboarding/onboardingTypes';
import {
  appendDashboardTourCompletedStep,
  DASHBOARD_TOUR_STEPS,
  type DashboardTourMetadata,
  type DashboardTourStep,
  getDashboardTourMetadata,
  getInitialDashboardTourStep,
  getNextDashboardTourStep,
  shouldShowDashboardTour,
} from '../../src/features/onboarding/dashboardTour';

interface DashboardTourOverlayProps {
  profile?: Partial<Profile> | null;
  active?: boolean;
  onStartMission?: () => void;
}

interface TourStepConfig {
  id: DashboardTourStep;
  eyebrow: string;
  title: string;
  copy: string;
  selectors: string[];
  primaryCta: string;
  interactive?: boolean;
}

const TOUR_STEPS: TourStepConfig[] = [
  {
    id: 'base_unlocked',
    eyebrow: 'Base online',
    title: 'Dashboard unlocked',
    copy: 'Base unlocked. I’ll show you the only controls you need right now.',
    selectors: [],
    primaryCta: 'Show me',
  },
  {
    id: 'profile_progress',
    eyebrow: 'Agent badge',
    title: 'Your command profile',
    copy: 'This is your agent badge. Your avatar, level, XP bar, and stats live here.',
    selectors: ['[data-testid="dashboard-profile-card"]'],
    primaryCta: 'Got it',
  },
  {
    id: 'xp_rewards',
    eyebrow: 'Reward loop',
    title: 'XP turns effort into progress',
    copy: 'XP levels you up. Coins and rewards come from missions. Your first mission starts the loop.',
    selectors: ['[data-testid="profile-xp-progress"]', '[data-testid="dashboard-profile-card"]'],
    primaryCta: 'Find missions',
  },
  {
    id: 'first_mission',
    eyebrow: 'Mission ready',
    title: 'Launch when ready',
    copy: 'This is the mission button. Tap it to preview your first route and start earning.',
    selectors: ['[data-testid="dashboard-start-quest"]'],
    primaryCta: 'Start mission',
    interactive: true,
  },
];

const TARGET_RETRY_MS = 1200;
const TARGET_RETRY_INTERVAL_MS = 120;

const findTarget = (selectors: string[]): { element: HTMLElement; selector: string } | null => {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement) {
      return { element, selector };
    }
  }
  return null;
};

const mergeTourMetadata = (
  existing: DashboardTourMetadata,
  patch: DashboardTourMetadata,
): DashboardTourMetadata => ({
  ...existing,
  ...patch,
  completed_steps: patch.completed_steps ?? existing.completed_steps,
});

const DashboardTourOverlay: React.FC<DashboardTourOverlayProps> = ({
  profile,
  active = true,
  onStartMission,
}) => {
  const flags = getOnboardingFlags();
  const [onboardingState, setOnboardingState] = React.useState<OnboardingState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [hidden, setHidden] = React.useState(false);
  const [step, setStep] = React.useState<DashboardTourStep>('base_unlocked');
  const [targetRect, setTargetRect] = React.useState<DOMRect | null>(null);
  const [targetFound, setTargetFound] = React.useState(false);
  const [targetSelector, setTargetSelector] = React.useState<string | null>(null);
  const seenStepsRef = React.useRef<Set<DashboardTourStep>>(new Set());
  const startedRef = React.useRef(false);
  const completingMissionRef = React.useRef(false);

  const tourMetadata = React.useMemo(() => getDashboardTourMetadata(onboardingState), [onboardingState]);
  const shouldShow = active && !hidden && shouldShowDashboardTour({
    profile,
    state: onboardingState,
    ftueEnabled: flags.ftue_enabled,
  });
  const currentStep = TOUR_STEPS.find((item) => item.id === step) ?? TOUR_STEPS[0];
  const currentIndex = Math.max(0, DASHBOARD_TOUR_STEPS.indexOf(step));
  const isFallback = currentStep.selectors.length > 0 && !targetFound;
  const isMissionStep = currentStep.id === 'first_mission';

  const persistTour = React.useCallback(async (patch: DashboardTourMetadata) => {
    const nextTour = mergeTourMetadata(getDashboardTourMetadata(onboardingState), patch);
    const nextState = await updateOnboardingState({
      metadata: { dashboard_tour: nextTour },
    }, profile?.id);
    if (nextState) setOnboardingState(nextState);
    return nextState;
  }, [onboardingState, profile?.id]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getOnboardingState(profile?.id).then((state) => {
      if (cancelled) return;
      setOnboardingState(state);
      setStep(getInitialDashboardTourStep(getDashboardTourMetadata(state)));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [profile?.id]);

  React.useEffect(() => {
    if (!shouldShow || startedRef.current) return;
    startedRef.current = true;
    const metadata = getDashboardTourMetadata(onboardingState);
    const now = new Date().toISOString();
    const resume = metadata.status === 'active';
    void persistTour({
      status: 'active',
      current_step: getInitialDashboardTourStep(metadata),
      completed_steps: metadata.completed_steps ?? [],
      started_at: metadata.started_at ?? now,
    });
    void emitOnboardingEvent({
      event: 'dashboard_tour_started',
      user_id: onboardingState?.user_id ?? profile?.id,
      segment: onboardingState?.segment ?? undefined,
      context_type: onboardingState?.context_type ?? undefined,
      step: 'dashboard_reveal',
      metadata: {
        resume,
        entry_step: getInitialDashboardTourStep(metadata),
        source: resume ? 'resume' : 'phase_1a_complete',
      },
    });
  }, [onboardingState, persistTour, profile?.id, shouldShow]);

  React.useEffect(() => {
    if (!shouldShow || !currentStep) return;
    let cancelled = false;
    let intervalId: number | undefined;
    const startedAt = Date.now();
    setTargetFound(false);
    setTargetSelector(null);
    setTargetRect(null);

    const syncTarget = () => {
      if (currentStep.selectors.length === 0) {
        setTargetFound(false);
        setTargetSelector(null);
        setTargetRect(null);
        return true;
      }

      const result = findTarget(currentStep.selectors);
      if (result) {
        result.element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        window.setTimeout(() => {
          if (cancelled) return;
          setTargetFound(true);
          setTargetSelector(result.selector);
          setTargetRect(result.element.getBoundingClientRect());
        }, 180);
        return true;
      }

      if (Date.now() - startedAt >= TARGET_RETRY_MS) {
        setTargetFound(false);
        setTargetSelector(null);
        setTargetRect(null);
        return true;
      }

      return false;
    };

    if (!syncTarget()) {
      intervalId = window.setInterval(() => {
        if (syncTarget() && intervalId !== undefined) {
          window.clearInterval(intervalId);
        }
      }, TARGET_RETRY_INTERVAL_MS);
    }

    const handleWindowChange = () => {
      const result = findTarget(currentStep.selectors);
      if (result) setTargetRect(result.element.getBoundingClientRect());
    };
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    return () => {
      cancelled = true;
      if (intervalId !== undefined) window.clearInterval(intervalId);
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [currentStep, shouldShow, step]);

  React.useEffect(() => {
    if (!shouldShow || seenStepsRef.current.has(step)) return;
    seenStepsRef.current.add(step);
    void emitOnboardingEvent({
      event: 'tour_step_seen',
      user_id: onboardingState?.user_id ?? profile?.id,
      segment: onboardingState?.segment ?? undefined,
      context_type: onboardingState?.context_type ?? undefined,
      step: 'dashboard_reveal',
      metadata: {
        tour_step: step,
        target_found: targetFound,
        target_selector: targetSelector,
        fallback: currentStep.selectors.length > 0 && !targetFound,
        viewport: typeof window !== 'undefined' && window.innerWidth < 768 ? 'mobile' : 'desktop',
      },
    });
  }, [currentStep.selectors.length, onboardingState, profile?.id, shouldShow, step, targetFound, targetSelector]);

  const completeCurrentStep = React.useCallback(async (next: DashboardTourStep | 'complete') => {
    const completedSteps = appendDashboardTourCompletedStep(tourMetadata.completed_steps, step);
    await emitOnboardingEvent({
      event: 'tour_step_completed',
      user_id: onboardingState?.user_id ?? profile?.id,
      segment: onboardingState?.segment ?? undefined,
      context_type: onboardingState?.context_type ?? undefined,
      step: 'dashboard_reveal',
      metadata: { tour_step: step, next_step: next },
    });
    if (next !== 'complete') {
      await persistTour({
        status: 'active',
        current_step: next,
        completed_steps: completedSteps,
      });
      setStep(next);
    }
  }, [onboardingState, persistTour, profile?.id, step, tourMetadata.completed_steps]);

  const completeMissionStep = React.useCallback(async (options: { launchMission: boolean }) => {
    if (completingMissionRef.current) return;
    completingMissionRef.current = true;
    const now = new Date().toISOString();
    const completedSteps = appendDashboardTourCompletedStep(tourMetadata.completed_steps, 'first_mission');

    await emitOnboardingEvent({
      event: 'first_mission_cta_clicked',
      user_id: onboardingState?.user_id ?? profile?.id,
      segment: onboardingState?.segment ?? undefined,
      context_type: onboardingState?.context_type ?? undefined,
      step: 'dashboard_reveal',
      metadata: { source: 'dashboard_tour', target: 'dashboard-start-quest' },
    });
    await emitOnboardingEvent({
      event: 'tour_step_completed',
      user_id: onboardingState?.user_id ?? profile?.id,
      segment: onboardingState?.segment ?? undefined,
      context_type: onboardingState?.context_type ?? undefined,
      step: 'dashboard_reveal',
      metadata: { tour_step: 'first_mission', next_step: 'complete' },
    });
    await persistTour({
      status: 'completed',
      current_step: 'first_mission',
      completed_steps: completedSteps,
      completed_at: now,
      first_mission_cta_clicked: true,
    });
    await emitOnboardingEvent({
      event: 'dashboard_tour_completed',
      user_id: onboardingState?.user_id ?? profile?.id,
      segment: onboardingState?.segment ?? undefined,
      context_type: onboardingState?.context_type ?? undefined,
      step: 'dashboard_reveal',
      metadata: {
        completed_steps: completedSteps,
        first_mission_cta_clicked: true,
      },
    });
    setHidden(true);
    if (options.launchMission) onStartMission?.();
  }, [onboardingState, onStartMission, persistTour, profile?.id, tourMetadata.completed_steps]);

  React.useEffect(() => {
    if (!shouldShow) return;
    const handleMissionClick = () => {
      void completeMissionStep({ launchMission: false });
    };
    window.addEventListener('brains-heist:first-mission-cta-clicked', handleMissionClick);
    return () => window.removeEventListener('brains-heist:first-mission-cta-clicked', handleMissionClick);
  }, [completeMissionStep, shouldShow]);

  const handlePrimary = async () => {
    if (currentStep.interactive) {
      await completeMissionStep({ launchMission: true });
      return;
    }
    const next = getNextDashboardTourStep(step);
    if (next !== 'complete') await completeCurrentStep(next);
  };

  const handleSkip = async () => {
    const now = new Date().toISOString();
    await persistTour({
      status: 'skipped',
      current_step: step,
      completed_steps: tourMetadata.completed_steps ?? [],
      skipped_at: now,
    });
    setHidden(true);
  };

  if (loading || !shouldShow) return null;

  const ringStyle = targetRect ? {
    top: Math.max(10, targetRect.top - 10),
    left: Math.max(10, targetRect.left - 10),
    width: Math.min(window.innerWidth - 20, targetRect.width + 20),
    height: targetRect.height + 20,
  } : undefined;

  return (
    <div className="pointer-events-none fixed inset-0 z-[10000]" aria-live="polite" data-testid="dashboard-tour-overlay">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(34,211,238,0.12),transparent_34%),linear-gradient(180deg,rgba(2,6,23,0.48),rgba(2,6,23,0.62))] backdrop-blur-[1.5px] transition-opacity duration-300" />
      {targetRect && targetFound && ringStyle && (
        <div
          className="pointer-events-none fixed rounded-[1.35rem] border border-cyan-100/80 bg-cyan-200/[0.03] shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_0_28px_rgba(34,211,238,0.36)] transition-[top,left,width,height,opacity,transform] duration-300 ease-out"
          style={ringStyle}
          aria-hidden
        />
      )}

      <section
        className={`pointer-events-auto fixed ${isFallback || step === 'base_unlocked' ? 'left-1/2 top-1/2 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 px-1' : 'inset-x-3 bottom-3 pb-[env(safe-area-inset-bottom)] md:bottom-6 md:left-auto md:right-6 md:w-[26rem] md:pb-0'}`}
      >
        <div key={step} className="animate-[dashboardTourCard_240ms_ease-out] overflow-hidden rounded-[1.75rem] border border-cyan-200/20 bg-slate-950/92 text-white shadow-[0_24px_70px_rgba(0,0,0,0.45),0_0_42px_rgba(14,165,233,0.12)] ring-1 ring-white/5 backdrop-blur-xl">
          <div className="h-px bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent" />
          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-lg shadow-[0_0_24px_rgba(34,211,238,0.20)] ${isMissionStep ? 'border-emerald-200/50 bg-emerald-300/15 text-emerald-100' : 'border-cyan-200/35 bg-cyan-300/12 text-cyan-100'}`} aria-hidden>
                <span className="absolute inset-1 rounded-xl bg-white/5" />
                <span className="relative">{isMissionStep ? '▶' : '◈'}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/90">{currentStep.eyebrow}</p>
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-slate-300">
                    {currentIndex + 1}/{TOUR_STEPS.length}
                  </span>
                </div>
                <h2 className="mt-2 text-xl font-black leading-tight tracking-tight text-white sm:text-2xl">{currentStep.title}</h2>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-300 sm:text-[15px]">{currentStep.copy}</p>
                {isMissionStep && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-bold text-emerald-100">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.9)]" aria-hidden />
                    First route ready
                  </div>
                )}
                {isFallback && (
                  <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-5 text-slate-400">Target offline for a moment — you can continue safely.</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5" aria-label={`Dashboard tour step ${currentIndex + 1} of ${TOUR_STEPS.length}`}>
              {TOUR_STEPS.map((item, index) => (
                <div
                  key={item.id}
                  className={`h-1.5 rounded-full transition-all duration-300 ${index <= currentIndex ? (isMissionStep ? 'w-8 bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.5)]' : 'w-8 bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.42)]') : 'w-3 bg-white/12'}`}
                />
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => { void handlePrimary(); }}
                className={`min-h-12 flex-1 rounded-2xl px-5 py-3 text-sm font-black text-slate-950 shadow-lg transition duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${isMissionStep ? 'bg-gradient-to-r from-emerald-300 via-cyan-200 to-sky-300 shadow-emerald-400/20 hover:shadow-emerald-300/35 focus-visible:ring-emerald-200' : 'bg-gradient-to-r from-cyan-200 via-sky-200 to-cyan-300 shadow-cyan-400/20 hover:shadow-cyan-300/35 focus-visible:ring-cyan-100'}`}
              >
                {currentStep.primaryCta}{isMissionStep ? ' →' : ''}
              </button>
              <button
                type="button"
                onClick={() => { void handleSkip(); }}
                className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-bold text-slate-300 transition duration-200 hover:border-white/20 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      </section>
      <style>{`@keyframes dashboardTourCard { from { opacity: 0; transform: translate3d(0, 10px, 0) scale(0.985); } to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); } }`}</style>
    </div>
  );
};

export default DashboardTourOverlay;
