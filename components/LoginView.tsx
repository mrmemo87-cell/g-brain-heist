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

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-6 sm:mb-8">
                    <img 
                        src="/logo.png" 
                        alt="Brains Heist" 
                        className="w-20 h-20 sm:w-32 sm:h-32 mx-auto mb-3 sm:mb-4 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                    />
                    <h1 className="font-heading text-3xl sm:text-5xl font-bold tracking-wider" style={{ color: 'var(--ion-blue)' }}>
                        Brains Heist
                    </h1>
                    <p className="text-mist-400 mt-2">Sign in to continue your learning mission</p>
                    <a
                        href="/ielts"
                        className="inline-flex items-center gap-1 text-xs text-ion-green mt-3 px-3 py-1.5 border border-ion-green rounded-full hover:bg-ion-green/10 transition-colors"
                    >
                        📚 IELTS PREPARATION
                    </a>
                </div>

                <div className="bg-ink-900/50 backdrop-blur-sm border border-mist-800 rounded-lg p-5 sm:p-8 shadow-xl">
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

                    <form onSubmit={handleSubmit} className="space-y-6">
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
                            type="submit"
                            disabled={isLoading || (mode === 'signup' && !username.trim())}
                            className="w-full py-3 px-4 rounded-md font-bold transition-all bg-ion-blue text-ink-900 hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
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
            </div>

            {/* Legal footer */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-[11px] text-gray-600">
                <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">Terms</a>
                <span>·</span>
                <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">Privacy</a>
                <span>·</span>
                <a href="/contact.html" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">Contact</a>
            </div>
        </div>
    );
};

export default LoginView;
