import React, { useEffect, useState } from 'react';
import * as AuthService from '../services/authService';
import { consumeBanMessage } from '../services/banMessage';
import { askVisitorAssistant } from '../services/visitorAssistantService';
import { submitDemoRequest } from '../services/demoRequestService';
import PortalLanding from './login/PortalLanding';
import ExploreUniverse from './login/ExploreUniverse';
import AuthPortalCard from './login/AuthPortalCard';

interface LoginViewProps {
    onLogin: (email: string, pass: string) => Promise<void>;
}

type AssistantMessage = {
    role: 'agent' | 'visitor';
    text: string;
};

const PENDING_CONFIRMATION_KEY = 'brains_heist_pending_confirmation_v1';

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
    const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'confirm'>('login');
    const [pageMode, setPageMode] = useState<'portal' | 'explore'>('portal');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
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
            text: "Hi! I'm Brains Assistant. Tell me if you're a student, teacher, school leader, or IELTS learner and I'll point you in the right direction.",
        },
    ]);

    useEffect(() => {
        const persisted = consumeBanMessage();
        if (persisted) {
            setMode('login');
            setPageMode('portal');
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
            setPageMode('portal');
        } catch {
            window.localStorage.removeItem(PENDING_CONFIRMATION_KEY);
        }
    }, []);

    const friendlyError = (message?: string) => {
        const normalized = (message || '').toLowerCase();
        if (normalized.includes('invalid login') || normalized.includes('invalid credentials')) return "We couldn't sign you in. Check your email and password and try again.";
        if (normalized.includes('email not confirmed')) return 'Please verify your email before signing in.';
        if (normalized.includes('rate') || normalized.includes('too many')) return 'Too many attempts. Please wait a moment and try again.';
        return message || 'Something went wrong. Please try again.';
    };

    const switchMode = (next: 'login' | 'signup' | 'reset') => {
        setMode(next);
        setPageMode('portal');
        setError(null);
        setSuccess(null);
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
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
                    window.localStorage.setItem(PENDING_CONFIRMATION_KEY, JSON.stringify({ email: signupResult.email, expiresAt }));
                    setConfirmationCode('');
                    setMode('confirm');
                    setSuccess('Account created. Confirm your email within seven days.');
                    return;
                }
                setSuccess('Account created. Opening your profile…');
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

    const switchFromConfirmation = (next: 'login' | 'signup') => {
        setMode(next);
        setError(null);
        setSuccess(null);
        setConfirmationCode('');
        if (next === 'signup') setEmail(pendingEmail);
    };

    const openDemoModal = () => {
        setDemoSubmitted(false);
        setDemoSubmitError(null);
        setShowDemoModal(true);
    };

    const closeDemoModal = () => {
        setShowDemoModal(false);
        setDemoSubmitting(false);
        setDemoSubmitted(false);
        setDemoSubmitError(null);
    };

    const handleDemoSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
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
        const trimmed = question.trim();
        if (!trimmed || assistantLoading) return;
        const nextMessages: AssistantMessage[] = [...assistantMessages, { role: 'visitor', text: trimmed }];
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

    const authCard = (
        <AuthPortalCard
            mode={mode}
            email={email}
            password={password}
            username={username}
            showPassword={showPassword}
            confirmationCode={confirmationCode}
            pendingEmail={pendingEmail}
            pendingExpiresAt={pendingExpiresAt}
            error={error}
            success={success}
            isLoading={isLoading}
            isGoogleLoading={isGoogleLoading}
            resendLoading={resendLoading}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onUsernameChange={setUsername}
            onConfirmationCodeChange={setConfirmationCode}
            onTogglePassword={() => setShowPassword((current) => !current)}
            onSubmit={handleSubmit}
            onGoogle={() => void handleGoogleSignIn()}
            onSwitchMode={switchMode}
            onSwitchFromConfirmation={switchFromConfirmation}
            onResendConfirmation={() => void handleResendConfirmation()}
        />
    );

    return (
        <>
            {pageMode === 'portal' ? (
                <PortalLanding onExplore={() => setPageMode('explore')}>
                    {authCard}
                </PortalLanding>
            ) : (
                <ExploreUniverse onBack={() => setPageMode('portal')} onRequestDemo={openDemoModal} />
            )}

            <button
                type="button"
                onClick={() => setAssistantOpen(true)}
                className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-cyan-300/25 bg-[#081321]/95 px-4 py-3 text-sm font-black text-white shadow-[0_15px_45px_rgba(0,0,0,0.35),0_0_30px_rgba(34,211,238,0.12)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-cyan-300/45"
            >
                <span className="text-cyan-300">◉</span> Ask Brains
            </button>

            {assistantOpen && (
                <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/55 p-4 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label="Brains Assistant">
                    <div className="w-full max-w-md overflow-hidden rounded-[1.75rem] border border-cyan-300/20 bg-[#081321] shadow-[0_30px_100px_rgba(0,0,0,0.55)]">
                        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                            <div><p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">Visitor guide</p><h2 className="mt-1 font-black text-white">Ask Brains</h2></div>
                            <button type="button" onClick={() => setAssistantOpen(false)} className="rounded-lg px-3 py-2 text-slate-400 hover:bg-white/[0.05] hover:text-white" aria-label="Close assistant">✕</button>
                        </div>
                        <div className="max-h-[50vh] space-y-3 overflow-y-auto p-5">
                            {assistantMessages.map((message, index) => (
                                <div key={`${message.role}-${index}`} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === 'agent' ? 'bg-white/[0.06] text-slate-200' : 'ml-auto bg-cyan-300 text-[#06101d]'}`}>{message.text}</div>
                            ))}
                            {assistantLoading && <div className="text-xs text-slate-500">Brains is thinking…</div>}
                            {assistantError && <div className="rounded-xl border border-rose-400/25 bg-rose-400/[0.07] px-3 py-2 text-xs text-rose-100">{assistantError}</div>}
                        </div>
                        <div className="border-t border-white/10 p-4">
                            <div className="mb-3 flex flex-wrap gap-2">
                                {['I’m a student', 'I’m a teacher', 'I run a school', 'I’m preparing for IELTS'].map((prompt) => <button key={prompt} type="button" onClick={() => void submitAssistantPrompt(prompt)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-cyan-300/30 hover:text-white">{prompt}</button>)}
                            </div>
                            <form onSubmit={(event) => { event.preventDefault(); void submitAssistantPrompt(assistantQuestion); }} className="flex gap-2">
                                <input value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)} placeholder="Ask anything…" className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900/70 px-3 text-sm text-white outline-none focus:border-cyan-300/40" />
                                <button type="submit" disabled={assistantLoading || !assistantQuestion.trim()} className="rounded-xl bg-cyan-300 px-4 text-sm font-black text-[#06101d] disabled:opacity-50">Send</button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {showDemoModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="demo-title">
                    <div className="w-full max-w-xl overflow-hidden rounded-[1.75rem] border border-cyan-300/20 bg-[#081321] shadow-[0_30px_100px_rgba(0,0,0,0.55)]">
                        <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
                            <div><p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-300/75">For schools</p><h2 id="demo-title" className="mt-1 text-2xl font-black text-white">Request a Brains Heist demo</h2></div>
                            <button type="button" onClick={closeDemoModal} className="rounded-lg px-3 py-2 text-slate-400 hover:bg-white/[0.05] hover:text-white" aria-label="Close demo request">✕</button>
                        </div>
                        {demoSubmitted ? (
                            <div className="p-8 text-center"><div className="text-4xl">✓</div><h3 className="mt-4 text-xl font-black text-white">Request received</h3><p className="mt-2 text-sm text-slate-400">We’ll use the details you provided to follow up.</p><button type="button" onClick={closeDemoModal} className="mt-6 rounded-xl bg-cyan-300 px-5 py-3 font-black text-[#06101d]">Close</button></div>
                        ) : (
                            <form onSubmit={handleDemoSubmit} className="grid gap-4 p-6 sm:grid-cols-2">
                                <input required value={demoForm.name} onChange={(event) => setDemoForm((current) => ({ ...current, name: event.target.value }))} placeholder="Your name" className="h-12 rounded-xl border border-white/10 bg-slate-900/70 px-4 text-white outline-none focus:border-cyan-300/40" />
                                <input required type="email" value={demoForm.email} onChange={(event) => setDemoForm((current) => ({ ...current, email: event.target.value }))} placeholder="Work email" className="h-12 rounded-xl border border-white/10 bg-slate-900/70 px-4 text-white outline-none focus:border-cyan-300/40" />
                                <input required value={demoForm.school} onChange={(event) => setDemoForm((current) => ({ ...current, school: event.target.value }))} placeholder="School name" className="h-12 rounded-xl border border-white/10 bg-slate-900/70 px-4 text-white outline-none focus:border-cyan-300/40" />
                                <input value={demoForm.country} onChange={(event) => setDemoForm((current) => ({ ...current, country: event.target.value }))} placeholder="Country" className="h-12 rounded-xl border border-white/10 bg-slate-900/70 px-4 text-white outline-none focus:border-cyan-300/40" />
                                <input inputMode="numeric" value={demoForm.studentCount} onChange={(event) => setDemoForm((current) => ({ ...current, studentCount: event.target.value }))} placeholder="Student count" className="h-12 rounded-xl border border-white/10 bg-slate-900/70 px-4 text-white outline-none focus:border-cyan-300/40" />
                                <input value={demoForm.website} onChange={(event) => setDemoForm((current) => ({ ...current, website: event.target.value }))} placeholder="Website (optional)" className="h-12 rounded-xl border border-white/10 bg-slate-900/70 px-4 text-white outline-none focus:border-cyan-300/40" />
                                <textarea value={demoForm.notes} onChange={(event) => setDemoForm((current) => ({ ...current, notes: event.target.value }))} placeholder="What would you like to explore?" className="min-h-28 rounded-xl border border-white/10 bg-slate-900/70 p-4 text-white outline-none focus:border-cyan-300/40 sm:col-span-2" />
                                {demoSubmitError && <div className="rounded-xl border border-rose-400/25 bg-rose-400/[0.07] px-4 py-3 text-sm text-rose-100 sm:col-span-2">{demoSubmitError}</div>}
                                <button type="submit" disabled={demoSubmitting} className="h-12 rounded-xl bg-gradient-to-r from-cyan-300 to-teal-300 font-black text-[#06101d] disabled:opacity-50 sm:col-span-2">{demoSubmitting ? 'Sending…' : 'Request demo →'}</button>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default LoginView;
