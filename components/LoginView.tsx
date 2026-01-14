import React, { useMemo, useState, useEffect } from 'react';
import { GoogleIcon } from './icons';
import * as AuthService from '../services/authService';
import type { School } from '../services/authService';
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
    const [grade, setGrade] = useState<Grade | null>(null);
    const [batch, setBatch] = useState<Batch | ''>('');
    const [role, setRole] = useState<'student' | 'teacher'>('student');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    
    // Multi-tenant: Dynamic schools
    const [schools, setSchools] = useState<School[]>([]);
    const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
    const [isLoadingSchools, setIsLoadingSchools] = useState(false);
    const [inviteCode, setInviteCode] = useState('');
    const [showInviteCode, setShowInviteCode] = useState(false);

    // Fetch available schools when signup mode is active
    useEffect(() => {
        if (mode === 'signup' && schools.length === 0) {
            const fetchSchools = async () => {
                setIsLoadingSchools(true);
                try {
                    const schoolList = await AuthService.getAvailableSchools();
                    setSchools(schoolList);
                    
                    // Auto-select first school if only one available
                    if (schoolList.length === 1) {
                        setSelectedSchool(schoolList[0]);
                    } else if (schoolList.length > 0 && !selectedSchool) {
                        // Select the first school by default
                        setSelectedSchool(schoolList[0]);
                    }
                } catch (err) {
                    console.error('Failed to load schools:', err);
                    // Fallback: create a default school option
                    const fallbackSchool: School = {
                        id: 'default',
                        name: 'Default School',
                        slug: 'default-school',
                        logo_url: null,
                        allow_student_signup: true,
                        allow_teacher_signup: true,
                    };
                    setSchools([fallbackSchool]);
                    setSelectedSchool(fallbackSchool);
                }
                setIsLoadingSchools(false);
            };
            fetchSchools();
        }
    }, [mode, schools.length, selectedSchool]);

    useEffect(() => {
        const persisted = consumeBanMessage();
        if (persisted) {
            setMode('login');
            setError(persisted);
        }
    }, []);

    useEffect(() => {
        if (role === 'teacher') {
            setGrade(null);
            setBatch('');
        }
    }, [role]);

    // Handle invite code validation
    const handleInviteCodeSubmit = async () => {
        if (!inviteCode.trim()) return;
        
        setIsLoading(true);
        setError(null);
        
        try {
            const result = await AuthService.validateInviteCode(inviteCode.trim());
            if (result.valid && result.school_id) {
                const school = schools.find(s => s.id === result.school_id) || {
                    id: result.school_id,
                    name: result.school_name || 'School',
                    slug: result.school_slug || '',
                    logo_url: null,
                    allow_student_signup: true,
                    allow_teacher_signup: true,
                };
                setSelectedSchool(school);
                setShowInviteCode(false);
                setSuccess(`Joined ${result.school_name}!`);
            } else {
                setError(result.error || 'Invalid invite code');
            }
        } catch (err) {
            setError('Failed to validate invite code');
        } finally {
            setIsLoading(false);
        }
    };

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

                if (!selectedSchool) {
                    setError('Select your school to continue.');
                    return;
                }

                // Check if school allows this role
                if (role === 'student' && !selectedSchool.allow_student_signup) {
                    setError('This school is not accepting student signups.');
                    return;
                }
                if (role === 'teacher' && !selectedSchool.allow_teacher_signup) {
                    setError('This school is not accepting teacher signups.');
                    return;
                }

                if (role === 'student') {
                    if (!grade) {
                        setError('Choose your grade to unlock the right missions.');
                        return;
                    }

                    if (!batch) {
                        setError('Pick your batch so we can match you with your class.');
                        return;
                    }
                }

                const gradeForSignup = role === 'student' ? grade ?? undefined : undefined;
                const batchForSignup = role === 'student' ? batch || undefined : undefined;
                // Use school ID for multi-tenant, fallback to name if ID is 'default'
                const schoolId = selectedSchool.id !== 'default' ? selectedSchool.id : undefined;
                const schoolName = selectedSchool.name;

                await AuthService.signup(
                    email.trim(),
                    password,
                    username.trim(),
                    role,
                    gradeForSignup,
                    batchForSignup,
                    schoolName,  // Legacy school name
                    schoolId     // New multi-tenant school ID
                );
                setSuccess('Account created! Please log in.');
                setMode('login');
                setPassword('');
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

    const gradeChoices = useMemo<Grade[]>(() => [6, 7, 8, 9, 10, 11, 12], []);
    const gradeOptions: Record<Grade, Batch[]> = useMemo(() => {
        const classLetters: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C'];
        return gradeChoices.reduce((acc, currentGrade) => {
            acc[currentGrade] = classLetters.map((letter) => `${currentGrade}${letter}` as Batch);
            return acc;
        }, {} as Record<Grade, Batch[]>);
    }, [gradeChoices]);

    const handleGradeChange = (value: string) => {
        if (!value) {
            setGrade(null);
            setBatch('');
            return;
        }

        const parsedGrade = Number(value) as Grade;
        setGrade(parsedGrade);

        const availableBatches = gradeOptions[parsedGrade];
        if (!availableBatches.includes(batch as Batch)) {
            setBatch(availableBatches[0]);
        }
    };

    const availableBatches = grade ? gradeOptions[grade] : [];

    const isSignupIncomplete =
        mode === 'signup' &&
        (
            !selectedSchool || 
            !username.trim() || 
            !email.trim() || 
            !password ||
            (role === 'student' && (!grade || !batch))
        );

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
                                                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                                                placeholder="Enter code"
                                                className="flex-1 bg-gray-800 border border-gray-600 rounded-md p-2 text-white text-sm uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-cyan-400"
                                                maxLength={8}
                                            />
                                            <button
                                                type="button"
                                                onClick={handleInviteCodeSubmit}
                                                disabled={isLoading || !inviteCode.trim()}
                                                className="px-3 py-2 bg-cyan-400 text-gray-900 rounded-md text-sm font-semibold hover:bg-cyan-300 disabled:opacity-50"
                                            >
                                                Join
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowInviteCode(false);
                                                    setInviteCode('');
                                                }}
                                                className="px-2 text-gray-500 hover:text-gray-400"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )}
                                    
                                    {/* Show selected school signup restrictions */}
                                    {selectedSchool && (
                                        <p className="mt-1 text-xs text-gray-400">
                                            {selectedSchool.allow_student_signup && selectedSchool.allow_teacher_signup 
                                                ? 'Open for students and teachers'
                                                : selectedSchool.allow_student_signup 
                                                    ? 'Open for students only'
                                                    : 'Open for teachers only'
                                            }
                                        </p>
                                    )}
                                </div>

                                {role === 'student' && (
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
        </>
    );
};

export default LoginView;
