import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/dist/ScrollTrigger';
import { GoogleIcon } from './icons';
import * as AuthService from '../services/authService';
import { consumeBanMessage } from '../services/banMessage';

/* ─── tiny inline icons (avoids new deps) ──────────────────────────────── */
const CheckBadge = () => (
    <svg className="w-5 h-5 shrink-0" style={{ color: 'var(--ion-blue)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);
const ShieldCheck = () => (
    <svg className="w-4 h-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
);

interface LoginViewProps {
    onLogin: (email: string, pass: string) => Promise<void>;
}

/* ─── value props ──────────────────────────────────────────────────────── */
const VALUE_BULLETS = [
    'Admission Tests (English + Math) with Cambridge stage mapping',
    'Lockdown Clan Territory mode for live class sessions',
    'Reports for schools + parents (score + skill breakdown + placement band)',
] as const;

const TRUST_ITEMS = [
    'Secure payments via Paddle (Merchant of Record)',
    'Cancel anytime',
    'Support response within 24–48 hours',
] as const;

const HOW_IT_WORKS = [
    { step: '1', title: 'Create your school', desc: 'Sign up and register your school in under 2 minutes.' },
    { step: '2', title: 'Add students & classes', desc: 'Import rosters or invite students with a class code.' },
    { step: '3', title: 'Run assessments & battles', desc: 'Launch tests, clan battles, and track real-time progress.' },
] as const;

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
    const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);

    // Refs for GSAP animations
    const cardRef = useRef<HTMLDivElement>(null);
    const logoRef = useRef<HTMLImageElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const subtitleRef = useRef<HTMLParagraphElement>(null);
    const bulletsRef = useRef<HTMLUListElement>(null);
    const submitBtnRef = useRef<HTMLButtonElement>(null);
    const emailInputRef = useRef<HTMLInputElement>(null);
    const passwordInputRef = useRef<HTMLInputElement>(null);
    const usernameInputRef = useRef<HTMLInputElement>(null);
    const pageRef = useRef<HTMLDivElement>(null);
    const heroColRef = useRef<HTMLDivElement>(null);
    const howItWorksRef = useRef<HTMLElement>(null);
    const audienceRef = useRef<HTMLElement>(null);
    const orbOneRef = useRef<HTMLDivElement>(null);
    const orbTwoRef = useRef<HTMLDivElement>(null);
    const orbThreeRef = useRef<HTMLDivElement>(null);
    const heroSweepRef = useRef<HTMLDivElement>(null);
    const heroGridRef = useRef<HTMLDivElement>(null);
    const ctaShimmerRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const persisted = consumeBanMessage();
        if (persisted) {
            setMode('login');
            setError(persisted);
        }
    }, []);

    // GSAP entrance animation
    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        gsap.registerPlugin(ScrollTrigger);

        const ctx = gsap.context(() => {
            // Only animate refs guaranteed to exist on initial render (login mode)
            const hero = [cardRef, logoRef, titleRef, subtitleRef, bulletsRef].map(r => r.current).filter(Boolean);
            const inputs = [emailInputRef, passwordInputRef].map(r => r.current).filter(Boolean);
            const btn = submitBtnRef.current;
            if (!hero.length) return;

            const heroHeading = titleRef.current;
            const headingText = heroHeading?.dataset.text || 'Brains Heist';

            gsap.set(hero, { opacity: 0 });
            gsap.set(cardRef.current!, { y: 92, scale: 0.93, filter: 'blur(14px)' });
            gsap.set(logoRef.current!, { scale: 0.52, y: -28, rotate: -18, filter: 'blur(7px)', transformOrigin: '50% 50%' });
            gsap.set([titleRef.current!, subtitleRef.current!, bulletsRef.current!], { y: 38, filter: 'blur(8px)' });
            if (inputs.length) gsap.set(inputs, { opacity: 0, y: 32, filter: 'blur(6px)' });
            if (btn) gsap.set(btn, { opacity: 0, y: 24, filter: 'blur(5px)' });
            if (heroSweepRef.current) gsap.set(heroSweepRef.current, { opacity: 0, scaleX: 0, xPercent: -20, transformOrigin: '0% 50%' });
            if (heroGridRef.current) gsap.set(heroGridRef.current, { opacity: 0.1 });

            if (heroHeading) {
                heroHeading.textContent = '███████████';
                gsap.set(heroHeading, { letterSpacing: '0.18em', textShadow: '0 0 36px rgba(34,211,238,0.28)' });
            }

            const tl = gsap.timeline();
            tl.to(heroGridRef.current, { opacity: 0.34, duration: 0.5, ease: 'power2.out' }, 0)
                .to(heroSweepRef.current, { opacity: 0.8, scaleX: 1, xPercent: 0, duration: 0.45, ease: 'power2.out' }, 0.05)
                .to(heroSweepRef.current, { xPercent: 125, duration: 0.78, ease: 'power4.inOut' }, 0.4)
                .to(heroSweepRef.current, { opacity: 0, duration: 0.24, ease: 'power1.out' }, 0.94)
                .to(cardRef.current, { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 1.12, ease: 'expo.out' }, 0.16)
                .to(logoRef.current, { opacity: 1, scale: 1, y: 0, rotate: 0, filter: 'blur(0px)', duration: 1, ease: 'expo.out' }, 0.08)
                .to(titleRef.current, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.75, ease: 'power3.out' }, 0.34)
                .to(subtitleRef.current, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.65, ease: 'power3.out' }, 0.56)
                .to(bulletsRef.current, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.64, ease: 'power3.out' }, 0.68);
            if (inputs.length) {
                tl.to(inputs, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.58, ease: 'power3.out', stagger: 0.09 }, 0.84);
            }
            if (btn) {
                tl.to(btn, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.62, ease: 'power3.out' }, 1.03)
                    .fromTo(btn, { boxShadow: '0 0 0px rgba(34,211,238,0)' }, { boxShadow: '0 0 38px rgba(34,211,238,0.65)', duration: 0.52, ease: 'power2.out' }, 1.09);
            }

            if (heroHeading) {
                const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@$%&*';
                const reveal = { frame: 0 };
                gsap.to(reveal, {
                    frame: headingText.length + 7,
                    duration: 1.1,
                    ease: 'power2.out',
                    delay: 0.38,
                    onUpdate: () => {
                        const settled = Math.floor(reveal.frame - 7);
                        heroHeading.textContent = headingText
                            .split('')
                            .map((char, idx) => {
                                if (char === ' ') return ' ';
                                if (idx <= settled) return char;
                                return glyphs[Math.floor(Math.random() * glyphs.length)];
                            })
                            .join('');
                    },
                    onComplete: () => {
                        heroHeading.textContent = headingText;
                        gsap.to(heroHeading, { letterSpacing: '0.04em', duration: 0.5, ease: 'power2.out' });
                    },
                });
            }

            if (btn && ctaShimmerRef.current && pageRef.current) {
                gsap.set(btn, {
                    boxShadow: '0 0 18px rgba(34,211,238,0.18), 0 0 34px rgba(34,211,238,0.08), inset 0 0 12px rgba(34,211,238,0.1)',
                });
                gsap.set(ctaShimmerRef.current, {
                    xPercent: -220,
                    opacity: 0.22,
                    filter: 'blur(0px)',
                    willChange: 'transform, opacity, filter',
                });

                const getResponsiveStart = () => {
                    if (window.innerWidth >= 1024) return 'top 58%';
                    if (window.innerWidth >= 640) return 'top 68%';
                    return 'top 78%';
                };

                const getResponsiveEnd = () => {
                    if (window.innerWidth >= 1024) return 'top 12%';
                    if (window.innerWidth >= 640) return 'top 18%';
                    return 'top 26%';
                };

                gsap.timeline({
                    scrollTrigger: {
                        trigger: btn,
                        start: getResponsiveStart,
                        end: getResponsiveEnd,
                        scrub: 0.35,
                        invalidateOnRefresh: true,
                    },
                })
                    .to(ctaShimmerRef.current, {
                        xPercent: 240,
                        opacity: 0.86,
                        filter: 'blur(0.2px)',
                        ease: 'none',
                    }, 0)
                    .to(btn, {
                        boxShadow: '0 0 30px rgba(34,211,238,0.38), 0 0 58px rgba(34,211,238,0.16), inset 0 0 20px rgba(34,211,238,0.2)',
                        ease: 'none',
                    }, 0);
            }

            [
                heroColRef.current && gsap.to(heroColRef.current, {
                    y: -14,
                    duration: 5.8,
                    ease: 'sine.inOut',
                    repeat: -1,
                    yoyo: true,
                    delay: 1.1,
                }),
                logoRef.current && gsap.to(logoRef.current, {
                    rotate: 4,
                    scale: 1.06,
                    filter: 'drop-shadow(0 0 24px rgba(44,246,200,0.62))',
                    duration: 4.4,
                    ease: 'sine.inOut',
                    repeat: -1,
                    yoyo: true,
                    delay: 1.2,
                }),
                orbOneRef.current && gsap.to(orbOneRef.current, {
                    xPercent: 18,
                    yPercent: -18,
                    opacity: 0.62,
                    scale: 1.14,
                    duration: 8,
                    ease: 'sine.inOut',
                    repeat: -1,
                    yoyo: true,
                }),
                orbTwoRef.current && gsap.to(orbTwoRef.current, {
                    xPercent: -16,
                    yPercent: 14,
                    opacity: 0.66,
                    scale: 1.18,
                    duration: 10,
                    ease: 'sine.inOut',
                    repeat: -1,
                    yoyo: true,
                }),
                orbThreeRef.current && gsap.to(orbThreeRef.current, {
                    xPercent: -12,
                    yPercent: -12,
                    opacity: 0.48,
                    scale: 1.22,
                    duration: 9.2,
                    ease: 'sine.inOut',
                    repeat: -1,
                    yoyo: true,
                }),
                heroGridRef.current && gsap.to(heroGridRef.current, {
                    backgroundPosition: '0px 58px',
                    duration: 9,
                    ease: 'sine.inOut',
                    repeat: -1,
                    yoyo: true,
                }),
            ].filter(Boolean);

            [howItWorksRef.current, audienceRef.current].filter(Boolean).forEach((section) => {
                const revealItems = Array.from((section as HTMLElement).querySelectorAll<HTMLElement>('[data-reveal]'));
                const heading = (section as HTMLElement).querySelector<HTMLElement>('[data-reveal-heading]');
                if (!revealItems.length) return;

                if (heading) gsap.set(heading, { opacity: 0, y: 28, filter: 'blur(5px)' });
                gsap.set(revealItems, { opacity: 0, y: 56, z: -60, rotateX: 10, filter: 'blur(8px)' });

                const sectionTl = gsap.timeline({
                    scrollTrigger: {
                        trigger: section,
                        start: 'top 78%',
                        toggleActions: 'play none none reverse',
                    },
                });

                if (heading) {
                    sectionTl.to(heading, {
                        opacity: 1,
                        y: 0,
                        filter: 'blur(0px)',
                        duration: 0.58,
                        ease: 'power3.out',
                    }, 0);
                }

                sectionTl.to(revealItems, {
                    opacity: 1,
                    y: 0,
                    z: 0,
                    rotateX: 0,
                    filter: 'blur(0px)',
                    duration: 0.78,
                    ease: 'power3.out',
                    stagger: 0.13,
                }, heading ? 0.12 : 0)
                    .fromTo(revealItems, {
                        boxShadow: '0 0 0px rgba(34,211,238,0)',
                    }, {
                        boxShadow: '0 0 22px rgba(34,211,238,0.22)',
                        duration: 0.45,
                        stagger: 0.1,
                        ease: 'power2.out',
                    }, heading ? 0.24 : 0.1);
            });

        }, pageRef);

        return () => ctx.revert();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setIsLoading(true);

        try {
            if (mode === 'reset') {
                await AuthService.sendPasswordResetEmail(email);
                setSuccess('Password reset email sent!');
                setMode('login');
            } else if (mode === 'signup') {
                if (!username.trim()) {
                    setError('Pick a codename!');
                    return;
                }
                if (!email.trim()) {
                    setError('Enter your email');
                    return;
                }
                // Create account with minimal info - SetupWizard will complete the profile
                await AuthService.signup(
                    email.trim(),
                    password,
                    username.trim(),
                    'student' // Default, will be changed in SetupWizard
                );
                // Show success and reload to trigger auth check
                setSuccess('Account created! Loading your profile...');
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
                return; // Don't set isLoading to false, keep loading state
            } else {
                await onLogin(email.trim(), password);
            }
        } catch (err: any) {
            setError(err.message || 'Operation failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setError(null);
        setIsGoogleLoading(true);
        try {
            await AuthService.loginWithGoogle();
        } catch (err: any) {
            setError(err.message || 'Google sign-in failed');
        } finally {
            setIsGoogleLoading(false);
        }
    };

    /* ─── Auth form card (reused in both mobile & desktop) ─────────────── */
    const authCard = (
        <div ref={cardRef} className="bg-ink-900/50 backdrop-blur-sm border border-white/10 rounded-2xl p-5 sm:p-8 shadow-xl">
            {error && (
                <div className="mb-4 rounded-md border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    ⚠️ {error}
                </div>
            )}
            {success && (
                <div className="mb-4 rounded-md border border-green-500/60 bg-green-500/10 px-4 py-3 text-sm text-green-200">
                    ✓ {success}
                </div>
            )}

            <div className="flex gap-4 mb-6">
                <button
                    onClick={() => setMode('login')}
                    className={`flex-1 py-2 px-4 rounded-md font-semibold transition-all ${
                        mode === 'login'
                            ? 'bg-ion-blue text-ink-900'
                            : 'text-gray-400 hover:text-white'
                    }`}
                >
                    Sign in
                </button>
                <button
                    onClick={() => setMode('signup')}
                    className={`flex-1 py-2 px-4 rounded-md font-semibold transition-all ${
                        mode === 'signup'
                            ? 'bg-ion-blue text-ink-900'
                            : 'text-gray-400 hover:text-white'
                    }`}
                >
                    Sign up
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                {mode === 'reset' && (
                    <div className="mb-4">
                        <button
                            type="button"
                            onClick={() => setMode('login')}
                            className="text-cyan-400 hover:text-cyan-300 text-sm"
                        >
                            ← Back to sign in
                        </button>
                        <h3 className="text-xl font-bold text-white mt-2">Reset Password</h3>
                    </div>
                )}

                {mode === 'signup' && (
                    <div>
                        <label htmlFor="username" className="block text-sm font-medium text-gray-300">Username</label>
                        <input
                            ref={usernameInputRef}
                            id="username"
                            type="text"
                            required
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="mt-1 block w-full bg-gray-800 border border-gray-600 rounded-md p-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                            placeholder="ChooseYourName"
                        />
                        <p className="mt-1 text-xs text-gray-400">You'll complete your profile in the next step</p>
                    </div>
                )}

                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-300">Email</label>
                    <input
                        ref={emailInputRef}
                        id="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mt-1 block w-full bg-gray-800 border border-gray-600 rounded-md p-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                        placeholder="agent@bh.os"
                    />
                </div>

                {mode !== 'reset' && (
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-300">Password</label>
                        <input
                            ref={passwordInputRef}
                            id="password"
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="mt-1 block w-full bg-gray-800 border border-gray-600 rounded-md p-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                            placeholder="••••••••"
                        />
                    </div>
                )}

                {mode === 'login' && (
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => setMode('reset')}
                            className="text-xs text-cyan-300 hover:text-cyan-200"
                        >
                            Forgot password?
                        </button>
                    </div>
                )}

                <button
                    ref={submitBtnRef}
                    type="submit"
                    disabled={isLoading || (mode === 'signup' && !username.trim())}
                    className="group relative isolate overflow-hidden w-full py-3 px-4 rounded-md font-bold transition-all bg-ion-blue text-ink-900 hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <span
                        ref={ctaShimmerRef}
                        className="pointer-events-none absolute -inset-y-2 left-[-45%] z-10 w-[55%] -skew-x-12 bg-gradient-to-r from-transparent via-white/95 via-50% to-transparent mix-blend-screen opacity-70"
                        aria-hidden="true"
                    />
                    {isLoading ? 'Loading...' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
                </button>
            </form>

            {(mode === 'login' || mode === 'signup') && (
                <>
                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-600"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-ink-900/50 text-gray-400">or</span>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={isGoogleLoading}
                        className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-md border-2 border-gray-600 hover:border-gray-500 text-white transition-all disabled:opacity-50"
                    >
                        <GoogleIcon />
                        {isGoogleLoading ? 'Loading...' : mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}
                    </button>
                </>
            )}
        </div>
    );

    return (
        <div ref={pageRef} className="min-h-screen flex flex-col relative overflow-hidden">
            <div
                ref={heroGridRef}
                className="pointer-events-none absolute inset-0 opacity-20"
                style={{
                    backgroundImage: 'linear-gradient(rgba(34,211,238,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.08) 1px, transparent 1px)',
                    backgroundSize: '72px 72px',
                    maskImage: 'radial-gradient(circle at 40% 22%, black, transparent 72%)',
                    WebkitMaskImage: 'radial-gradient(circle at 40% 22%, black, transparent 72%)',
                }}
                aria-hidden="true"
            />

            <div
                ref={heroSweepRef}
                className="pointer-events-none absolute top-[16%] left-[-20%] h-24 w-[64%] bg-gradient-to-r from-transparent via-cyan-300/75 to-transparent blur-xl"
                aria-hidden="true"
            />

            <div
                ref={orbOneRef}
                className="pointer-events-none absolute -top-28 -left-20 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl"
                aria-hidden="true"
            />
            <div
                ref={orbTwoRef}
                className="pointer-events-none absolute top-1/3 -right-24 h-72 w-72 rounded-full bg-emerald-400/16 blur-3xl"
                aria-hidden="true"
            />
            <div
                ref={orbThreeRef}
                className="pointer-events-none absolute bottom-16 left-1/4 h-56 w-56 rounded-full bg-violet-400/12 blur-3xl"
                aria-hidden="true"
            />
            {/* ── HERO + AUTH (above the fold) ─────────────────────────────── */}
            <section className="flex-1 flex items-center justify-center px-4 py-10 sm:py-16">
                <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">

                    {/* ── Left: hero / value props ──────────────────────────── */}
                    <div ref={heroColRef} className="text-center lg:text-left order-1">
                        <div className="flex items-center justify-center lg:justify-start gap-3 mb-5">
                            <img
                                ref={logoRef}
                                src="/logo.png"
                                alt="Brains Heist"
                                className="w-14 h-14 sm:w-16 sm:h-16 drop-shadow-[0_0_18px_rgba(44,246,200,0.45)]"
                            />
                            <h1
                                ref={titleRef}
                                className="font-heading text-3xl sm:text-4xl font-bold tracking-wide"
                                data-text="Brains Heist"
                                style={{ color: 'var(--ion-blue)' }}
                            >
                                Brains Heist
                            </h1>
                        </div>

                        <p
                            ref={subtitleRef}
                            className="text-lg sm:text-xl text-gray-200 leading-relaxed max-w-lg mx-auto lg:mx-0"
                        >
                            A gamified English &amp; Math platform for schools — assessments, leaderboards, and class battle modes.
                        </p>

                        {/* value bullets */}
                        <ul
                            ref={bulletsRef}
                            className="mt-6 space-y-3 text-sm sm:text-base text-gray-300 max-w-lg mx-auto lg:mx-0"
                            role="list"
                        >
                            {VALUE_BULLETS.map((b) => (
                                <li key={b} className="flex items-start gap-2.5">
                                    <CheckBadge />
                                    <span>{b}</span>
                                </li>
                            ))}
                        </ul>

                        {/* trust strip */}
                        <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2 text-xs sm:text-sm text-gray-400">
                            {TRUST_ITEMS.map((t) => (
                                <span key={t} className="flex items-center gap-1.5">
                                    <ShieldCheck />
                                    {t}
                                </span>
                            ))}
                        </div>

                        {/* IELTS link */}
                        <div className="mt-6 flex justify-center lg:justify-start">
                            <a
                                href="/ielts"
                                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 border border-emerald-500/40 rounded-full hover:bg-emerald-500/10 transition-colors"
                                style={{ color: 'var(--ion-blue)' }}
                            >
                                📚 IELTS Preparation →
                            </a>
                        </div>
                    </div>

                    {/* ── Right: auth card ───────────────────────────────────── */}
                    <div className="w-full max-w-md mx-auto lg:mx-0 lg:ml-auto order-2">
                        {authCard}
                    </div>

                </div>
            </section>

            {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
            <section ref={howItWorksRef} className="px-4 py-12 sm:py-16 border-t border-white/5">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 data-reveal-heading className="font-heading text-2xl sm:text-3xl font-bold mb-8" style={{ color: 'var(--ion-blue)' }}>
                        How it works
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
                        {HOW_IT_WORKS.map((item) => (
                            <div
                                key={item.step}
                                className="relative bg-white/[0.03] border border-white/10 rounded-2xl p-6 backdrop-blur-sm"
                                data-reveal
                            >
                                <span
                                    className="inline-flex items-center justify-center w-10 h-10 rounded-full text-lg font-bold mb-4"
                                    style={{ background: 'var(--ion-blue)', color: 'var(--ink-900)' }}
                                >
                                    {item.step}
                                </span>
                                <h3 className="text-white font-semibold text-base mb-1">{item.title}</h3>
                                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── FOR SCHOOLS / FOR STUDENTS ────────────────────────────────── */}
            <section ref={audienceRef} className="px-4 py-12 sm:py-16 border-t border-white/5">
                <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 sm:p-8" data-reveal>
                        <h3 className="font-heading text-lg font-bold text-white mb-2">🏫 For Schools</h3>
                        <ul className="space-y-2 text-sm text-gray-300">
                            <li>• Cambridge-aligned admission tests</li>
                            <li>• Live Lockdown class battle mode</li>
                            <li>• School-wide analytics &amp; placement reports</li>
                            <li>• Manage classes, batches &amp; rosters</li>
                        </ul>
                        <a
                            href="/pricing.html"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block mt-4 text-sm font-medium hover:underline"
                            style={{ color: 'var(--ion-blue)' }}
                        >
                            View pricing →
                        </a>
                    </div>
                    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 sm:p-8" data-reveal>
                        <h3 className="font-heading text-lg font-bold text-white mb-2">🎮 For Students</h3>
                        <ul className="space-y-2 text-sm text-gray-300">
                            <li>• Earn XP, coins &amp; gems through quests</li>
                            <li>• Join clans and compete in PvP battles</li>
                            <li>• Track your progress &amp; skill levels</li>
                            <li>• Customize your avatar in the shop</li>
                        </ul>
                        <a
                            href="/pricing.html"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block mt-4 text-sm font-medium hover:underline"
                            style={{ color: 'var(--ion-blue)' }}
                        >
                            Get started free →
                        </a>
                    </div>
                </div>
            </section>

            {/* ── FOOTER ───────────────────────────────────────────────────── */}
            <footer className="border-t border-white/5 px-4 py-8 sm:py-10">
                <div className="max-w-5xl mx-auto">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-sm">
                        {/* Brand */}
                        <div className="col-span-2 sm:col-span-1">
                            <div className="flex items-center gap-2 mb-3">
                                <img src="/logo.png" alt="" className="w-7 h-7" />
                                <span className="font-heading font-bold text-white">Brains Heist</span>
                            </div>
                            <p className="text-gray-500 text-xs leading-relaxed">
                                Gamified learning for English &amp; Math — built for schools, loved by students.
                            </p>
                        </div>

                        {/* Legal */}
                        <div>
                            <h4 className="text-gray-400 font-semibold text-xs uppercase tracking-wider mb-3">Legal</h4>
                            <ul className="space-y-2 text-gray-500">
                                <li><a href="/terms.html" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">Terms of Service</a></li>
                                <li><a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">Privacy Policy</a></li>
                                <li><a href="/refund.html" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">Refund Policy</a></li>
                            </ul>
                        </div>

                        {/* Resources */}
                        <div>
                            <h4 className="text-gray-400 font-semibold text-xs uppercase tracking-wider mb-3">Resources</h4>
                            <ul className="space-y-2 text-gray-500">
                                <li><a href="/pricing.html" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">Pricing</a></li>
                                <li><a href="/contact.html" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">Contact Us</a></li>
                                <li><a href="/ielts" className="hover:text-emerald-400 transition-colors">IELTS Prep</a></li>
                            </ul>
                        </div>

                        {/* Contact */}
                        <div>
                            <h4 className="text-gray-400 font-semibold text-xs uppercase tracking-wider mb-3">Get in touch</h4>
                            <ul className="space-y-2 text-gray-500 text-xs sm:text-sm">
                                <li>
                                    <a href="mailto:support@brainsheist.com" className="hover:text-emerald-400 transition-colors">
                                        support@brainsheist.com
                                    </a>
                                </li>
                                <li>
                                    <a href="mailto:sales@brainsheist.com" className="hover:text-emerald-400 transition-colors">
                                        sales@brainsheist.com
                                    </a>
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* Bottom bar */}
                    <div className="mt-8 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
                        <span>© {new Date().getFullYear()} Brains Heist. All rights reserved.</span>
                        <span className="flex items-center gap-1">
                            <ShieldCheck />
                            Payments secured by Paddle — Merchant of Record
                        </span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LoginView;
