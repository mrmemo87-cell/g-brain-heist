import React, { useState } from 'react';
import { GoogleIcon } from './icons';

interface LoginViewProps {
    onLogin: (email: string, pass: string) => Promise<void>;
}

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        try {
            await onLogin(email, password);
            // On success, the parent component will unmount this view.
        } catch (err: any) {
            setError(err.message || 'Login failed. Please try again.');
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="font-heading text-5xl font-bold tracking-wider" style={{ color: 'var(--ion-blue)' }}>
                        Brain Heist
                    </h1>
                    <p className="text-mist-400 mt-2">Agent Access Terminal</p>
                </div>

                <div className="card-glass glow-ion p-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-mist-400">Agent ID (Email)</label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="mt-1 block w-full bg-ink-800 border border-mist-400/20 rounded-md p-3 text-paper-50 placeholder-mist-400/50 focus:outline-none focus:ring-2 focus:ring-ion-blue focus:border-ion-blue"
                                placeholder="agent@bh.os"
                            />
                        </div>

                        <div>
                            <label htmlFor="password"className="block text-sm font-medium text-mist-400">Passcode</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="mt-1 block w-full bg-ink-800 border border-mist-400/20 rounded-md p-3 text-paper-50 placeholder-mist-400/50 focus:outline-none focus:ring-2 focus:ring-ion-blue focus:border-ion-blue"
                                placeholder="••••••••"
                            />
                        </div>

                        {error && <p className="text-sm text-danger-red text-center">{error}</p>}

                        <div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-lg font-bold text-ink-900 bg-ion-blue hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ion-blue disabled:opacity-50 disabled:cursor-wait transition-colors"
                                style={{textShadow: '0 1px 1px rgba(0,0,0,0.2)'}}
                            >
                                {isLoading ? 'Authenticating...' : 'Access System'}
                            </button>
                        </div>
                    </form>

                    <div className="mt-6">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-mist-400/20"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-ink-800 text-mist-400">Or continue with</span>
                            </div>
                        </div>

                        <div className="mt-6">
                            <button
                                onClick={() => onLogin('google-user@gmail.com', 'google-pass')}
                                className="w-full inline-flex justify-center items-center py-3 px-4 border border-mist-400/40 rounded-md shadow-sm bg-paper-50 text-ink-900 font-medium hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ion-blue"
                            >
                                <GoogleIcon className="w-5 h-5 mr-2" />
                                <span>Use Google</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginView;
