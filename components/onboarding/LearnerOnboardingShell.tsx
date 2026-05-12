import React, { useEffect, useMemo, useState } from 'react';
import type { Profile } from '../../types';
import { emitOnboardingEvent } from '../../src/features/onboarding/onboardingAnalytics';
import { isOnboardingFlagEnabled } from '../../src/features/onboarding/featureFlags';
import { markOnboardingStepComplete, resetOnboarding } from '../../src/features/onboarding/onboardingService';
import type { OnboardingResolution, OnboardingSegment, OnboardingStep } from '../../src/features/onboarding/onboardingTypes';

interface LearnerOnboardingShellProps {
  resolution: OnboardingResolution;
  profile?: Partial<Profile> | null;
  onComplete: () => void;
}

type LearnerStep = Extract<OnboardingStep, 'intent' | 'school_confirm' | 'goal' | 'mission_brief' | 'reward_reveal'>;

const SOLO_GOALS = [
  { id: 'daily_practice', title: 'Daily practice', detail: 'Build a calm learning streak.' },
  { id: 'cambridge_prep', title: 'Cambridge prep', detail: 'Train for exam-style missions.' },
  { id: 'science_mastery', title: 'Subject mastery', detail: 'Strengthen tricky topics.' },
];


const getStepSequence = (segment: OnboardingSegment): LearnerStep[] => (
  segment === 'solo_learner'
    ? ['intent', 'school_confirm', 'goal', 'mission_brief', 'reward_reveal']
    : ['intent', 'school_confirm', 'mission_brief', 'reward_reveal']
);

const getInitialStep = (resolution: OnboardingResolution): LearnerStep => {
  const sequence = getStepSequence(resolution.segment);
  if (sequence.includes(resolution.nextStep as LearnerStep)) return resolution.nextStep as LearnerStep;
  const completed = new Set(resolution.state?.completed_steps ?? []);
  return sequence.find((step) => !completed.has(step)) ?? 'reward_reveal';
};

const getNextStep = (segment: OnboardingSegment, currentStep: LearnerStep): LearnerStep | 'complete' => {
  const sequence = getStepSequence(segment);
  const index = sequence.indexOf(currentStep);
  return sequence[index + 1] ?? 'complete';
};

const ProgressDots: React.FC<{ current: LearnerStep; segment: OnboardingSegment }> = ({ current, segment }) => {
  const sequence = getStepSequence(segment);
  const activeIndex = Math.max(0, sequence.indexOf(current));
  return (
    <div className="flex items-center justify-center gap-2" aria-label={`Onboarding step ${activeIndex + 1} of ${sequence.length}`}>
      {sequence.map((step, index) => (
        <div
          key={step}
          className={`h-1.5 rounded-full transition-all duration-300 ${index <= activeIndex ? 'w-8 bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.55)]' : 'w-4 bg-white/15'}`}
        />
      ))}
    </div>
  );
};

const ByteCard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!isOnboardingFlagEnabled('byte_ftue_enabled')) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm text-cyan-50">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-200/40 bg-cyan-300/15 shadow-[0_0_24px_rgba(34,211,238,0.25)]">◈</div>
      <p className="leading-6">{children}</p>
    </div>
  );
};

const LearnerOnboardingShell: React.FC<LearnerOnboardingShellProps> = ({ resolution, profile, onComplete }) => {
  const [step, setStep] = useState<LearnerStep>(() => getInitialStep(resolution));
  const [goal, setGoal] = useState<string>(() => String(resolution.state?.metadata?.['goal'] ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSolo = resolution.segment === 'solo_learner';
  const schoolName = profile?.school_name || String(resolution.state?.metadata?.['school_name'] ?? 'your school');
  const resumeMode = Boolean((resolution.state?.completed_steps?.length ?? 0) > 0);

  const title = useMemo(() => {
    switch (step) {
      case 'intent':
        return isSolo ? 'Choose your path.' : 'School mission online.';
      case 'school_confirm':
        return isSolo ? 'Solo route confirmed.' : `${schoolName} confirmed.`;
      case 'goal':
        return 'Choose your focus.';
      case 'mission_brief':
        return 'Your route is ready.';
      case 'reward_reveal':
        return 'Dashboard unlocked.';
      default:
        return 'Welcome to Brains Heist.';
    }
  }, [isSolo, schoolName, step]);

  useEffect(() => {
    void emitOnboardingEvent({
      event: 'onboarding_started',
      user_id: resolution.state?.user_id,
      segment: resolution.segment,
      context_type: resolution.context,
      step,
      metadata: { resume: resumeMode },
    });
    // Only emit once per shell mount; step changes emit via explicit actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completeStep = async (nextStep: LearnerStep | 'complete', metadata?: Record<string, unknown>, options?: { firstValueStarted?: boolean; firstValueCompleted?: boolean; completeCoreFtue?: boolean }) => {
    setBusy(true);
    setError(null);
    try {
      await markOnboardingStepComplete(step, {
        nextStep: nextStep === 'complete' ? 'complete' : nextStep,
        metadata,
        ...options,
      });
      if (nextStep === 'complete') {
        onComplete();
      } else {
        setStep(nextStep);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onboarding step failed. You can continue safely.');
    } finally {
      setBusy(false);
    }
  };

  const handleContinue = async () => {
    const nextStep = getNextStep(resolution.segment, step);

    if (step === 'goal' && !goal) {
      setError('Choose one focus to build your first route.');
      return;
    }

    if (step === 'mission_brief') {
      await emitOnboardingEvent({ event: 'first_mission_launched', user_id: resolution.state?.user_id, segment: resolution.segment, context_type: resolution.context, step, metadata: { fallback: true } });
      await completeStep('reward_reveal', { goal: goal || undefined, first_mission: 'orientation_mission' }, { firstValueStarted: true });
      return;
    }

    if (step === 'reward_reveal') {
      await emitOnboardingEvent({ event: 'first_mission_completed', user_id: resolution.state?.user_id, segment: resolution.segment, context_type: resolution.context, step, metadata: { mission: 'orientation_mission' } });
      await emitOnboardingEvent({ event: 'reward_revealed', user_id: resolution.state?.user_id, segment: resolution.segment, context_type: resolution.context, step, metadata: { reward: 'dashboard_reveal' } });
      await emitOnboardingEvent({ event: 'onboarding_completed', user_id: resolution.state?.user_id, segment: resolution.segment, context_type: resolution.context, step });
      await completeStep('complete', { goal: goal || undefined }, { firstValueCompleted: true, completeCoreFtue: true });
      return;
    }

    await completeStep(nextStep, { goal: goal || undefined });
  };

  const handleSkip = async () => {
    setBusy(true);
    try {
      await emitOnboardingEvent({ event: 'onboarding_skipped', user_id: resolution.state?.user_id, segment: resolution.segment, context_type: resolution.context, step });
      await markOnboardingStepComplete(step, {
        nextStep: 'complete',
        completeCoreFtue: true,
        metadata: { skipped: true, skipped_at_step: step },
      });
      onComplete();
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setBusy(true);
    try {
      await resetOnboarding();
      onComplete();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-5 text-white sm:px-6">
      <div className="pointer-events-none absolute left-1/2 top-[-16rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-18rem] right-[-10rem] h-[34rem] w-[34rem] rounded-full bg-violet-500/20 blur-3xl" />
      <section className="relative mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-xl flex-col justify-between rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-cyan-950/30 backdrop-blur sm:p-7">
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">Brains Heist FTUE</p>
              {resumeMode && <p className="mt-1 text-xs text-slate-400">Resuming your mission setup</p>}
            </div>
            <button type="button" onClick={handleSkip} disabled={busy} className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-300/50 hover:text-white">
              Skip
            </button>
          </div>

          <ProgressDots current={step} segment={resolution.segment} />

          <div className="animate-[fadeIn_240ms_ease-out] rounded-3xl border border-white/10 bg-slate-950/45 p-5 shadow-xl shadow-black/20">
            <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl">{title}</h1>
            {step === 'intent' && (
              <p className="mt-4 text-base leading-7 text-slate-300">
                {isSolo ? 'One focused mission. School access can come later.' : 'Your school route is ready. One clear next step.'}
              </p>
            )}
            {step === 'school_confirm' && (
              <div className="mt-5 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-4">
                <div className="text-sm font-semibold text-cyan-100">{isSolo ? 'Solo route' : 'School route'}</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">{isSolo ? 'Your progress starts here.' : `Missions connect to ${schoolName}.`}</p>
              </div>
            )}
            {step === 'goal' && (
              <div className="mt-5 grid gap-3">
                {SOLO_GOALS.map((item) => (
                  <button key={item.id} type="button" onClick={() => setGoal(item.id)} className={`rounded-2xl border p-4 text-left transition ${goal === item.id ? 'border-cyan-300 bg-cyan-300/15 shadow-[0_0_28px_rgba(34,211,238,0.18)]' : 'border-white/10 bg-white/[0.04] hover:border-cyan-300/40'}`}>
                    <div className="font-bold text-white">{item.title}</div>
                    <div className="mt-1 text-sm text-slate-400">{item.detail}</div>
                  </button>
                ))}
              </div>
            )}
            {step === 'mission_brief' && (
              <div className="mt-5 space-y-4">
                <ByteCard>{isSolo ? 'First route locked. Launch when ready.' : 'School route locked. Launch when ready.'}</ByteCard>
                <div className="rounded-3xl border border-cyan-300/25 bg-gradient-to-br from-cyan-300/15 to-violet-400/10 p-5 shadow-[0_0_34px_rgba(34,211,238,0.16)]">
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">Mission brief</div>
                  <h2 className="mt-3 text-2xl font-black">Orientation: First Signal</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">Your route is ready.</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-200">
                    <span className="rounded-full bg-white/10 px-3 py-1.5">Under 2 minutes</span>
                    <span className="rounded-full bg-white/10 px-3 py-1.5">No pressure</span>
                    <span className="rounded-full bg-white/10 px-3 py-1.5">Dashboard unlock</span>
                  </div>
                </div>
              </div>
            )}
            {step === 'reward_reveal' && (
              <div className="mt-5 space-y-4 text-center">
                <div className="mx-auto flex h-24 w-24 animate-pulse items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/15 text-4xl shadow-[0_0_36px_rgba(52,211,153,0.25)]">✓</div>
                <p className="text-base leading-7 text-slate-300">Your command deck is ready.</p>
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm font-semibold text-emerald-100">Reward unlocked: dashboard access</div>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 space-y-3">
          <button type="button" onClick={handleContinue} disabled={busy} className="w-full rounded-2xl bg-cyan-300 px-5 py-4 text-base font-black text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.28)] transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-70">
            {step === 'mission_brief' ? 'Launch first mission' : step === 'reward_reveal' ? 'Enter dashboard' : 'Continue'}
          </button>
          <button type="button" onClick={handleReset} disabled={busy} className="w-full rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-slate-400 transition hover:border-white/25 hover:text-white">
            Reset onboarding state
          </button>
        </div>
      </section>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </main>
  );
};

export default LearnerOnboardingShell;
