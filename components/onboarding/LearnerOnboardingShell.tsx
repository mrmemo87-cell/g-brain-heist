import React from 'react';
import type { Profile } from '../../types';
import { emitOnboardingEvent } from '../../src/features/onboarding/onboardingAnalytics';
import { markOnboardingStepComplete } from '../../src/features/onboarding/onboardingService';
import type { OnboardingResolution, OnboardingSegment, OnboardingStep } from '../../src/features/onboarding/onboardingTypes';

interface LearnerOnboardingShellProps {
  resolution: OnboardingResolution;
  profile?: Partial<Profile> | null;
  onComplete: () => void;
}

type LearnerStep = Extract<OnboardingStep, 'intent' | 'dashboard_reveal'>;

const DASHBOARD_FEATURES = [
  { icon: '🚀', label: 'Next mission', detail: 'Your clearest next learning action.', accent: 'from-cyan-300/20 to-sky-400/5' },
  { icon: '⚡', label: 'Live progress', detail: 'XP, level, streak, and rewards in one view.', accent: 'from-amber-300/20 to-orange-400/5' },
  { icon: '🧭', label: 'Easy navigation', detail: 'Your learning, games, tasks, clan, and profile stay one tap away.', accent: 'from-fuchsia-300/20 to-violet-400/5' },
];

const getStepSequence = (_segment: OnboardingSegment): LearnerStep[] => ['intent', 'dashboard_reveal'];

const getInitialStep = (resolution: OnboardingResolution): LearnerStep => {
  const sequence = getStepSequence(resolution.segment);
  if (sequence.includes(resolution.nextStep as LearnerStep)) return resolution.nextStep as LearnerStep;

  const completed = new Set(resolution.state?.completed_steps ?? []);
  const firstIncomplete = sequence.find((step) => !completed.has(step));
  if (firstIncomplete) return firstIncomplete;

  // Learners paused in retired mission/reward screens resume at the dashboard
  // handoff instead of being sent through obsolete content.
  return 'dashboard_reveal';
};

const getNextStep = (segment: OnboardingSegment, current: LearnerStep): LearnerStep | 'complete' => {
  const sequence = getStepSequence(segment);
  const index = sequence.indexOf(current);
  return sequence[index + 1] ?? 'complete';
};

const JourneyProgress: React.FC<{ step: LearnerStep; segment: OnboardingSegment }> = ({ step, segment }) => {
  const sequence = getStepSequence(segment);
  const activeIndex = Math.max(0, sequence.indexOf(step));

  return (
    <div className="flex items-center gap-2" aria-label={`Introduction step ${activeIndex + 1} of ${sequence.length}`}>
      {sequence.map((item, index) => (
        <span
          key={item}
          className={`h-1.5 rounded-full transition-all duration-500 ${
            index <= activeIndex
              ? 'w-10 bg-gradient-to-r from-cyan-300 to-fuchsia-400 shadow-[0_0_18px_rgba(34,211,238,0.35)]'
              : 'w-5 bg-white/10'
          }`}
        />
      ))}
    </div>
  );
};

const LearnerOnboardingShell: React.FC<LearnerOnboardingShellProps> = ({ resolution, profile, onComplete }) => {
  const [step, setStep] = React.useState<LearnerStep>(() => getInitialStep(resolution));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isSolo = resolution.segment === 'solo_learner';
  const metadata = resolution.state?.metadata ?? {};
  const schoolName = profile?.school_name || String(metadata['school_name'] ?? 'Your school');
  const gradeLabel = profile?.grade ?? metadata['grade_label'];
  const classCode = profile?.batch ?? metadata['class_code'];
  const firstName = String(profile?.full_name || profile?.username || 'Agent').trim().split(/\s+/)[0];
  const sequence = getStepSequence(resolution.segment);
  const activeIndex = Math.max(0, sequence.indexOf(step));

  React.useEffect(() => {
    void emitOnboardingEvent({
      event: 'onboarding_started',
      user_id: resolution.state?.user_id,
      segment: resolution.segment,
      context_type: resolution.context,
      step,
      metadata: {
        experience: 'premium_dashboard_intro_v3',
        resume: Boolean(resolution.state?.completed_steps?.length),
      },
    });
    // Mount-only analytics event. Step events are emitted by explicit actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completeStep = async (
    nextStep: LearnerStep | 'complete',
    metadataPatch?: Record<string, unknown>,
    completeCoreFtue = false,
  ) => {
    setBusy(true);
    setError(null);
    try {
      await markOnboardingStepComplete(step, {
        nextStep,
        completeCoreFtue,
        metadata: {
          experience: 'premium_dashboard_intro_v3',
          ...metadataPatch,
        },
      });
      await emitOnboardingEvent({
        event: 'onboarding_step_completed',
        user_id: resolution.state?.user_id,
        segment: resolution.segment,
        context_type: resolution.context,
        step,
        metadata: { next_step: nextStep, experience: 'premium_dashboard_intro_v3' },
      });

      if (nextStep === 'complete') onComplete();
      else setStep(nextStep);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not save this step. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleContinue = async () => {
    if (step === 'dashboard_reveal') {
      await emitOnboardingEvent({
        event: 'onboarding_completed',
        user_id: resolution.state?.user_id,
        segment: resolution.segment,
        context_type: resolution.context,
        step,
        metadata: { experience: 'premium_dashboard_intro_v3' },
      });
      await completeStep('complete', undefined, true);
      return;
    }

    await completeStep(getNextStep(resolution.segment, step));
  };

  const handleSkip = async () => {
    setBusy(true);
    setError(null);
    try {
      await emitOnboardingEvent({
        event: 'onboarding_skipped',
        user_id: resolution.state?.user_id,
        segment: resolution.segment,
        context_type: resolution.context,
        step,
        metadata: { experience: 'premium_dashboard_intro_v3' },
      });
      await markOnboardingStepComplete(step, {
        nextStep: 'complete',
        completeCoreFtue: true,
        metadata: {
          skipped: true,
          skipped_at_step: step,
          experience: 'premium_dashboard_intro_v3',
        },
      });
      onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not skip the introduction. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050711] px-4 py-4 text-white sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(34,211,238,0.16),transparent_32%),radial-gradient(circle_at_85%_18%,rgba(217,70,239,0.14),transparent_30%),radial-gradient(circle_at_70%_90%,rgba(59,130,246,0.12),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.045] [background-image:linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:44px_44px]" />

      <section className="relative mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#07101f] shadow-[0_40px_120px_rgba(0,0,0,0.72),0_0_80px_rgba(34,211,238,0.10)] lg:min-h-[calc(100vh-3rem)] lg:grid-cols-[0.82fr_1.18fr]">
        <aside className="relative hidden overflow-hidden border-r border-white/10 bg-white/[0.025] p-8 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -left-28 top-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Brains Heist" className="h-11 w-11 object-contain drop-shadow-[0_0_18px_rgba(34,211,238,0.45)]" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-200">Brains Heist</p>
                <p className="mt-1 text-sm font-semibold text-slate-400">Student command centre</p>
              </div>
            </div>
            <div className="mt-16">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-fuchsia-200/80">Your first minute</p>
              <h2 className="mt-4 max-w-sm text-4xl font-black leading-[1.08] tracking-[-0.035em]">Know where you are. See what matters. Start with confidence.</h2>
              <p className="mt-5 max-w-sm text-sm leading-7 text-slate-400">A focused introduction to the dashboard you will use every day.</p>
            </div>
          </div>

          <div className="relative space-y-3">
            {[['✅', 'Identity confirmed'], ['🧭', 'Dashboard ready']].map(([icon, label], index) => (
              <div key={label} className="flex items-center gap-3 text-sm">
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl border text-sm ${index <= activeIndex ? 'border-cyan-200/50 bg-cyan-300/15 shadow-[0_0_18px_rgba(34,211,238,0.14)]' : 'border-white/10 bg-white/[0.03] opacity-50'}`} aria-hidden>{icon}</span>
                <span className={index <= activeIndex ? 'font-semibold text-slate-200' : 'text-slate-500'}>{label}</span>
              </div>
            ))}
          </div>
        </aside>

        <div className="flex min-h-[calc(100vh-2rem)] flex-col p-5 sm:p-8 lg:min-h-0 lg:p-10">
          <header className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 lg:hidden">
              <img src="/logo.png" alt="Brains Heist" className="h-10 w-10 object-contain" />
              <span className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Dashboard introduction</span>
            </div>
            <JourneyProgress step={step} segment={resolution.segment} />
            <button type="button" onClick={() => { void handleSkip(); }} disabled={busy} className="rounded-full px-3 py-2 text-xs font-bold text-slate-400 transition hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:opacity-50">
              Skip introduction
            </button>
          </header>

          <div key={step} className="flex flex-1 animate-[premiumIntroIn_420ms_cubic-bezier(0.22,1,0.36,1)] flex-col justify-center py-8 sm:py-10">
            {step === 'intent' && (
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-bold text-emerald-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.9)]" />
                  Setup complete
                </div>
                <h1 className="mt-6 max-w-2xl text-4xl font-black leading-[1.06] tracking-[-0.04em] sm:text-6xl">Welcome, {firstName}.</h1>
                <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
                  {isSolo
                    ? 'Your personal learning workspace is ready. Let’s shape the dashboard around your next goal.'
                    : `You’re connected to ${schoolName}. Let’s show you where your learning, progress, and school activity come together.`}
                </p>

                {!isSolo && (
                  <div className="mt-8 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">School</p>
                      <p className="mt-2 truncate text-base font-black text-white">{schoolName}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Grade</p>
                      <p className="mt-2 text-base font-black text-white">{gradeLabel ? `Grade ${gradeLabel}` : 'Pending placement'}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Class</p>
                      <p className="mt-2 text-base font-black text-white">{classCode || 'Pending placement'}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 'dashboard_reveal' && (
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-fuchsia-200">Your command centre</p>
                <h1 className="mt-4 max-w-2xl text-4xl font-black leading-[1.08] tracking-[-0.035em] sm:text-5xl">Everything important, one clear view.</h1>
                <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">We’ll highlight the live dashboard next. It takes less than a minute, and you can start your first mission immediately.</p>
                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {DASHBOARD_FEATURES.map((feature) => (
                    <article key={feature.label} className={`group rounded-2xl border border-white/10 bg-gradient-to-br ${feature.accent} p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:-translate-y-0.5 hover:border-cyan-200/25`}>
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-slate-950/70 text-xl shadow-lg" aria-hidden>{feature.icon}</div>
                      <h2 className="mt-4 text-sm font-black text-white">{feature.label}</h2>
                      <p className="mt-2 text-xs leading-5 text-slate-400">{feature.detail}</p>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && <div role="alert" className="mb-4 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">{error}</div>}

          <footer className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-slate-500">Step {activeIndex + 1} of {sequence.length} · Progress saves automatically</p>
            <button type="button" onClick={() => { void handleContinue(); }} disabled={busy} className="min-h-12 rounded-2xl bg-gradient-to-r from-cyan-200 via-sky-200 to-fuchsia-200 px-7 py-3 text-sm font-black text-slate-950 shadow-[0_14px_34px_rgba(34,211,238,0.18)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(34,211,238,0.26)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-wait disabled:opacity-60">
              {busy ? 'Saving…' : step === 'dashboard_reveal' ? 'Open my dashboard →' : 'Continue →'}
            </button>
          </footer>
        </div>
      </section>

      <style>{`
        @keyframes premiumIntroIn {
          from { opacity: 0; transform: translate3d(0, 16px, 0) scale(0.99); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          [class*="premiumIntroIn"] { animation: none !important; }
        }
      `}</style>
    </main>
  );
};

export default LearnerOnboardingShell;
