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
  icon: string;
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
    icon: '👋',
    eyebrow: 'Dashboard ready',
    title: 'Welcome to your dashboard',
    copy: 'This is your daily starting point. We’ll show you the essentials in under a minute.',
    selectors: [],
    primaryCta: 'Start the tour',
  },
  {
    id: 'profile_progress',
    icon: '🪪',
    eyebrow: 'Your learner identity',
    title: 'See your status at a glance',
    copy: 'Your profile keeps your level, school identity, and current progress together.',
    selectors: ['[data-testid="dashboard-profile-card"]'],
    primaryCta: 'Next',
  },
  {
    id: 'xp_rewards',
    icon: '⚡',
    eyebrow: 'Visible momentum',
    title: 'Watch your progress build',
    copy: 'XP moves your level forward while streaks and rewards make consistency visible.',
    selectors: ['[data-testid="profile-xp-progress"]', '[data-testid="dashboard-profile-card"]'],
    primaryCta: 'Show me around',
  },
  {
    id: 'navigation',
    icon: '🧭',
    eyebrow: 'Move with confidence',
    title: 'Your dashboard map is always nearby',
    copy: 'On a phone, use the bottom bar. On a larger screen, use the side navigation to reach Learn, Game, Tasks, Clan, Leaderboard, and More.',
    selectors: ['[data-testid="dashboard-navigation-mobile"]', '[data-testid="dashboard-navigation-desktop"]'],
    primaryCta: 'Got it',
  },
  {
    id: 'first_mission',
    icon: '🚀',
    eyebrow: 'Your next action',
    title: 'Start with one clear mission',
    copy: 'This card always gives you a direct way to move your learning forward.',
    selectors: ['[data-testid="dashboard-start-quest"]'],
    primaryCta: 'Start my first mission',
    interactive: true,
  },
];

const TARGET_RETRY_MS = 1200;
const TARGET_RETRY_INTERVAL_MS = 120;

interface TourCardLayout {
  className: string;
  style?: React.CSSProperties;
  placement: 'center' | 'bottom' | 'right' | 'below' | 'above' | 'left';
  cueStyle?: React.CSSProperties;
}

const CARD_WIDTH = 416;
const CARD_GAP = 22;
const VIEWPORT_PADDING = 16;
const SPOTLIGHT_PADDING = 12;
const DESKTOP_MIN_WIDTH = 768;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getTourCardLayout = (targetRect: DOMRect | null, targetFound: boolean, isIntro: boolean): TourCardLayout => {
  if (typeof window === 'undefined') {
    return { className: 'left-1/2 top-1/2 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 px-1', placement: 'center' };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const mobileBottomSheet = 'inset-x-3 bottom-3 pb-[env(safe-area-inset-bottom)]';
  const mobileTopSheet = 'inset-x-3 top-3 pt-[env(safe-area-inset-top)]';

  if (viewportWidth < DESKTOP_MIN_WIDTH && targetFound && !isIntro) {
    const targetIsLow = Boolean(targetRect && targetRect.top > viewportHeight * 0.52);
    return {
      className: targetIsLow ? mobileTopSheet : mobileBottomSheet,
      placement: targetIsLow ? 'above' : 'bottom',
    };
  }

  if (isIntro || !targetRect || !targetFound) {
    return { className: 'left-1/2 top-1/2 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 px-1', placement: 'center' };
  }

  const maxCardLeft = viewportWidth - CARD_WIDTH - VIEWPORT_PADDING;
  const idealTop = clamp(targetRect.top + targetRect.height / 2 - 132, VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, viewportHeight - 300));
  const idealLeft = clamp(targetRect.left + targetRect.width / 2 - CARD_WIDTH / 2, VIEWPORT_PADDING, maxCardLeft);
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;

  const spaceRight = viewportWidth - targetRect.right;
  if (spaceRight >= CARD_WIDTH + CARD_GAP + VIEWPORT_PADDING) {
    const top = idealTop;
    return {
      className: 'w-[26rem]',
      placement: 'right',
      style: { left: targetRect.right + CARD_GAP, top },
      cueStyle: { left: -7, top: clamp(targetCenterY - top - 7, 24, 236) },
    };
  }

  const spaceBelow = viewportHeight - targetRect.bottom;
  if (spaceBelow >= 230) {
    const left = idealLeft;
    return {
      className: 'w-[26rem]',
      placement: 'below',
      style: { left, top: targetRect.bottom + CARD_GAP },
      cueStyle: { top: -7, left: clamp(targetCenterX - left - 7, 28, CARD_WIDTH - 40) },
    };
  }

  if (targetRect.top >= 230) {
    const left = idealLeft;
    return {
      className: 'w-[26rem]',
      placement: 'above',
      style: { left, bottom: viewportHeight - targetRect.top + CARD_GAP },
      cueStyle: { bottom: -7, left: clamp(targetCenterX - left - 7, 28, CARD_WIDTH - 40) },
    };
  }

  if (targetRect.left >= CARD_WIDTH + CARD_GAP + VIEWPORT_PADDING) {
    const top = idealTop;
    return {
      className: 'w-[26rem]',
      placement: 'left',
      style: { left: targetRect.left - CARD_WIDTH - CARD_GAP, top },
      cueStyle: { right: -7, top: clamp(targetCenterY - top - 7, 24, 236) },
    };
  }

  return { className: 'left-1/2 top-1/2 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 px-1', placement: 'center' };
};

const findTarget = (selectors: string[]): { element: HTMLElement; selector: string } | null => {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
        return { element, selector };
      }
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
  const dialogRef = React.useRef<HTMLElement>(null);

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
  const isNavigationStep = currentStep.id === 'navigation';

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

  React.useEffect(() => {
    if (!shouldShow) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [shouldShow]);

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

  React.useEffect(() => {
    if (!shouldShow) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => previouslyFocused?.focus();
  }, [shouldShow]);

  React.useEffect(() => {
    if (shouldShow) window.requestAnimationFrame(() => dialogRef.current?.focus());
  }, [shouldShow, step]);

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      void handleSkip();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'));
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (loading || !shouldShow) return null;

  const spotlightStyle = targetRect ? (() => {
    const top = Math.max(0, targetRect.top - SPOTLIGHT_PADDING);
    const left = Math.max(0, targetRect.left - SPOTLIGHT_PADDING);
    return {
      top,
      left,
      width: Math.min(window.innerWidth - left, targetRect.width + SPOTLIGHT_PADDING * 2),
      height: Math.min(window.innerHeight - top, targetRect.height + SPOTLIGHT_PADDING * 2),
    };
  })() : undefined;
  const ringStyle = spotlightStyle ? {
    top: spotlightStyle.top,
    left: spotlightStyle.left,
    width: spotlightStyle.width,
    height: spotlightStyle.height,
  } : undefined;
  const cardLayout = getTourCardLayout(targetRect, targetFound, step === 'base_unlocked');
  const hasAnchoredCue = cardLayout.placement !== 'center' && cardLayout.placement !== 'bottom' && cardLayout.cueStyle;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[10000]" aria-live="polite" data-testid="dashboard-tour-overlay">
      {spotlightStyle && targetFound ? (
        <>
          <div className="pointer-events-none fixed inset-x-0 top-0 bg-slate-950/90 backdrop-blur-[2px] transition-[height] duration-300" style={{ height: spotlightStyle.top }} aria-hidden />
          <div className="pointer-events-none fixed inset-x-0 bottom-0 bg-slate-950/90 backdrop-blur-[2px] transition-[top] duration-300" style={{ top: spotlightStyle.top + spotlightStyle.height }} aria-hidden />
          <div className="pointer-events-none fixed left-0 bg-slate-950/90 backdrop-blur-[2px] transition-[top,width,height] duration-300" style={{ top: spotlightStyle.top, width: spotlightStyle.left, height: spotlightStyle.height }} aria-hidden />
          <div className="pointer-events-none fixed right-0 bg-slate-950/90 backdrop-blur-[2px] transition-[top,left,height] duration-300" style={{ top: spotlightStyle.top, left: spotlightStyle.left + spotlightStyle.width, height: spotlightStyle.height }} aria-hidden />
        </>
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(34,211,238,0.14),transparent_32%),linear-gradient(180deg,rgba(8,15,30,0.97),rgba(2,6,23,0.98))] backdrop-blur-[3px] transition-opacity duration-300" aria-hidden />
      )}
      {targetRect && targetFound && ringStyle && (
        <div
          className="pointer-events-none fixed rounded-[1.35rem] border border-cyan-100/65 shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_0_18px_rgba(34,211,238,0.22)] transition-[top,left,width,height,opacity,transform] duration-300 ease-out"
          style={ringStyle}
          aria-hidden
        />
      )}

      <section
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className={`pointer-events-auto fixed ${cardLayout.className}`}
        style={cardLayout.style}
        data-placement={cardLayout.placement}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-tour-title"
      >
        {hasAnchoredCue && (
          <span
            className="pointer-events-none absolute z-10 hidden h-3.5 w-3.5 rotate-45 rounded-[0.2rem] border border-cyan-200/20 bg-[#07101f] shadow-[0_0_18px_rgba(34,211,238,0.22)] md:block"
            style={cardLayout.cueStyle}
            aria-hidden
          />
        )}
        <div key={step} className="max-h-[calc(100vh-1.5rem)] animate-[dashboardTourCard_240ms_ease-out] overflow-y-auto rounded-[1.75rem] border border-cyan-200/25 bg-[#07101f] text-white shadow-[0_28px_80px_rgba(0,0,0,0.72),0_0_34px_rgba(14,165,233,0.16)] ring-1 ring-white/10">
          <div className="h-px bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent" />
          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-xl ${isMissionStep ? 'border-emerald-200/50 bg-emerald-300/15 shadow-[0_0_26px_rgba(52,211,153,0.20)]' : isNavigationStep ? 'border-fuchsia-200/45 bg-fuchsia-300/15 shadow-[0_0_26px_rgba(217,70,239,0.18)]' : 'border-cyan-200/35 bg-cyan-300/12 shadow-[0_0_24px_rgba(34,211,238,0.20)]'}`} aria-hidden>
                <span className="absolute inset-1 rounded-xl bg-white/5" />
                <span className="relative">{currentStep.icon}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/90">{currentStep.eyebrow}</p>
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-slate-300">
                    {currentIndex + 1}/{TOUR_STEPS.length}
                  </span>
                </div>
                <h2 id="dashboard-tour-title" className="mt-2 text-xl font-black leading-tight tracking-tight text-white sm:text-2xl">{currentStep.title}</h2>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-300 sm:text-[15px]">{currentStep.copy}</p>
                {isMissionStep && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-bold text-emerald-100">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.9)]" aria-hidden />
                    Ready when you are
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
                className={`min-h-12 flex-1 rounded-2xl px-5 py-3 text-sm font-black text-slate-950 shadow-lg transition duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${isMissionStep ? 'bg-gradient-to-r from-emerald-300 via-cyan-200 to-sky-300 shadow-emerald-400/20 hover:shadow-emerald-300/35 focus-visible:ring-emerald-200' : isNavigationStep ? 'bg-gradient-to-r from-fuchsia-200 via-violet-200 to-cyan-200 shadow-fuchsia-400/20 hover:shadow-fuchsia-300/35 focus-visible:ring-fuchsia-100' : 'bg-gradient-to-r from-cyan-200 via-sky-200 to-cyan-300 shadow-cyan-400/20 hover:shadow-cyan-300/35 focus-visible:ring-cyan-100'}`}
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
