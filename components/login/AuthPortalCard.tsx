import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { GoogleIcon } from '../icons';

type Mode = 'login' | 'signup' | 'reset' | 'confirm';

interface AuthPortalCardProps {
    mode: Mode;
    email: string;
    password: string;
    username: string;
    showPassword: boolean;
    confirmationCode: string;
    pendingEmail: string;
    pendingExpiresAt: string | null;
    error: string | null;
    success: string | null;
    isLoading: boolean;
    isGoogleLoading: boolean;
    resendLoading: boolean;
    onEmailChange: (value: string) => void;
    onPasswordChange: (value: string) => void;
    onUsernameChange: (value: string) => void;
    onConfirmationCodeChange: (value: string) => void;
    onTogglePassword: () => void;
    onSubmit: (event: React.FormEvent) => void;
    onGoogle: () => void;
    onSwitchMode: (mode: 'login' | 'signup' | 'reset') => void;
    onSwitchFromConfirmation: (mode: 'login' | 'signup') => void;
    onResendConfirmation: () => void;
}

const AuthPortalCard: React.FC<AuthPortalCardProps> = ({
    mode,
    email,
    password,
    username,
    showPassword,
    confirmationCode,
    pendingEmail,
    pendingExpiresAt,
    error,
    success,
    isLoading,
    isGoogleLoading,
    resendLoading,
    onEmailChange,
    onPasswordChange,
    onUsernameChange,
    onConfirmationCodeChange,
    onTogglePassword,
    onSubmit,
    onGoogle,
    onSwitchMode,
    onSwitchFromConfirmation,
    onResendConfirmation,
}) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const shimmerRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (!buttonRef.current || !shimmerRef.current) return;
        const tween = gsap.fromTo(shimmerRef.current,
            { xPercent: -230, opacity: 0.15 },
            { xPercent: 245, opacity: 0.85, duration: 1.65, repeat: -1, repeatDelay: 4.5, ease: 'power2.inOut' },
        );
        return () => tween.kill();
    }, [mode]);

    if (mode === 'confirm') {
        return (
            <div className="relative overflow-hidden rounded-[1.75rem] border border-cyan-300/25 bg-[#081321]/95 p-5 shadow-[0_34px_110px_rgba(0,0,0,0.42),0_0_55px_rgba(34,211,238,0.10)] backdrop-blur-xl sm:p-7">
                <form onSubmit={onSubmit} className="space-y-5" aria-labelledby="portal-confirm-title">
                    <div className="text-center">
                        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-300/75">Identity verification</p>
                        <h2 id="portal-confirm-title" className="mt-2 text-2xl font-black text-white">Confirm your email</h2>
                        <p className="mt-2 text-sm text-slate-400">We sent a confirmation to</p>
                        <strong className="mt-1 block break-all text-cyan-200">{pendingEmail}</strong>
                    </div>

                    {error && <div role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-400/[0.08] px-4 py-3 text-sm text-rose-100">{error}</div>}
                    {success && <div role="status" className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.08] px-4 py-3 text-sm text-emerald-100">✓ {success}</div>}

                    <input
                        value={confirmationCode}
                        onChange={(event) => onConfirmationCodeChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        aria-label="Confirmation code"
                        placeholder="000000"
                        className="block h-14 w-full rounded-2xl border border-slate-600/70 bg-slate-800/70 px-4 text-center font-mono text-2xl tracking-[0.45em] text-white outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10"
                    />
                    <p className="text-center text-xs text-slate-500">{pendingExpiresAt ? `Pending account expires ${new Date(pendingExpiresAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}.` : 'Confirm within seven days.'}</p>

                    <button type="submit" disabled={isLoading || confirmationCode.length !== 6} className="flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-300 via-cyan-400 to-teal-300 font-black text-[#06101d] disabled:opacity-50">{isLoading ? 'Confirming…' : 'Confirm and continue'}</button>

                    <div className="grid gap-2 sm:grid-cols-2">
                        <button type="button" onClick={onResendConfirmation} disabled={resendLoading} className="rounded-xl border border-white/10 px-3 py-2.5 text-sm font-bold text-slate-300 transition hover:border-cyan-300/35 hover:text-white disabled:opacity-50">{resendLoading ? 'Sending…' : 'Resend confirmation'}</button>
                        <button type="button" onClick={onGoogle} disabled={isGoogleLoading} className="rounded-xl border border-white/10 px-3 py-2.5 text-sm font-bold text-slate-300 transition hover:border-cyan-300/35 hover:text-white disabled:opacity-50">Continue with Google</button>
                    </div>
                    <div className="flex items-center justify-center gap-4 text-xs">
                        <button type="button" onClick={() => onSwitchFromConfirmation('signup')} className="font-bold text-cyan-300">Change email</button>
                        <button type="button" onClick={() => onSwitchFromConfirmation('login')} className="text-slate-400 hover:text-white">Back to sign in</button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#081321]/92 p-5 shadow-[0_34px_110px_rgba(0,0,0,0.42),0_0_55px_rgba(34,211,238,0.08)] backdrop-blur-xl sm:p-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cyan-400/[0.08] blur-3xl" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-fuchsia-400/[0.07] blur-3xl" aria-hidden="true" />

            <div className="relative">
                <div className="mb-6 text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-300/75">Brains Heist access</p>
                    <h2 className="mt-2 text-2xl font-black tracking-tight text-white">{mode === 'login' ? 'Welcome back, Agent.' : mode === 'signup' ? 'Create your identity.' : 'Reset access.'}</h2>
                    <p className="mt-2 text-sm text-slate-400">{mode === 'login' ? 'The fastest way in is Google.' : mode === 'signup' ? 'Google works for new accounts too.' : 'We’ll send you a secure reset link.'}</p>
                </div>

                {mode !== 'reset' && (
                    <button type="button" onClick={onGoogle} disabled={isGoogleLoading} className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white px-4 font-extrabold text-slate-900 shadow-[0_10px_30px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(0,0,0,0.26)] disabled:opacity-60">
                        <GoogleIcon className="h-5 w-5" />
                        {isGoogleLoading ? 'Connecting…' : 'Continue with Google'}
                    </button>
                )}

                {mode !== 'reset' && <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.28em] text-slate-600"><span className="h-px flex-1 bg-white/10" /><span>or</span><span className="h-px flex-1 bg-white/10" /></div>}

                {mode === 'reset' && <button type="button" onClick={() => onSwitchMode('login')} className="mb-5 text-sm font-bold text-cyan-300">← Back to sign in</button>}

                {error && <div role="alert" className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-400/[0.08] px-4 py-3 text-sm text-rose-100">{error}</div>}
                {success && <div role="status" className="mb-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.08] px-4 py-3 text-sm text-emerald-100">✓ {success}</div>}

                <form onSubmit={onSubmit} className="space-y-4">
                    {mode === 'signup' && <input autoComplete="username" required value={username} onChange={(event) => onUsernameChange(event.target.value)} placeholder="Choose a username" aria-label="Username" className="block h-13 w-full rounded-2xl border border-slate-600/70 bg-slate-800/70 px-4 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10" />}
                    <input type="email" autoComplete="email" required value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="Email address" aria-label="Email" className="block h-13 w-full rounded-2xl border border-slate-600/70 bg-slate-800/70 px-4 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10" />
                    {mode !== 'reset' && (
                        <div className="relative">
                            <input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={password} onChange={(event) => onPasswordChange(event.target.value)} placeholder="Password" aria-label="Password" className="block h-13 w-full rounded-2xl border border-slate-600/70 bg-slate-800/70 px-4 pr-12 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10" />
                            <button type="button" onClick={onTogglePassword} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-slate-400 hover:text-white" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? '◉' : '◎'}</button>
                        </div>
                    )}

                    {mode === 'login' && <div className="flex justify-end"><button type="button" onClick={() => onSwitchMode('reset')} className="text-xs font-bold text-cyan-300 hover:text-cyan-200">Forgot password?</button></div>}

                    <button ref={buttonRef} type="submit" disabled={isLoading || (mode === 'signup' && !username.trim())} className="group relative isolate flex h-14 w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-300 via-cyan-400 to-teal-300 px-4 font-black text-[#06101d] shadow-[0_12px_34px_rgba(34,211,238,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(34,211,238,0.32)] disabled:opacity-50">
                        <span ref={shimmerRef} className="pointer-events-none absolute -inset-y-3 left-[-45%] z-10 w-[42%] -skew-x-12 bg-gradient-to-r from-transparent via-white/80 to-transparent mix-blend-screen" aria-hidden="true" />
                        <span className="relative z-20">{isLoading ? 'Working…' : mode === 'login' ? 'Enter →' : mode === 'signup' ? 'Create account →' : 'Send reset link →'}</span>
                    </button>
                </form>

                {mode !== 'reset' && <p className="mt-5 text-center text-sm text-slate-400">{mode === 'login' ? 'New to Brains Heist?' : 'Already have an account?'}{' '}<button type="button" onClick={() => onSwitchMode(mode === 'login' ? 'signup' : 'login')} className="font-extrabold text-cyan-300 hover:text-cyan-200">{mode === 'login' ? 'Create account' : 'Sign in'}</button></p>}
            </div>
        </div>
    );
};

export default AuthPortalCard;
