import React, { useState, useEffect } from 'react';
import { GoogleIcon } from './icons';
import * as AuthService from '../services/authService';
import { consumeBanMessage } from '../services/banMessage';

interface LoginViewProps {
    onLogin: (email: string, pass: string) => Promise<void>;
}

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
    const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);

    useEffect(() => {
        const persisted = consumeBanMessage();
        if (persisted) {
            setMode('login');
            setError(persisted);
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setIsLoading(true);

        try {
            if (mode === 'reset') {
                await AuthService.sendPasswordResetEmail(email);
                setSuccess('Password reset email sent! ⚠️ Note: In development, check your Supabase dashboard Email Templates or configure SMTP for real emails.');
                console.log('Password reset requested for:', email);
                console.log('📧 IMPORTANT: Configure SMTP in Supabase Dashboard → Settings → Auth → SMTP Settings to receive actual emails');
                setMode('login');
            } else if (mode === 'signup') {
                if (!username.trim()) {
                    setError('Pick a codename so other agents can recognize you.');
                    return;
                }

                if (!email.trim()) {
                    setError('Enter a valid email to receive mission updates.');
                    return;
                }

                // Simplified signup - only username/email/password
                // SetupWizard handles school/role/grade after authentication
                await AuthService.signup(
                    email.trim(),
                    password,
                    username.trim()
                );
                // User will be redirected to SetupWizard automatically by auth flow
                await AuthService.signup(
                    email.trim(),
                    password,
                    username.trim()
                );
                // After signup, user will be redirected to SetupWizard automatically
                // No need to set success message or switch to login
            } else {
                await onLogin(email.trim(), password);
            }
        } catch (err: any) {
            setError(err.message || 'Operation failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setError(null);
        setSuccess(null);
        setIsGoogleLoading(true);

        try {
            await AuthService.loginWithGoogle();
        } catch (err: any) {
            setError(err.message || 'Google sign-in failed. Please try again.');
        } finally {
            setIsGoogleLoading(false);
        }
    };

    const isSignupIncomplete =
        mode === 'signup' &&
        (!username.trim() || !email.trim() || !password);

    return (
        <>
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <img 
                        src="/logo.png" 
                        alt="Brains Heist" 
                        className="w-32 h-32 mx-auto mb-4 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                    />
                    <h1 className="font-heading text-5xl font-bold tracking-wider" style={{ color: 'var(--ion-blue)' }}>
                        Brains Heist
                    </h1>
                    <p className="text-mist-400 mt-2">Agent Access Terminal</p>
                    <a
                        href="/ielts"
                        onClick={(e) => {
                            e.preventDefault();
                            window.history.pushState({}, '', '/ielts');
                            window.dispatchEvent(new PopStateEvent('popstate'));
                        }}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full border-2 border-emerald-500/70 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-400 text-sm font-bold transition-all shadow-lg hover:shadow-emerald-500/50 cursor-pointer"
                    >
                        📚 IELTS PREPARATION
                    </a>
                </div>

                <div className="card-glass glow-ion p-8">
                    {/* Toggle Tabs */}
                    <div className="flex mb-6 bg-black/30 rounded-lg p-1">
                        <button
                            onClick={() => setMode('login')}
                            className={`flex-1 py-2 px-4 rounded-md font-semibold transition-all ${
                                mode === 'login'
                                    ? 'bg-ion-blue text-ink-900'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            Login
                        </button>
                        <button
                            onClick={() => setMode('signup')}
                            className={`flex-1 py-2 px-4 rounded-md font-semibold transition-all ${
                                mode === 'signup'
                                    ? 'bg-ion-blue text-ink-900'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            Sign Up
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {mode === 'reset' && (
                            <div className="mb-4">
                                <button
                                    type="button"
                                    onClick={() => setMode('login')}
                                    className="text-cyan-400 hover:text-cyan-300 text-sm"
                                >
                                    ← Back to Login
                                </button>
                                <h3 className="text-xl font-bold text-white mt-2">Reset Password</h3>
                                <p className="text-gray-400 text-sm mt-1">Enter your email to receive a reset link</p>
                            </div>
                        )}
                        
                        {mode === 'signup' && (
                            <>
                                <div>
                                    <label htmlFor="username" className="block text-sm font-medium text-gray-300">Username</label>
                                    <input
                                        id="username"
                                        name="username"
                                        type="text"
                                        required
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="mt-1 block w-full bg-gray-800 border border-gray-600 rounded-md p-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                                        placeholder="ChooseYourName"
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-3">I am a...</label>
                                    <div className="flex gap-4">
                                        <button
                                            type="button"
                                            onClick={() => setRole('student')}
                                            className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                                                role === 'student'
                                                    ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400'
                                                    : 'border-gray-600 bg-gray-800/50 text-gray-300 hover:border-gray-500'
                                            }`}
                                        >
                                            <div className="text-2xl mb-1">🎓</div>
                                            <div className="font-semibold">Student</div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRole('teacher')}
                                            className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                                                role === 'teacher'
                                                    ? 'border-purple-400 bg-purple-400/10 text-purple-400'
                                                    : 'border-gray-600 bg-gray-800/50 text-gray-300 hover:border-gray-500'
                                            }`}
                                        >
                                            <div className="text-2xl mb-1">👨‍🏫</div>
                                            <div className="font-semibold">Teacher</div>
                                        </button>
                                    </div>
                                </div>

                                {/* School Selection - Multi-Tenant */}
                                <div>
                                    <label htmlFor="school" className="block text-sm font-medium text-gray-300">School</label>
                                    {isLoadingSchools ? (
                                        <div className="mt-1 flex items-center gap-2 p-3 text-gray-400">
                                            <div className="animate-spin h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full" />
                                            Loading schools...
                                        </div>
                                    ) : (
                                        <select
                                            id="school"
                                            name="school"
                                            value={selectedSchool?.id || ''}
                                            onChange={(e) => {
                                                const school = schools.find(s => s.id === e.target.value);
                                                setSelectedSchool(school || null);
                                            }}
                                            className="mt-1 block w-full bg-gray-800 border border-gray-600 rounded-md p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                                        >
                                            <option value="">Select your school</option>
                                            {schools.map((school) => (
                                                <option key={school.id} value={school.id}>
                                                    {school.name}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setShowSchoolRequest(true)}
                                        className="mt-2 text-xs text-cyan-300 hover:text-cyan-200"
                                    >
                                        My school isn’t listed → Apply
                                    </button>
                                    
                                    {/* Invite Code Section */}
                                    {!showInviteCode ? (
                                        <button
                                            type="button"
                                            onClick={() => setShowInviteCode(true)}
                                            className="mt-2 text-xs text-cyan-400 hover:text-cyan-300"
                                        >
                                            Have an invite code?
                                        </button>
                                    ) : (
                                        <div className="mt-2 flex gap-2">
                                            <input
                                                type="text"
                                                value={inviteCode}
                                                onChange={(e) => {
                                                    setInviteCode(normalizeInviteCode(e.target.value));
                                                    setInviteCodeError(null);
                                                }}
                                                placeholder="Enter code"
                                                className="flex-1 bg-gray-800 border border-gray-600 rounded-md p-2 text-white text-sm uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-cyan-400"
                                                maxLength={10}
                                            />
                                            <button
                                                type="button"
                                                onClick={handleInviteCodeSubmit}
                                                disabled={isLoading || !inviteCodeReady}
                                                className="px-3 py-2 bg-cyan-400 text-gray-900 rounded-md text-sm font-semibold hover:bg-cyan-300 disabled:opacity-50"
                                            >
                                                Join
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowInviteCode(false);
                                                    setInviteCode('');
                                                    setInviteCodeError(null);
                                                }}
                                                className="px-2 text-gray-500 hover:text-gray-400"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )}
                                    {showInviteCode && (
                                        <div className="mt-2 space-y-2">
                                            <p className="text-xs text-gray-400">Invite codes are 10 characters.</p>
                                            {inviteCodeError && (
                                                <div className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                                                    Invalid invite code
                                                </div>
                                            )}
                                            {inviteCodeError && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const individuals = schools.find(s => s.id === individualSchoolOption.id) || individualSchoolOption;
                                                        setSelectedSchool(individuals);
                                                        setShowInviteCode(false);
                                                        setInviteCode('');
                                                        setInviteCodeError(null);
                                                    }}
                                                    className="text-xs text-cyan-300 hover:text-cyan-200"
                                                >
                                                    Continue as Individuals
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    
                                    {/* Show selected school signup restrictions */}
                                    {selectedSchool && (
                                        <p className="mt-1 text-xs text-gray-400">
                                            {isIndividual
                                                ? 'Play solo until you join a school'
                                                : selectedSchool.allow_student_signup && selectedSchool.allow_teacher_signup 
                                                    ? 'Open for students and teachers'
                                                    : selectedSchool.allow_student_signup 
                                                        ? 'Open for students only'
                                                        : 'Open for teachers only'
                                            }
                                        </p>
                                    )}
                                </div>

                                {role === 'student' && !isIeltsSchool && !isIndividual && (
                                    <>
                                        <div>
                                            <label htmlFor="grade" className="block text-sm font-medium text-gray-300">Grade</label>
                                            <select
                                                id="grade"
                                                value={grade ?? ''}
                                                onChange={(e) => handleGradeChange(e.target.value)}
                                                className="mt-1 block w-full bg-gray-800 border border-gray-600 rounded-md p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                                            >
                                                <option value="">Select your grade</option>
                                                {gradeChoices.map((option) => (
                                                    <option key={option} value={option}>{`Grade ${option}`}</option>
                                                ))}
                                            </select>
                                            <p className="mt-1 text-xs text-gray-400">Your missions will be tailored to this grade.</p>
                                        </div>
                                        <div>
                                            <label htmlFor="batch" className="block text-sm font-medium text-gray-300">Class</label>
                                            <select
                                                id="batch"
                                                value={batch}
                                                onChange={(e) => setBatch(e.target.value as Batch)}
                                                disabled={!grade}
                                                className="mt-1 block w-full bg-gray-800 border border-gray-600 rounded-md p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <option value="">{grade ? 'Select your class' : 'Choose a grade first'}</option>
                                                {availableBatches.map((option) => {
                                                    const classLetter = option.replace(String(grade ?? ''), '');
                                                    return (
                                                        <option key={option} value={option}>{`Class ${classLetter || option} (${option})`}</option>
                                                    );
                                                })}
                                            </select>
                                            <p className="mt-1 text-xs text-gray-400">Pick the exact batch you attend in school.</p>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                        
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-300">Email</label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
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
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="mt-1 block w-full bg-gray-800 border border-gray-600 rounded-md p-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                                    placeholder="••••••••"
                                />
                            </div>
                        )}

                        {mode === 'login' && (
                            <div className="text-right">
                                <button
                                    type="button"
                                    onClick={() => setMode('reset')}
                                    className="text-sm text-cyan-400 hover:text-cyan-300"
                                >
                                    Forgot password?
                                </button>
                            </div>
                        )}

                        {error && <p className="text-sm text-danger-red text-center">{error}</p>}
                        {success && <p className="text-sm text-success-teal text-center">{success}</p>}

                        <div>
                            <button
                                type="submit"
                                disabled={isLoading || isGoogleLoading || isSignupIncomplete}
                                className="w-full flex justify-center py-3 px-4 rounded-md text-lg font-bold text-black bg-gradient-to-r from-amber-500 to-orange-500 shadow-lg shadow-amber-500/20 transition-all hover:from-amber-400 hover:to-orange-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-400 disabled:cursor-wait disabled:opacity-50"
                            >
                                {isLoading ? 'Processing...' : mode === 'reset' ? 'Send Reset Link' : mode === 'login' ? 'Access System' : 'Create Account'}
                            </button>
                        </div>
                    </form>

                    {mode !== 'reset' && (
                        <div className="mt-8 space-y-4">
                            <div className="flex items-center gap-4 text-gray-500 text-xs uppercase tracking-[0.35em]">
                                <span className="flex-1 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
                                or
                                <span className="flex-1 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
                            </div>

                            <button
                                type="button"
                                onClick={handleGoogleSignIn}
                                disabled={isGoogleLoading || isLoading}
                                className="group relative w-full overflow-hidden rounded-xl border border-white/10 bg-white/5 py-3 px-4 font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-cyan-400/40 focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:cursor-wait disabled:opacity-60"
                            >
                                <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/10 via-cyan-400/20 to-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                                <span className="relative flex items-center justify-center gap-3 text-base">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
                                        <GoogleIcon className="h-5 w-5" />
                                    </span>
                                    <span className="text-lg font-semibold tracking-wide text-white">
                                        {isGoogleLoading ? 'Contacting Google...' : 'Continue with Google'}
                                    </span>
                                </span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
        <SchoolRequestModal
            isOpen={showSchoolRequest}
            onClose={() => setShowSchoolRequest(false)}
            requesterRole={role}
            onUseSuggestion={(code) => {
                setInviteCode(normalizeInviteCode(code));
                setInviteCodeError(null);
                setShowInviteCode(true);
            }}
        />
        </>
    );
};

export default LoginView;
