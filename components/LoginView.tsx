import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/dist/ScrollTrigger';
import { GoogleIcon } from './icons';
import LoginFooter from './LoginFooter';
import * as AuthService from '../services/authService';
import { consumeBanMessage } from '../services/banMessage';
import { askVisitorAssistant } from '../services/visitorAssistantService';
import { submitDemoRequest } from '../services/demoRequestService';

interface LoginViewProps {
    onLogin: (email: string, pass: string) => Promise<void>;
}

type AssistantMessage = {
    role: 'agent' | 'visitor';
    text: string;
};

type BenefitIcon = 'target' | 'trophy' | 'chart';

const BenefitMark: React.FC<{ type: BenefitIcon }> = ({ type }) => {
    const path = type === 'target'
        ? 'M12 3a9 9 0 109 9M12 7a5 5 0 105 5M12 11a1 1 0 101 1M16 8l5-5m0 0v4m0-4h-4'
        : type === 'trophy'
            ? 'M8 4h8v4a4 4 0 01-8 0V4zm0 2H5v1a4 4 0 004 4m7-5h3v1a4 4 0 01-4 4m-3 1v5m-4 3h8'
            : 'M4 19V9m5 10V5m5 14v-7m5 7V3M3 21h18';

    return (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={path} />
            </svg>
        </span>
    );
};

const BENEFITS: Array<{ icon: BenefitIcon; title: string; description: string; accent?: 'pink' }> = [
    {
        icon: 'target',
        title: 'Cambridge-aligned assessments',
        description: 'Admission tests with stage mapping and skill-level insights.',
    },
    {
        icon: 'trophy',
        title: 'Classrooms students want to join',
        description: 'Battles, XP, rankings and clan competition.',
        accent: 'pink',
    },
    {
        icon: 'chart',
        title: 'Useful reports, not just scores',
        description: 'See strengths, weaknesses and placement readiness.',
    },
];

const HOW_IT_WORKS = [
    { step: '01', title: 'Create your school', desc: 'Start your workspace and choose the learning experience that fits your school.' },
    { step: '02', title: 'Add students & classes', desc: 'Invite learners, organize classes and get everyone into the right place quickly.' },
    { step: '03', title: 'Assess, compete, improve', desc: 'Run assessments and live modes, then use the reporting layer to act on results.' },
] as const;

const PENDING_CONFIRMATION_KEY = 'brains_heist_pending_confirmation_v1';

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
    const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'confirm'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const [pendingEmail, setPendingEmail] = useState('');
    const [pendingExpiresAt, setPendingExpiresAt] = useState<string | null>(null);
    const [confirmationCode, setConfirmationCode] = useState('');
    const [resendLoading, setResendLoading] = useState(false);

    const [showDemoModal, setShowDemoModal] = useState(false);
    const [demoForm, setDemoForm] = useState({ name: '', email: '', school: '', country: '', studentCount: '', website: '', notes: '' });
    const [demoSubmitted, setDemoSubmitted] = useState(false);
    const [demoSubmitting, setDemoSubmitting] = useState(false);
    const [demoSubmitError, setDemoSubmitError] = useState<string | null>(null);

    const [assistantOpen, setAssistantOpen] = useState(false);
    const [assistantQuestion, setAssistantQuestion] = useState('');
    const [assistantLoading, setAssistantLoading] = useState(false);
    const [assistantError, setAssistantError] = useState<string | null>(null);
    const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([
        {
            role: 'agent',
            text: "Hi! I'm Brains Assistant. Need help signing in, choosing a plan, requesting a demo, or finding the right Brains Heist experience?",
        },
    ]);

    const pageRef = useRef<HTMLDivElement>(null);
    const heroRef = useRef<HTMLDivElement>(null);
    const brandRef = useRef<HTMLDivElement>(null);
    const headlineRef = useRef<HTMLHeadingElement>(null);
    const introRef = useRef<HTMLParagraphElement>(null);
    const benefitsRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const submitBtnRef = useRef<HTMLButtonElement>(null);
    const ctaShimmerRef = useRef<HTMLSpanElement>(null);
    const heroGridRef = useRef<HTMLDivElement>(null);
    const heroSweepRef = useRef<HTMLDivElement>(null);
    const orbOneRef = useRef<HTMLDivElement>(null);
    const orbTwoRef = useRef<HTMLDivElement>(null);
    const orbThreeRef = useRef<HTMLDivElement>(null);
    const howItWorksRef = useRef<HTMLElement>(null);
    const audienceRef = useRef<HTMLElement>(null);

    useEffect(() => {
        const persisted = consumeBanMessage();
        if (persisted) {
            setMode('login');
            setError(persisted);
        }
    }, []);

    useEffect(() => {
        try {
            const saved = JSON.parse(window.localStorage.getItem(PENDING_CONFIRMATION_KEY) || 'null') as { email?: string; expiresAt?: string } | null;
            if (!saved?.email || !saved.expiresAt || new Date(saved.expiresAt).getTime() <= Date.now()) {
                window.localStorage.removeItem(PENDING_CONFIRMATION_KEY);
                return;
            }
            setPendingEmail(saved.email);
            setPendingExpiresAt(saved.expiresAt);
            setMode('confirm');
        } catch {
            window.localStorage.removeItem(PENDING_CONFIRMATION_KEY);
        }
    }, []);

    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        gsap.registerPlugin(ScrollTrigger);

        const ctx = gsap.context(() => {
            const entrance = [brandRef.current, headlineRef.current, introRef.current, benefitsRef.current, cardRef.current].filter(Boolean);
            gsap.set(entrance, { opacity: 0, y: 30, filter: 'blur(8px)' });
            if (cardRef.current) gsap.set(cardRef.current, { y: 56, scale: 0.97 });
            if (heroGridRef.current) gsap.set(heroGridRef.current, { opacity: 0.08 });
            if (heroSweepRef.current) gsap.set(heroSweepRef.current, { opacity: 0, scaleX: 0, transformOrigin: '0% 50%' });

            const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
            tl.to(heroGridRef.current, { opacity: 0.24, duration: 0.6 }, 0)
                .to(heroSweepRef.current, { opacity: 0.75, scaleX: 1, duration: 0.45 }, 0.05)
                .to(heroSweepRef.current, { xPercent: 135, duration: 0.85, ease: 'power4.inOut' }, 0.35)
                .to(heroSweepRef.current, { opacity: 0, duration: 0.2 }, 0.95)
                .to(brandRef.current, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7 }, 0.1)
                .to(headlineRef.current, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.75 }, 0.25)
                .to(introRef.current, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.65 }, 0.42)
                .to(benefitsRef.current, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.65 }, 0.56)
                .to(cardRef.current, { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.9, ease: 'expo.out' }, 0.2);

            if (submitBtnRef.current && ctaShimmerRef.current) {
                gsap.set(ctaShimmerRef.current, { xPercent: -240, opacity: 0.18 });
                gsap.to(ctaShimmerRef.current, {
                    xPercent: 250,
                    opacity: 0.8,
                    duration: 1.7,
                    repeat: -1,
                    repeatDelay: 4.8,
                    ease: 'power2.inOut',
                    delay: 1.4,
                });
            }

            [
                orbOneRef.current && gsap.to(orbOneRef.current, { xPercent: 16, yPercent: -12, scale: 1.12, duration: 8, repeat: -1, yoyo: true, ease: 'sine.inOut' }),
                orbTwoRef.current && gsap.to(orbTwoRef.current, { xPercent: -14, yPercent: 16, scale: 1.16, duration: 10, repeat: -1, yoyo: true, ease: 'sine.inOut' }),
                orbThreeRef.current && gsap.to(orbThreeRef.current, { xPercent: -10, yPercent: -12, scale: 1.2, duration: 9, repeat: -1, yoyo: true, ease: 'sine.inOut' }),
                heroGridRef.current && gsap.to(heroGridRef.current, { backgroundPosition: '0px 72px', duration: 11, repeat: -1, yoyo: true, ease: 'sine.inOut' }),
                heroRef.current && gsap.to(heroRef.current, { y: -8, duration: 6, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 1.1 }),
            ].filter(Boolean);

            [howItWorksRef.current, audienceRef.current].filter(Boolean).forEach((section) => {
                const items = Array.from((section as HTMLElement).querySelectorAll<HTMLElement>('[data-reveal]'));
                const heading = (section as HTMLElement).querySelector<HTMLElement>('[data-reveal-heading]');
                gsap.set(items, { opacity: 0, y: 44, rotateX: 7, filter: 'blur(7px)' });
                if (heading) gsap.set(heading, { opacity: 0, y: 24, filter: 'blur(5px)' });

                const sectionTl = gsap.timeline({
                    scrollTrigger: {
                        trigger: section,
                        start: 'top 80%',
                        toggleActions: 'play none none reverse',
                    },
                });

                if (heading) {
                    sectionTl.to(heading, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.55, ease: 'power3.out' });
                }
                sectionTl.to(items, {
                    opacity: 1,
                    y: 0,
                    rotateX: 0,
                    filter: 'blur(0px)',
                    duration: 0.72,
                    stagger: 0.12,
                    ease: 'power3.out',
                }, heading ? 0.12 : 0);
            });
        }, pageRef);

        return () => ctx.revert();
    }, []);

    const switchMode = (next: 'login' | 'signup' | 'reset') => {
        setMode(next);
        setError(null);
        setSuccess(null);
    };

    const friendlyError = (message?: string) => {
        const normalized = (message || '').toLowerCase();
        if (normalized.includes('invalid login') || normalized.includes('invalid credentials')) return "We couldn't sign you in. Check your email and password and try again.";
        if (normalized.includes('email not confirmed')) return 'Please verify your email before signing in.';
        if (normalized.includes('rate') || normalized.includes('too many')) return 'Too many attempts. Please wait a moment and try again.';
        return message || 'Something went wrong. Please try again.';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isLoading) return;
        setError(null);
        setSuccess(null);
        setIsLoading(true);

        try {
            if (mode === 'confirm') {
                await AuthService.verifySignupEmailCode(pendingEmail, confirmationCode);
                window.localStorage.removeItem(PENDING_CONFIRMATION_KEY);
                setSuccess('Email confirmed. Opening your workspace…');
                window.setTimeout(() => window.location.reload(), 700);
                return;
            }

            if (!email.trim()) {
                setError('Enter your email address.');
                return;
            }

            if (mode === 'reset') {
                await AuthService.sendPasswordResetEmail(email.trim());
                setSuccess('Password reset email sent. Check your inbox.');
                return;
            }

            if (mode === 'signup') {
                if (!username.trim()) {
                    setError('Choose a username to continue.');
                    return;
                }
                const signupResult = await AuthService.signup(email.trim(), password, username.trim(), 'student');
                if (signupResult.confirmationRequired) {
                    const expiresAt = signupResult.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                    setPendingEmail(signupResult.email);
                    setPendingExpiresAt(expiresAt);
                    window.localStorage.setItem(PENDING_CONFIRMATION_KEY, JSON.stringify({
                        email: signupResult.email,
                        expiresAt,
                    }));
                    setConfirmationCode('');
                    setMode('confirm');
                    setSuccess('Account created. Confirm your email within seven days.');
                    return;
                }
                setSuccess('Account created! Opening your profile…');
                window.setTimeout(() => window.location.reload(), 700);
                return;
            }

            await onLogin(email.trim(), password);
        } catch (err: any) {
            if (AuthService.isEmailConfirmationRequiredError(err)) {
                const confirmationEmail = err.email || email.trim();
                const expiresAt = pendingExpiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                setPendingEmail(confirmationEmail);
                setPendingExpiresAt(expiresAt);
                window.localStorage.setItem(PENDING_CONFIRMATION_KEY, JSON.stringify({ email: confirmationEmail, expiresAt }));
                setMode('confirm');
                setError(null);
                setSuccess('Your account is waiting for email confirmation.');
            } else {
                setError(friendlyError(err?.message));
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleResendConfirmation = async () => {
        if (!pendingEmail || resendLoading) return;
        setResendLoading(true);
        setError(null);
        setSuccess(null);
        try {
            await AuthService.resendSignupConfirmation(pendingEmail);
            setSuccess('A fresh confirmation email has been sent.');
        } catch (err: any) {
            setError(err?.message || 'Could not resend the confirmation email.');
        } finally {
            setResendLoading(false);
        }
    };

    const switchFromConfirmation = (nextMode: 'login' | 'signup') => {
        setMode(nextMode);
        setError(null);
        setSuccess(null);
        setConfirmationCode('');
        if (nextMode === 'signup') setEmail(pendingEmail);
    };

    const handleGoogleSignIn = async () => {
        if (isGoogleLoading) return;
        setError(null);
        setIsGoogleLoading(true);
        try {
            await AuthService.loginWithGoogle();
        } catch (err: any) {
            setError(friendlyError(err?.message || 'Google sign-in failed.'));
        } finally {
            setIsGoogleLoading(false);
        }
    };

    const resetDemoStatus = () => {
        setDemoSubmitted(false);
        setDemoSubmitError(null);
    };

    const openDemoModal = () => {
        resetDemoStatus();
        setShowDemoModal(true);
    };

    const closeDemoModal = () => {
        setShowDemoModal(false);
        setDemoSubmitting(false);
        resetDemoStatus();
    };

    const handleDemoSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (demoSubmitting) return;
        setDemoSubmitting(true);
        setDemoSubmitted(false);
        setDemoSubmitError(null);

        try {
            await submitDemoRequest({
                name: demoForm.name.trim(),
                school_name: demoForm.school.trim(),
                email: demoForm.email.trim(),
                country: demoForm.country.trim() || undefined,
                student_count: demoForm.studentCount.trim() ? Number(demoForm.studentCount) : null,
                website: demoForm.website.trim() || undefined,
                notes: demoForm.notes.trim() || undefined,
            });
            setDemoSubmitted(true);
        } catch (err: any) {
            setDemoSubmitError(err?.message || 'We could not send your demo request right now. Please check your details and try again.');
        } finally {
            setDemoSubmitting(false);
        }
    };

    const submitAssistantPrompt = async (question: string) => {
        const trimmedQuestion = question.trim();
        if (!trimmedQuestion || assistantLoading) return;

        const nextMessages: AssistantMessage[] = [...assistantMessages, { role: 'visitor', text: trimmedQuestion }];
        setAssistantMessages(nextMessages);
        setAssistantQuestion('');
        setAssistantError(null);
        setAssistantLoading(true);

        try {
            const { reply } = await askVisitorAssistant(nextMessages.map((message) => ({
                role: message.role === 'agent' ? 'assistant' : 'visitor',
                text: message.text,
            })));
            setAssistantMessages((messages) => [...messages, { role: 'agent', text: reply }]);
        } catch (err: any) {
            setAssistantError(err?.message || 'Brains Assistant is having trouble connecting. Please try again.');
        } finally {
            setAssistantLoading(false);
        }
    };

    const openDemoFromAssistant = () => {
        setAssistantOpen(false);
        openDemoModal();
    };

    const authCard = mode === 'confirm' ? (
        <div ref={cardRef} className="relative overflow-hidden rounded-[1.75rem] border border-cyan-300/25 bg-[#081321]/95 p-5 shadow-[0_34px_110px_rgba(0,0,0,0.42),0_0_55px_rgba(34,211,238,0.10)] backdrop-blur-xl sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5" aria-labelledby="confirm-email-title">
                <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/5 p-5 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/40 bg-cyan-400/10 text-2xl" aria-hidden="true">✉</div>
                    <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-300/80">Secure account setup</p>
                    <h2 id="confirm-email-title" className="mt-2 text-2xl font-extrabold text-white">Confirm your email</h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">We sent a confirmation email to</p>
                    <strong className="mt-1 block break-all text-cyan-200">{pendingEmail}</strong>
                    <p className="mt-3 text-xs leading-relaxed text-amber-100/90">Your account stays reserved for seven days. Until confirmed, it cannot join a school or access school data.</p>
                </div>

                {error && <p className="rounded-xl border border-rose-300/30 bg-rose-300/[0.08] px-4 py-3 text-sm text-rose-100">{error}</p>}
                {success && <p className="rounded-xl border border-emerald-300/30 bg-emerald-300/[0.08] px-4 py-3 text-sm text-emerald-100">{success}</p>}

                <label className="block text-sm font-semibold text-slate-300" htmlFor="confirmation-code">
                    Confirmation code <span className="font-normal text-slate-500">(if shown in your email)</span>
                    <input
                        id="confirmation-code"
                        value={confirmationCode}
                        onChange={(event) => setConfirmationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        placeholder="000000"
                        className="mt-2 block h-14 w-full rounded-2xl border border-slate-600/70 bg-slate-800/70 px-4 text-center font-mono text-2xl tracking-[0.45em] text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10"
                        aria-describedby="confirmation-expiry"
                    />
                </label>
                <p id="confirmation-expiry" className="text-center text-xs text-slate-500">
                    {pendingExpiresAt ? `Pending account expires ${new Date(pendingExpiresAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}.` : 'Confirm within seven days.'}
                </p>

                <button
                    ref={submitBtnRef}
                    type="submit"
                    disabled={isLoading || confirmationCode.length !== 6}
                    className="relative isolate flex h-14 w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-300 via-cyan-400 to-teal-300 px-4 font-extrabold text-[#06101d] shadow-[0_12px_34px_rgba(34,211,238,0.22)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0"
                >
                    {isLoading ? 'Confirming…' : 'Confirm and continue'}
                </button>

                <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={() => { window.location.href = 'mailto:'; }} className="rounded-xl border border-white/10 px-3 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-cyan-300/40 hover:text-white">Open email app</button>
                    <button type="button" onClick={() => void handleResendConfirmation()} disabled={resendLoading} className="rounded-xl border border-white/10 px-3 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-cyan-300/40 hover:text-white disabled:opacity-50">{resendLoading ? 'Sending…' : 'Resend confirmation'}</button>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
                    <button type="button" onClick={() => switchFromConfirmation('signup')} className="font-semibold text-cyan-300 hover:text-cyan-200">Change email</button>
                    <button type="button" onClick={() => switchFromConfirmation('login')} className="text-slate-400 hover:text-white">Back to sign in</button>
                    <button type="button" onClick={handleGoogleSignIn} disabled={isGoogleLoading} className="text-slate-400 hover:text-white disabled:opacity-50">Continue with Google</button>
                </div>
            </form>
        </div>
    ) : (
        <div ref={cardRef} className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#081321]/90 p-5 shadow-[0_34px_110px_rgba(0,0,0,0.42),0_0_55px_rgba(34,211,238,0.08)] backdrop-blur-xl sm:p-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cyan-400/[0.08] blur-3xl" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-fuchsia-400/[0.06] blur-3xl" aria-hidden="true" />

            {mode !== 'reset' ? (
                <>
                    <div className="mb-7">
                        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-300/80">Brains Heist access</p>
                        <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-[1.75rem]">{mode === 'login' ? 'Welcome back 👋' : 'Start your journey'}</h2>
                        <p className="mt-2 text-sm leading-relaxed text-slate-400">{mode === 'login' ? 'Continue your Brains Heist journey.' : 'Create your account, then finish setup inside the platform.'}</p>
                    </div>

                    <div className="mb-7 grid grid-cols-2 border-b border-white/10" role="tablist" aria-label="Authentication mode">
                        <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => switchMode('login')} className={`relative px-4 pb-3 text-sm font-bold transition-colors ${mode === 'login' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                            Sign in
                            {mode === 'login' && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.8)]" />}
                        </button>
                        <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => switchMode('signup')} className={`relative px-4 pb-3 text-sm font-bold transition-colors ${mode === 'signup' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                            Sign up
                            {mode === 'signup' && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.8)]" />}
                        </button>
                    </div>
                </>
            ) : (
                <div className="mb-7">
                    <button type="button" onClick={() => switchMode('login')} className="text-sm font-semibold text-cyan-300 transition hover:text-cyan-200">← Back to sign in</button>
                    <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-white">Reset your password</h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">Enter the email associated with your Brains Heist account.</p>
                </div>
            )}

            {error && <div role="alert" className="mb-5 rounded-2xl border border-rose-400/30 bg-rose-400/[0.08] px-4 py-3 text-sm leading-relaxed text-rose-100">{error}</div>}
            {success && <div role="status" className="mb-5 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.08] px-4 py-3 text-sm leading-relaxed text-emerald-100">✓ {success}</div>}

            <form onSubmit={handleSubmit} className="space-y-5">
                {mode === 'signup' && (
                    <label className="block text-sm font-semibold text-slate-300" htmlFor="username">
                        Username
                        <input id="username" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ChooseYourName" className="mt-2 block h-14 w-full rounded-2xl border border-slate-600/70 bg-slate-800/70 px-4 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10" />
                    </label>
                )}

                <label className="block text-sm font-semibold text-slate-300" htmlFor="email">
                    Email
                    <div className="relative mt-2">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true">✉</span>
                        <input id="email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="block h-14 w-full rounded-2xl border border-slate-600/70 bg-slate-800/70 pl-11 pr-4 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10" />
                    </div>
                </label>

                {mode !== 'reset' && (
                    <label className="block text-sm font-semibold text-slate-300" htmlFor="password">
                        Password
                        <div className="relative mt-2">
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true">▣</span>
                            <input id="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="block h-14 w-full rounded-2xl border border-slate-600/70 bg-slate-800/70 pl-11 pr-12 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10" />
                            <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/[0.05] hover:text-white" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? '◉' : '◎'}</button>
                        </div>
                    </label>
                )}

                {mode === 'login' && <div className="flex justify-end"><button type="button" onClick={() => switchMode('reset')} className="text-xs font-semibold text-cyan-300 transition hover:text-cyan-200">Forgot password?</button></div>}

                <button ref={submitBtnRef} type="submit" disabled={isLoading || (mode === 'signup' && !username.trim())} className="group relative isolate flex h-14 w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-300 via-cyan-400 to-teal-300 px-4 font-extrabold text-[#06101d] shadow-[0_12px_34px_rgba(34,211,238,0.22)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(34,211,238,0.32)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0">
                    <span ref={ctaShimmerRef} className="pointer-events-none absolute -inset-y-3 left-[-45%] z-10 w-[42%] -skew-x-12 bg-gradient-to-r from-transparent via-white/80 to-transparent mix-blend-screen" aria-hidden="true" />
                    {isLoading ? 'Working...' : mode === 'login' ? 'Sign in  →' : mode === 'signup' ? 'Create account  →' : 'Send reset link  →'}
                </button>
            </form>

            {(mode === 'login' || mode === 'signup') && (
                <>
                    <div className="my-6 flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-white/10" /><span>or continue with</span><span className="h-px flex-1 bg-white/10" /></div>
                    <button type="button" onClick={handleGoogleSignIn} disabled={isGoogleLoading} className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-slate-200/90 bg-white px-4 font-bold text-slate-900 transition duration-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60">
                        <span className="flex h-6 w-6 items-center justify-center [&_svg]:h-5 [&_svg]:w-5"><GoogleIcon /></span>
                        {isGoogleLoading ? 'Connecting...' : 'Continue with Google'}
                    </button>
                    <p className="mt-6 text-center text-sm text-slate-400">{mode === 'login' ? 'New to Brains Heist?' : 'Already have an account?'}{' '}<button type="button" onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')} className="font-bold text-cyan-300 hover:text-cyan-200">{mode === 'login' ? 'Create account' : 'Sign in'}</button></p>
                </>
            )}
        </div>
    );

    return (
        <div ref={pageRef} className="relative min-h-screen overflow-hidden bg-[#030a14] text-white">
            <div ref={heroGridRef} className="pointer-events-none fixed inset-0 z-0" style={{ backgroundImage: 'linear-gradient(rgba(34,211,238,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.055) 1px, transparent 1px)', backgroundSize: '72px 72px', maskImage: 'radial-gradient(circle at 40% 18%, black, transparent 76%)', WebkitMaskImage: 'radial-gradient(circle at 40% 18%, black, transparent 76%)' }} aria-hidden="true" />
            <div ref={heroSweepRef} className="pointer-events-none fixed left-[-22%] top-[13%] z-0 h-24 w-[65%] bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent blur-2xl" aria-hidden="true" />
            <div ref={orbOneRef} className="pointer-events-none fixed -left-28 -top-28 z-0 h-72 w-72 rounded-full bg-cyan-400/[0.12] blur-3xl" aria-hidden="true" />
            <div ref={orbTwoRef} className="pointer-events-none fixed -right-28 top-1/3 z-0 h-80 w-80 rounded-full bg-teal-400/[0.09] blur-3xl" aria-hidden="true" />
            <div ref={orbThreeRef} className="pointer-events-none fixed bottom-0 left-1/3 z-0 h-72 w-72 rounded-full bg-fuchsia-400/[0.07] blur-3xl" aria-hidden="true" />

            <main className="relative z-10">
                <section className="flex min-h-screen items-center px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
                    <div className="mx-auto grid w-full max-w-[1380px] grid-cols-1 items-center gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:gap-20 xl:gap-24">
                        <div ref={heroRef} className="mx-auto w-full max-w-2xl text-center lg:mx-0 lg:text-left">
                            <div ref={brandRef} className="mb-10 flex items-center justify-center gap-3 lg:justify-start">
                                <img src="/logo.png" alt="Brains Heist" className="h-16 w-16 drop-shadow-[0_0_24px_rgba(34,211,238,0.35)]" />
                                <div><div className="font-heading text-3xl font-black tracking-tight sm:text-[2.15rem]"><span className="text-white">Brains</span> <span className="bg-gradient-to-r from-cyan-300 via-teal-300 to-fuchsia-400 bg-clip-text text-transparent">Heist</span></div><div className="mt-1 text-[10px] font-bold uppercase tracking-[0.33em] text-slate-500">Learn · Compete · Grow</div></div>
                            </div>

                            <h1 ref={headlineRef} className="font-heading text-5xl font-black leading-[1.02] tracking-[-0.035em] text-white sm:text-6xl lg:text-[4.2rem] xl:text-[4.65rem]">Where school<br />feels like a <span className="bg-gradient-to-r from-cyan-300 via-teal-300 to-fuchsia-400 bg-clip-text text-transparent">game.</span></h1>
                            <p ref={introRef} className="mx-auto mt-7 max-w-xl text-base leading-7 text-slate-300 sm:text-lg lg:mx-0">A gamified English &amp; Maths platform for schools — assessments, live classroom battles, progress tracking and meaningful reports.</p>

                            <div ref={benefitsRef} className="mx-auto mt-8 max-w-xl space-y-5 text-left lg:mx-0">
                                {BENEFITS.map((benefit) => (
                                    <div key={benefit.title} className="flex items-start gap-4"><div className={benefit.accent === 'pink' ? '[&_span]:border-fuchsia-300/20 [&_span]:bg-fuchsia-300/[0.06] [&_span]:text-fuchsia-300' : ''}><BenefitMark type={benefit.icon} /></div><div><h2 className="text-[15px] font-bold text-slate-100 sm:text-base">{benefit.title}</h2><p className="mt-0.5 text-sm leading-relaxed text-slate-500">{benefit.description}</p></div></div>
                                ))}
                            </div>

                            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                                <button type="button" onClick={() => switchMode('signup')} className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cyan-300 px-6 text-sm font-extrabold text-[#06101d] shadow-[0_12px_30px_rgba(34,211,238,0.2)] transition hover:-translate-y-0.5 hover:bg-cyan-200 sm:w-auto">Get started free →</button>
                                <button type="button" onClick={openDemoModal} className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-white/15 bg-white/[0.04] px-6 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:bg-cyan-300/[0.06] sm:w-auto">Request demo</button>
                            </div>

                            <div className="mt-5 flex justify-center lg:justify-start"><a href="/ielts" className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-cyan-300"><span aria-hidden="true">🎓</span> Preparing for IELTS? <span className="font-bold text-cyan-300">Explore IELTS Prime →</span></a></div>
                            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-white/[0.06] pt-5 text-xs text-slate-500 lg:justify-start"><span>🔒 Secure payments</span><span className="hidden text-slate-700 sm:inline">|</span><span>✓ Cancel anytime</span><span className="hidden text-slate-700 sm:inline">|</span><span>🏫 Built for schools</span></div>
                        </div>

                        <div className="mx-auto w-full max-w-[540px] lg:mx-0 lg:ml-auto">{authCard}</div>
                    </div>
                </section>

                <section ref={howItWorksRef} className="border-t border-white/[0.05] px-4 py-20 sm:px-6 sm:py-24">
                    <div className="mx-auto max-w-6xl">
                        <div data-reveal-heading className="mx-auto mb-12 max-w-2xl text-center"><p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300/75">Simple setup</p><h2 className="mt-3 font-heading text-3xl font-black tracking-tight text-white sm:text-4xl">From signup to real learning momentum.</h2><p className="mt-4 text-sm leading-7 text-slate-500 sm:text-base">The same platform can handle admissions, classroom competition and progress reporting without making setup feel like a project.</p></div>
                        <div className="grid gap-5 md:grid-cols-3">{HOW_IT_WORKS.map((item) => <article key={item.step} data-reveal className="group rounded-[1.6rem] border border-white/[0.08] bg-white/[0.025] p-6 backdrop-blur transition hover:-translate-y-1 hover:border-cyan-300/25 hover:bg-cyan-300/[0.035]"><div className="text-xs font-black tracking-[0.22em] text-cyan-300/65">{item.step}</div><h3 className="mt-5 text-lg font-bold text-white">{item.title}</h3><p className="mt-3 text-sm leading-6 text-slate-500">{item.desc}</p></article>)}</div>
                    </div>
                </section>

                <section ref={audienceRef} className="border-t border-white/[0.05] px-4 py-20 sm:px-6 sm:py-24">
                    <div className="mx-auto max-w-6xl">
                        <div data-reveal-heading className="mb-12 text-center"><p className="text-xs font-bold uppercase tracking-[0.28em] text-fuchsia-300/70">One platform, two perspectives</p><h2 className="mt-3 font-heading text-3xl font-black tracking-tight text-white sm:text-4xl">Useful for schools. Fun for students.</h2></div>
                        <div className="grid gap-6 md:grid-cols-2">
                            <article data-reveal className="rounded-[1.75rem] border border-white/[0.08] bg-gradient-to-br from-cyan-300/[0.055] to-transparent p-7 sm:p-8"><div className="text-2xl" aria-hidden="true">🏫</div><h3 className="mt-5 text-xl font-extrabold text-white">For schools</h3><ul className="mt-5 space-y-3 text-sm leading-6 text-slate-400"><li>✓ Cambridge-aligned admission tests</li><li>✓ Live Lockdown class battle mode</li><li>✓ School analytics and placement reports</li><li>✓ Classes and roster management</li></ul><a href="/pricing.html" target="_blank" rel="noopener noreferrer" className="mt-7 inline-flex text-sm font-bold text-cyan-300 hover:text-cyan-200">View pricing →</a></article>
                            <article data-reveal className="rounded-[1.75rem] border border-white/[0.08] bg-gradient-to-br from-fuchsia-300/[0.045] to-transparent p-7 sm:p-8"><div className="text-2xl" aria-hidden="true">🎮</div><h3 className="mt-5 text-xl font-extrabold text-white">For students</h3><ul className="mt-5 space-y-3 text-sm leading-6 text-slate-400"><li>✓ Earn XP, coins and gems through quests</li><li>✓ Join clans and compete in PvP battles</li><li>✓ Track progress and skill levels</li><li>✓ Build a profile and customize rewards</li></ul><button type="button" onClick={() => switchMode('signup')} className="mt-7 inline-flex text-sm font-bold text-cyan-300 hover:text-cyan-200">Get started free →</button></article>
                        </div>
                    </div>
                </section>
            </main>

            {showDemoModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="demo-modal-title">
                    <div className="my-auto w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-cyan-300/25 bg-[#081321] shadow-[0_0_80px_rgba(34,211,238,0.14)]">
                        <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-gradient-to-br from-white/[0.06] via-cyan-400/[0.05] to-transparent p-5 sm:p-6"><div><p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">For schools &amp; teams</p><h2 id="demo-modal-title" className="mt-2 text-2xl font-extrabold text-white">Request a Brains Heist demo</h2><p className="mt-2 text-sm leading-relaxed text-slate-400">Tell us about your school and the team can prepare the right walkthrough.</p></div><button type="button" onClick={closeDemoModal} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-lg text-slate-400 transition hover:border-white/20 hover:text-white" aria-label="Close demo form">×</button></div>
                        {demoSubmitted ? (
                            <div className="p-6"><div className="rounded-2xl border border-emerald-300/30 bg-emerald-300/[0.07] p-5 text-emerald-50"><div className="text-2xl">✓</div><h3 className="mt-3 text-xl font-bold text-white">Demo request received.</h3><p className="mt-2 text-sm text-emerald-50/80">The Brains Heist team can follow up using the email you provided.</p></div><div className="mt-5 flex justify-end"><button type="button" onClick={closeDemoModal} className="rounded-xl bg-cyan-300 px-5 py-2.5 text-sm font-bold text-[#06101d]">Done</button></div></div>
                        ) : (
                            <form onSubmit={handleDemoSubmit} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
                                {[
                                    ['name', 'First name*', 'Ada'], ['email', 'Work email*', 'leader@school.edu'], ['school', 'School / company*', 'North Star Academy'], ['country', 'Country', 'United Kingdom'], ['studentCount', 'Approx. students', '450'], ['website', 'Website', 'school.example.com'],
                                ].map(([key, label, placeholder]) => (
                                    <label key={key} className="text-sm font-semibold text-slate-300">{label}<input required={key === 'name' || key === 'email' || key === 'school'} type={key === 'email' ? 'email' : key === 'studentCount' ? 'number' : 'text'} min={key === 'studentCount' ? 1 : undefined} value={demoForm[key as keyof typeof demoForm]} onChange={(e) => setDemoForm((form) => ({ ...form, [key]: e.target.value }))} disabled={demoSubmitting} placeholder={placeholder} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.05] p-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10 disabled:opacity-60" /></label>
                                ))}
                                <label className="text-sm font-semibold text-slate-300 sm:col-span-2">Notes<textarea rows={4} value={demoForm.notes} onChange={(e) => setDemoForm((form) => ({ ...form, notes: e.target.value }))} disabled={demoSubmitting} placeholder="Admissions, reports, classroom battles, onboarding timeline..." className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.05] p-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10 disabled:opacity-60" /></label>
                                {demoSubmitError && <p className="rounded-xl border border-rose-300/30 bg-rose-300/[0.08] px-4 py-3 text-sm text-rose-100 sm:col-span-2">{demoSubmitError}</p>}
                                <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-relaxed text-slate-500">By submitting, you agree that Brains Heist may contact you about your demo request.</p><button type="submit" disabled={demoSubmitting} className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-bold text-[#06101d] disabled:opacity-60">{demoSubmitting ? 'Sending...' : 'Send demo request'}</button></div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            <div className="fixed bottom-4 right-4 z-40 w-[calc(100%-2rem)] max-w-sm sm:bottom-5 sm:right-5">
                {assistantOpen ? (
                    <div className="overflow-hidden rounded-[1.65rem] border border-white/15 bg-white text-slate-900 shadow-[0_28px_90px_rgba(0,0,0,0.34)]">
                        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-white via-cyan-50 to-teal-50 px-4 py-3.5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-teal-300">🤖</div><div><p className="text-sm font-extrabold">Brains Assistant</p><p className="text-[11px] text-slate-500">Help with access, demos &amp; setup</p></div></div><button type="button" onClick={() => setAssistantOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Minimize Brains Assistant">×</button></div>
                        <div className="max-h-[18rem] space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">{assistantMessages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex ${message.role === 'agent' ? 'justify-start' : 'justify-end'}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === 'agent' ? 'border border-slate-200 bg-white text-slate-700' : 'bg-gradient-to-br from-cyan-600 to-teal-500 text-white'}`}>{message.text}</div></div>)}{assistantLoading && <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500"><span className="h-2 w-2 animate-pulse rounded-full bg-cyan-500" />Thinking...</div>}{assistantError && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{assistantError}</div>}</div>
                        <div className="flex gap-2 overflow-x-auto border-t border-slate-200 px-4 py-3 text-[11px] font-bold"><button type="button" onClick={() => void submitAssistantPrompt('How much does Brains Heist cost for my school?')} className="whitespace-nowrap rounded-full border border-slate-200 px-3 py-1.5 hover:bg-cyan-50">Pricing</button><button type="button" onClick={openDemoFromAssistant} className="whitespace-nowrap rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-cyan-900">Request demo</button><button type="button" onClick={() => void submitAssistantPrompt('I need help signing in or setting up my Brains Heist account.')} className="whitespace-nowrap rounded-full border border-slate-200 px-3 py-1.5 hover:bg-cyan-50">Sign-in help</button></div>
                        <form onSubmit={(e) => { e.preventDefault(); void submitAssistantPrompt(assistantQuestion); }} className="flex gap-2 border-t border-slate-200 bg-white p-3"><input value={assistantQuestion} onChange={(e) => setAssistantQuestion(e.target.value)} disabled={assistantLoading} placeholder="Ask a question" className="min-w-0 flex-1 rounded-full border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100" /><button type="submit" disabled={assistantLoading} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-white disabled:opacity-50" aria-label="Send assistant question">➤</button></form>
                    </div>
                ) : (
                    <button type="button" onClick={() => setAssistantOpen(true)} className="ml-auto flex items-center gap-2 rounded-full border border-cyan-300/30 bg-[#081321]/95 px-4 py-3 text-sm font-bold text-white shadow-[0_0_30px_rgba(34,211,238,0.18)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-cyan-300/50"><span className="relative text-lg">🤖<span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-emerald-400" /></span> Brains Assistant</button>
                )}
            </div>

            <LoginFooter onRequestDemo={openDemoModal} />
        </div>
    );
};

export default LoginView;
