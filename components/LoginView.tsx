import React, { useMemo, useState, useEffect } from 'react';
import { GoogleIcon } from './icons';
import * as AuthService from '../services/authService';
import type { Batch, Grade } from '../types';
import { consumeBanMessage } from '../services/banMessage';

interface LoginViewProps {
    onLogin: (email: string, pass: string) => Promise<void>;
}

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
    const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [grade, setGrade] = useState<Grade>(8);
    const [batch, setBatch] = useState<Batch>('N/A');
    const [role, setRole] = useState<'student' | 'teacher'>('student');
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
                setSuccess('Password reset email sent! Check your inbox.');
                setMode('login');
            } else if (mode === 'signup') {
                const gradeForSignup = role === 'student' ? grade : undefined;
                const batchForSignup = role === 'student' ? batch : undefined;
                await AuthService.signup(email, password, username, role, gradeForSignup, batchForSignup);
                setSuccess('Account created! Please log in.');
                setMode('login');
                setPassword('');
            } else {
                await onLogin(email, password);
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

    const gradeOptions: Record<Grade, Batch[]> = useMemo(() => ({
        8: ['8A', '8B', '8C', 'N/A'],
        9: ['9A', '9B', '9C', 'N/A'],
    }), []);

    const handleGradeChange = (value: Grade) => {
        setGrade(value);
        const availableBatches = gradeOptions[value];
        if (!availableBatches.includes(batch)) {
            setBatch(availableBatches[0]);
        }
    };

    return (
        <>
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
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

                                {role === 'student' && (
                                    <>
                                        <div>
                                            <label htmlFor="grade" className="block text-sm font-medium text-gray-300">Grade</label>
                                            <select
                                                id="grade"
                                                value={grade}
                                                onChange={(e) => handleGradeChange(Number(e.target.value) as Grade)}
                                                className="mt-1 block w-full bg-gray-800 border border-gray-600 rounded-md p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                                            >
                                                <option value={8}>Grade 8</option>
                                                <option value={9}>Grade 9</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label htmlFor="batch" className="block text-sm font-medium text-gray-300">Class</label>
                                            <select
                                                id="batch"
                                                value={batch}
                                                onChange={(e) => setBatch(e.target.value as Batch)}
                                                className="mt-1 block w-full bg-gray-800 border border-gray-600 rounded-md p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                                            >
                                                {gradeOptions[grade].map((option) => (
                                                    <option key={option} value={option}>{`Class ${option}`}</option>
                                                ))}
                                            </select>
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
                                disabled={isLoading || isGoogleLoading}
                                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-lg font-bold text-ink-900 bg-ion-blue hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ion-blue disabled:opacity-50 disabled:cursor-wait transition-colors"
                                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.2)' }}
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
        </>
    );
};

export default LoginView;
